// js/player.js — Continuous 2D movement, normalized diagonals, sprint hysteresis, wall-safe Holo-Blink, and Easter Egg shout

import { CONFIG } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class Player {
  constructor() {
    this.cheatGodMode = false;
    this.cheatSpeedMult = 1.0;
    this.reset(1200, 900, 'balanced');
  }

  reset(x, y, archetypeId = 'balanced', hasGripUpgrade = false) {
    const arch = CONFIG.ARCHETYPES[archetypeId] || CONFIG.ARCHETYPES.balanced;
    this.archetypeId = arch.id;
    this.archetype = arch;
    this.hasGripUpgrade = hasGripUpgrade;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = CONFIG.PLAYER_DEFAULTS.RADIUS;
    this.facingAngle = -Math.PI / 2;

    this.baseSpeed = arch.speed;
    this.acceleration = CONFIG.PLAYER_DEFAULTS.ACCELERATION;
    this.friction = CONFIG.PLAYER_DEFAULTS.FRICTION;

    this.maxHealth = arch.health;
    this.health = arch.health;

    this.dodgeCooldownMax = arch.dodgeCooldown;
    this.dodgeCooldown = 0;
    this.dodgeDurationMax = CONFIG.PLAYER_DEFAULTS.DODGE_DURATION;
    this.dodgeTimer = 0;
    this.dodgeDistance = arch.dodgeDistance;
    this.dodgeDirX = 0;
    this.dodgeDirY = -1;

    this.iframeTimer = 0;
    this.postDodgeIframes = arch.dodgeIframes;

    this.maxStamina = CONFIG.PLAYER_DEFAULTS.MAX_STAMINA;
    this.stamina = this.maxStamina;
    this.staminaRegenRate = arch.staminaRegen;
    this.sprintRegenDelayTimer = 0;
    this.isSprinting = false;
    this.lowStaminaFlashTimer = 0;
    this.exhaustedToastCooldown = 0;

    this.abilityCooldownMax = arch.abilityCooldown;
    this.abilityCooldown = 0;
    this.abilityBuffTimer = 0;

    this.slowTimer = 0;
    this.checkerImmunityTimer = 0; // Prevents multiple Checkers from chain-slowing the player
    this.jukeFlashTimer = 0;       // Visual feedback ring on successful dodge juke
    this.distanceTravelled = 0;
    this.stepPhase = 0;
    this.afterimages = [];
    this.afterimageSpawnTimer = 0;

    // 1% Easter Egg Scream state ("STOP FOLLOWING ME!")
    this.screamText = '';
    this.screamTimer = 0;
  }

  triggerEasterEggScream() {
    this.screamText = 'STOP FOLLOWING ME!!';
    this.screamTimer = 2.8;
  }

  isInvulnerable() {
    return this.cheatGodMode || this.dodgeTimer > 0 || this.iframeTimer > 0;
  }

  isDodging() {
    return this.dodgeTimer > 0;
  }

  heal(amount = 1) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  takeDamage(amount = 1, knockX = 0, knockY = 0) {
    if (this.isInvulnerable()) return false;
    this.health = Math.max(0, this.health - amount);
    this.iframeTimer = CONFIG.PLAYER_DEFAULTS.DAMAGE_IFRAMES;
    this.vx += knockX;
    this.vy += knockY;
    return true;
  }

  tryDodge(inputX, inputY) {
    if (this.dodgeCooldown > 0 || this.dodgeTimer > 0) return false;

    let dx = inputX;
    let dy = inputY;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
      dx /= len;
      dy /= len;
    } else {
      dx = Math.cos(this.facingAngle);
      dy = Math.sin(this.facingAngle);
    }

    this.dodgeDirX = dx;
    this.dodgeDirY = dy;
    this.facingAngle = Math.atan2(dy, dx);
    this.dodgeTimer = this.dodgeDurationMax;
    this.dodgeCooldown = this.dodgeCooldownMax;
    this.iframeTimer = Math.max(this.iframeTimer, this.postDodgeIframes);
    return true;
  }

  tryUseAbility(callbacks = {}, solidRects = []) {
    if (this.abilityCooldown > 0) return false;
    this.abilityCooldown = this.abilityCooldownMax;

    switch (this.archetypeId) {
      case 'balanced':
        // Smoke Pop: drops 3.6s smoke cloud (breaks distant LOS, not adjacent contact) + 2.5s +25% speed boost
        this.abilityBuffTimer = 2.5;
        if (callbacks.onSpawnSmoke) callbacks.onSpawnSmoke(this.x, this.y, 110, 3.6);
        break;
      case 'sprinter':
        // Nitro Stride: instant full stamina + 3s zero-drain +25% hyper sprint
        this.stamina = this.maxStamina;
        this.abilityBuffTimer = 3.0;
        break;
      case 'tank':
        // Shockwave Shove: radial pulse stuns Dando & pushes NPCs
        if (callbacks.onShockwave) callbacks.onShockwave(this.x, this.y, 220);
        break;
      case 'trickster': {
        // Wall-safe Holo-Blink: step along ray up to 110 units without clipping through walls
        const oldX = this.x;
        const oldY = this.y;
        const cos = Math.cos(this.facingAngle);
        const sin = Math.sin(this.facingAngle);
        let bestX = oldX;
        let bestY = oldY;
        const maxDist = 110;
        for (let d = 10; d <= maxDist; d += 10) {
          const tx = oldX + cos * d;
          const ty = oldY + sin * d;
          if (Pathfinder.isPointClearOfSolids(tx, ty, solidRects, this.radius + 2)) {
            bestX = tx;
            bestY = ty;
          } else {
            break;
          }
        }
        this.x = bestX;
        this.y = bestY;
        this.iframeTimer = Math.max(this.iframeTimer, 0.45);
        if (callbacks.onHoloBlink) callbacks.onHoloBlink(oldX, oldY);
        break;
      }
    }
    return true;
  }

  update(dt, inputState, areaEffect, hasSpeedPowerup, obstacleManager) {
    if (this.dodgeCooldown > 0) this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (this.iframeTimer > 0) this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.abilityCooldown > 0) this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    if (this.abilityBuffTimer > 0) this.abilityBuffTimer = Math.max(0, this.abilityBuffTimer - dt);
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
    if (this.checkerImmunityTimer > 0) this.checkerImmunityTimer = Math.max(0, this.checkerImmunityTimer - dt);
    if (this.jukeFlashTimer > 0) this.jukeFlashTimer = Math.max(0, this.jukeFlashTimer - dt);
    if (this.lowStaminaFlashTimer > 0) this.lowStaminaFlashTimer = Math.max(0, this.lowStaminaFlashTimer - dt);
    if (this.exhaustedToastCooldown > 0) this.exhaustedToastCooldown = Math.max(0, this.exhaustedToastCooldown - dt);
    if (this.screamTimer > 0) this.screamTimer = Math.max(0, this.screamTimer - dt);

    const prevX = this.x;
    const prevY = this.y;

    let ix = inputState.moveX || 0;
    let iy = inputState.moveY || 0;
    const mag = Math.hypot(ix, iy);
    if (mag > 1.0) {
      ix /= mag;
      iy /= mag;
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
      const dashSpeed = (this.dodgeDistance / this.dodgeDurationMax) * this.cheatSpeedMult;
      this.vx = this.dodgeDirX * dashSpeed;
      this.vy = this.dodgeDirY * dashSpeed;
    } else {
      // Sprint handling with hysteresis (requires 15 stamina to start, continues down to 0.5)
      const wantsSprint = Boolean(inputState.sprint) && mag > 0.1;
      const freeSprint = this.archetypeId === 'sprinter' && this.abilityBuffTimer > 0;
      const minStamThreshold = this.isSprinting ? 0.5 : CONFIG.PLAYER_DEFAULTS.SPRINT_MIN_START;

      if (wantsSprint && (this.stamina >= minStamThreshold || freeSprint)) {
        this.isSprinting = true;
        if (!freeSprint) {
          this.stamina = Math.max(0, this.stamina - CONFIG.PLAYER_DEFAULTS.SPRINT_DRAIN_RATE * dt);
        }
        this.sprintRegenDelayTimer = CONFIG.PLAYER_DEFAULTS.SPRINT_REGEN_DELAY;
      } else {
        if (wantsSprint && !freeSprint && this.stamina < minStamThreshold) {
          this.lowStaminaFlashTimer = 0.35;
        }
        this.isSprinting = false;
        if (this.sprintRegenDelayTimer > 0) {
          this.sprintRegenDelayTimer = Math.max(0, this.sprintRegenDelayTimer - dt);
        } else {
          this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt);
        }
      }

      let speedMult = this.cheatSpeedMult;
      if (this.isSprinting) speedMult *= CONFIG.PLAYER_DEFAULTS.SPRINT_MULTIPLIER;
      if (hasSpeedPowerup) speedMult *= 1.35;
      if (this.abilityBuffTimer > 0 && (this.archetypeId === 'balanced' || this.archetypeId === 'sprinter')) {
        speedMult *= 1.25;
      }
      if (this.slowTimer > 0) speedMult *= 0.68;

      let accel = this.acceleration * this.cheatSpeedMult;
      let fric = this.friction;
      if (areaEffect && areaEffect.slippery) {
        const slipFactor = this.hasGripUpgrade ? 0.65 : 0.28;
        accel *= slipFactor;
        fric *= slipFactor * 0.7;
      }

      const maxSpeed = this.baseSpeed * speedMult;

      if (mag > 0.05) {
        const targetVx = ix * maxSpeed;
        const targetVy = iy * maxSpeed;
        this._moveVectorToward(targetVx, targetVy, accel * dt);
        this.facingAngle = Math.atan2(iy, ix);
      } else {
        this._moveVectorToward(0, 0, fric * dt);
      }
    }

    const subSteps = 2;
    for (let s = 0; s < subSteps; s++) {
      this.x += (this.vx * dt) / subSteps;
      this.y += (this.vy * dt) / subSteps;
      if (obstacleManager) {
        obstacleManager.resolveCircleObstacles(this, this.radius);
      }
    }

    const stepDist = Math.hypot(this.x - prevX, this.y - prevY);
    this.distanceTravelled += stepDist;
    if (stepDist > 0.5) {
      this.stepPhase += stepDist * 0.12;
    }

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].alpha -= dt * 3.4;
      if (this.afterimages[i].alpha <= 0) {
        this.afterimages.splice(i, 1);
      }
    }
    if (this.dodgeTimer > 0 || this.isSprinting || hasSpeedPowerup) {
      this.afterimageSpawnTimer += dt;
      if (this.afterimageSpawnTimer >= 0.04) {
        this.afterimageSpawnTimer = 0;
        this.afterimages.push({
          x: this.x,
          y: this.y,
          angle: this.facingAngle,
          alpha: 0.6
        });
      }
    }
  }

  _moveVectorToward(targetVx, targetVy, maxDelta) {
    const dvx = targetVx - this.vx;
    const dvy = targetVy - this.vy;
    const dist = Math.hypot(dvx, dvy);
    if (dist <= maxDelta || dist < 0.0001) {
      this.vx = targetVx;
      this.vy = targetVy;
    } else {
      this.vx += (dvx / dist) * maxDelta;
      this.vy += (dvy / dist) * maxDelta;
    }
  }
}
