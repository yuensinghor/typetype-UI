// src/lib/achievementUI.ts
import { BADGES, TIER_ORDER, TIER_LABELS, fetchUnlockedAchievements, type BadgeDef, type BadgeTier, type BadgeIcon } from './achievements';
import type { Identity } from '../shared/types';

const TIER_COLORS: Record<BadgeTier, { a: string; b: string; glow: string; disc0: string; disc1: string }> = {
  explorer:  { a: '#D9A066', b: '#8B5A2B', glow: '#E8B978', disc0: '#3A2A1A', disc1: '#1E1408' },
  skilled:   { a: '#7CE0FF', b: '#3A6DF0', glow: '#FFD23F', disc0: '#1B2A52', disc1: '#0E1730' },
  master:    { a: '#FFE9A8', b: '#D98A2B', glow: '#FFC94D', disc0: '#3A2A0E', disc1: '#1E1406' },
  elite:     { a: '#2DD4BF', b: '#6C4AB6', glow: '#C9B6FF', disc0: '#241C3D', disc1: '#120D22' },
  legendary: { a: '#FFF6D6', b: '#F0B400', glow: '#FFE9A8', disc0: '#3A2E0A', disc1: '#1A1404' },
  mythical:  { a: '#7C3AED', b: '#0B0620', glow: '#FFD700', disc0: '#241046', disc1: '#08040F' },
};

