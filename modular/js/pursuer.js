// js/pursuer.js — Deterministic Seeded Dando AI, close-proximity Smoke sense, forward-cone lunge juke check, and anti-camp grace

import { CONFIG, SeededRandom } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class PursuerAI {
  constructor() {
    this.rng = new SeededRandom('AI');
    this.reset(1200, 1290, 'normal', 'AI', false);
  }

  reset(x, y, difficultyId = 'normal', seedStr = '', isFirstRun = false) {
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;
    this.difficulty = diff;
    this.rng = new SeededRandom((seedStr || 'DANDO') + '_AI');

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = CONFIG.PURSUER.RADIUS;
    this.facingAngle = -Math.PI / 2;

    this.state = 'Stalking';
    const baseStalk = diff.stalkDuration || CONFIG.PURSUER.STALK_DURATION;
    this.stateTimer = baseStalk + (isFirstRun ? 1.4 : 0);

    this.baseSpeed = CONFIG.PURSUER.BASE_SPEED * diff.pursuerSpeedMult;
    this.maxSpeed = CONFIG.PURSUER.MAX_ESCALATED_SPEED * diff.pursuerSpeedMult;
    this.escalationRate = CONFIG.PURSUER.SPEED_ESCALATION_PER_SEC * diff.escalationMult;
    this.currentSpeed = this.baseSpeed;
    this.heatLevel = 1;

    this.attackCooldown = 1.4;
    this.attackSubState = 'none';
    this.attackTimer = 0;
    this.windupTotal = CONFIG.PURSUER.ATTACK_WINDUP;
    this.lungeDirX = 0;
    this.lungeDirY = 0;
    this.lungeTargetX = 0;
    this.lungeTargetY = 0;
    this.attackDodgedFlag = false;
    this.closeGrabTimer = 0;

    this.path = [];
    this.pathTimer = 0;
    this.lastKnownTarget = { x, y: y - 240 };
    this.lastSeenPlayerVel = { vx: 0, vy: -100 };
    this.hasLOS = true;
    this.searchTimer = 0;
    this.searchWaypointsChecked = 0;
    this.patrolIndex = 0;
    this.stuckTimer = 0;
    this.lastPos = { x, y };

    this.playerAnchorPos = { x: 1200, y: 900 };
    this.playerCampTimer = 0;
    this.easterEggCheckTimer = 1.0;

    this.stunTimer = 0;
    this.distractionTarget = null;

    this.activeQuip = 'DANDO IS ON THE FLOOR!';
    this.quipTimer = 3.0;
    this.quipCooldown = 9.0;
  }

  stun(seconds = 2.0) {
    this.stunTimer = Math.max(this.stunTimer, seconds);
    this.state = 'Recovery';
    this.attackSubState = 'none';
    this.closeGrabTimer = 0;
    this.activeQuip = 'WATCH THE SUIT!';
    this.quipTimer = 2.2;
  }

  redirectToDistraction(x, y, duration = 3.0) {
    this.distractionTarget = { x, y, timer: duration };
    this.activeQuip = 'CAMERAS?! HOLD UP!';
    this.quipTimer = 2.2;
  }

  update(dt, runTime, player, pathfinder, obstacleManager, activeDecoy, timeFreezeMult = 1.0, heatInfo = null, callbacks = {}, mapData = null) {
    if (this.quipTimer > 0) {
      this.quipTimer = Math.max(0, this.quipTimer - dt);
    }
    this.quipCooldown -= dt;
    if (this.quipCooldown <= 0) {
      this.quipCooldown = 9 + this.rng.next() * 5;
      this.activeQuip = CONFIG.PURSUER.QUIPS[Math.floor(this.rng.next() * CONFIG.PURSUER.QUIPS.length)];
      this.quipTimer = 2.5;
    }

    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }

    const effectiveDt = dt * timeFreezeMult;

    const heatBonus = heatInfo?.current?.speedBonus || 0;
    this.heatLevel = heatInfo?.current?.level || 1;
    this.currentSpeed = Math.min(
      this.maxSpeed,
      this.baseSpeed + heatBonus * 0.85 * this.difficulty.pursuerSpeedMult + runTime * this.escalationRate
    );

    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - effectiveDt);
    }

    // Track if player is camping stationary (only after the opening 6.0s grace window)
    const distFromAnchor = Math.hypot(player.x - this.playerAnchorPos.x, player.y - this.playerAnchorPos.y);
    if (distFromAnchor > 60 || runTime < CONFIG.PURSUER.CAMP_GRACE_TIME) {
      this.playerAnchorPos.x = player.x;
      this.playerAnchorPos.y = player.y;
      this.playerCampTimer = 0;
    } else {
      this.playerCampTimer += dt;
    }

    let targetX = player.x;
    let targetY = player.y;
    let chasingDecoy = false;

    if (activeDecoy && activeDecoy.remaining > 0) {
      targetX = activeDecoy.x;
      targetY = activeDecoy.y;
      chasingDecoy = true;
    } else if (this.distractionTarget && this.distractionTarget.timer > 0) {
      this.distractionTarget.timer -= dt;
      targetX = this.distractionTarget.x;
      targetY = this.distractionTarget.y;
      chasingDecoy = true;
    }

    const preDistToTarget = Math.hypot(targetX - this.x, targetY - this.y);
    const preDistToPlayer = Math.hypot(player.x - this.x, player.y - this.y);

    this.easterEggCheckTimer -= dt;
    if (this.easterEggCheckTimer <= 0) {
      this.easterEggCheckTimer = 1.0;
      if (preDistToPlayer < 220 && this.rng.next() < CONFIG.PLAYER_DEFAULTS.EASTER_EGG_CHANCE) {
        if (callbacks.onEasterEggScream) callbacks.onEasterEggScream();
      }
    }

    const playerArea = obstacleManager.getAreaEffectAt(player.x, player.y);
    const rawLOS = pathfinder.hasLineOfSight(this.x, this.y, targetX, targetY, obstacleManager.solidRects);
    // FIXED: Standing right next to Dando (< 92u) inside smoke no longer hides you from his immediate physical sense!
    const smokeConcealed = playerArea.inSmoke && !chasingDecoy && preDistToPlayer > CONFIG.PURSUER.SMOKE_SENSE_RADIUS;
    this.hasLOS = rawLOS && preDistToTarget <= CONFIG.PURSUER.LOS_MAX_DIST && !smokeConcealed;

    if (this.hasLOS) {
      this.lastKnownTarget = { x: targetX, y: targetY };
      this.lastSeenPlayerVel = { vx: player.vx, vy: player.vy };
      this.searchWaypointsChecked = 0;
    } else if (this.playerCampTimer >= CONFIG.PURSUER.CAMP_FLUSH_TIME) {
      this.playerCampTimer = 0;
      this.lastKnownTarget = { x: player.x, y: player.y };
      this.activeQuip = 'SONAR PING — FLUSHING CORNER!';
      this.quipTimer = 2.2;
    } else if (player.isSprinting && preDistToPlayer <= CONFIG.PURSUER.SPRINT_HEARING_DIST && !smokeConcealed) {
      this.lastKnownTarget = { x: player.x, y: player.y };
    }

    switch (this.state) {
      case 'Stalking': {
        this.stateTimer -= effectiveDt;
        const navGoal = this.hasLOS ? { x: targetX, y: targetY } : this.lastKnownTarget;
        this._navigateToward(navGoal.x, navGoal.y, this.currentSpeed * CONFIG.PURSUER.STALK_SPEED_MULT, effectiveDt, pathfinder, obstacleManager, this.hasLOS);
        if (this.stateTimer <= 0 || (this.hasLOS && preDistToTarget < 210)) {
          this.state = this.hasLOS ? 'Chasing' : 'Searching';
          this.searchTimer = CONFIG.PURSUER.SEARCH_TIMEOUT;
        }
        break;
      }

      case 'Chasing': {
        if (!this.hasLOS && !chasingDecoy) {
          this.state = 'Searching';
          this.searchTimer = CONFIG.PURSUER.SEARCH_TIMEOUT;
          this.searchWaypointsChecked = 0;
          break;
        }

        const lungeRange = CONFIG.PURSUER.LUNGE_RANGE + (this.heatLevel >= 3 ? 20 : 0);
        if (preDistToPlayer <= lungeRange && this.attackCooldown <= 0 && this.hasLOS && !chasingDecoy) {
          this._beginAttack(player, callbacks);
          break;
        }

        const playerSpeed = Math.hypot(player.vx, player.vy);
        if (!chasingDecoy && preDistToPlayer > 140 && preDistToPlayer < 480 && playerSpeed > 130 && this.rng.next() < 0.04) {
          this.state = 'Intercepting';
          this.stateTimer = 2.4;
          break;
        }

        this._navigateToward(targetX, targetY, this.currentSpeed, effectiveDt, pathfinder, obstacleManager, this.hasLOS);
        break;
      }

      case 'Intercepting': {
        this.stateTimer -= effectiveDt;
        if (!this.hasLOS) {
          this.state = 'Searching';
          this.searchTimer = CONFIG.PURSUER.SEARCH_TIMEOUT;
          this.searchWaypointsChecked = 0;
          break;
        }
        const lungeRange = CONFIG.PURSUER.LUNGE_RANGE + (this.heatLevel >= 3 ? 20 : 0);
        if (preDistToPlayer <= lungeRange && this.attackCooldown <= 0) {
          this._beginAttack(player, callbacks);
          break;
        }

        const lead = CONFIG.PURSUER.INTERCEPT_LEAD_TIME;
        const predX = Math.max(80, Math.min(CONFIG.WORLD.WIDTH - 80, player.x + player.vx * lead));
        const predY = Math.max(80, Math.min(CONFIG.WORLD.HEIGHT - 80, player.y + player.vy * lead));
        const predLOS = pathfinder.hasLineOfSight(this.x, this.y, predX, predY, obstacleManager.solidRects);
        this._navigateToward(predX, predY, this.currentSpeed * 1.05, effectiveDt, pathfinder, obstacleManager, predLOS);

        if (this.stateTimer <= 0 || preDistToPlayer < 120) {
          this.state = 'Chasing';
        }
        break;
      }

      case 'Searching': {
        this.searchTimer -= effectiveDt;
        if (this.hasLOS) {
          this.state = 'Chasing';
          break;
        }
        const distToLast = Math.hypot(this.lastKnownTarget.x - this.x, this.lastKnownTarget.y - this.y);
        if (distToLast > 36) {
          this._navigateToward(this.lastKnownTarget.x, this.lastKnownTarget.y, this.currentSpeed * 0.96, effectiveDt, pathfinder, obstacleManager, false);
        } else {
          this.searchWaypointsChecked++;
          const velAngle = Math.atan2(this.lastSeenPlayerVel.vy || 0, this.lastSeenPlayerVel.vx || 1);
          const sweepAngle = velAngle + (this.searchWaypointsChecked % 2 === 0 ? 0.6 : -0.6) * this.searchWaypointsChecked;
          const probeX = this.x + Math.cos(sweepAngle) * 260;
          const probeY = this.y + Math.sin(sweepAngle) * 260;
          this.lastKnownTarget = Pathfinder.findSafePointNear(probeX, probeY, obstacleManager.solidRects, 32);
          this.pathTimer = 0;
        }

        if (this.searchTimer <= 0) {
          this.searchTimer = CONFIG.PURSUER.SEARCH_TIMEOUT;
          const patrols = mapData?.patrolWaypoints || [
            { x: 600, y: 400 },
            { x: 1800, y: 400 },
            { x: 1200, y: 900 },
            { x: 600, y: 1400 },
            { x: 1800, y: 1400 }
          ];
          const wp = patrols[this.patrolIndex % patrols.length];
          this.patrolIndex++;
          this.lastKnownTarget = Pathfinder.findSafePointNear(wp.x, wp.y, obstacleManager.solidRects, 32);
          this.pathTimer = 0;
        }
        break;
      }

      case 'Attacking': {
        this.attackTimer -= effectiveDt;
        if (this.attackSubState === 'windup') {
          if (this.attackTimer > this.windupTotal * 0.42) {
            this._aimLungeAtPlayer(player);
          }
          this.vx = this.lungeDirX * (this.currentSpeed * 0.25);
          this.vy = this.lungeDirY * (this.currentSpeed * 0.25);
          this.x += this.vx * effectiveDt;
          this.y += this.vy * effectiveDt;
          obstacleManager.resolveCircleObstacles(this, this.radius);

          if (this.attackTimer <= 0) {
            this.attackSubState = 'lunge';
            this.attackTimer = CONFIG.PURSUER.ATTACK_ACTIVE_TIME;
            if (callbacks.onLungeStart) callbacks.onLungeStart();
          }
        } else if (this.attackSubState === 'lunge') {
          const lungeSpeed = this.currentSpeed * CONFIG.PURSUER.LUNGE_SPEED_MULT;
          this.vx = this.lungeDirX * lungeSpeed;
          this.vy = this.lungeDirY * lungeSpeed;
          this.x += this.vx * effectiveDt;
          this.y += this.vy * effectiveDt;
          const hitWall = obstacleManager.resolveCircleObstacles(this, this.radius);

          const postMoveDist = Math.hypot(player.x - this.x, player.y - this.y);
          if (player.isDodging() && postMoveDist < 84 && !this.attackDodgedFlag) {
            // Require player to be within or near Dando's forward lunge cone so remote dodges don't count
            const toPlayerX = (player.x - this.x) / (postMoveDist || 1);
            const toPlayerY = (player.y - this.y) / (postMoveDist || 1);
            const forwardDot = toPlayerX * this.lungeDirX + toPlayerY * this.lungeDirY;
            if (forwardDot > 0.25 || postMoveDist < 46) {
              this.attackDodgedFlag = true;
              if (callbacks.onAttackDodged) callbacks.onAttackDodged();
            }
          }

          if (hitWall || this.attackTimer <= 0) {
            if (hitWall) {
              this.activeQuip = 'ARGH! WALL IMPACT!';
              this.quipTimer = 2.0;
            }
            this.state = 'Recovery';
            this.attackSubState = 'none';
            this.stateTimer = CONFIG.PURSUER.ATTACK_RECOVERY_TIME * this.difficulty.recoveryMult;
            this.attackCooldown = CONFIG.PURSUER.ATTACK_COOLDOWN * this.difficulty.recoveryMult;
          }
        }
        break;
      }

      case 'Recovery': {
        this.stateTimer -= effectiveDt;
        this.vx *= 0.82;
        this.vy *= 0.82;
        if (this.stateTimer <= 0) {
          this.state = this.hasLOS ? 'Chasing' : 'Searching';
          this.searchTimer = CONFIG.PURSUER.SEARCH_TIMEOUT;
        }
        break;
      }
    }

    const postDistToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    const contactRadius = this.radius + player.radius;

    if (this.state === 'Attacking' && this.attackSubState === 'lunge') {
      if (postDistToPlayer <= contactRadius + 9) {
        if (player.isDodging()) {
          if (!this.attackDodgedFlag) {
            this.attackDodgedFlag = true;
            if (callbacks.onAttackDodged) callbacks.onAttackDodged();
          }
        } else if (!player.isInvulnerable()) {
          this._landHitOnPlayer(player, callbacks);
        }
      }
    } else if (this.state === 'Chasing' || this.state === 'Intercepting' || this.state === 'Searching') {
      // FIXED: Allow physical contact grab even in Searching state so standing on top of Dando in smoke is not invulnerable!
      if (postDistToPlayer <= contactRadius + 3 && !player.isDodging() && !player.isInvulnerable()) {
        this.closeGrabTimer += effectiveDt;
        if (this.closeGrabTimer >= CONFIG.PURSUER.CLOSE_GRAB_DELAY) {
          this.closeGrabTimer = 0;
          this._landHitOnPlayer(player, callbacks);
        }
      } else {
        this.closeGrabTimer = Math.max(0, this.closeGrabTimer - effectiveDt * 2);
      }
    } else {
      this.closeGrabTimer = 0;
    }
  }

  _aimLungeAtPlayer(player) {
    const lead = CONFIG.PURSUER.LUNGE_LEAD_TIME;
    const predX = player.x + player.vx * lead;
    const predY = player.y + player.vy * lead;
    const dx = predX - this.x;
    const dy = predY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.lungeDirX = dx / len;
    this.lungeDirY = dy / len;
    this.facingAngle = Math.atan2(this.lungeDirY, this.lungeDirX);
    this.lungeTargetX = this.x + this.lungeDirX * (CONFIG.PURSUER.LUNGE_RANGE + 45);
    this.lungeTargetY = this.y + this.lungeDirY * (CONFIG.PURSUER.LUNGE_RANGE + 45);
  }

  _landHitOnPlayer(player, callbacks) {
    if (callbacks.onCatchAttempt) {
      const pushAngle = Math.atan2(player.y - this.y, player.x - this.x);
      callbacks.onCatchAttempt(Math.cos(pushAngle) * 240, Math.sin(pushAngle) * 240);
    }
    this.state = 'Recovery';
    this.attackSubState = 'none';
    this.stateTimer = CONFIG.PURSUER.ATTACK_RECOVERY_TIME * this.difficulty.recoveryMult;
    this.attackCooldown = 2.4 * this.difficulty.recoveryMult;
  }

  _beginAttack(player, callbacks) {
    this.state = 'Attacking';
    this.attackSubState = 'windup';
    this.windupTotal = CONFIG.PURSUER.ATTACK_WINDUP * this.difficulty.windupMult;
    this.attackTimer = this.windupTotal;
    this.attackDodgedFlag = false;

    this._aimLungeAtPlayer(player);

    if (callbacks.onAttackWindup) callbacks.onAttackWindup();
  }

  _navigateToward(targetX, targetY, speed, dt, pathfinder, obstacleManager, directLOS = false) {
    let wp = { x: targetX, y: targetY };

    if (!directLOS) {
      this.pathTimer -= dt;
      const finalWp = this.path.length > 0 ? this.path[this.path.length - 1] : null;
      const targetMovedFar = !finalWp || Math.hypot(finalWp.x - targetX, finalWp.y - targetY) > 65;

      if (this.pathTimer <= 0 || this.path.length === 0 || targetMovedFar) {
        this.pathTimer = CONFIG.PURSUER.PATH_RECOMPUTE_INTERVAL;
        this.path = pathfinder.findPath(this.x, this.y, targetX, targetY, obstacleManager.solidRects);
      }

      wp = this.path[0] || { x: targetX, y: targetY };
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < 24 && this.path.length > 1) {
        this.path.shift();
        wp = this.path[0];
      }
    }

    const dx = wp.x - this.x;
    const dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;
    this.facingAngle = Math.atan2(this.vy, this.vx);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const hitWall = obstacleManager.resolveCircleObstacles(this, this.radius);

    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    this.lastPos.x = this.x;
    this.lastPos.y = this.y;
    if (moved < speed * dt * 0.25 || hitWall) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.24) {
        this.stuckTimer = 0;
        this.pathTimer = 0;
        this.x += -this.vy * dt * 0.85;
        this.y += this.vx * dt * 0.85;
        obstacleManager.resolveCircleObstacles(this, this.radius);
      }
    } else {
      this.stuckTimer = 0;
    }
  }
}
