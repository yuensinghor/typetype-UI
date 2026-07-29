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

export function soundToggleHTML(id = 'btn-sound-toggle', inline = false): string {
  const c = theme.color;
  const icon = audioManager.isMuted() ? '🔇' : '🔊';
  const position = inline
    ? 'flex-shrink:0;'
    : 'position:absolute;top:16px;right:16px;z-index:50;';
  return `<button id="${id}" aria-label="Toggle sound" style="
    ${position}width:38px;height:38px;border-radius:12px;background:${c.bgCard};border:1px solid ${c.border};
    display:flex;align-items:center;justify-content:center;cursor:pointer;
    box-shadow:0 2px 8px rgba(139,126,116,0.12);font-size:16px;line-height:1;">${icon}</button>`;
}

export function bindSoundToggle(root: ParentNode, id = 'btn-sound-toggle') {
  const btn = root.querySelector(`#${id}`) as HTMLButtonElement | null;
  btn?.addEventListener('click', () => {
    const muted = audioManager.toggleMute();
    btn.textContent = muted ? '🔇' : '🔊';
  });
}
