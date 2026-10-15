// js/main.js — Application boot and global entry point

import { Game } from './game.js';

function bootGame() {
  if (window.__RFDS_GAME__) return;
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  const game = new Game(canvas);
  game.init();
  window.__RFDS_GAME__ = game;
  window.__RFD_GAME__ = game;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootGame);
} else {
  bootGame();
}
