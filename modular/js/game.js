// js/game.js — Main Game lifecycle, Deterministic Seeded Run management, fixed-step 60Hz loop, and cheat-gated progression

import { CONFIG, SeededRandom } from './config.js';
import { SaveManager } from './save.js';
import { AudioManager } from './audio.js';
import { ProgressionManager } from './progression.js';
import { Pathfinder } from './pathfinding.js';
import { MapManager } from './maps.js';
import { ObstacleManager } from './obstacles.js';
import { PowerUpManager } from './powerups.js';
import { Player } from './player.js';
import { PursuerAI } from './pursuer.js';
import { NPCManager } from './npc.js';
import { ModeManager } from './modes.js';
import { InputManager } from './input.js';
import { Renderer } from './renderer.js';
import { UIManager } from './ui.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.saveManager = new SaveManager();
    this.audioManager = new AudioManager(this.saveManager);
    this.progressionManager = new ProgressionManager(this.saveManager);
    this.pathfinder = new Pathfinder();
    this.mapManager = new MapManager();
    this.obstacleManager = new ObstacleManager();
    this.powerUpManager = new PowerUpManager();
    this.player = new Player();
    this.pursuer = new PursuerAI();
    this.npcManager = new NPCManager();
    this.modeManager = new ModeManager();
    this.inputManager = new InputManager(this.saveManager);
    this.renderer = new Renderer(canvas);
    this.uiManager = new UIManager(this);

    this.activeSeed = SeededRandom.generateSeedString();
    this.customSeedLocked = false;
    this.sessionCheated = false;

    this.state = 'MENU';
    this.countdownValue = 3.0;
    this.runTime = 0;
    this.currentScore = 0;
    this.currentHeatLevel = 1;
    this.hitStopTimer = 0;
    this.forceHudRefresh = true;

    this.runStats = this._createBlankRunStats();
    this.particles = [];
    this.floatingTexts = [];

    this.lastFrameTime = performance.now();
    this.accumulator = 0;
  }

  init() {
    this.uiManager.init();
    this._setupCheatConsoleHooks();

    this.inputManager.bindMobileControls(
      document.getElementById('touch-joystick-zone'),
      document.getElementById('touch-joystick-knob'),
      document.getElementById('btn-touch-dodge'),
      document.getElementById('btn-touch-sprint'),
      document.getElementById('btn-touch-ability')
    );

    const eq = this.saveManager.data.equipped;
    this.loadMenuPreviewMap(eq.map || 'downtown', this.activeSeed);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && (this.state === 'PLAYING' || this.state === 'COUNTDOWN')) {
        this.pauseRun();
      }
    });

    // FIXED: Auto-pause when window loses focus (e.g., clicking another monitor or OS notification)
    window.addEventListener('blur', () => {
      if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
        this.pauseRun();
      }
    });

    if (!this.saveManager.data.tutorialSeen) {
      this.uiManager.openModal('modal-tutorial');
    }

    requestAnimationFrame((ts) => this._loop(ts));
  }

  _setupCheatConsoleHooks() {
    const printCheatMenu = () => {
      this.sessionCheated = true;
      if (this.runStats) this.runStats.cheated = true;
      this.audioManager.playSfx('cheat');
      const menuText = [
        '============================================================',
        '  RUN FROM DANDO // [/iamacheater] SANDBOX CHEATS ACTIVE',
        '  (Note: Cheated runs do not record high scores or honors)',
        '============================================================',
        '  Press number keys [1]-[9], [0] at any time (or call cheat(n)):',
        '  [1] +5,000 Sandbox CRED',
        '  [2] Unlock All Archetypes & Cosmetics (Sandbox)',
        '  [3] Toggle GOD MODE (Invulnerability)',
        '  [4] Stun / Freeze Dando for 15 seconds',
        '  [5] Toggle 1.8x Super Speed',
        '  [6] Instant Win / Complete Current Mode',
        '  [7] Spawn All 5 Power-Ups Around Player',
        '  [8] Trigger "STOP FOLLOWING ME!!" Easter Egg Scream',
        '  [9] Advance Heat Level (+16s) & Trigger Mutator',
        '  [0] Reset Active Run Cheats',
        '============================================================'
      ].join('\n');
      console.log(menuText);
      this.uiManager.showCheatConsoleBanner();
      this.uiManager.showToast('[/iamacheater] SANDBOX CHEATS UNLOCKED (RECORDS GATED)');
    };

    this.inputManager.onActivateCheats = printCheatMenu;
    this.inputManager.onExecuteCheatNumber = (digit) => this.executeCheatCode(digit);

    window.cheat = (arg) => {
      if (arg === '/iamacheater' || arg === 'iamacheater' || arg === undefined) {
        this.inputManager.unlockCheats();
        return 'CHEATS UNLOCKED. Use number keys 1-9, 0 or cheat(1..9).';
      }
      if (typeof arg === 'number') {
        this.inputManager.cheatsUnlocked = true;
        return this.executeCheatCode(arg);
      }
    };

    try {
      Object.defineProperty(window, 'iamacheater', {
        configurable: true,
        get: () => {
          this.inputManager.unlockCheats();
          return 'CHEATER MODE ACTIVATED — Press number keys [1]-[9], [0]!';
        }
      });
    } catch (e) {
      // Ignore if property already defined
    }
  }

  executeCheatCode(digit) {
    this.sessionCheated = true;
    if (this.runStats) this.runStats.cheated = true;
    this.audioManager.playSfx('cheat');
    const solidRects = this.obstacleManager.solidRects;
    let msg = '';

    switch (digit) {
      case 1:
        this.saveManager.enterSandboxMode();
        this.saveManager.data.currency += 5000;
        this.uiManager.refreshMainMenu();
        msg = 'CHEAT [1]: +5,000 SANDBOX CRED ADDED';
        break;
      case 2:
        this.saveManager.unlockAllCheats();
        this.uiManager.refreshMainMenu();
        this.uiManager.renderShopModal();
        msg = 'CHEAT [2]: ALL ARCHETYPES & COSMETICS UNLOCKED (SANDBOX)';
        break;
      case 3:
        this.player.cheatGodMode = !this.player.cheatGodMode;
        msg = `CHEAT [3]: GOD MODE ${this.player.cheatGodMode ? 'ON' : 'OFF'}`;
        break;
      case 4:
        this.pursuer.stun(15.0);
        msg = 'CHEAT [4]: DANDO STUNNED FOR 15s';
        break;
      case 5:
        this.player.cheatSpeedMult = this.player.cheatSpeedMult > 1.1 ? 1.0 : 1.8;
        msg = `CHEAT [5]: SUPER SPEED ${this.player.cheatSpeedMult > 1.1 ? '1.8x ON' : 'OFF'}`;
        break;
      case 6:
        if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
          this.endRun(true, 'CHEAT OVERRIDE // INSTANT VICTORY');
        }
        msg = 'CHEAT [6]: INSTANT RUN VICTORY';
        break;
      case 7: {
        const types = Object.keys(CONFIG.POWERUPS);
        types.forEach((t, i) => {
          const angle = (i / types.length) * Math.PI * 2;
          this.powerUpManager.spawnPickupAt(
            this.player.x + Math.cos(angle) * 65,
            this.player.y + Math.sin(angle) * 65,
            t,
            solidRects
          );
        });
        msg = 'CHEAT [7]: SPAWNED ALL 5 POWER-UPS';
        break;
      }
      case 8:
        this.triggerEasterEggScream();
        msg = 'CHEAT [8]: TRIGGERED "STOP FOLLOWING ME!!" SCREAM';
        break;
      case 9:
        this.runTime += 16;
        this.modeManager.triggerNextChaosModifier(this.mapManager.mapData, this.powerUpManager, solidRects, {});
        msg = 'CHEAT [9]: ADVANCED HEAT WAVE +16s & MUTATOR';
        break;
      case 0:
        this.player.cheatGodMode = false;
        this.player.cheatSpeedMult = 1.0;
        msg = 'CHEAT [0]: RESET ACTIVE CHEATS';
        break;
    }

    console.log(`[CHEAT] ${msg}`);
    this.uiManager.showToast(msg);
    this.forceHudRefresh = true;
    return msg;
  }

  triggerEasterEggScream() {
    this.player.triggerEasterEggScream();
    this.audioManager.playSfx('scream');
    this.renderer.addScreenShake(7, this.saveManager.data.settings.reducedMotion);
  }

  _createBlankRunStats() {
    const eq = this.saveManager.data.equipped;
    const isCheated = Boolean(
      this.sessionCheated ||
      this.inputManager.cheatsUnlocked ||
      this.player.cheatGodMode ||
      this.player.cheatSpeedMult > 1.01
    );
    return {
      seed: this.activeSeed,
      mapId: eq.map || 'downtown',
      modeId: eq.mode || 'survival',
      difficultyId: eq.difficulty || 'normal',
      characterId: eq.character || 'balanced',
      survivalTime: 0,
      distanceTravelled: 0,
      pickupsCollected: 0,
      speedBoostsCollected: 0,
      objectivesCompleted: 0,
      nearMisses: 0,
      attacksDodged: 0,
      overheals: 0,
      scoreStars: 0,
      damageTaken: 0,
      untouchableTime: 0,
      modifierScoreMult: 1.0,
      cheated: isCheated,
      escaped: false,
      endReason: ''
    };
  }

  loadMenuPreviewMap(mapId, seedStr = '') {
    const useSeed = seedStr || this.activeSeed || SeededRandom.generateSeedString();
    this.activeSeed = useSeed;
    const eq = this.saveManager.data.equipped;
    const mapData = this.mapManager.loadMap(mapId, useSeed, eq.difficulty || 'normal');
    this.obstacleManager.initFromMap(mapData, eq.difficulty || 'normal', this.pathfinder, useSeed);
    this.player.reset(mapData.playerSpawn.x, mapData.playerSpawn.y, eq.character);
    this.pursuer.reset(mapData.pursuerSpawn.x, mapData.pursuerSpawn.y, eq.difficulty || 'normal', useSeed);
    this.npcManager.initForMap(mapData, eq.difficulty || 'normal', this.obstacleManager.solidRects, useSeed);
    this.powerUpManager.reset(mapData, this.obstacleManager.solidRects, 'survival', useSeed);
    this.renderer.camera.x = mapData.playerSpawn.x;
    this.renderer.camera.y = mapData.playerSpawn.y;
  }

  startNewRun(keepCurrentSeed = false) {
    this.uiManager.closeAllModals();
    const profile = this.saveManager.data;
    const eq = profile.equipped;

    // FIXED:
    // - If launching from MENU, always use the seed displayed in #input-run-seed so the visible seed is 100% what you play.
    // - If clicking "Restart Sector" or "Replay Seed" (keepCurrentSeed === true) or if customSeedLocked, reuse activeSeed.
    // - If clicking "New Seed Run" from RESULTS with an unlocked seed, roll a fresh seed.
    const seedInput = document.getElementById('input-run-seed');
    if (this.state === 'MENU') {
      if (seedInput && seedInput.value.trim()) {
        this.activeSeed = seedInput.value.trim().toUpperCase();
      } else if (!this.activeSeed) {
        this.activeSeed = SeededRandom.generateSeedString();
      }
    } else if (!keepCurrentSeed && !this.customSeedLocked) {
      this.activeSeed = SeededRandom.generateSeedString();
    }
    if (seedInput) seedInput.value = this.activeSeed;

    const isFirstRun = (profile.statistics.totalRuns === 0);
    const mapData = this.mapManager.loadMap(eq.map, this.activeSeed, eq.difficulty);
    this.obstacleManager.initFromMap(mapData, eq.difficulty, this.pathfinder, this.activeSeed);

    const hasGrip = profile.unlockedCosmetics.includes('upgrade_shoes');
    this.player.reset(mapData.playerSpawn.x, mapData.playerSpawn.y, eq.character, hasGrip);
    this.pursuer.reset(mapData.pursuerSpawn.x, mapData.pursuerSpawn.y, eq.difficulty, this.activeSeed, isFirstRun);
    this.npcManager.initForMap(mapData, eq.difficulty, this.obstacleManager.solidRects, this.activeSeed);
    this.powerUpManager.reset(mapData, this.obstacleManager.solidRects, eq.mode, this.activeSeed);
    this.modeManager.reset(eq.mode, eq.difficulty, mapData, this.obstacleManager.solidRects, this.activeSeed);

    this.runStats = this._createBlankRunStats();
    this.runTime = 0;
    this.currentScore = 0;
    this.currentHeatLevel = 1;
    this.hitStopTimer = 0;
    this.countdownValue = 3.0;
    this.particles = [];
    this.floatingTexts = [];
    this.inputManager.clearAllInputs();

    this.renderer.camera.x = this.player.x;
    this.renderer.camera.y = this.player.y;

    this.state = 'COUNTDOWN';
    this.forceHudRefresh = true;
    this.uiManager.showScreen('screen-hud');
    this.audioManager.playSfx('countdown');
    this.audioManager.startMusic(eq.map);
  }

  togglePause() {
    if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') {
      this.pauseRun();
    } else if (this.state === 'PAUSED') {
      this.resumeRun();
    }
  }

  pauseRun() {
    if (this.state !== 'PLAYING' && this.state !== 'COUNTDOWN') return;
    this.previousPlayState = this.state;
    this.state = 'PAUSED';
    this.audioManager.stopMusic();
    this.inputManager.clearAllInputs();
    this.uiManager.showScreen('screen-pause');
  }

  resumeRun() {
    if (this.state !== 'PAUSED') return;
    this.uiManager.closeAllModals();
    this.state = this.previousPlayState || 'PLAYING';
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.audioManager.startMusic(this.saveManager.data.equipped.map);
    this.uiManager.showScreen('screen-hud');
  }

  returnToMainMenu() {
    this.uiManager.closeAllModals();
    this.audioManager.stopMusic();
    this.state = 'MENU';
    // Pre-roll next seed when returning to menu if seed is unlocked so the displayed seed matches the next run
    if (!this.customSeedLocked) {
      this.activeSeed = SeededRandom.generateSeedString();
    }
    this.loadMenuPreviewMap(this.saveManager.data.equipped.map, this.activeSeed);
    this.uiManager.refreshMainMenu();
    this.uiManager.showScreen('screen-menu');
  }

  endRun(escaped = false, reason = 'Caught by Dando!') {
    if (this.state === 'RESULTS') return;
    this.state = 'RESULTS';
    this.audioManager.stopMusic();
    this.audioManager.playSfx(escaped ? 'victory' : 'gameover');

    this.runStats.survivalTime = this.runTime;
    this.runStats.distanceTravelled = this.player.distanceTravelled;
    this.runStats.escaped = escaped;
    this.runStats.endReason = reason;
    if (this.sessionCheated || this.inputManager.cheatsUnlocked || this.player.cheatGodMode || this.player.cheatSpeedMult > 1.01) {
      this.runStats.cheated = true;
    }

    const outcome = this.progressionManager.processRunResults(this.runStats);
    this.uiManager.showResultsScreen(this.runStats, outcome);
  }

  spawnParticles(x, y, color = '#e5ff00', count = 8, speed = 130) {
    if (this.saveManager.data.settings.reducedMotion) count = Math.min(3, count);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= CONFIG.SIMULATION.MAX_PARTICLES) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color,
        size: 3 + Math.random() * 3,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7
      });
    }
  }

  spawnFloatingText(x, y, text, color = '#e5ff00') {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1.0,
      maxLife: 1.0
    });
  }

  _loop(timestamp) {
    const rawElapsed = (timestamp - this.lastFrameTime) * 0.001;
    this.lastFrameTime = timestamp;

    const clampedElapsed = Math.min(Math.max(0, rawElapsed), CONFIG.SIMULATION.MAX_ACCUMULATED_TIME);
    this.accumulator += clampedElapsed;

    const dt = CONFIG.SIMULATION.FIXED_DT;
    while (this.accumulator >= dt) {
      this._fixedUpdate(dt);
      this.accumulator -= dt;
    }

    this._renderFrame(clampedElapsed);
    requestAnimationFrame((ts) => this._loop(ts));
  }

  _fixedUpdate(dt) {
    const input = this.inputManager.getInputState();

    if (input.pausePressed && this.uiManager.isAnyModalOpen()) {
      this.uiManager.closeAllModals();
      return;
    }

    if (input.pausePressed && (this.state === 'PLAYING' || this.state === 'COUNTDOWN' || this.state === 'PAUSED')) {
      this.togglePause();
      return;
    }

    if (input.confirmPressed && !this.uiManager.isAnyModalOpen() && (this.state === 'MENU' || this.state === 'RESULTS')) {
      this.audioManager.initFromGesture();
      this.startNewRun(false);
      return;
    }

    // FIXED: Animate background traffic & rotors while on the Main Menu so the scene feels alive
    if (this.state === 'MENU') {
      const t = performance.now() * 0.00022;
      const mapData = this.mapManager.mapData;
      if (mapData) {
        this.obstacleManager.update(dt, mapData, 1.0, 1.0, null);
        this.renderer.updateCamera(
          mapData.width * 0.5 + Math.cos(t) * 280,
          mapData.height * 0.5 + Math.sin(t) * 190,
          dt,
          true
        );
      }
      return;
    }

    if (this.state === 'PAUSED' || this.state === 'RESULTS') {
      return;
    }

    if (this.state === 'COUNTDOWN') {
      const prevCeil = Math.ceil(this.countdownValue);
      this.countdownValue -= dt;
      const nextCeil = Math.ceil(this.countdownValue);
      if (nextCeil !== prevCeil && nextCeil > 0) {
        this.audioManager.playSfx('countdown');
      }
      if (this.countdownValue <= 0) {
        this.state = 'PLAYING';
        this.audioManager.playSfx('go');
        this.spawnFloatingText(this.player.x, this.player.y - 36, 'EVADE DANDO!', '#e5ff00');
      }
      this.uiManager.updateHUD(dt, this);
      return;
    }

    // Micro hit-stop on successful lunge juke for tactile feedback
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      this.uiManager.updateHUD(dt, this);
      return;
    }

    this.runTime += dt;
    if (this.runStats.damageTaken === 0) {
      this.runStats.untouchableTime = this.runTime;
    }

    const mapData = this.mapManager.mapData;
    const eq = this.saveManager.data.equipped;
    const settings = this.saveManager.data.settings;
    const solidRects = this.obstacleManager.solidRects;

    const heatInfo = this.progressionManager.getHeatLevelInfo(this.runTime);
    if (heatInfo.current.level > this.currentHeatLevel) {
      this.currentHeatLevel = heatInfo.current.level;
      this.audioManager.playSfx('heat_up');
      this.uiManager.showToast(`▲ ${heatInfo.current.name} — PURSUIT INTENSIFIES!`);
    }

    if (input.dodgePressed) {
      if (this.modeManager.activeModifier?.dodgeFast) {
        this.player.dodgeCooldownMax = this.player.archetype.dodgeCooldown * 0.50;
      } else {
        this.player.dodgeCooldownMax = this.player.archetype.dodgeCooldown;
      }

      if (this.player.tryDodge(input.moveX, input.moveY)) {
        this.audioManager.playSfx('dodge');
        this.spawnParticles(this.player.x, this.player.y, '#e5ff00', 7, 90);

        if (this.obstacleManager.isNearDynamicHazard(this.player, 36)) {
          this.runStats.nearMisses++;
          this.player.jukeFlashTimer = 0.35;
          this.audioManager.playSfx('nearmiss');
          this.spawnFloatingText(this.player.x, this.player.y - 48, 'HAZARD JUKE +75', '#00ff88');
        }
      }
    }

    if (input.abilityPressed) {
      const used = this.player.tryUseAbility({
        onSpawnSmoke: (x, y, radius, duration = 3.6) => {
          this.obstacleManager.areaHazards.push({ type: 'smoke', x, y, radius, label: 'SMOKE POP', tempTimer: duration });
          this.spawnFloatingText(x, y - 48, 'SMOKE POP!', '#e5ff00');
        },
        onShockwave: (x, y, radius) => {
          this.npcManager.applyShockwave(x, y, radius, solidRects);
          if (Math.hypot(this.pursuer.x - x, this.pursuer.y - y) <= radius) {
            this.pursuer.stun(2.0);
          }
          this.renderer.addScreenShake(9, settings.reducedMotion);
          this.spawnParticles(x, y, '#ff5500', 14, 190);
          this.spawnFloatingText(x, y - 48, 'SHOCKWAVE!', '#ff5500');
        },
        onHoloBlink: (oldX, oldY) => {
          this.powerUpManager.deployDecoyAt(oldX, oldY, 3.8, solidRects);
          this.obstacleManager.resolveCircleObstacles(this.player, this.player.radius);
          this.spawnParticles(oldX, oldY, '#00e5ff', 12, 150);
          this.spawnFloatingText(this.player.x, this.player.y - 48, 'HOLO-BLINK!', '#00e5ff');
        }
      }, solidRects);
      if (used) {
        this.audioManager.playSfx('ability');
      }
    }

    const areaEffect = this.obstacleManager.getAreaEffectAt(this.player.x, this.player.y);
    const hasSpeedBoost = this.powerUpManager.hasEffect('energy_drink');
    this.player.update(dt, input, areaEffect, hasSpeedBoost, this.obstacleManager);

    const timeFreezeMult = this.powerUpManager.hasEffect('time_freeze') ? 0.4 : 1.0;
    const chaosSpeedMult = (this.modeManager.activeModifier?.hazardSpeedMult || 1.0) * heatInfo.current.hazardMult;
    this.obstacleManager.update(dt, mapData, timeFreezeMult, chaosSpeedMult, this.pathfinder);

    for (let i = this.obstacleManager.areaHazards.length - 1; i >= 0; i--) {
      const ah = this.obstacleManager.areaHazards[i];
      if (ah.tempTimer !== undefined) {
        ah.tempTimer -= dt;
        if (ah.tempTimer <= 0) this.obstacleManager.areaHazards.splice(i, 1);
      }
    }

    const hazardHit = this.obstacleManager.checkDynamicHazardCollisions(this.player);
    if (hazardHit.hit && !this.player.isInvulnerable()) {
      this._handlePlayerHit(1, hazardHit.knockX, hazardHit.knockY, `Struck by ${hazardHit.source}`);
    }

    const checkerSpeedMult = (this.modeManager.activeModifier?.checkerSpeedMult || 1.0) * (1 + (heatInfo.current.level - 1) * 0.08);
    this.npcManager.update(dt, this.player, this.pursuer, this.obstacleManager, this.powerUpManager, this.pathfinder, checkerSpeedMult, {
      onDistractorTriggered: (npc) => {
        this.audioManager.playSfx('nearmiss');
        this.spawnParticles(npc.x, npc.y, '#ffffff', 10, 130);
        this.spawnFloatingText(npc.x, npc.y - 36, 'PRESS DISTRACTION!', '#e5ff00');
      },
      onHelperDrop: (npc) => {
        this.audioManager.playSfx('pickup');
        this.spawnFloatingText(npc.x, npc.y - 36, 'SUPPLY DROP!', '#00ff88');
      },
      onSecurityGrab: () => {
        this.audioManager.playSfx('warning');
        this.spawnFloatingText(this.player.x, this.player.y - 48, 'PINNED BY CHECKER!', '#ff3300');
      }
    });

    this.pursuer.update(
      dt,
      this.runTime,
      this.player,
      this.pathfinder,
      this.obstacleManager,
      this.powerUpManager.activeDecoy,
      timeFreezeMult,
      heatInfo,
      {
        onAttackWindup: () => {
          this.audioManager.playSfx('warning');
        },
        onLungeStart: () => {
          this.audioManager.playSfx('lunge');
          this.spawnParticles(this.pursuer.x, this.pursuer.y, '#ff3300', 8, 140);
        },
        onAttackDodged: () => {
          // FIXED: Separate attacksDodged (+140) from nearMisses (+75) so reward text matches exact points,
          // and add a crisp hit-stop + ring flash + screen shake so dodging feels powerful!
          this.runStats.attacksDodged++;
          this.player.jukeFlashTimer = 0.35;
          if (!settings.reducedMotion) {
            this.hitStopTimer = 0.045;
            this.renderer.addScreenShake(5, false);
          }
          this.audioManager.playSfx('nearmiss');
          this.spawnParticles(this.player.x, this.player.y, '#00ff88', 12, 150);
          this.spawnFloatingText(this.player.x, this.player.y - 48, 'LUNGE JUKED! +140', '#00ff88');
        },
        onCatchAttempt: (knockX, knockY) => {
          this._handlePlayerHit(1, knockX, knockY, 'Captured by Dando!');
        },
        onEasterEggScream: () => {
          this.triggerEasterEggScream();
        }
      },
      mapData
    );

    const distToPursuer = Math.hypot(this.pursuer.x - this.player.x, this.pursuer.y - this.player.y);
    this.audioManager.setPursuitIntensity(1 - Math.min(1, Math.max(0, (distToPursuer - 100) / 520)));

    const hasMagnet = this.saveManager.data.unlockedCosmetics.includes('upgrade_magnet');
    this.powerUpManager.update(
      dt,
      this.player,
      mapData,
      solidRects,
      eq.difficulty,
      eq.mode,
      this.pathfinder,
      hasMagnet,
      (pickup, wasFullHealth) => {
        this.audioManager.playSfx('pickup');
        if (pickup.type === 'score_star') {
          this.runStats.scoreStars++;
          this.spawnParticles(pickup.x, pickup.y, '#e5ff00', 10, 130);
          this.spawnFloatingText(pickup.x, pickup.y - 24, '★ STAR +250', '#e5ff00');
        } else {
          this.runStats.pickupsCollected++;
          if (pickup.type === 'energy_drink') {
            this.runStats.speedBoostsCollected++;
          }
          // FIXED: Full-HP medkit awards dedicated overheal bonus (+100) instead of inflating nearMisses juke counter!
          if (pickup.type === 'medkit' && wasFullHealth) {
            this.runStats.overheals = (this.runStats.overheals || 0) + 1;
            this.spawnFloatingText(pickup.x, pickup.y - 24, 'OVERHEAL BONUS +100', '#00ff88');
          } else {
            const def = CONFIG.POWERUPS[pickup.type];
            this.spawnFloatingText(pickup.x, pickup.y - 24, `${def?.name} +75`, def?.color || '#e5ff00');
          }
          const def = CONFIG.POWERUPS[pickup.type];
          this.spawnParticles(pickup.x, pickup.y, def?.color || '#e5ff00', 10, 130);
        }
      }
    );

    this.runStats.survivalTime = this.runTime;
    this.runStats.distanceTravelled = this.player.distanceTravelled;
    this.runStats.modifierScoreMult = this.modeManager.activeModifier?.scoreMultBonus || 1.0;

    const scoreObj = this.progressionManager.calculateScore(
      this.runStats,
      eq.difficulty,
      eq.map,
      this.runStats.modifierScoreMult
    );
    this.currentScore = scoreObj.total;

    this.modeManager.update(dt, this.player, mapData, this.currentScore, eq.difficulty, this.powerUpManager, solidRects, {
      onTerminalCompleted: (term) => {
        this.runStats.objectivesCompleted++;
        this.audioManager.playSfx('terminal');
        this.spawnParticles(term.x, term.y, '#00ff88', 14, 160);
        this.spawnFloatingText(term.x, term.y - 32, `${term.label} UNLOCKED +200`, '#00ff88');
      },
      onExitUnlocked: () => {
        this.audioManager.playSfx('victory');
        this.uiManager.showToast('EXTRACTION OPEN // PROCEED TO NORTH HELIPAD');
      },
      onChaosModifier: (mod) => {
        this.audioManager.playSfx('warning');
        this.uiManager.showToast(`MUTATOR: ${mod.name} — ${mod.desc}`);
      },
      onModeVictory: (victoryText) => {
        this.endRun(true, victoryText);
      },
      onModeFailure: (failureText) => {
        this.endRun(false, failureText);
      }
    });

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 28 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    this.renderer.updateCamera(this.player.x, this.player.y, dt, settings.reducedMotion);
    this.uiManager.updateHUD(dt, this);
  }

  _handlePlayerHit(damage, knockX, knockY, deathReason) {
    if (this.powerUpManager.consumeShield()) {
      this.audioManager.playSfx('shield_break');
      this.player.iframeTimer = 0.95;
      this.player.vx += knockX * 0.6;
      this.player.vy += knockY * 0.6;
      this.spawnParticles(this.player.x, this.player.y, '#00e5ff', 14, 160);
      this.spawnFloatingText(this.player.x, this.player.y - 52, 'SHIELD BLOCKED HIT!', '#00e5ff');
      this.forceHudRefresh = true;
      return;
    }

    if (this.player.takeDamage(damage, knockX, knockY)) {
      this.runStats.damageTaken += damage;
      this.audioManager.playSfx('damage');
      this.renderer.addScreenShake(11, this.saveManager.data.settings.reducedMotion);
      this.spawnParticles(this.player.x, this.player.y, '#ff3300', 14, 180);
      this.spawnFloatingText(this.player.x, this.player.y - 52, '-1 HP', '#ff3300');
      this.forceHudRefresh = true;

      if (this.player.health <= 0) {
        this.endRun(false, deathReason);
      }
    }
  }

  _renderFrame() {
    this.renderer.render({
      state: this.state,
      mapData: this.mapManager.mapData,
      player: this.player,
      pursuer: this.pursuer,
      npcManager: this.npcManager,
      obstacleManager: this.obstacleManager,
      powerUpManager: this.powerUpManager,
      modeManager: this.modeManager,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      settings: this.saveManager.data.settings,
      equipped: {
        ...this.saveManager.data.equipped,
        unlockedCosmetics: this.saveManager.data.unlockedCosmetics
      }
    });
  }
}
