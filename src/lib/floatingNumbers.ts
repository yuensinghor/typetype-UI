import { theme } from './theme';

interface FloatSlot {
  x: string;
  y: string;
  s: number;
  rot: number;
  delay: number;
  dur: number;
}

// TypeType is a numeric transcription game, not a typing-alphabet game —
// background decoration uses digits AND math operators (0-9, +, −, .),
// never QWERTY letters.
const CHARS = ['4', '7', '9', '5', '0', '8', '6', '2', '+', '−', '.', '3'];

// Fixed scattered positions (deterministic layout, only the character shown
// at each slot rotates via `seed` — keeps screens visually distinct without
// a jumpy random layout on every render).
const POSITIONS: FloatSlot[] = [
  { x: '5%', y: '10%', s: 0.7, rot: -12, delay: 0, dur: 5 },
  { x: '82%', y: '14%', s: 0.6, rot: 8, delay: 1.3, dur: 6 },
  { x: '8%', y: '74%', s: 0.65, rot: 6, delay: 0.7, dur: 5.5 },
  { x: '84%', y: '70%', s: 0.75, rot: -9, delay: 2.0, dur: 6.5 },
  { x: '3%', y: '42%', s: 0.55, rot: 4, delay: 2.5, dur: 5.8 },
  { x: '90%', y: '44%', s: 0.6, rot: -5, delay: 0.4, dur: 5.2 },
  { x: '75%', y: '88%', s: 0.5, rot: -7, delay: 3.0, dur: 5.4 },
  { x: '18%', y: '90%', s: 0.45, rot: -4, delay: 2.2, dur: 5.6 },
];

/**
 * Decorative scattered background digits + operators — the typetype.fun
 * "floating keys" motif, ported from framer-motion to a plain CSS
 * animation (`ddFloat`, defined once in globalStyles.ts).
 *
 * Renders as absolutely-positioned elements. The caller's container must be
 * position:relative (or absolute) for placement to work, and real content
 * should sit above it (give content position:relative; z-index:1).
 *
 * @param seed shifts which character appears in which slot, so different
 *   screens using this don't look identical.
 */
export function floatingBackgroundHTML(seed = 0): string {
  return POSITIONS.map((p, i) => {
    const char = CHARS[(i + seed) % CHARS.length];
    const size = Math.round(36 * p.s);
    const fontSize = Math.round(18 * p.s);
    return `
      <div style="
        position:absolute; left:${p.x}; top:${p.y}; pointer-events:none; user-select:none;
        --dd-rot:${p.rot}deg;
        animation: ddFloat ${p.dur}s ease-in-out ${p.delay}s infinite;
      ">
        <div style="
          width:${size}px;height:${size}px;border-radius:10px;display:flex;align-items:center;justify-content:center;
          font-family:${theme.font.display};font-weight:700;font-size:${fontSize}px;color:#fff;
          background:${theme.palette.floatingKeyGradient};
          border:1.5px solid rgba(255,255,255,0.5);opacity:0.35;">
          ${char}
        </div>
      </div>`;
  }).join('');
}
