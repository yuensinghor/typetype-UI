import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Preloader } from './scenes/Preloader';
import { ChallengeLanding } from './scenes/ChallengeLanding';
import { ChallengeTestRound } from './scenes/ChallengeTestRound';
import { ChallengeResult } from './scenes/ChallengeResult';
import { MainMenu } from './scenes/MainMenu';
import { Game } from './scenes/Game';
import { GameOver } from './scenes/GameOver';
import type { Identity } from './shared/types';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  transparent: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [Boot, Preloader, ChallengeLanding, ChallengeTestRound, ChallengeResult, MainMenu, Game, GameOver],
};

export const phaserGame = new Phaser.Game(config);

// Identity is resolved once during Preloader and stashed in the registry
// so every scene can read it synchronously afterward.
export function getIdentity(): Identity | null {
  return phaserGame.registry.get('identity') ?? null;
}

export function getUsername(): string {
  return getIdentity()?.username ?? '';
}
