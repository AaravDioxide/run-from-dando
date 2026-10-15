// js/npc.js — 100% deterministic Seeded NPC spawning & runtime movement across all 5 NPC categories

import { CONFIG, SeededRandom } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class NPCManager {
  constructor() {
    this.npcs = [];
    this.rng = new SeededRandom('NPC');
  }

  initForMap(mapData, difficultyId = 'normal', solidRects = [], seedStr = '') {
    this.npcs = [];
    this.rng = new SeededRandom((seedStr || mapData.seed || 'DANDO') + '_NPC');
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;

    const checkerCount = diff.id === 'chaos' ? 6 : (diff.id === 'hard' ? 5 : 4);
    // Spawn Insiders (helper) and Press (distractor) first so they are ALWAYS present on every difficulty!
    const roster = [
      { type: 'helper', count: 2, speed: 92, radius: 14, color: '#00ff88', label: 'INSIDER' },
      { type: 'distractor', count: 3, speed: 95, radius: 14, color: '#f3f4f6', label: 'PRESS' },
      { type: 'security', count: checkerCount, speed: 126, radius: 15, color: '#ff3300', label: 'CHECKER' },
      { type: 'panicked', count: 4, speed: 132, radius: 13, color: '#e5ff00', label: 'RUNNER' },
      { type: 'civilian', count: 5, speed: 75, radius: 13, color: '#94a3b8', label: 'BYSTANDER' }
    ];

    for (const group of roster) {
      for (let i = 0; i < group.count; i++) {
        if (this.npcs.length >= CONFIG.SIMULATION.MAX_NPCS) break;
        const pos = this._findSafeSpawn(mapData, solidRects);
        this.npcs.push({
          id: `npc_${this.npcs.length}`,
          type: group.type,
          label: group.label,
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          radius: group.radius,
          baseSpeed: group.speed,
          color: group.color,
          state: group.type === 'security' ? 'patrol' : 'wander',
          stateTimer: 1.5 + this.rng.next() * 3.0,
          cooldown: 0,
          facingAngle: this.rng.next() * Math.PI * 2,
          patrolOrigin: { x: pos.x, y: pos.y },
          path: [],
          pathTimer: 0,
          barkText: '',
          barkTimer: 0
        });
      }
    }
  }

  _findSafeSpawn(mapData, solidRects) {
    for (let a = 0; a < 60; a++) {
      const x = Math.round(160 + this.rng.next() * (mapData.width - 320));
      const y = Math.round(160 + this.rng.next() * (mapData.height - 320));
      if (Math.hypot(x - mapData.playerSpawn.x, y - mapData.playerSpawn.y) < 190) continue;
      if (Math.hypot(x - mapData.pursuerSpawn.x, y - mapData.pursuerSpawn.y) < 170) continue;

      if (Pathfinder.isPointClearOfSolids(x, y, solidRects, 28)) {
        return { x, y };
      }
    }
    return Pathfinder.findSafePointNear(mapData.playerSpawn.x - 220, mapData.playerSpawn.y, solidRects, 28);
  }

  applyShockwave(originX, originY, radius, solidRects = []) {
    for (const n of this.npcs) {
      const dx = n.x - originX;
      const dy = n.y - originY;
      const d = Math.hypot(dx, dy);
      if (d < radius && d > 0.01) {
        const safe = Pathfinder.findSafePointNear(n.x + (dx / d) * 85, n.y + (dy / d) * 85, solidRects, n.radius + 4);
        n.x = safe.x;
        n.y = safe.y;
        n.state = 'recover';
        n.stateTimer = 2.2;
      }
    }
  }

  update(dt, player, pursuer, obstacleManager, powerUpManager, pathfinder, checkerSpeedMult = 1.0, callbacks = {}) {
    const solidRects = obstacleManager.solidRects;

    for (const n of this.npcs) {
      if (n.cooldown > 0) n.cooldown = Math.max(0, n.cooldown - dt);
      if (n.barkTimer > 0) n.barkTimer = Math.max(0, n.barkTimer - dt);
      n.stateTimer -= dt;

      const distToPursuer = Math.hypot(pursuer.x - n.x, pursuer.y - n.y);
      const distToPlayer = Math.hypot(player.x - n.x, player.y - n.y);

      if (n.state === 'recover') {
        n.vx *= 0.85;
        n.vy *= 0.85;
        if (n.stateTimer <= 0) {
          n.state = n.type === 'security' ? 'patrol' : 'wander';
          n.stateTimer = 2.0;
        }
      } else if (n.type === 'panicked' || n.type === 'civilian') {
        if (distToPursuer < 260) {
          n.state = 'flee';
          const awayAngle = Math.atan2(n.y - pursuer.y, n.x - pursuer.x);
          n.facingAngle = awayAngle;
          const fleeMult = n.type === 'panicked' ? 1.4 : 1.15;
          n.vx = Math.cos(awayAngle) * n.baseSpeed * fleeMult;
          n.vy = Math.sin(awayAngle) * n.baseSpeed * fleeMult;
          if (n.barkTimer <= 0 && this.rng.next() < 0.015) {
            n.barkText = 'DANDO IS COMING!';
            n.barkTimer = 1.5;
          }
        } else {
          this._wanderStep(n);
        }
      } else if (n.type === 'security') {
        const spd = n.baseSpeed * checkerSpeedMult;
        if (distToPlayer < 290 && n.cooldown <= 0) {
          n.state = 'interact';
          n.pathTimer -= dt;
          if (pathfinder && (n.pathTimer <= 0 || n.path.length === 0)) {
            n.pathTimer = 0.40;
            n.path = pathfinder.findPath(n.x, n.y, player.x, player.y, solidRects);
          }
          const wp = n.path[0] || { x: player.x, y: player.y };
          if (Math.hypot(wp.x - n.x, wp.y - n.y) < 22 && n.path.length > 1) {
            n.path.shift();
          }
          const chaseAngle = Math.atan2(wp.y - n.y, wp.x - n.x);
          n.facingAngle = chaseAngle;
          n.vx = Math.cos(chaseAngle) * (spd * 1.18);
          n.vy = Math.sin(chaseAngle) * (spd * 1.18);
          if (n.barkTimer <= 0) {
            n.barkText = 'SECTOR CHECK!';
            n.barkTimer = 1.4;
          }
        } else {
          n.state = 'patrol';
          if (n.stateTimer <= 0) {
            const targetPatrol = this.rng.next() < 0.4
              ? { x: player.x + (this.rng.next() - 0.5) * 380, y: player.y + (this.rng.next() - 0.5) * 380 }
              : n.patrolOrigin;
            n.facingAngle = Math.atan2(targetPatrol.y - n.y, targetPatrol.x - n.x) + (this.rng.next() - 0.5) * 0.8;
            n.stateTimer = 2.0 + this.rng.next() * 2.0;
          }
          n.vx = Math.cos(n.facingAngle) * spd;
          n.vy = Math.sin(n.facingAngle) * spd;
        }
      } else if (n.type === 'distractor') {
        this._wanderStep(n);
        if ((distToPlayer < 110 || distToPursuer < 220) && n.cooldown <= 0) {
          n.cooldown = 14.0;
          n.state = 'interact';
          n.stateTimer = 1.2;
          n.barkText = 'FLASH! LOOK HERE DANDO!';
          n.barkTimer = 2.2;
          pursuer.redirectToDistraction(n.x, n.y, 2.8);
          if (callbacks.onDistractorTriggered) callbacks.onDistractorTriggered(n);
        }
      } else if (n.type === 'helper') {
        this._wanderStep(n);
        if (distToPlayer < 120 && n.cooldown <= 0) {
          n.cooldown = 15.0;
          n.state = 'interact';
          n.stateTimer = 1.0;
          n.barkText = 'SUPPLY DROP!';
          n.barkTimer = 2.2;
          const giftTypes = ['energy_drink', 'bubble_shield', 'time_freeze', 'medkit'];
          const gift = giftTypes[Math.floor(this.rng.next() * giftTypes.length)];
          powerUpManager.spawnPickupAt(n.x + 24, n.y + 24, gift, solidRects);
          if (callbacks.onHelperDrop) callbacks.onHelperDrop(n);
        }
      }

      n.x += n.vx * dt;
      n.y += n.vy * dt;
      const hitWall = obstacleManager.resolveCircleObstacles(n, n.radius);
      if (hitWall) {
        n.facingAngle += Math.PI * 0.72;
        n.vx = Math.cos(n.facingAngle) * n.baseSpeed;
        n.vy = Math.sin(n.facingAngle) * n.baseSpeed;
      }

      const postDistToPlayer = Math.hypot(player.x - n.x, player.y - n.y);
      const minDist = n.radius + player.radius;
      if (postDistToPlayer < minDist && postDistToPlayer > 0.001) {
        const overlap = minDist - postDistToPlayer;
        const nx = (player.x - n.x) / postDistToPlayer;
        const ny = (player.y - n.y) / postDistToPlayer;

        if (!player.isDodging()) {
          player.x += nx * overlap * 0.65;
          player.y += ny * overlap * 0.65;
          n.x -= nx * overlap * 0.35;
          n.y -= ny * overlap * 0.35;

          // Prevent Checker chain-slows via player.checkerImmunityTimer (3.2s immunity between pins)
          if (n.type === 'security' && n.cooldown <= 0 && (player.checkerImmunityTimer || 0) <= 0) {
            n.cooldown = 5.0;
            player.slowTimer = 1.25;
            player.checkerImmunityTimer = 3.2;
            pursuer.lastKnownTarget = { x: player.x, y: player.y };
            n.barkText = 'TARGET PINNED!';
            n.barkTimer = 1.6;
            if (callbacks.onSecurityGrab) callbacks.onSecurityGrab(n);
          }
        }
      }
    }
  }

  _wanderStep(n) {
    if (n.stateTimer <= 0) {
      if (this.rng.next() < 0.2) {
        n.state = 'idle';
        n.vx = 0;
        n.vy = 0;
        n.stateTimer = 0.8 + this.rng.next() * 1.2;
      } else {
        n.state = 'wander';
        n.facingAngle += (this.rng.next() - 0.5) * 2.4;
        n.vx = Math.cos(n.facingAngle) * n.baseSpeed;
        n.vy = Math.sin(n.facingAngle) * n.baseSpeed;
        n.stateTimer = 1.8 + this.rng.next() * 2.5;
      }
    }
  }
}
