// js/modes.js — Deterministic seeded rules for Survival, Time Attack, Escape Mission, and Endless Chaos

import { CONFIG, SeededRandom } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class ModeManager {
  constructor() {
    this.modeId = 'survival';
    this.rng = new SeededRandom('MODE');
    this.reset('survival', 'normal', null, [], 'MODE');
  }

  reset(modeId = 'survival', difficultyId = 'normal', mapData = null, solidRects = [], seedStr = '') {
    this.modeId = CONFIG.MODES[modeId] ? modeId : 'survival';
    this.rng = new SeededRandom((seedStr || mapData?.seed || 'DANDO') + '_MODE');
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;

    this.timeRemaining = 0;
    this.targetScore = 0;
    this.terminals = [];
    this.terminalsCompleted = 0;
    this.requiredTerminals = CONFIG.MODES.escape_mission.requiredTerminals;
    this.exitUnlocked = false;
    if (mapData) mapData.exitZone.active = false;

    this.chaosInterval = (this.modeId === 'endless_chaos')
      ? CONFIG.MODES.endless_chaos.chaosInterval
      : (diff.chaosInterval || 15.0);
    this.chaosEventTimer = this.chaosInterval;
    this.activeModifier = null;

    if (this.modeId === 'time_attack') {
      this.timeRemaining = Math.max(45, CONFIG.MODES.time_attack.baseDuration + diff.objectiveTimeBonus);
      this.targetScore = diff.timeAttackTarget || CONFIG.MODES.time_attack.targetScore;
    } else if (this.modeId === 'escape_mission' && mapData) {
      const obstacles = (solidRects && solidRects.length > 0) ? solidRects : (mapData.buildings || []);
      const locs = mapData.terminalLocations.slice(0, this.requiredTerminals);
      this.terminals = locs.map((pos, idx) => {
        const safePos = Pathfinder.findSafePointNear(pos.x, pos.y, obstacles, 48);
        return {
          id: `term_${idx + 1}`,
          label: `TERMINAL 0${idx + 1}`,
          x: safePos.x,
          y: safePos.y,
          radius: 38,
          progress: 0,
          hackTime: CONFIG.MODES.escape_mission.terminalHackTime,
          completed: false,
          isHacking: false
        };
      });
    }
  }

  update(dt, player, mapData, currentScore, difficultyId, powerUpManager, solidRects = [], callbacks = {}) {
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;

    if (this.modeId === 'time_attack') {
      if (currentScore >= this.targetScore) {
        if (callbacks.onModeVictory) {
          callbacks.onModeVictory('TARGET SCORE REACHED!');
        }
        return;
      }
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
      if (this.timeRemaining <= 0) {
        if (currentScore >= this.targetScore) {
          if (callbacks.onModeVictory) callbacks.onModeVictory('TARGET SCORE REACHED!');
        } else if (callbacks.onModeFailure) {
          callbacks.onModeFailure(`TIME EXPIRED — SCORE ${currentScore} / ${this.targetScore}`);
        }
        return;
      }
    }

    if (this.modeId === 'escape_mission' && mapData) {
      for (const term of this.terminals) {
        if (term.completed) {
          term.isHacking = false;
          continue;
        }
        const d = Math.hypot(player.x - term.x, player.y - term.y);
        if (d <= term.radius + player.radius + 16) {
          term.isHacking = true;
          term.progress += dt;
          if (term.progress >= term.hackTime) {
            term.progress = term.hackTime;
            term.completed = true;
            term.isHacking = false;
            this.terminalsCompleted++;
            if (callbacks.onTerminalCompleted) callbacks.onTerminalCompleted(term);

            if (this.terminalsCompleted >= this.requiredTerminals) {
              this.exitUnlocked = true;
              mapData.exitZone.active = true;
              if (callbacks.onExitUnlocked) callbacks.onExitUnlocked();
            }
          }
        } else {
          term.isHacking = false;
          term.progress = Math.max(0, term.progress - dt * 0.25);
        }
      }

      if (this.exitUnlocked && mapData.exitZone.active) {
        const distToExit = Math.hypot(player.x - mapData.exitZone.x, player.y - mapData.exitZone.y);
        if (distToExit <= mapData.exitZone.radius + player.radius) {
          if (callbacks.onModeVictory) {
            callbacks.onModeVictory('EXTRACTION COMPLETE!');
          }
          return;
        }
      }
    }

    if (this.modeId === 'endless_chaos' || diff.chaosEvents) {
      if (this.activeModifier) {
        this.activeModifier.remaining -= dt;
        if (this.activeModifier.remaining <= 0) {
          this.activeModifier = null;
        }
      }

      this.chaosEventTimer -= dt;
      if (this.chaosEventTimer <= 0) {
        this.chaosEventTimer = this.chaosInterval;
        this.triggerNextChaosModifier(mapData, powerUpManager, solidRects, callbacks);
      }
    }
  }

  triggerNextChaosModifier(mapData, powerUpManager, solidRects = [], callbacks = {}) {
    const pool = [
      { id: 'turbo_hazards', name: 'TURBO TRAFFIC', desc: 'Vehicles & rotors move 35% faster for 10s!', duration: 10, hazardSpeedMult: 1.35, scoreMultBonus: 1.1 },
      { id: 'hyper_pickups', name: 'HYPER PICKUPS', desc: '3 bonus power-ups dropped & Dodge cooldown halved!', duration: 10, hazardSpeedMult: 1.0, instantPickups: 3, dodgeFast: true, scoreMultBonus: 1.0 },
      { id: 'disco_dimmer', name: 'CLUB STROBE SURGE', desc: 'Reduced arena visibility & +25% Score Multiplier!', duration: 10, hazardSpeedMult: 1.08, blackoutBonus: 0.45, scoreMultBonus: 1.25 },
      { id: 'bouncer_stampede', name: 'CHECKER STAMPEDE', desc: 'Dando Checkers patrol 45% faster for 10s!', duration: 10, hazardSpeedMult: 1.10, checkerSpeedMult: 1.45, scoreMultBonus: 1.2 }
    ];
    const chosen = pool[Math.floor(this.rng.next() * pool.length)];
    this.activeModifier = { ...chosen, remaining: chosen.duration };
    if (chosen.instantPickups && powerUpManager && mapData) {
      for (let i = 0; i < chosen.instantPickups; i++) {
        powerUpManager.spawnRandomPickup(mapData, solidRects, this.modeId);
      }
    }
    if (callbacks.onChaosModifier) callbacks.onChaosModifier(this.activeModifier);
  }

  getObjectiveSummary(currentScore = 0) {
    if (this.modeId === 'survival') {
      return 'SURVIVE AS LONG AS POSSIBLE';
    }
    if (this.modeId === 'time_attack') {
      return `CLOCK: ${Math.ceil(this.timeRemaining)}s · TARGET: ${currentScore.toLocaleString()} / ${this.targetScore.toLocaleString()}`;
    }
    if (this.modeId === 'escape_mission') {
      if (!this.exitUnlocked) {
        const activeTerm = this.terminals.find(t => t.isHacking && !t.completed);
        if (activeTerm) {
          const pct = Math.min(100, Math.round((activeTerm.progress / activeTerm.hackTime) * 100));
          return `HACKING ${activeTerm.label}: ${pct}% (${this.terminalsCompleted}/${this.requiredTerminals})`;
        }
        return `STAND IN TERMINALS TO HACK: ${this.terminalsCompleted} / ${this.requiredTerminals}`;
      }
      return 'EXTRACTION OPEN · REACH NORTH HELIPAD EXIT';
    }
    if (this.modeId === 'endless_chaos') {
      if (this.activeModifier) {
        return `MUTATOR: ${this.activeModifier.name} (${Math.ceil(this.activeModifier.remaining)}s)`;
      }
      return `NEXT MUTATOR IN ${Math.ceil(this.chaosEventTimer)}s`;
    }
    return '';
  }
}
