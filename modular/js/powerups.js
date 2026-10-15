// js/powerups.js — Seeded pickup spawning, 2 guaranteed early counterplay pickups near spawn, and Time Attack stars

import { CONFIG, SeededRandom } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class PowerUpManager {
  constructor() {
    this.pickups = [];
    this.activeEffects = {};
    this.activeDecoy = null;
    this.spawnTimer = 0;
    this.rng = new SeededRandom('DEFAULT');
  }

  reset(mapData, solidRects = [], modeId = 'survival', seedStr = '') {
    this.pickups = [];
    this.activeEffects = {};
    this.activeDecoy = null;
    this.spawnTimer = 1.0;
    this.rng = new SeededRandom((seedStr || mapData.seed || 'DANDO') + '_PU');

    // Guarantee 2 accessible early counterplay pickups near playerSpawn so runs never suffer an early pickup drought
    const nearPos1 = Pathfinder.findSafePointNear(
      mapData.playerSpawn.x - 115,
      mapData.playerSpawn.y - 95,
      solidRects,
      32
    );
    this.spawnPickupAt(nearPos1.x, nearPos1.y, 'energy_drink', solidRects);

    const earlyDefensive = this.rng.next() < 0.5 ? 'bubble_shield' : 'time_freeze';
    const nearPos2 = Pathfinder.findSafePointNear(
      mapData.playerSpawn.x + 115,
      mapData.playerSpawn.y - 95,
      solidRects,
      32
    );
    this.spawnPickupAt(nearPos2.x, nearPos2.y, earlyDefensive, solidRects);

    for (let i = 0; i < 6; i++) {
      this.spawnRandomPickup(mapData, solidRects, modeId);
    }
  }

  spawnRandomPickup(mapData, solidRects = [], modeId = 'survival') {
    if (this.pickups.length >= CONFIG.SIMULATION.MAX_PICKUPS) {
      this.pickups.shift();
    }

    const types = Object.keys(CONFIG.POWERUPS);
    const activeStars = this.pickups.filter(p => p.type === 'score_star').length;
    const forceStar = modeId === 'time_attack' && (activeStars < 3 || this.rng.next() < 0.5);
    const typeId = forceStar ? 'score_star' : types[Math.floor(this.rng.next() * types.length)];

    const obstacles = (solidRects && solidRects.length > 0) ? solidRects : (mapData.buildings || []);

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Math.round(140 + this.rng.next() * (mapData.width - 280));
      const y = Math.round(140 + this.rng.next() * (mapData.height - 280));

      if (!Pathfinder.isPointClearOfSolids(x, y, obstacles, 30)) {
        continue;
      }

      const pickup = {
        id: 'pk_' + Math.floor(this.rng.next() * 1e6).toString(36),
        type: typeId,
        x,
        y,
        radius: 15,
        bobPhase: this.rng.next() * Math.PI * 2,
        ttl: 26.0
      };
      this.pickups.push(pickup);
      return pickup;
    }
    return null;
  }

  spawnPickupAt(x, y, typeId = 'energy_drink', solidRects = []) {
    if (this.pickups.length >= CONFIG.SIMULATION.MAX_PICKUPS + 3) {
      this.pickups.shift();
    }
    const safe = Pathfinder.findSafePointNear(x, y, solidRects, 28);
    const pickup = {
      id: 'pk_' + Math.floor(this.rng.next() * 1e6).toString(36),
      type: typeId,
      x: safe.x,
      y: safe.y,
      radius: 15,
      bobPhase: 0,
      ttl: 26.0
    };
    this.pickups.push(pickup);
    return pickup;
  }

  update(dt, player, mapData, solidRects, difficultyId, modeId, pathfinder, hasMagnetUpgrade = false, onCollectCallback = null) {
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;

    for (const key of Object.keys(this.activeEffects)) {
      this.activeEffects[key] -= dt;
      if (this.activeEffects[key] <= 0) {
        delete this.activeEffects[key];
      }
    }

    if (this.activeDecoy) {
      this.activeDecoy.remaining -= dt;
      if (this.activeDecoy.remaining <= 0) {
        this.activeDecoy = null;
      }
    }

    this.spawnTimer += dt;
    if (this.spawnTimer >= CONFIG.SIMULATION.PICKUP_SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnRandomPickup(mapData, solidRects, modeId);
    }

    const magnetBonus = hasMagnetUpgrade ? 36 : 0;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.bobPhase += dt * 4;
      if (p.ttl !== undefined) {
        p.ttl -= dt;
        if (p.ttl <= 0) {
          this.pickups.splice(i, 1);
          continue;
        }
      }

      const dist = Math.hypot(player.x - p.x, player.y - p.y);
      const collectDist = player.radius + p.radius + magnetBonus;

      if (dist <= collectDist) {
        if (pathfinder && !pathfinder.hasLineOfSight(player.x, player.y, p.x, p.y, solidRects)) {
          continue;
        }

        if (dist > player.radius + p.radius && hasMagnetUpgrade) {
          p.x += ((player.x - p.x) / dist) * 320 * dt;
          p.y += ((player.y - p.y) / dist) * 320 * dt;
          continue;
        }

        const wasFullHealth = player.health >= player.maxHealth;
        this.applyPickup(p, player, diff.powerupDurationMult, solidRects);
        this.pickups.splice(i, 1);
        if (onCollectCallback) onCollectCallback(p, wasFullHealth);
      }
    }
  }

  applyPickup(pickup, player, durationMult = 1.0, solidRects = []) {
    if (pickup.type === 'score_star') {
      return;
    }

    const def = CONFIG.POWERUPS[pickup.type];
    if (!def) return;

    const scaledDuration = def.duration * durationMult;

    switch (pickup.type) {
      case 'energy_drink':
      case 'bubble_shield':
      case 'time_freeze':
        this.activeEffects[pickup.type] = Math.max(this.activeEffects[pickup.type] || 0, scaledDuration);
        break;
      case 'decoy': {
        this.activeEffects.decoy = Math.max(this.activeEffects.decoy || 0, scaledDuration);
        const rawX = player.x - Math.cos(player.facingAngle) * 70;
        const rawY = player.y - Math.sin(player.facingAngle) * 70;
        const safe = Pathfinder.findSafePointNear(rawX, rawY, solidRects, 22);
        this.activeDecoy = {
          x: safe.x,
          y: safe.y,
          remaining: scaledDuration
        };
        break;
      }
      case 'medkit':
        player.heal(1);
        break;
    }
  }

  hasEffect(effectId) {
    return (this.activeEffects[effectId] || 0) > 0;
  }

  consumeShield() {
    if (this.hasEffect('bubble_shield')) {
      delete this.activeEffects.bubble_shield;
      return true;
    }
    return false;
  }

  deployDecoyAt(x, y, duration = 4.0, solidRects = []) {
    const safe = Pathfinder.findSafePointNear(x, y, solidRects, 22);
    this.activeEffects.decoy = Math.max(this.activeEffects.decoy || 0, duration);
    this.activeDecoy = { x: safe.x, y: safe.y, remaining: duration };
  }
}
