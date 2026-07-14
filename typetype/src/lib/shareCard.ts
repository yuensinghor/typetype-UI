import { theme } from './theme';
import type { Tier } from '../shared/types';

export interface ShareCardData {
  tier: Tier;
  username: string;
  score: number;
  avgTime: number; // seconds
  clearedHiddenBonus: boolean;
  hasLimitBreakAward: boolean;
}

const TIER_LABELS: Record<Tier, string> = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', boss: 'BOSS' };

const TIER_ACCENT: Record<Tier, string> = {
  easy: '#22C55E',
  medium: '#7C6CF6',
  hard: '#F5A524',
  boss: '#F04452',
};

const W = 1080;
const H = 1350;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function ensureFontsLoaded() {
  try {
    await Promise.all([
      document.fonts.load('800 64px "Space Grotesk"'),
      document.fonts.load('700 32px "Space Grotesk"'),
    ]);
    await document.fonts.ready;
  } catch {
    // best-effort — canvas will fall back to system fonts if this fails
  }
}

export async function renderShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  await ensureFontsLoaded();

  const c = theme.color;
  const accent = TIER_ACCENT[data.tier];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createRadialGradient(W / 2, 260, 40, W / 2, 260, 700);
  grad.addColorStop(0, `${accent}22`);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const pad = 64;
  const cardX = pad, cardY = 220, cardW = W - pad * 2, cardH = 900;
  ctx.fillStyle = c.bgCard;
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = c.textPrimary;
  ctx.font = '800 52px "Space Grotesk", sans-serif';
  ctx.fillText('TypeType', 64, 108);

  ctx.textAlign = 'right';
  ctx.fillStyle = c.textMuted;
  ctx.font = '700 22px "Space Grotesk", sans-serif';
  ctx.fillText('typetype.fun', W - 64, 108);

  const headline = data.hasLimitBreakAward ? 'LIMIT BREAK CLEARED' : `LEVEL CLEARED`;
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '700 26px "Space Grotesk", sans-serif';
  ctx.fillText(headline, W / 2, cardY + 90);

  ctx.fillStyle = c.textPrimary;
  ctx.font = '800 130px "Space Grotesk", sans-serif';
  ctx.fillText(TIER_LABELS[data.tier], W / 2, cardY + 250);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(cardX + 48, cardY + 340);
  ctx.lineTo(cardX + cardW - 48, cardY + 340);
  ctx.stroke();
  ctx.setLineDash([]);

  const statY = cardY + 470;
  drawStat(ctx, W / 2 - 220, statY, 'SCORE', String(data.score), c.textPrimary);
  drawStat(ctx, W / 2 + 220, statY, 'AVG TIME', `${data.avgTime.toFixed(2)}s`, accent);

  let badgeY = statY + 130;
  ctx.font = '700 24px "Space Grotesk", sans-serif';
  if (data.clearedHiddenBonus) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F5A524';
    ctx.fillText('🏅 BONUS STAGES CLEARED', W / 2, badgeY);
    badgeY += 46;
  }
  if (data.hasLimitBreakAward) {
    ctx.fillStyle = '#22C55E';
    ctx.fillText('⚡ LIMIT BREAK CLEARED', W / 2, badgeY);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = c.textSecondary;
  ctx.font = '700 24px "Space Grotesk", sans-serif';
  ctx.fillText(`${data.username}`, W / 2, cardY + cardH - 56);

  ctx.fillStyle = accent;
  roundRect(ctx, cardX, cardY + cardH + 32, cardW, 84, 16);
  ctx.fill();
  ctx.fillStyle = '#0B0E14';
  ctx.font = '800 30px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CAN YOU BEAT MY TIME?', W / 2, cardY + cardH + 32 + 54);

  return canvas;
}

function drawStat(ctx: CanvasRenderingContext2D, cx: number, y: number, label: string, value: string, color: string) {
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.color.textMuted;
  ctx.font = '700 20px "Space Grotesk", sans-serif';
  ctx.fillText(label, cx, y);
  ctx.fillStyle = color;
  ctx.font = '800 64px "Space Grotesk", sans-serif';
  ctx.fillText(value, cx, y + 78);
}

export function shareCaption(data: ShareCardData): string {
  const label = TIER_LABELS[data.tier];
  if (data.hasLimitBreakAward) {
    return `I just cleared LIMIT BREAK on TypeType \u26a1 Beat that if you can \u2192 typetype.fun`;
  }
  return `I just cleared ${label} on TypeType in ${data.avgTime.toFixed(2)}s/round. Can you beat me? \u2192 typetype.fun`;
}

export async function shareOrDownload(canvas: HTMLCanvasElement, data: ShareCardData): Promise<'shared' | 'downloaded' | 'failed'> {
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return 'failed';

  const fileName = `typetype-${data.tier}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });
  const caption = shareCaption(data);

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption, title: 'TypeType' });
      return 'shared';
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
