import Phaser from 'phaser';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Nothing to preload — all UI is DOM-based
  }

  create() {
    this.scene.start('Preloader');
  }
}
