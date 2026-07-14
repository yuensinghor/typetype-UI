// Layout: 7 8 9 [back] / 4 5 6 − / 1 2 3 + / 0(wide) .(wide)
// Shared between Game.ts (real tier play) and ChallengeTestRound.ts (Screen 2
// of the Challenge Flow) — extracted here so both stay in sync automatically.
export const KEYPAD = [
  [{ v: '7' }, { v: '8' }, { v: '9' }, { v: '⌫', k: 'backspace' }],
  [{ v: '4' }, { v: '5' }, { v: '6' }, { v: '−', k: '-' }],
  [{ v: '1' }, { v: '2' }, { v: '3' }, { v: '+' }],
  [{ v: '0', wide: true }, { v: '.', wide: true }],
] as { v: string; k?: string; wide?: boolean }[][];
