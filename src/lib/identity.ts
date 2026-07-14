import { supabase } from './supabaseClient';
import type { Identity } from '../shared/types';

const GUEST_ID_KEY = 'dd_guest_user_id';
const GUEST_NAME_KEY = 'dd_guest_username';
const INVITE_CODE_KEY = 'dd_pending_invite_code';

function uuid(): string {
  return crypto.randomUUID();
}

/** Capture ?ref=INVITECODE from the URL on first load and stash it until signup completes. */
export function capturePendingInviteFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem(INVITE_CODE_KEY, ref);
    // Clean the URL so it doesn't get re-captured or shared accidentally
    params.delete('ref');
    const clean = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', clean);
  }
}

export function consumePendingInviteCode(): string | null {
  const code = localStorage.getItem(INVITE_CODE_KEY);
  return code;
}

export function clearPendingInviteCode(): void {
  localStorage.removeItem(INVITE_CODE_KEY);
}

/** Kick off Google OAuth via Supabase. Redirects the browser; resolves on return via getSession. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Create or fetch a guest identity, stored locally (no account required). */
export function getOrCreateGuestIdentity(nickname?: string): Identity {
  let userId = localStorage.getItem(GUEST_ID_KEY);
  if (!userId) {
    userId = uuid();
    localStorage.setItem(GUEST_ID_KEY, userId);
  }
  let username = nickname?.trim() || localStorage.getItem(GUEST_NAME_KEY) || '';
  if (nickname?.trim()) {
    localStorage.setItem(GUEST_NAME_KEY, nickname.trim());
  }
  if (!username) {
    username = `Guest${userId.slice(0, 5)}`;
  }
  return { userId, username, isGuest: true };
}

export function hasGuestNickname(): boolean {
  return !!localStorage.getItem(GUEST_NAME_KEY);
}

/**
 * Resolve the current identity: prefers an active Supabase (Google) session,
 * falls back to guest mode. Ensures a `profiles` row exists, applying any
 * pending invite code exactly once.
 */
export async function resolveIdentity(guestNicknameFallback?: string): Promise<Identity> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (session?.user) {
    const authUid = session.user.id;
    const googleName =
      session.user.user_metadata?.full_name ||
      session.user.user_metadata?.name ||
      session.user.email?.split('@')[0] ||
      `Player${authUid.slice(0, 5)}`;

    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id, username, invite_code, invited_by')
      .eq('auth_uid', authUid)
      .maybeSingle();

    if (existing) {
      return {
        userId: existing.user_id,
        username: existing.username,
        isGuest: false,
        inviteCode: existing.invite_code,
        invitedBy: existing.invited_by,
      };
    }

    // First login — create profile, applying any pending invite code
    const pendingCode = consumePendingInviteCode();
    let invitedBy: string | null = null;
    if (pendingCode) {
      const { data: inviter } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('invite_code', pendingCode)
        .maybeSingle();
      invitedBy = inviter?.user_id ?? null;
    }

    const { data: created, error } = await supabase
      .from('profiles')
      .insert({ auth_uid: authUid, username: googleName, invited_by: invitedBy, is_guest: false })
      .select('user_id, username, invite_code, invited_by')
      .single();

    if (error) throw error;
    clearPendingInviteCode();

    return {
      userId: created.user_id,
      username: created.username,
      isGuest: false,
      inviteCode: created.invite_code,
      invitedBy: created.invited_by,
    };
  }

  // Guest fallback — still register a lightweight profile row so invites/leaderboard work
  const guest = getOrCreateGuestIdentity(guestNicknameFallback);
  const pendingCode = consumePendingInviteCode();

  const { data: existingGuestProfile } = await supabase
    .from('profiles')
    .select('user_id, username, invite_code, invited_by')
    .eq('user_id', guest.userId)
    .maybeSingle();

  if (existingGuestProfile) {
    return {
      userId: existingGuestProfile.user_id,
      username: existingGuestProfile.username,
      isGuest: true,
      inviteCode: existingGuestProfile.invite_code,
      invitedBy: existingGuestProfile.invited_by,
    };
  }

  let invitedBy: string | null = null;
  if (pendingCode) {
    const { data: inviter } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('invite_code', pendingCode)
      .maybeSingle();
    invitedBy = inviter?.user_id ?? null;
  }

  const { data: created, error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: guest.userId, username: guest.username, is_guest: true, invited_by: invitedBy },
      { onConflict: 'user_id' }
    )
    .select('user_id, username, invite_code, invited_by')
    .single();

  if (error) throw error;
  clearPendingInviteCode();

  return {
    userId: created.user_id,
    username: created.username,
    isGuest: true,
    inviteCode: created.invite_code,
    invitedBy: created.invited_by,
  };
}

export function buildInviteLink(inviteCode: string): string {
  return `${window.location.origin}/?ref=${inviteCode}`;
}

const CHALLENGE_SEEN_KEY = 'dd_challenge_seen';

/** Marks that this browser has already been routed through (or past) the
 *  Challenge Flow landing screen. Prevents re-showing it on reload and
 *  prevents a redirect loop with Preloader on an invalid/unresolvable code. */
export function markChallengeSeen(): void {
  localStorage.setItem(CHALLENGE_SEEN_KEY, '1');
}

export function hasSeenChallenge(): boolean {
  return localStorage.getItem(CHALLENGE_SEEN_KEY) === '1';
}

/** Lightweight "does this browser already have an identity" check, used to
 *  gate the Challenge Flow to first-time anonymous visitors only. Deliberately
 *  does NOT call resolveIdentity() (which creates a guest profile row as a
 *  side effect) — just peeks at local state + session. */
export async function hasExistingSession(): Promise<boolean> {
  if (hasGuestNickname()) return true;
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user;
}
