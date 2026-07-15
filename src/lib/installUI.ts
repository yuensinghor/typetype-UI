import { theme, panel, primaryButton, secondaryButton } from './theme';
import { canOfferInstall, promptInstall, isIOS } from './installPrompt';

interface InstallButtonOptions {
  id?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  /** Extra inline CSS appended to the button's own style, e.g. 'margin-top:12px;' */
  extra?: string;
  /** Called after a successful install action (native accept, or the iOS
   * instructions modal being dismissed) so callers can react — e.g. hide
   * a surrounding wrapper, log an event, etc. Optional. */
  onHandled?: () => void;
}

/**
 * Renders a themed "Install App" button into the given container, but only
 * if installing is actually possible right now (not already installed, and
 * the platform supports either the native prompt or iOS's manual path).
 * No-ops silently otherwise — callers don't need to check canOfferInstall()
 * themselves before calling this.
 *
 * Android/Chrome/Edge: click triggers the native install dialog directly.
 * iOS Safari: click opens an instructions modal (there's no programmatic
 * install path on iOS — Apple doesn't expose one).
 */
export function renderInstallButton(container: HTMLElement, options: InstallButtonOptions = {}): void {
  if (!canOfferInstall()) return;

  const id = options.id ?? 'btn-install-app';
  const text = options.label ?? 'Install App';
  const variant = options.variant ?? 'secondary';
  const extra = options.extra ?? '';

  const html = variant === 'primary' ? primaryButton(text, id, extra) : secondaryButton(text, id, extra);
  container.insertAdjacentHTML('beforeend', html);

  const btn = container.querySelector(`#${id}`) as HTMLButtonElement | null;
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (isIOS()) {
      showIOSInstallInstructions(() => options.onHandled?.());
      return;
    }
    const accepted = await promptInstall();
    if (accepted) {
      btn.remove();
      options.onHandled?.();
    }
  });
}

/** Themed modal walking iOS users through the manual Add to Home Screen steps. */
export function showIOSInstallInstructions(onClose?: () => void): void {
  const c = theme.color;
  const overlay = document.createElement('div');
  overlay.id = 'ios-install-modal-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:2000;background:rgba(45,52,54,0.55);backdrop-filter:blur(4px);
    display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;
    font-family:${theme.font.body};animation:fadeIn 0.15s;
  `;

  overlay.innerHTML = `
    <div style="width:100%;max-width:320px;${panel('padding:24px 20px;')}display:flex;flex-direction:column;
      align-items:center;gap:16px;text-align:center;animation:popIn 0.18s;">
      <div style="font-family:${theme.font.display};font-size:16px;font-weight:800;color:${c.textPrimary};">
        Install TypeType
      </div>
      <div style="width:56px;height:56px;border-radius:14px;background:${c.accentDim};
        display:flex;align-items:center;justify-content:center;">
        ${shareIconSvg(c.accent)}
      </div>
      <p style="font-size:12.5px;color:${c.textSecondary};line-height:1.8;margin:0;">
        Tap the <strong style="color:${c.textPrimary};">Share</strong> icon in Safari's toolbar,
        then scroll down and tap <strong style="color:${c.textPrimary};">"Add to Home Screen."</strong>
      </p>
      ${secondaryButton('Got it', 'btn-ios-install-close')}
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    onClose?.();
  };

  overlay.querySelector('#btn-ios-install-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function shareIconSvg(color: string): string {
  return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v13"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>
  </svg>`;
}
