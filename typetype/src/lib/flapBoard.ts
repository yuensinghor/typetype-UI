import { theme } from './theme';

type TileSize = 'lg' | 'md' | 'sm';

const SIZE_SPEC: Record<TileSize, { w: number; h: number; font: number; radius: number; gap: number }> = {
  lg: { w: 34, h: 46, font: 30, radius: 6, gap: 3 },
  md: { w: 24, h: 34, font: 21, radius: 5, gap: 2.5 },
  sm: { w: 15, h: 21, font: 13, radius: 3, gap: 2 },
};

/**
 * A row of mechanical split-flap tiles, à la airport departure boards.
 * Mount once into a persistent container, then call setValue() on every
 * change — only tiles whose character actually changed will flip.
 */
export class FlapBoard {
  private root: HTMLDivElement;
  private tileEls: HTMLDivElement[] = [];
  private oldFaceEls: HTMLDivElement[] = [];
  private newFaceEls: HTMLDivElement[] = [];
  private innerEls: HTMLDivElement[] = [];
  private current: string[] = [];
  private pendingHandlers: (Array<() => void>)[] = [];
  private spec: (typeof SIZE_SPEC)[TileSize];
  private tone: 'amber' | 'ivory';

  constructor(
    private container: HTMLElement,
    private length: number,
    size: TileSize = 'md',
    tone: 'amber' | 'ivory' = 'ivory'
  ) {
    this.spec = SIZE_SPEC[size];
    this.tone = tone;
    this.root = document.createElement('div');
    this.root.style.cssText = `display:flex;gap:${this.spec.gap}px;`;
    this.container.appendChild(this.root);
    this.buildTiles(length);
  }

  private buildTiles(length: number) {
    this.root.innerHTML = '';
    this.tileEls = [];
    this.oldFaceEls = [];
    this.newFaceEls = [];
    this.innerEls = [];
    this.current = new Array(length).fill(' ');
    this.pendingHandlers = new Array(length).fill(null).map(() => []);
    const faceColor = this.tone === 'amber' ? theme.color.signalAmber : theme.color.flapIvory;
    const bgColor = theme.color.casing;

    for (let i = 0; i < length; i++) {
      const tile = document.createElement('div');
      tile.style.cssText = `
        position:relative;width:${this.spec.w}px;height:${this.spec.h}px;
        perspective:${this.spec.h * 4}px;flex-shrink:0;
      `;

      const inner = document.createElement('div');
      inner.style.cssText = `
        position:relative;width:100%;height:100%;
        transform-style:preserve-3d;transition:transform 0.16s cubic-bezier(.45,0,.55,1);
      `;

      const oldFace = document.createElement('div');
      oldFace.textContent = ' ';
      oldFace.style.cssText = this.faceStyle(bgColor, faceColor, 0);

      const newFace = document.createElement('div');
      newFace.textContent = ' ';
      newFace.style.cssText = this.faceStyle(bgColor, faceColor, 180);

      inner.appendChild(oldFace);
      inner.appendChild(newFace);
      tile.appendChild(inner);
      this.root.appendChild(tile);

      this.tileEls.push(tile);
      this.innerEls.push(inner);
      this.oldFaceEls.push(oldFace);
      this.newFaceEls.push(newFace);
    }
  }

  private faceStyle(bg: string, fg: string, rotateY: number): string {
    return `
      position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      background:${bg};border-radius:${this.spec.radius}px;
      border:1px solid rgba(237,230,214,0.06);
      font-family:${theme.font.flap};font-weight:600;font-size:${this.spec.font}px;
      color:${fg};backface-visibility:hidden;transform:rotateY(${rotateY}deg);
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -${this.spec.h / 2}px 0 -${this.spec.h / 2 - 1}px rgba(0,0,0,0.35);
    `;
  }

  /** Render a value, resizing the board if length changes; flips only changed positions. */
  setValue(value: string, animate = true) {
    const chars = value.split('').slice(0, this.length);
    while (chars.length < this.length) chars.push(' ');

    chars.forEach((ch, i) => {
      if (this.current[i] === ch) return;
      this.current[i] = ch;
      const inner = this.innerEls[i];
      const oldFace = this.oldFaceEls[i];
      const newFace = this.newFaceEls[i];
      if (!inner) return;

      if (!animate) {
        oldFace.textContent = ch;
        newFace.textContent = ch;
        inner.style.transition = 'none';
        inner.style.transform = 'rotateY(0deg)';
        requestAnimationFrame(() => { inner.style.transition = 'transform 0.16s cubic-bezier(.45,0,.55,1)'; });
        return;
      }

      newFace.textContent = ch;
      inner.style.transform = 'rotateY(-180deg)';

      // If a previous flip on this tile is still mid-flight, its transitionend
      // was cancelled by CSS (never fires) — clean up that stale listener now
      // so it can't fire later with an outdated captured value.
      const pending = this.pendingHandlers[i];
      pending.forEach(h => inner.removeEventListener('transitionend', h));
      pending.length = 0;

      const onEnd = () => {
        // Always read the LIVE current value, not the `ch` captured when this
        // flip started — by the time this fires, current[i] may have moved on.
        const finalCh = this.current[i];
        oldFace.textContent = finalCh;
        newFace.textContent = finalCh;
        inner.style.transition = 'none';
        inner.style.transform = 'rotateY(0deg)';
        // Force reflow before restoring the transition for the next flip
        void inner.offsetHeight;
        inner.style.transition = 'transform 0.16s cubic-bezier(.45,0,.55,1)';
        inner.removeEventListener('transitionend', onEnd);
        const idx = this.pendingHandlers[i].indexOf(onEnd);
        if (idx !== -1) this.pendingHandlers[i].splice(idx, 1);
      };
      this.pendingHandlers[i].push(onEnd);
      inner.addEventListener('transitionend', onEnd);
    });
  }

  /** Resize the board to a new tile count (used when target answer length changes between rounds). */
  resize(length: number) {
    this.length = length;
    this.buildTiles(length);
  }

  destroy() {
    this.root.remove();
  }
}

/** Static (non-interactive) flap-styled label, for places that don't need live updates. */
export function flapLabelHTML(text: string, size: TileSize = 'sm'): string {
  const spec = SIZE_SPEC[size];
  return `
    <div style="display:inline-flex;gap:${spec.gap}px;">
      ${text.split('').map(ch => `
        <div style="width:${spec.w}px;height:${spec.h}px;display:flex;align-items:center;justify-content:center;
          background:${theme.color.casing};border-radius:${spec.radius}px;border:1px solid rgba(237,230,214,0.06);
          font-family:${theme.font.flap};font-weight:600;font-size:${spec.font}px;color:${theme.color.flapIvory};
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -${spec.h / 2}px 0 -${spec.h / 2 - 1}px rgba(0,0,0,0.35);">
          ${ch === ' ' ? '&nbsp;' : ch}
        </div>`).join('')}
    </div>`;
}
