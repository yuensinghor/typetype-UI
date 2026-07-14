import { theme } from './theme';

let injected = false;

/**
 * Injects global CSS + web fonts once. The app renders inside a centered
 * column that fills the viewport on mobile (the priority device) and
 * becomes a card-like frame with rounded corners on wider desktop
 * viewports, so nothing ever stretches edge-to-edge awkwardly or overflows.
 */
export function injectGlobalStyles() {
  if (injected) return;
  injected = true;

  // Fredoka (display) + DM Sans (body) — the warm/playful typetype.fun look.
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  const style = document.createElement('style');
  style.id = 'dd-global-styles';
  style.textContent = `
    * { box-sizing: border-box; }
    html, body, #game-container { margin:0; padding:0; height:100%; overflow:hidden; background:${theme.color.bg}; }
    button { font: inherit; }
    button:active { transform: scale(0.98); }
    input:focus { outline: none; border-color: ${theme.color.accent} !important; }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    @keyframes popIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }

    /* Gentle drift used by decorative floating background numbers/operators. */
    @keyframes ddFloat {
      0%   { transform: translate(0, 0) rotate(var(--dd-rot, 0deg)); }
      33%  { transform: translate(5px, -6px) rotate(calc(var(--dd-rot, 0deg) + 2deg)); }
      66%  { transform: translate(-3px, 2px) rotate(calc(var(--dd-rot, 0deg) - 1.5deg)); }
      100% { transform: translate(0, 0) rotate(var(--dd-rot, 0deg)); }
    }

    /* Spring pop-in used by title letters, number keys, and hero buttons. */
    @keyframes ddSpringIn {
      0%   { opacity: 0; transform: translateY(20px) scale(0.8); }
      60%  { opacity: 1; transform: translateY(-3px) scale(1.03); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Gentle vertical-only bounce for leaderboard rows — calmer than ddFloat
       (no rotation), so a list of many rows doesn't look chaotic. */
    @keyframes ddBob {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-3px); }
    }

    .dd-shell {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:${theme.color.bg};
    }
    .dd-frame {
      position:relative; width:100%; height:100%; max-width:480px;
      background:${theme.color.bg};
      background-image: radial-gradient(circle, ${theme.color.border} 1px, transparent 1px);
      background-size: 24px 24px;
      display:flex; flex-direction:column; overflow:hidden;
    }
    @media (min-width: 620px) {
      .dd-frame {
        max-height: 900px; margin: 24px 0; border-radius: 24px;
        border: 1px solid ${theme.color.border};
        box-shadow: 0 8px 32px rgba(139,126,116,0.12), 0 2px 8px rgba(139,126,116,0.08);
      }
    }
    .dd-scroll { overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; }
    .dd-scroll::-webkit-scrollbar { width:6px; }
    .dd-scroll::-webkit-scrollbar-track { background:transparent; }
    .dd-scroll::-webkit-scrollbar-thumb { background:${theme.color.borderStrong}; border-radius:3px; }
  `;
  document.head.appendChild(style);
}