function iconMarkup(type: BadgeIcon, uid: string): string {
  switch (type) {
    case 'bolt': return `
      <path d="M100 34 L70 92 L88 92 L76 142 L118 78 L96 78 Z" fill="#7CE0FF" opacity="0.18" transform="translate(-8,3)"/>
      <path d="M100 34 L70 92 L88 92 L76 142 L118 78 L96 78 Z" fill="#FFD23F" stroke="#7A4B00" stroke-width="1.5" stroke-linejoin="round"/>`;
    case 'tornado': return `
      <g fill="none" stroke="#EAF6FF" stroke-width="4" stroke-linecap="round" opacity="0.9">
        <path d="M46 62 Q88 50 130 62"/><path d="M52 78 Q88 68 124 78"/><path d="M58 94 Q88 86 118 94"/>
        <path d="M66 110 Q88 104 110 110"/><path d="M74 124 Q88 120 102 124"/>
      </g>
      <text x="118" y="60" font-family="monospace" font-weight="700" font-size="13" fill="#FFE9A8" transform="rotate(18 118 60)">A</text>
      <text x="52" y="100" font-family="monospace" font-weight="700" font-size="11" fill="#FFE9A8" transform="rotate(-14 52 100)">Z</text>`;
    case 'target': return `
      <circle cx="88" cy="88" r="34" fill="#E8E8E8"/>
      <circle cx="88" cy="88" r="34" fill="none" stroke="#C0392B" stroke-width="9"/>
      <circle cx="88" cy="88" r="20" fill="#C0392B"/>
      <circle cx="88" cy="88" r="20" fill="none" stroke="#E8E8E8" stroke-width="7"/>
      <rect x="80" y="80" width="16" height="16" rx="2" fill="#2B2116" stroke="#EAD7B0" stroke-width="1.5"/>`;
    case 'ghost': return `
      <path d="M88 42 C 62 42 48 62 48 88 L 48 122 C 54 116 60 122 66 122 C 72 122 76 114 82 114 C 88 114 92 122 98 122 C 104 122 108 114 114 114 C 120 114 124 122 128 122 L 128 88 C 128 62 114 42 88 42 Z" fill="url(#ghostFill${uid})"/>
      <circle cx="76" cy="82" r="4.2" fill="#241C3D"/><circle cx="102" cy="82" r="4.2" fill="#241C3D"/>
      <text x="70" y="75" font-family="monospace" font-size="13" fill="#241C3D" opacity="0.18">+</text>
      <text x="94" y="100" font-family="monospace" font-size="11" fill="#241C3D" opacity="0.15">7</text>`;
    case 'key': return `
      <circle cx="68" cy="68" r="22" fill="none" stroke="url(#keyFill${uid})" stroke-width="9"/>
      <circle cx="68" cy="68" r="6" fill="#8A5A00"/>
      <rect x="76" y="86" width="9" height="52" rx="2" fill="url(#keyFill${uid})" transform="rotate(45 88 88)"/>
      <rect x="108" y="108" width="14" height="7" fill="url(#keyFill${uid})" transform="rotate(45 88 88)"/>
      <rect x="118" y="118" width="10" height="7" fill="url(#keyFill${uid})" transform="rotate(45 88 88)"/>`;
    case 'door': return `
      <path d="M62 132 L62 76 Q62 48 88 48 Q114 48 114 76 L114 132 Z" fill="none" stroke="url(#doorFill${uid})" stroke-width="6"/>
      <circle cx="88" cy="94" r="7" fill="url(#doorFill${uid})" opacity="0.85"/>
      <rect x="85" y="98" width="6" height="14" fill="url(#doorFill${uid})" opacity="0.85"/>
      <text x="42" y="66" font-size="14" fill="#C9B6FF" opacity="0.7">?</text>
      <text x="122" y="112" font-size="11" fill="#C9B6FF" opacity="0.55">?</text>`;
    case 'rocket': return `
      <g transform="rotate(-40 88 88)">
        <path d="M88 40 Q104 60 104 100 L72 100 Q72 60 88 40 Z" fill="url(#rocketFill${uid})" stroke="#7A4B00" stroke-width="1.5"/>
        <circle cx="88" cy="72" r="7" fill="#6BD1FF" stroke="#1B4E66" stroke-width="1.5"/>
        <path d="M72 96 L58 116 L72 110 Z" fill="#D9432B"/><path d="M104 96 L118 116 L104 110 Z" fill="#D9432B"/>
        <path d="M82 100 L94 100 L88 122 Z" fill="#FF9F1C"/>
      </g>
      <circle cx="46" cy="128" r="2" fill="#FFE9A8"/><circle cx="56" cy="118" r="1.4" fill="#FFE9A8"/><circle cx="38" cy="114" r="1.2" fill="#FFE9A8"/>`;
    case 'mountain': return `
      <path d="M40 128 L70 68 L88 96 L106 60 L136 128 Z" fill="url(#mtnFill${uid})" stroke="#5A4A1A" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M100 74 L106 60 L112 74 L106 70 Z" fill="#F4EFFF"/>
      <rect x="103" y="52" width="10" height="7" rx="1" fill="#2B2116" stroke="#EAD7B0" stroke-width="1"/>
      <circle cx="76" cy="104" r="3" fill="#2B2116"/>`;
    case 'crown': return `
      <g font-family="'Fredoka',sans-serif" font-weight="700" fill="#FFD700" opacity="0.85">
        <text x="24" y="92" font-size="12">7</text><text x="146" y="70" font-size="12">+</text>
        <text x="128" y="146" font-size="12">3</text><text x="42" y="150" font-size="12">−</text>
      </g>
      <path d="M58 108 L58 84 L72 98 L88 72 L104 98 L118 84 L118 108 Z" fill="url(#crownFill${uid})" stroke="#8A5A00" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="58" y="108" width="60" height="10" rx="2" fill="url(#crownFill${uid})" stroke="#8A5A00" stroke-width="1.5"/>
      <circle cx="88" cy="72" r="3.2" fill="#FF6B6B"/><circle cx="72" cy="86" r="2.4" fill="#6BD1FF"/><circle cx="104" cy="86" r="2.4" fill="#6BD1FF"/>`;
    case 'galaxy': return `
      <g fill="none" stroke="url(#galaxyFill${uid})" stroke-width="3.5" stroke-linecap="round">
        <path d="M88 88 Q120 78 128 50"/><path d="M88 88 Q60 66 40 78"/><path d="M88 88 Q108 116 138 112"/><path d="M88 88 Q64 112 50 138"/>
      </g>
      <circle cx="88" cy="88" r="11" fill="#FFF3C4"/>
      <g fill="#FFE9A8"><circle cx="34" cy="46" r="1.4"/><circle cx="146" cy="52" r="1.1"/><circle cx="140" cy="130" r="1.6"/><circle cx="40" cy="128" r="1.2"/></g>
      <text x="118" y="46" font-size="10" fill="#C9B6FF" opacity="0.7">+</text><text x="36" y="100" font-size="10" fill="#C9B6FF" opacity="0.7">7</text>`;
    case 'mask': return `
      <path d="M50 76 Q50 54 88 54 Q126 54 126 76 L126 96 Q88 108 50 96 Z" fill="#1C1830" stroke="#3A2E5A" stroke-width="2"/>
      <rect x="58" y="74" width="24" height="9" rx="3" fill="#F4EFFF"/><rect x="94" y="74" width="24" height="9" rx="3" fill="#F4EFFF"/>
      <circle cx="68" cy="78.5" r="2.6" fill="#1C1830"/><circle cx="104" cy="78.5" r="2.6" fill="#1C1830"/>`;
    case 'owl': return `
      <ellipse cx="88" cy="92" rx="34" ry="38" fill="url(#owlFill${uid})"/>
      <path d="M64 60 L72 76 L58 76 Z" fill="url(#owlFill${uid})"/><path d="M112 60 L104 76 L118 76 Z" fill="url(#owlFill${uid})"/>
      <circle cx="76" cy="86" r="12" fill="#F4EFFF"/><circle cx="100" cy="86" r="12" fill="#F4EFFF"/>
      <circle cx="76" cy="86" r="5" fill="#1C1830"/><circle cx="100" cy="86" r="5" fill="#1C1830"/>
      <path d="M84 98 L92 98 L88 106 Z" fill="#FF9F1C"/>
      <rect x="78" y="118" width="20" height="9" rx="2" fill="#2B2116" stroke="#EAD7B0" stroke-width="1"/>`;
    case 'flame': return `
      <path d="M88 46 Q108 78 96 100 Q120 92 112 122 Q108 140 88 142 Q68 140 64 122 Q56 92 80 100 Q68 78 88 46 Z" fill="url(#flameFill${uid})"/>
      <rect x="66" y="128" width="12" height="10" rx="1.5" fill="#2B2116" stroke="#EAD7B0" stroke-width="1"/>
      <rect x="82" y="128" width="12" height="10" rx="1.5" fill="#2B2116" stroke="#EAD7B0" stroke-width="1"/>
      <rect x="98" y="128" width="12" height="10" rx="1.5" fill="#2B2116" stroke="#EAD7B0" stroke-width="1"/>`;
    case 'dice': return `
      <rect x="42" y="70" width="30" height="36" rx="5" fill="#F4EFFF" stroke="#8A5A00" stroke-width="1.5"/>
      <rect x="73" y="70" width="30" height="36" rx="5" fill="#F4EFFF" stroke="#8A5A00" stroke-width="1.5"/>
      <rect x="104" y="70" width="30" height="36" rx="5" fill="#F4EFFF" stroke="#8A5A00" stroke-width="1.5"/>
      <text x="57" y="96" font-family="'Fredoka',sans-serif" font-weight="700" font-size="18" fill="#D9432B" text-anchor="middle">7</text>
      <text x="88" y="96" font-family="'Fredoka',sans-serif" font-weight="700" font-size="18" fill="#D9432B" text-anchor="middle">7</text>
      <text x="119" y="96" font-family="'Fredoka',sans-serif" font-weight="700" font-size="18" fill="#D9432B" text-anchor="middle">7</text>
      <circle cx="36" cy="60" r="1.6" fill="#FFE9A8"/><circle cx="140" cy="118" r="1.6" fill="#FFE9A8"/>`;
    case 'rabbit': return `
      <ellipse cx="88" cy="88" rx="30" ry="26" fill="none" stroke="url(#portalFill${uid})" stroke-width="5"/>
      <ellipse cx="88" cy="88" rx="18" ry="15" fill="none" stroke="url(#portalFill${uid})" stroke-width="3" opacity="0.6"/>
      <g transform="translate(30,26) rotate(-12 88 88)">
        <ellipse cx="88" cy="96" rx="12" ry="9" fill="#F4EFFF"/>
        <ellipse cx="80" cy="72" rx="4" ry="16" fill="#F4EFFF"/><ellipse cx="90" cy="70" rx="4" ry="18" fill="#F4EFFF"/>
        <circle cx="94" cy="92" r="2" fill="#1C1830"/>
      </g>`;
    default: return '';
  }
}

