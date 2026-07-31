import { audioManager } from './audio';
import { theme } from './theme';

// Shared "mute everything" button — used on every reachable scene so the
// player can silence/restore sound from wherever they are. One toggle
// covers both keypad/SFX beeps and the looping menu theme (see audio.ts).
//
// Usage in a scene:
//   this.containerEl.innerHTML = `... ${soundToggleHTML()} ...`;
//   bindSoundToggle(this.containerEl);
//
// The button renders as position:absolute by default (top-right corner of
// whatever positioned ancestor it's placed in) so it can be dropped into
// any scene's markup without restructuring existing layout. Pass
// `inline: true` for scenes (like Home's header) that want it laid out
// alongside other icon buttons instead.
//
// Icons are inline SVG (currentColor), not emoji text. Emoji glyphs depend
// on the OS/browser having a color-emoji font installed — several desktop
// Chrome/Edge setups (notably Linux, some Windows configs) fall back to a
// generic "missing glyph" mark for less-common emoji, which made unrelated
// icons (mute vs. trophy) render as visually identical placeholders. SVG
// sidesteps that entirely.

const SPEAKER_ON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
</svg>`;

const SPEAKER_MUTED_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
  <line x1="23" y1="9" x2="17" y2="15"></line>
  <line x1="17" y1="9" x2="23" y2="15"></line>
</svg>`;

export function soundToggleHTML(id = 'btn-sound-toggle', inline = false): string {
  const c = theme.color;
  const icon = audioManager.isMuted() ? SPEAKER_MUTED_SVG : SPEAKER_ON_SVG;
  const position = inline
    ? 'flex-shrink:0;'
    : 'position:absolute;top:16px;right:16px;z-index:50;';
  return `<button id="${id}" aria-label="Toggle sound" style="
    ${position}width:38px;height:38px;border-radius:12px;background:${c.bgCard};border:1px solid ${c.border};
    display:flex;align-items:center;justify-content:center;cursor:pointer;color:${c.textPrimary};
    box-shadow:0 2px 8px rgba(139,126,116,0.12);">${icon}</button>`;
}

export function bindSoundToggle(root: ParentNode, id = 'btn-sound-toggle') {
  const btn = root.querySelector(`#${id}`) as HTMLButtonElement | null;
  btn?.addEventListener('click', () => {
    const muted = audioManager.toggleMute();
    btn.innerHTML = muted ? SPEAKER_MUTED_SVG : SPEAKER_ON_SVG;
  });
}
