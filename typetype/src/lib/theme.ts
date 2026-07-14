/**
 * TypeType — warm, playful game UI theme.
 * Replaces the old dark "clean modern" theme with the typetype.fun palette:
 * cream background, coral/orange/yellow/mint accents, Fredoka + DM Sans.
 */
export const theme = {
  color: {
    bg: '#FFF8F0',
    bgElevated: '#FFF3E6',
    bgCard: '#FFFFFF',
    bgCardHover: '#FFEFE0',
    border: '#E8DDD3',
    borderStrong: '#D9C4B0',
    textPrimary: '#2D3436',
    textSecondary: '#5C534C',
    textMuted: '#8B7E74',
    accent: '#FF6B6B',
    accentBright: '#FF8A95',
    accentDim: 'rgba(255,107,107,0.12)',
    success: '#3FAE7A',
    successDim: 'rgba(63,174,122,0.14)',
    danger: '#E5484D',
    dangerDim: 'rgba(229,72,77,0.12)',
    warning: '#FFD166',
    // Pale yellow reads fine as a background/fill, but fails as text on a
    // light background (too little contrast). Use this instead anywhere
    // "warning" needs to be a text/foreground color.
    warningText: '#B8860B',
    ink: '#2D3436',
  },
  // Raw palette + decorative gradients, for one-off decorative elements
  // (floating background numbers, hero number keys, etc.) that want the
  // exact reference hues rather than the semantic tokens above.
  palette: {
    coral: '#FF6B6B',
    pink: '#FF8A95',
    orange: '#FF8C42',
    yellow: '#FFD166',
    mint: '#7ECEC1',
    cream: '#FFF8F0',
    keyGradients: [
      ['#FFB3BA', '#FF8A95'], // pink
      ['#FFDFBA', '#FFBE7D'], // orange
      ['#BAFFC9', '#7ECEC1'], // mint
    ] as [string, string][],
    floatingKeyGradient: 'linear-gradient(135deg, #FFD1D1, #FFE4C9, #FFF5C9, #D4F5E0, #D1E8FF)',
  },
  font: {
    display: `'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body: `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    mono: `'JetBrains Mono', 'SF Mono', Consolas, monospace`,
  },
} as const;

export function panel(extra = ''): string {
  return `background:${theme.color.bgCard};border:1px solid ${theme.color.border};border-radius:14px;${extra}`;
}

export function label(text: string, color: string = theme.color.textSecondary): string {
  return `<span style="font-family:${theme.font.body};font-size:11px;font-weight:600;
    letter-spacing:0.04em;text-transform:uppercase;color:${color};">${text}</span>`;
}

export function badge(text: string, tone: 'go' | 'stop' | 'wait' = 'go'): string {
  const color =
    tone === 'go' ? theme.color.success : tone === 'stop' ? theme.color.danger : theme.color.warningText;
  const bg = tone === 'go' ? theme.color.successDim : tone === 'stop' ? theme.color.dangerDim : 'rgba(255,209,102,0.18)';
  return `
    <div style="display:inline-flex;align-items:center;padding:6px 16px;border-radius:999px;
      background:${bg};color:${color};font-family:${theme.font.display};font-weight:700;font-size:14px;
      letter-spacing:0.02em;">${text}</div>`;
}

export function primaryButton(text: string, id: string, extra = ''): string {
  return `<button id="${id}" style="
    width:100%;padding:15px 0;background:linear-gradient(135deg, ${theme.palette.pink} 0%, ${theme.palette.coral} 100%);
    border:2px solid rgba(255,255,255,0.5);border-radius:12px;
    color:#fff;font-family:${theme.font.display};font-weight:700;font-size:15px;letter-spacing:0.01em;
    cursor:pointer;box-shadow:0 3px 14px rgba(255,107,107,0.3);transition:transform 0.12s, box-shadow 0.12s;${extra}">${text}</button>`;
}

export function secondaryButton(text: string, id: string, extra = ''): string {
  return `<button id="${id}" style="
    width:100%;padding:15px 0;background:${theme.color.bgCard};border:1px solid ${theme.color.borderStrong};
    border-radius:12px;color:${theme.color.textPrimary};font-family:${theme.font.display};font-weight:700;
    font-size:15px;cursor:pointer;${extra}">${text}</button>`;
}

const TITLE_COLORS = [theme.palette.coral, theme.palette.orange, theme.palette.yellow, theme.palette.mint];

/**
 * Shared "TypeType" logo heading — each letter in a cycling palette color,
 * springing in with a staggered delay. Used at the top of every screen so
 * the brand treatment stays identical everywhere; pass animate=false for
 * screens where the logo re-renders often (e.g. after a state refresh) and
 * shouldn't re-play the entrance animation every time.
 */
export function logoTitle(text = 'TypeType', fontSize = 28, animate = true): string {
  return `<h1 style="font-family:${theme.font.display};font-size:${fontSize}px;font-weight:800;margin:0;
    display:flex;justify-content:center;">
    ${text
      .split('')
      .map((ch, i) => {
        const anim = animate
          ? `animation:ddSpringIn 0.5s cubic-bezier(0.34,1.56,0.64,1) ${(0.06 * i).toFixed(2)}s both;`
          : '';
        return `<span style="display:inline-block;color:${TITLE_COLORS[i % TITLE_COLORS.length]};${anim}">${ch === ' ' ? '&nbsp;' : ch}</span>`;
      })
      .join('')}
  </h1>`;
}