function gradientDefs(type: BadgeIcon, uid: string, t: { a: string; b: string; glow: string }): string {
  const g: Partial<Record<BadgeIcon, string>> = {
    ghost:  `<linearGradient id="ghostFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F5F0FF" stop-opacity="0.95"/><stop offset="100%" stop-color="${t.a}" stop-opacity="0.55"/></linearGradient>`,
    key:    `<linearGradient id="keyFill${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFF3C4"/><stop offset="100%" stop-color="#E8B93B"/></linearGradient>`,
    door:   `<linearGradient id="doorFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.a}"/><stop offset="100%" stop-color="${t.b}"/></linearGradient>`,
    rocket: `<linearGradient id="rocketFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F4EFFF"/><stop offset="100%" stop-color="${t.a}"/></linearGradient>`,
    mountain: `<linearGradient id="mtnFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.glow}"/><stop offset="100%" stop-color="${t.b}"/></linearGradient>`,
    crown:  `<linearGradient id="crownFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFF3C4"/><stop offset="100%" stop-color="#E8B93B"/></linearGradient>`,
    galaxy: `<linearGradient id="galaxyFill${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#C9B6FF"/><stop offset="100%" stop-color="#FFD700"/></linearGradient>`,
    owl:    `<linearGradient id="owlFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#B8956B"/><stop offset="100%" stop-color="#6B4A2E"/></linearGradient>`,
    flame:  `<linearGradient id="flameFill${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFF3B0"/><stop offset="55%" stop-color="#FFC94D"/><stop offset="100%" stop-color="#D9432B"/></linearGradient>`,
    rabbit: `<linearGradient id="portalFill${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${t.a}"/><stop offset="100%" stop-color="${t.b}"/></linearGradient>`,
  };
  return g[type] ?? '';
}

