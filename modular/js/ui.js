// js/ui.js — Clean Neo-Brutalist UI Manager with Seed Lock, Dynamic Keybind Labels, Mobile Cooldowns, and Modal Focus Trap

import { CONFIG, SeededRandom } from './config.js';
import { InputManager } from './input.js';

export class UIManager {
  constructor(game) {
    this.game = game;
    this.hudUpdateTimer = 0;
    this.lastFocusedElement = null;
  }

  init() {
    this._bindMenuButtons();
    this.refreshMainMenu();
    this.applyAccessibilityClasses();
  }

  applyAccessibilityClasses() {
    const s = this.game.saveManager.data.settings;
    document.body.classList.toggle('high-contrast', Boolean(s.highContrast));
    document.body.classList.toggle('reduced-motion', Boolean(s.reducedMotion));
    const scale = Math.max(0.85, Math.min(1.15, Number(s.uiScale || 1)));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
  }

  showScreen(screenId) {
    const screens = ['screen-menu', 'screen-hud', 'screen-pause', 'screen-results'];
    for (const id of screens) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== screenId);
    }
    const abortConfirm = document.getElementById('pause-abort-confirm');
    if (abortConfirm) abortConfirm.classList.add('hidden');
  }

  isAnyModalOpen() {
    const modals = document.querySelectorAll('.modal-overlay');
    for (const m of modals) {
      if (!m.classList.contains('hidden')) return true;
    }
    return false;
  }

  openModal(modalId) {
    this.game.audioManager.playSfx('click');
    this.lastFocusedElement = document.activeElement;
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      const closeBtn = modal.querySelector('[data-close-modal]');
      if (closeBtn) setTimeout(() => closeBtn.focus(), 20);
    }
    if (modalId === 'modal-shop') this.renderShopModal();
    if (modalId === 'modal-stats') this.renderStatsModal();
    if (modalId === 'modal-settings') this.renderSettingsModal();
    if (modalId === 'modal-tutorial') this.updateDynamicKeyLabels();
  }

  closeAllModals() {
    this.game.audioManager.playSfx('click');
    this.game.inputManager.cancelListeningForKey();

    const tutModal = document.getElementById('modal-tutorial');
    if (tutModal && !tutModal.classList.contains('hidden')) {
      this.game.saveManager.data.tutorialSeen = true;
      this.game.saveManager.save();
    }
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      try { this.lastFocusedElement.focus(); } catch (e) {}
    }
  }

  _bindMenuButtons() {
    const seedInput = document.getElementById('input-run-seed');
    if (seedInput) {
      seedInput.value = this.game.activeSeed || SeededRandom.generateSeedString();
      seedInput.addEventListener('input', () => {
        this.game.activeSeed = seedInput.value.trim().toUpperCase();
        this.game.customSeedLocked = this.game.activeSeed.length > 0;
        this._syncSeedLockUI();
      });
    }

    document.getElementById('btn-lock-seed')?.addEventListener('click', () => {
      this.game.audioManager.playSfx('click');
      this.game.customSeedLocked = !this.game.customSeedLocked;
      this._syncSeedLockUI();
      this.showToast(this.game.customSeedLocked
        ? `SEED LOCKED // ${this.game.activeSeed}`
        : 'SEED UNLOCKED (AUTO-ROTATES EACH RUN)');
    });

    document.getElementById('btn-random-seed')?.addEventListener('click', () => {
      this.game.audioManager.playSfx('click');
      const nextSeed = SeededRandom.generateSeedString();
      this.game.activeSeed = nextSeed;
      if (seedInput) seedInput.value = nextSeed;
      this._syncSeedLockUI();
      this.game.loadMenuPreviewMap(this.game.saveManager.data.equipped.map, nextSeed);
      this.showToast(`NEW ARENA SEED // ${nextSeed}`);
    });

    document.getElementById('btn-play-run')?.addEventListener('click', () => {
      this.game.audioManager.initFromGesture();
      this.game.audioManager.playSfx('click');
      this.game.saveManager.data.tutorialSeen = true;
      this.game.saveManager.save();
      this.game.startNewRun(false);
    });

    document.getElementById('btn-open-shop')?.addEventListener('click', () => this.openModal('modal-shop'));
    document.getElementById('btn-open-stats')?.addEventListener('click', () => this.openModal('modal-stats'));
    document.getElementById('btn-open-settings')?.addEventListener('click', () => this.openModal('modal-settings'));
    document.getElementById('btn-open-tutorial')?.addEventListener('click', () => this.openModal('modal-tutorial'));
    document.getElementById('btn-open-credits')?.addEventListener('click', () => this.openModal('modal-credits'));

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeAllModals();
        }
      });
      overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || overlay.classList.contains('hidden')) return;
        const focusables = overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]');
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    });

    document.getElementById('btn-hud-pause')?.addEventListener('click', () => this.game.togglePause());
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => this.game.togglePause());
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => this.game.startNewRun(true));
    document.getElementById('btn-pause-tutorial')?.addEventListener('click', () => this.openModal('modal-tutorial'));
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => this.openModal('modal-settings'));

    document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
      const box = document.getElementById('pause-abort-confirm');
      if (box) box.classList.remove('hidden');
    });
    document.getElementById('btn-confirm-abort-yes')?.addEventListener('click', () => {
      this.game.returnToMainMenu();
    });
    document.getElementById('btn-confirm-abort-no')?.addEventListener('click', () => {
      const box = document.getElementById('pause-abort-confirm');
      if (box) box.classList.add('hidden');
    });

    document.getElementById('btn-results-retry')?.addEventListener('click', () => this.game.startNewRun(false));
    document.getElementById('btn-results-replay-seed')?.addEventListener('click', () => this.game.startNewRun(true));
    document.getElementById('btn-results-shop')?.addEventListener('click', () => {
      this.game.returnToMainMenu();
      this.openModal('modal-shop');
    });
    document.getElementById('btn-results-menu')?.addEventListener('click', () => this.game.returnToMainMenu());

    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      const confirmEl = document.getElementById('reset-confirm-box');
      if (confirmEl) confirmEl.classList.remove('hidden');
    });
    document.getElementById('btn-confirm-reset-yes')?.addEventListener('click', () => {
      this.game.saveManager.resetProgress();
      this.applyAccessibilityClasses();
      this.refreshMainMenu();
      this.renderSettingsModal();
      const confirmEl = document.getElementById('reset-confirm-box');
      if (confirmEl) confirmEl.classList.add('hidden');
    });
    document.getElementById('btn-confirm-reset-no')?.addEventListener('click', () => {
      const confirmEl = document.getElementById('reset-confirm-box');
      if (confirmEl) confirmEl.classList.add('hidden');
    });
  }

  _syncSeedLockUI() {
    const lockBtn = document.getElementById('btn-lock-seed');
    if (lockBtn) {
      const locked = Boolean(this.game.customSeedLocked);
      lockBtn.textContent = locked ? '🔒 LOCKED' : '🔓 AUTO';
      lockBtn.classList.toggle('selected', locked);
      lockBtn.title = locked
        ? 'Seed is locked: every run will use this exact seed until unlocked'
        : 'Seed is unlocked: clicking Deploy Run will use this seed once, then rotate on subsequent runs';
    }
  }

  updateDynamicKeyLabels() {
    const binds = this.game.saveManager.data.settings.keybinds || CONFIG.DEFAULT_KEYS;
    const dodgeKey = InputManager.formatKeyCode(binds.dodge);
    const sprintKey = InputManager.formatKeyCode(binds.sprint);
    const abilKey = InputManager.formatKeyCode(binds.ability);
    const pauseKey = InputManager.formatKeyCode(binds.pause);

    const stamLabel = document.getElementById('hud-stamina-label');
    if (stamLabel) stamLabel.textContent = `STAMINA [${sprintKey}]`;

    const pauseBtn = document.getElementById('btn-hud-pause');
    if (pauseBtn) {
      pauseBtn.textContent = pauseKey === 'ESC' ? 'PAUSE [ESC]' : `PAUSE [${pauseKey}/ESC]`;
    }

    const tutDodge = document.getElementById('tut-key-dodge');
    if (tutDodge) tutDodge.textContent = `[${dodgeKey}]`;
    const tutSprint = document.getElementById('tut-key-sprint');
    if (tutSprint) tutSprint.textContent = `[${sprintKey}]`;
    const tutAbil = document.getElementById('tut-key-ability');
    if (tutAbil) tutAbil.textContent = `[${abilKey}]`;
  }

  refreshMainMenu() {
    this.game.saveManager.ensureFreshDailyChallenges();
    const profile = this.game.saveManager.data;
    const eq = profile.equipped;
    const binds = profile.settings.keybinds || CONFIG.DEFAULT_KEYS;

    const credEl = document.getElementById('menu-currency-val');
    if (credEl) credEl.textContent = profile.currency.toLocaleString();

    const seedInput = document.getElementById('input-run-seed');
    if (seedInput && this.game.activeSeed) {
      seedInput.value = this.game.activeSeed;
    }
    this._syncSeedLockUI();
    this.updateDynamicKeyLabels();

    const mapGrid = document.getElementById('selector-maps');
    if (mapGrid) {
      mapGrid.innerHTML = '';
      for (const map of Object.values(CONFIG.MAPS)) {
        const active = eq.map === map.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `select-card ${active ? 'selected' : ''}`;
        btn.innerHTML = `
          <div class="card-top">
            <span class="card-title">${map.name}</span>
            <span class="card-badge">${map.scoreBonusMult > 1 ? `+${Math.round((map.scoreBonusMult - 1) * 100)}%` : '1.0x'}</span>
          </div>
          <div class="card-sub">${map.mechanicName}</div>
        `;
        btn.addEventListener('click', () => {
          this.game.audioManager.initFromGesture();
          this.game.audioManager.playSfx('click');
          profile.equipped.map = map.id;
          this.game.saveManager.save();
          this.game.loadMenuPreviewMap(map.id, this.game.activeSeed);
          this.refreshMainMenu();
        });
        mapGrid.appendChild(btn);
      }
      const activeMap = CONFIG.MAPS[eq.map] || CONFIG.MAPS.downtown;
      const mapSpecEl = document.getElementById('map-spec-readout');
      if (mapSpecEl) {
        mapSpecEl.textContent = `${activeMap.subtitle} — ${activeMap.description}`;
      }
    }

    const modeGrid = document.getElementById('selector-modes');
    if (modeGrid) {
      modeGrid.innerHTML = '';
      for (const mode of Object.values(CONFIG.MODES)) {
        const active = eq.mode === mode.id;
        const bestScore = profile.bestScores[mode.id] || 0;
        const bestTime = profile.bestSurvivalTimes[mode.id] || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `select-card ${active ? 'selected' : ''}`;
        btn.innerHTML = `
          <div class="card-top">
            <span class="card-title">${mode.name}</span>
            <span class="card-badge">${mode.tag}</span>
          </div>
          <div class="card-record">PB: ${bestScore.toLocaleString()} // ${this.formatTime(bestTime)}</div>
        `;
        btn.addEventListener('click', () => {
          this.game.audioManager.playSfx('click');
          profile.equipped.mode = mode.id;
          this.game.saveManager.save();
          this.refreshMainMenu();
        });
        modeGrid.appendChild(btn);
      }
      const activeMode = CONFIG.MODES[eq.mode] || CONFIG.MODES.survival;
      const modeSpecEl = document.getElementById('mode-spec-readout');
      if (modeSpecEl) {
        modeSpecEl.textContent = activeMode.description;
      }
    }

    const diffRow = document.getElementById('selector-difficulties');
    if (diffRow) {
      diffRow.innerHTML = '';
      for (const diff of Object.values(CONFIG.DIFFICULTIES)) {
        const active = eq.difficulty === diff.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pill-btn ${active ? 'selected' : ''}`;
        btn.innerHTML = `<strong>${diff.name}</strong> <span>[${diff.badge}]</span>`;
        btn.addEventListener('click', () => {
          this.game.audioManager.playSfx('click');
          profile.equipped.difficulty = diff.id;
          this.game.saveManager.save();
          this.refreshMainMenu();
        });
        diffRow.appendChild(btn);
      }
      const diffDescEl = document.getElementById('difficulty-desc-text');
      if (diffDescEl) {
        diffDescEl.textContent = CONFIG.DIFFICULTIES[eq.difficulty]?.description || '';
      }
    }

    const charGrid = document.getElementById('selector-characters');
    if (charGrid) {
      charGrid.innerHTML = '';
      for (const arch of Object.values(CONFIG.ARCHETYPES)) {
        const unlocked = profile.unlockedCharacters.includes(arch.id);
        const active = eq.character === arch.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `select-card char-card ${active ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        card.innerHTML = `
          <div class="card-top">
            <span class="card-title">${arch.name}</span>
            <span class="card-badge">${unlocked ? arch.role : `${arch.cost} CRED`}</span>
          </div>
          <div class="char-stats">
            <span>SPD:${arch.speed}</span>
            <span>HP:${arch.health}</span>
            <span>SKILL:${arch.abilityName.toUpperCase()}</span>
          </div>
          <div class="card-action-row">
            <span class="status-pill">${unlocked ? (active ? '[EQUIPPED]' : '[SELECT]') : `UNLOCK (${arch.cost} CRED)`}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          if (unlocked) {
            this.game.audioManager.playSfx('click');
            profile.equipped.character = arch.id;
            this.game.saveManager.save();
            this.refreshMainMenu();
          } else {
            const res = this.game.progressionManager.purchaseItem('character', arch.id);
            if (res.ok) {
              this.game.audioManager.playSfx('buy');
              this.showToast(`UNLOCKED ${arch.name}!`);
              this.refreshMainMenu();
            } else {
              this.game.audioManager.playSfx('error');
              this.showToast(`${res.reason} — OPEN ARMORY`);
            }
          }
        });
        charGrid.appendChild(card);
      }
      const activeArch = CONFIG.ARCHETYPES[eq.character] || CONFIG.ARCHETYPES.balanced;
      const charSpecEl = document.getElementById('char-spec-readout');
      if (charSpecEl) {
        const abilKey = InputManager.formatKeyCode(binds.ability);
        charSpecEl.textContent = `[${abilKey}] ${activeArch.abilityName}: ${activeArch.abilityDesc}`;
      }
    }

    const dcList = document.getElementById('daily-challenges-list');
    const dcSummary = document.getElementById('daily-directives-summary');
    if (dcList && profile.dailyChallenges?.items) {
      const doneCount = profile.dailyChallenges.items.filter(c => c.completed).length;
      if (dcSummary) {
        dcSummary.textContent = `05 // DAILY DIRECTIVES (${doneCount}/${profile.dailyChallenges.items.length})`;
      }
      dcList.innerHTML = profile.dailyChallenges.items.map(ch => `
        <div class="dc-item ${ch.completed ? 'done' : ''}">
          <span>${ch.completed ? '[X]' : '[ ]'} ${ch.text} (${ch.progress}/${ch.target})</span>
          <span class="dc-reward">+${ch.reward} CRED</span>
        </div>
      `).join('');
    }
  }

  updateHUD(dt, gameState) {
    this.hudUpdateTimer += dt;
    if (this.hudUpdateTimer < 0.06 && !gameState.forceHudRefresh) return;
    this.hudUpdateTimer = 0;
    gameState.forceHudRefresh = false;

    const { runTime, player, pursuer, powerUpManager, modeManager, progressionManager, currentScore, countdownValue, state, activeSeed } = gameState;
    const binds = this.game.saveManager.data.settings.keybinds || CONFIG.DEFAULT_KEYS;
    const dodgeKey = InputManager.formatKeyCode(binds.dodge);
    const sprintKey = InputManager.formatKeyCode(binds.sprint);
    const abilKey = InputManager.formatKeyCode(binds.ability);

    const cdBanner = document.getElementById('hud-countdown-banner');
    if (cdBanner) {
      if (state === 'COUNTDOWN') {
        cdBanner.classList.remove('hidden');
        cdBanner.textContent = countdownValue > 0 ? `DEPLOYING IN ${Math.ceil(countdownValue)}...` : 'RUN!';
      } else {
        cdBanner.classList.add('hidden');
      }
    }

    const timeEl = document.getElementById('hud-time-val');
    if (timeEl) timeEl.textContent = this.formatTime(runTime);

    const scoreEl = document.getElementById('hud-score-val');
    if (scoreEl) scoreEl.textContent = currentScore.toLocaleString();

    const seedEl = document.getElementById('hud-seed-val');
    if (seedEl) seedEl.textContent = `SEED // ${activeSeed || '----'}`;

    const hpEl = document.getElementById('hud-health-hearts');
    if (hpEl) {
      let html = `<span class="hp-num-label">HP ${player.health}/${player.maxHealth}</span>`;
      for (let i = 0; i < player.maxHealth; i++) {
        html += `<span class="heart ${i < player.health ? 'full' : 'empty'}">■</span>`;
      }
      if (player.cheatGodMode) {
        html += `<span class="shield-badge">GOD</span>`;
      } else if (powerUpManager.hasEffect('bubble_shield')) {
        html += `<span class="shield-badge">SHIELD</span>`;
      }
      hpEl.innerHTML = html;
    }

    const heatInfo = progressionManager.getHeatLevelInfo(runTime);
    const heatTextEl = document.getElementById('hud-heat-text');
    const heatFillEl = document.getElementById('hud-heat-fill');
    if (heatTextEl && heatFillEl) {
      heatTextEl.textContent = heatInfo.current.name;
      heatFillEl.style.width = `${Math.round(heatInfo.progress * 100)}%`;
    }

    const stamPct = Math.round((player.stamina / player.maxStamina) * 100);
    const stamFill = document.getElementById('hud-stamina-fill');
    const stamLabel = document.getElementById('hud-stamina-label');
    if (stamFill) {
      stamFill.style.width = `${stamPct}%`;
      stamFill.style.backgroundColor = player.stamina < CONFIG.PLAYER_DEFAULTS.SPRINT_MIN_START ? '#ff3300' : '#e5ff00';
    }
    if (stamLabel) {
      stamLabel.textContent = player.lowStaminaFlashTimer > 0
        ? `STAMINA LOW (<15%)`
        : `STAMINA [${sprintKey}]`;
      stamLabel.style.color = player.lowStaminaFlashTimer > 0 ? '#ff3300' : '';
    }

    const dodgeReadyRatio = player.dodgeCooldown <= 0 ? 1 : 1 - (player.dodgeCooldown / player.dodgeCooldownMax);
    const dodgeFill = document.getElementById('hud-dodge-fill');
    const dodgeLabel = document.getElementById('hud-dodge-label');
    if (dodgeFill && dodgeLabel) {
      dodgeFill.style.width = `${Math.round(dodgeReadyRatio * 100)}%`;
      dodgeLabel.textContent = player.dodgeCooldown <= 0 ? `DODGE [${dodgeKey}] READY` : `DODGE ${player.dodgeCooldown.toFixed(1)}s`;
    }

    const abilReadyRatio = player.abilityCooldown <= 0 ? 1 : 1 - (player.abilityCooldown / player.abilityCooldownMax);
    const abilFill = document.getElementById('hud-ability-fill');
    const abilLabel = document.getElementById('hud-ability-label');
    if (abilFill && abilLabel) {
      abilFill.style.width = `${Math.round(abilReadyRatio * 100)}%`;
      abilLabel.textContent = player.abilityCooldown <= 0
        ? `${player.archetype.abilityName.toUpperCase()} [${abilKey}] READY`
        : `${player.archetype.abilityName.toUpperCase()} ${player.abilityCooldown.toFixed(1)}s`;
    }

    // Mobile touch buttons live stamina/cooldown progress fills
    const touchSprintFill = document.getElementById('touch-sprint-fill');
    if (touchSprintFill) {
      touchSprintFill.style.height = `${stamPct}%`;
      touchSprintFill.style.backgroundColor = player.stamina < 15 ? 'rgba(255, 51, 0, 0.38)' : 'rgba(229, 255, 0, 0.28)';
    }
    const touchAbilFill = document.getElementById('touch-ability-fill');
    const touchAbilText = document.getElementById('touch-ability-text');
    if (touchAbilFill) touchAbilFill.style.height = `${Math.round(abilReadyRatio * 100)}%`;
    if (touchAbilText) {
      touchAbilText.textContent = player.abilityCooldown <= 0 ? 'SKILL' : `${player.abilityCooldown.toFixed(1)}s`;
    }
    const touchDodgeFill = document.getElementById('touch-dodge-fill');
    const touchDodgeText = document.getElementById('touch-dodge-text');
    if (touchDodgeFill) touchDodgeFill.style.height = `${Math.round(dodgeReadyRatio * 100)}%`;
    if (touchDodgeText) {
      touchDodgeText.textContent = player.dodgeCooldown <= 0 ? 'DODGE' : `${player.dodgeCooldown.toFixed(1)}s`;
    }

    // Calibrated Proximity Bar: CRITICAL only when inside lunge range (<185u) or active Attacking state
    const dist = Math.hypot(pursuer.x - player.x, pursuer.y - player.y);
    const pressureBar = document.getElementById('hud-pressure-fill');
    const pressureText = document.getElementById('hud-pressure-text');
    if (pressureBar && pressureText) {
      const norm = Math.max(0, Math.min(1, 1 - (dist - 70) / 550));
      pressureBar.style.width = `${Math.round(norm * 100)}%`;
      let label = 'CLEAR';
      let color = '#00ff88';
      if (pursuer.state === 'Attacking' || dist < 185) {
        label = 'CRITICAL';
        color = '#ff3300';
      } else if (dist < 310) {
        label = 'CLOSE';
        color = '#e5ff00';
      } else if (dist < 480) {
        label = 'TRACKING';
        color = '#f2efe9';
      }
      pressureBar.style.backgroundColor = color;
      pressureText.textContent = `${label} (${Math.round(dist)}u)`;
      pressureText.style.color = color;
    }

    const puContainer = document.getElementById('hud-active-powerups');
    if (puContainer) {
      const entries = Object.entries(powerUpManager.activeEffects);
      puContainer.innerHTML = entries.map(([k, rem]) => {
        const def = CONFIG.POWERUPS[k];
        if (!def) return '';
        return `<div class="pu-chip" style="border-color:${def.color}">
          <span>${def.symbol} ${def.name}</span>
          <strong>${rem.toFixed(1)}s</strong>
        </div>`;
      }).join('');
    }

    const objEl = document.getElementById('hud-objective-text');
    if (objEl) {
      objEl.textContent = modeManager.getObjectiveSummary(currentScore);
    }
  }

  showResultsScreen(runStats, outcome) {
    this.showScreen('screen-results');
    const titleEl = document.getElementById('results-title');
    const subEl = document.getElementById('results-subtitle');
    if (titleEl) {
      let headerText = 'CAPTURED BY DANDO';
      const reasonUpper = String(runStats.endReason || '').toUpperCase();
      if (runStats.escaped) {
        headerText = 'MISSION ACCOMPLISHED';
      } else if (reasonUpper.includes('TIME EXPIRED')) {
        headerText = 'TIME EXPIRED';
      } else if (reasonUpper.includes('STRUCK BY')) {
        headerText = 'WIPED OUT BY HAZARD';
      }
      titleEl.textContent = headerText;
      titleEl.className = runStats.escaped ? 'results-header victory' : 'results-header captured';
    }
    if (subEl) {
      subEl.textContent = `${runStats.endReason || 'Run terminated.'} // SEED: ${runStats.seed || '----'}`;
    }

    const sb = outcome.scoreBreakdown;
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setTxt('res-final-score', sb.total.toLocaleString());
    setTxt('res-survival-time', this.formatTime(runStats.survivalTime));
    setTxt('res-distance', `${Math.round(runStats.distanceTravelled).toLocaleString()} u`);
    setTxt('res-pickups', String(runStats.pickupsCollected));
    setTxt('res-objectives', String(runStats.objectivesCompleted));
    setTxt('res-skill-bonus', `+${sb.skillBonus.toLocaleString()} pts`);
    setTxt('res-multiplier', `${sb.multiplier}x`);
    setTxt('res-currency-earned', outcome.cheatedRun ? '0 CRED (CHEAT GATE)' : `+${outcome.earnedCurrency.toLocaleString()} CRED`);

    const badgesEl = document.getElementById('results-badges');
    if (badgesEl) {
      const items = [];
      if (outcome.cheatedRun) {
        items.push('<span class="res-badge magenta">[CHEATED RUN — RECORDS, HONORS &amp; CRED DISABLED]</span>');
      } else {
        if (outcome.isNewBestScore) items.push('<span class="res-badge gold">[NEW HIGH SCORE RECORD]</span>');
        if (outcome.isNewBestTime) items.push('<span class="res-badge cyan">[NEW SURVIVAL TIME RECORD]</span>');
        for (const ach of outcome.newlyUnlockedAchievements) {
          items.push(`<span class="res-badge magenta">[ACHIEVEMENT: ${ach.name} +${ach.reward} CRED]</span>`);
        }
        for (const ch of outcome.completedChallenges) {
          items.push(`<span class="res-badge green">[DIRECTIVE DONE: ${ch.text} +${ch.reward} CRED]</span>`);
        }
      }
      badgesEl.innerHTML = items.join('');
    }
  }

  renderShopModal() {
    const profile = this.game.saveManager.data;
    const balEl = document.getElementById('shop-balance-val');
    if (balEl) balEl.textContent = profile.currency.toLocaleString();

    const container = document.getElementById('shop-items-grid');
    if (!container) return;
    container.innerHTML = '';

    for (const arch of Object.values(CONFIG.ARCHETYPES)) {
      const owned = profile.unlockedCharacters.includes(arch.id);
      const equipped = profile.equipped.character === arch.id;
      const card = document.createElement('div');
      card.className = `shop-card ${owned ? 'owned' : ''}`;
      card.innerHTML = `
        <div class="shop-card-head">
          <strong>${arch.name} (${arch.role})</strong>
          <span class="shop-tag">ARCHETYPE</span>
        </div>
        <p>${arch.abilityName}: ${arch.abilityDesc}</p>
        <button type="button" class="shop-action-btn" ${owned && equipped ? 'disabled' : ''}>
          ${owned ? (equipped ? '[EQUIPPED]' : 'EQUIP') : `UNLOCK // ${arch.cost} CRED`}
        </button>
      `;
      card.querySelector('button').addEventListener('click', () => {
        if (owned) {
          profile.equipped.character = arch.id;
          this.game.saveManager.save();
          this.game.audioManager.playSfx('click');
          this.renderShopModal();
          this.refreshMainMenu();
        } else {
          const res = this.game.progressionManager.purchaseItem('character', arch.id);
          if (res.ok) {
            this.game.audioManager.playSfx('buy');
            this.renderShopModal();
            this.refreshMainMenu();
          } else {
            this.game.audioManager.playSfx('error');
            this.showToast(res.reason);
          }
        }
      });
      container.appendChild(card);
    }

    for (const item of CONFIG.SHOP_ITEMS) {
      const owned = profile.unlockedCosmetics.includes(item.id);
      const isEquipped =
        (item.category === 'skin' && profile.equipped.skin === item.id) ||
        (item.category === 'trail' && profile.equipped.trail === item.id) ||
        (item.category === 'upgrade' && owned);

      const card = document.createElement('div');
      card.className = `shop-card ${owned ? 'owned' : ''}`;
      card.innerHTML = `
        <div class="shop-card-head">
          <strong>${item.name}</strong>
          <span class="shop-tag">${item.category.toUpperCase()}</span>
        </div>
        <p>${item.desc}</p>
        <button type="button" class="shop-action-btn" ${owned && isEquipped ? 'disabled' : ''}>
          ${owned ? (isEquipped ? '[ACTIVE]' : 'EQUIP') : `BUY // ${item.cost} CRED`}
        </button>
      `;
      card.querySelector('button').addEventListener('click', () => {
        if (owned) {
          if (item.category === 'skin') profile.equipped.skin = item.id;
          if (item.category === 'trail') profile.equipped.trail = item.id;
          this.game.saveManager.save();
          this.game.audioManager.playSfx('click');
          this.renderShopModal();
        } else {
          const res = this.game.progressionManager.purchaseItem('cosmetic', item.id);
          if (res.ok) {
            this.game.audioManager.playSfx('buy');
            this.renderShopModal();
            this.refreshMainMenu();
          } else {
            this.game.audioManager.playSfx('error');
            this.showToast(res.reason);
          }
        }
      });
      container.appendChild(card);
    }
  }

  renderStatsModal() {
    const profile = this.game.saveManager.data;
    const st = profile.statistics;
    const statsGrid = document.getElementById('stats-summary-grid');
    if (statsGrid) {
      statsGrid.innerHTML = `
        <div class="stat-box"><span>TOTAL RUNS</span><strong>${st.totalRuns}</strong></div>
        <div class="stat-box"><span>TOTAL SURVIVAL</span><strong>${this.formatTime(st.lifetimeSurvivalTime)}</strong></div>
        <div class="stat-box"><span>DISTANCE RAN</span><strong>${Math.round(st.lifetimeDistance).toLocaleString()} u</strong></div>
        <div class="stat-box"><span>PICKUPS GRABBED</span><strong>${st.totalPickups}</strong></div>
        <div class="stat-box"><span>JUKE DODGES</span><strong>${st.totalNearMisses || 0}</strong></div>
        <div class="stat-box"><span>ESCAPES WON</span><strong>${st.escapesCompleted || 0}</strong></div>
      `;
    }

    const achGrid = document.getElementById('achievements-list-grid');
    if (achGrid) {
      achGrid.innerHTML = CONFIG.ACHIEVEMENTS.map(ach => {
        const unlocked = Boolean(profile.achievements[ach.id]);
        return `<div class="ach-card ${unlocked ? 'unlocked' : ''}">
          <div>
            <strong>${unlocked ? '[UNLOCKED]' : '[LOCKED]'} ${ach.name}</strong>
            <p>${ach.desc}</p>
          </div>
          <span class="ach-reward">+${ach.reward} CRED</span>
        </div>`;
      }).join('');
    }
  }

  renderSettingsModal() {
    const s = this.game.saveManager.data.settings;

    const bindSlider = (id, key) => {
      const el = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      if (!el) return;
      el.value = String(Math.round((s[key] ?? 0.8) * 100));
      if (valEl) valEl.textContent = `${el.value}%`;
      el.oninput = () => {
        s[key] = Number(el.value) / 100;
        if (valEl) valEl.textContent = `${el.value}%`;
        this.game.saveManager.save();
      };
    };

    bindSlider('slider-master-vol', 'masterVolume');
    bindSlider('slider-music-vol', 'musicVolume');
    bindSlider('slider-sfx-vol', 'effectsVolume');

    const scaleEl = document.getElementById('slider-ui-scale');
    const scaleValEl = document.getElementById('slider-ui-scale-val');
    if (scaleEl) {
      scaleEl.value = String(Math.round((s.uiScale || 1.0) * 100));
      if (scaleValEl) scaleValEl.textContent = `${scaleEl.value}%`;
      scaleEl.oninput = () => {
        s.uiScale = Number(scaleEl.value) / 100;
        if (scaleValEl) scaleValEl.textContent = `${scaleEl.value}%`;
        this.applyAccessibilityClasses();
        this.game.saveManager.save();
      };
    }

    const bindToggle = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = Boolean(s[key]);
      el.onchange = () => {
        s[key] = el.checked;
        this.game.saveManager.save();
        this.applyAccessibilityClasses();
      };
    };

    bindToggle('toggle-reduced-motion', 'reducedMotion');
    bindToggle('toggle-high-contrast', 'highContrast');
    bindToggle('toggle-colorblind', 'colorblindMode');
    bindToggle('toggle-minimap', 'showMinimap');

    const kbContainer = document.getElementById('keybinds-remap-list');
    if (kbContainer) {
      const labels = {
        up: 'Move North',
        down: 'Move South',
        left: 'Move West',
        right: 'Move East',
        dodge: 'Directional Dodge',
        sprint: 'Sprint Boost',
        ability: 'Archetype Skill',
        pause: 'Pause (Esc always active)'
      };
      kbContainer.innerHTML = '';
      for (const [action, label] of Object.entries(labels)) {
        const row = document.createElement('div');
        row.className = 'kb-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kb-btn';
        const rawCode = s.keybinds[action] || CONFIG.DEFAULT_KEYS[action];
        btn.textContent = InputManager.formatKeyCode(rawCode);
        btn.addEventListener('click', () => {
          this.game.inputManager.cancelListeningForKey();
          btn.textContent = '[PRESS KEY / ESC]';
          btn.classList.add('listening');
          this.game.inputManager.listenForNextKey(
            (newCode) => {
              const oldCode = s.keybinds[action];
              for (const otherAct of Object.keys(s.keybinds)) {
                if (otherAct !== action && s.keybinds[otherAct] === newCode) {
                  s.keybinds[otherAct] = oldCode;
                }
              }
              s.keybinds[action] = newCode;
              this.game.saveManager.save();
              this.updateDynamicKeyLabels();
              this.refreshMainMenu();
              this.renderSettingsModal();
            },
            () => {
              this.renderSettingsModal();
            }
          );
        });
        row.innerHTML = `<span>${label}</span>`;
        row.appendChild(btn);
        kbContainer.appendChild(row);
      }
    }
  }

  showCheatConsoleBanner() {
    const bar = document.getElementById('cheat-console-bar');
    if (!bar) return;
    bar.classList.remove('hidden');
    const items = [
      [1, '+5K CRED'],
      [2, 'UNLOCK ALL'],
      [3, 'GOD MODE'],
      [4, 'STUN DANDO'],
      [5, '1.8x SPEED'],
      [6, 'INSTANT WIN'],
      [7, 'SPAWN DROPS'],
      [8, 'SCREAM EGG'],
      [9, '+HEAT WAVE'],
      [0, 'RESET']
    ];
    bar.innerHTML = `<span style="margin-right:8px;">[/iamacheater] SANDBOX (RECORDS GATED):</span>` +
      items.map(([num, label]) =>
        `<button type="button" class="cheat-chip-btn" data-cheat-digit="${num}">[${num}] ${label}</button>`
      ).join(' ');

    bar.querySelectorAll('[data-cheat-digit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = Number(btn.getAttribute('data-cheat-digit'));
        this.game.executeCheatCode(d);
      });
    });
  }

  showToast(message) {
    const toast = document.getElementById('ui-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}
