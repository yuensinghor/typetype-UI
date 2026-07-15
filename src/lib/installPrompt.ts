/**
 * Shared PWA install-prompt logic.
 *
 * Android/Chrome/Edge fire a real `beforeinstallprompt` event we can capture
 * and replay later via `.prompt()`. iOS Safari has no such API — Apple never
 * exposes a programmatic install trigger — so on iOS the "install" action is
 * just showing the user how to do it manually (Share -> Add to Home Screen).
 *
 * This module owns capturing/storing that event and answering "can we
 * install, and how" so scenes don't need to know the platform differences.
 */

const FIRST_PLAY_KEY = 'dd_install_prompt_seen';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;

// BeforeInstallPromptEvent isn't in the standard lib.dom types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Call once, as early as possible (main.ts), so the event is captured
 * before any scene tries to use it. The event only fires once per page
 * load and only if the browser hasn't already decided to skip it.
 */
export function initInstallPromptCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
  });
}

/** True if running as an installed PWA already (standalone display mode). */
export function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari's own (non-standard) flag for "launched from home screen".
  if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
  return false;
}

export function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" but has touch support; real desktop Macs don't.
  const isIPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || isIPadOS;
}

/**
 * Whether there's *something* useful the install button can do right now.
 * False when already installed, or on a browser that gives us neither the
 * native prompt nor a meaningful manual path (rare — e.g. desktop Firefox).
 */
export function canOfferInstall(): boolean {
  if (installed || isStandalone()) return false;
  if (deferredPrompt) return true;
  if (isIOS()) return true;
  return false;
}

/**
 * Triggers the native install dialog (Android/Chrome/Edge). Resolves to
 * true if the user accepted. Returns false immediately if no native prompt
 * is available — callers should check `isIOS()` first and show manual
 * instructions instead in that case.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice.outcome === 'accepted';
}

/** Has the player completed at least one full run before? Used to gate the GameOver prompt to first-timers only. */
export function hasSeenInstallPrompt(): boolean {
  return localStorage.getItem(FIRST_PLAY_KEY) === '1';
}

export function markInstallPromptSeen(): void {
  localStorage.setItem(FIRST_PLAY_KEY, '1');
}