function badgeMedallionSVG(b: BadgeDef, uid: string, revealed: boolean): string {
  const t = TIER_COLORS[b.tier];
  const locked = !revealed;
  const secretHidden = b.secret && locked;

  return `
    <svg width="100" height="100" viewBox="0 0 176 176" style="${locked && !secretHidden ? 'filter:saturate(0.35) brightness(0.7);' : ''}">
      <defs>
        <linearGradient id="ring${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${t.a}"/><stop offset="100%" stop-color="${t.b}"/>
        </linearGradient>
        <radialGradient id="disc${uid}" cx="50%" cy="38%" r="78%">
          <stop offset="0%" stop-color="${t.disc0}"/><stop offset="100%" stop-color="${t.disc1}"/>
        </radialGradient>
        ${gradientDefs(b.icon, uid, t)}
      </defs>
      <circle cx="88" cy="88" r="82" fill="url(#disc${uid})" stroke="url(#ring${uid})" stroke-width="5"/>
      ${secretHidden
        ? `<text x="88" y="104" font-size="48" fill="${t.a}" text-anchor="middle" font-family="'Fredoka',sans-serif" font-weight="700" opacity="0.8">?</text>`
        : iconMarkup(b.icon, uid)}
    </svg>`;
}

function badgeCardHTML(b: BadgeDef, idx: number, unlocked: boolean): string {
  const t = TIER_COLORS[b.tier];
  const revealed = unlocked;
  const uid = b.id + idx;
  const showComingSoon = !b.trackable && !unlocked;

  const nameLine = b.secret && !unlocked
    ? `<div class="ach-name" style="color:#6B6188;">??? </div>`
    : `<div class="ach-name">${b.emoji} ${b.name}</div>`;

  const quoteLine = b.secret && !unlocked
    ? `<div class="ach-quote" style="opacity:0.5;">A secret waiting to be found.</div>`
    : `<div class="ach-quote">"${b.quote}"</div>`;

  const tagLine = unlocked
    ? `<div class="ach-tag" style="background:linear-gradient(90deg,#4ADE80,#22C55E);color:#0B1F12;">✓ Unlocked</div>`
    : b.secret
      ? `<div class="ach-tag" style="background:linear-gradient(90deg,#FFD23F,#FF9F6B);color:#2B1B00;">🔒 Secret</div>`
      : `<div class="ach-tag-tier" style="color:${t.glow};">${TIER_LABELS[b.tier].split(' ')[0]} Tier</div>`;

  const unlockLine = b.secret && !unlocked
    ? ''
    : `<div class="ach-unlock">${showComingSoon ? '🛠 Coming soon' : b.unlockLabel}</div>`;

  return `
    <div class="ach-card ${unlocked ? '' : 'locked'}">
      <div class="ach-medallion-wrap">
        <div class="ach-glow" style="background:radial-gradient(circle, ${t.glow}, transparent 70%); opacity:${unlocked ? 0.5 : 0.22};"></div>
        ${badgeMedallionSVG(b, uid, revealed)}
      </div>
      ${tagLine}
      ${nameLine}
      <div class="ach-stars">${'★'.repeat(b.stars)}</div>
      ${quoteLine}
      ${unlockLine}
    </div>`;
}

