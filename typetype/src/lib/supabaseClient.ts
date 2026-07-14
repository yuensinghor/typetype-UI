import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const looksConfigured = isValidHttpUrl(SUPABASE_URL) && !!SUPABASE_ANON_KEY;
const looksLikePlaceholder = SUPABASE_URL?.includes('YOUR_PROJECT') || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY';

/**
 * Whether Supabase has real (non-placeholder) config. Deliberately NOT thrown
 * here at module scope — that would happen during the initial import chain,
 * before Phaser or Preloader's try/catch exist to catch it, and would replace
 * the friendly "Board Offline" error screen with a blank white page instead.
 * Callers (Preloader.boot) check this flag first and throw from inside their
 * own try/catch, where it's guaranteed to be caught and displayed.
 */
export const isSupabaseConfigured = looksConfigured && !looksLikePlaceholder;

export const supabaseConfigError =
  !isValidHttpUrl(SUPABASE_URL) || !SUPABASE_ANON_KEY
    ? 'Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Create a .env file in the project root (copy .env.example) with your real Supabase project URL and anon key, then fully restart the dev server — Vite only reads .env at startup, not on hot reload.'
    : looksLikePlaceholder
    ? 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY still contain placeholder values from .env.example. Replace them with your actual Supabase project URL and anon key (Supabase dashboard → Settings → API), then fully restart the dev server.'
    : null;

// Fall back to a syntactically-valid dummy URL if misconfigured, purely so
// createClient() itself doesn't throw synchronously at import time — the real,
// user-facing error is raised later via isSupabaseConfigured/supabaseConfigError.
export const supabase = createClient(
  isValidHttpUrl(SUPABASE_URL) ? SUPABASE_URL : 'https://placeholder.invalid',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