export async function renderAchievementsHTML(userId: string | null): Promise<string> {
  let unlocked = new Set<string>();
  if (userId) {
    unlocked = await fetchUnlockedAchievements(userId);
  }

  const total = BADGES.length;
  const earned = unlocked.size;
  const guestNote = !userId
    ? `<div class="ach-summary">Sign in to start earning badges.</div>`
    : `<div class="ach-summary">${earned} / ${total} badges earned</div>`;

  return `
    <style>
      .ach-body { height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 10px 10px 40px 10px; }
      .ach-tier-head { display:flex; align-items:baseline; gap:8px; margin: 22px 0 10px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; }
      .ach-tier-head:first-child { margin-top: 0; }
      .ach-tier-head .ach-tier-name { font-family:'Fredoka',sans-serif; font-size:14px; font-weight:700; color:#F4EFFF; }
      .ach-tier-head .ach-tier-count { font-size:10.5px; color:#756A99; }
      .ach-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .ach-card { display:flex; flex-direction:column; align-items:center; text-align:center; padding:10px 6px; border-radius:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); }
      .ach-medallion-wrap { position:relative; width:80px; height:80px; display:flex; align-items:center; justify-content:center; margin-bottom:8px; }
      .ach-glow { position:absolute; inset:-10px; border-radius:50%; filter:blur(12px); z-index:0; }
      .ach-medallion-wrap svg { position:relative; z-index:1; width: 80px; height: 80px; }
      .ach-tag { display:inline-block; font-size:8px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:2px 6px; border-radius:20px; margin-bottom:4px; }
      .ach-tag-tier { font-size:8px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:4px; }
      .ach-name { font-family:'Fredoka',sans-serif; font-size:12px; font-weight:700; color:#F4EFFF; margin-bottom:4px; }
      .ach-stars { font-size:9px; letter-spacing:1.5px; color:#FFD23F; margin-bottom:4px; }
      .ach-quote { font-style:italic; font-size:10px; color:#B8AEDE; line-height:1.3; margin-bottom:4px; min-height:26px; }
      .ach-unlock { font-size:8.5px; color:#756A99; text-transform:uppercase; letter-spacing:0.03em; line-height:1.4; }
      .ach-card.locked .ach-name, .ach-card.locked .ach-quote { opacity: 0.75; }
      .ach-summary { text-align:center; margin-bottom:6px; color:#9E93C4; font-size:12px; font-family: 'Nunito', sans-serif; }
    </style>
    <div class="ach-body">
      ${guestNote + TIER_ORDER.map(tierKey => {
        const items = BADGES.filter(b => b.tier === tierKey);
        return `
          <div class="ach-tier-head">
            <span class="ach-tier-name">${TIER_LABELS[tierKey]}</span>
            <span class="ach-tier-count">${items.filter(b => unlocked.has(b.id)).length} / ${items.length}</span>
          </div>
          <div class="ach-grid">
            ${items.map((b, i) => badgeCardHTML(b, i, unlocked.has(b.id))).join('')}
          </div>`;
      }).join('')}
    </div>
  `;
}