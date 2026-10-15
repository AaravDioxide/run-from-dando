// js/obstacles.js — Seeded procedural obstacles, moving hazards, anti-farm hazard juke detection, and collision resolution

import { CONFIG, SeededRandom } from './config.js';

export class ObstacleManager {
  constructor() {
    this.solidRects = [];
    this.vehicles = [];
    this.timedGates = [];
    this.rotatingHazards = [];
    this.areaHazards = [];
    this.lightingTimer = 0;
    this.blackoutIntensity = 0;
  }

  initFromMap(mapData, difficultyId = 'normal', pathfinder = null, seedStr = '') {
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;
    const rng = new SeededRandom((seedStr || mapData.seed || 'DANDO') + '_OBS');

    this.solidRects = [];
    this.vehicles = [];
    this.timedGates = [];
    this.rotatingHazards = [];
    this.areaHazards = [];
    this.lightingTimer = 0;
    this.blackoutIntensity = 0;

    for (const b of mapData.buildings) {
      this.solidRects.push({ ...b, isBuilding: true });
    }

    for (const rot of mapData.rotatingHazards) {
      const copy = { ...rot, jukeCooldown: 0 };
      this.rotatingHazards.push(copy);
      this.solidRects.push({
        x: copy.x - copy.hubRadius,
        y: copy.y - copy.hubRadius,
        w: copy.hubRadius * 2,
        h: copy.hubRadius * 2,
        height3D: 16,
        label: '',
        color: '#e5ff00',
        accent: '#ff3300',
        isHub: true
      });
    }

    for (const g of mapData.timedGates) {
      const gateObj = { ...g };
      this.timedGates.push(gateObj);
      this.solidRects.push(gateObj);
    }

    for (const ah of mapData.areaHazards) {
      this.areaHazards.push({ ...ah });
    }

    const basePropCount = Math.round(10 * diff.obstacleDensityMult);
    const candidateProps = [
      { w: 52, h: 38, label: '', color: '#20232b', accent: '#e5ff00', height3D: 12 },
      { w: 46, h: 46, label: '', color: '#262932', accent: '#d1d5db', height3D: 14 },
      { w: 64, h: 36, label: '', color: '#1c1f26', accent: '#ff3300', height3D: 10 }
    ];

    let placed = 0;
    let attempts = 0;
    while (placed < basePropCount && attempts < 150) {
      attempts++;
      const tmpl = candidateProps[attempts % candidateProps.length];
      const rx = Math.round(220 + rng.next() * (mapData.width - 440 - tmpl.w));
      const ry = Math.round(260 + rng.next() * (mapData.height - 520 - tmpl.h));
      const cx = rx + tmpl.w * 0.5;
      const cy = ry + tmpl.h * 0.5;

      if (Math.hypot(cx - mapData.playerSpawn.x, cy - mapData.playerSpawn.y) < 210) continue;
      if (Math.hypot(cx - mapData.pursuerSpawn.x, cy - mapData.pursuerSpawn.y) < 250) continue;
      if (Math.hypot(cx - mapData.exitZone.x, cy - mapData.exitZone.y) < 180) continue;

      let nearTerminal = false;
      for (const t of mapData.terminalLocations) {
        if (Math.hypot(cx - t.x, cy - t.y) < 145) {
          nearTerminal = true;
          break;
        }
      }
      if (nearTerminal) continue;

      let nearRotor = false;
      for (const rot of this.rotatingHazards) {
        if (Math.hypot(cx - rot.x, cy - rot.y) < rot.armLength + 55) {
          nearRotor = true;
          break;
        }
      }
      if (nearRotor) continue;

      let onTrafficLane = false;
      for (const lane of mapData.trafficLanes) {
        if (Math.abs(cy - lane.y) < 75) {
          onTrafficLane = true;
          break;
        }
      }
      if (onTrafficLane) continue;

      let overlaps = false;
      for (const sr of this.solidRects) {
        if (
          rx < sr.x + sr.w + 95 &&
          rx + tmpl.w + 95 > sr.x &&
          ry < sr.y + sr.h + 95 &&
          ry + tmpl.h + 95 > sr.y
        ) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      this.solidRects.push({
        x: rx,
        y: ry,
        w: tmpl.w,
        h: tmpl.h,
        height3D: tmpl.height3D,
        label: tmpl.label,
        color: tmpl.color,
        accent: tmpl.accent,
        isProp: true
      });
      placed++;
    }

    for (const lane of mapData.trafficLanes) {
      const count = 2;
      const offset = rng.range(120, 420);
      for (let i = 0; i < count; i++) {
        this.vehicles.push({
          x: ((mapData.width / count) * i + offset) % mapData.width,
          y: lane.y,
          w: 86,
          h: 40,
          dir: lane.dir,
          baseSpeed: lane.speed * diff.hazardSpeedMult,
          color: lane.color,
          name: lane.name,
          jukeCooldown: 0
        });
      }
    }

    if (pathfinder) {
      pathfinder.rebuildGrid(this.solidRects, CONFIG.PURSUER.RADIUS);
    }
  }

  update(dt, mapData, timeFreezeMultiplier = 1.0, chaosSpeedMult = 1.0, pathfinder = null) {
    const effectiveDt = dt * timeFreezeMultiplier * chaosSpeedMult;

    for (const v of this.vehicles) {
      if (v.jukeCooldown > 0) v.jukeCooldown = Math.max(0, v.jukeCooldown - dt);
      v.x += v.dir * v.baseSpeed * effectiveDt;
      if (v.dir > 0 && v.x > mapData.width + 120) {
        v.x = -120;
      } else if (v.dir < 0 && v.x < -120) {
        v.x = mapData.width + 120;
      }
    }

    for (const rot of this.rotatingHazards) {
      if (rot.jukeCooldown > 0) rot.jukeCooldown = Math.max(0, rot.jukeCooldown - dt);
      rot.angle = (rot.angle + rot.angularSpeed * effectiveDt) % (Math.PI * 2);
    }

    let gateChanged = false;
    for (const g of this.timedGates) {
      g.timer = (g.timer + dt) % g.period;
      const shouldBeOpen = g.timer < g.openDuration;
      const warnBeforeClose = shouldBeOpen && g.timer >= g.openDuration - 1.0;
      const warnBeforeOpen = !shouldBeOpen && g.timer >= g.period - 1.0;
      g.isWarning = warnBeforeClose || warnBeforeOpen;

      if (g.isOpenGate !== shouldBeOpen) {
        g.isOpenGate = shouldBeOpen;
        gateChanged = true;
      }
    }
    if (gateChanged && pathfinder) {
      pathfinder.rebuildGrid(this.solidRects, CONFIG.PURSUER.RADIUS);
    }

    if (mapData.id === 'afterparty') {
      this.lightingTimer += dt;
      const wave = Math.sin(this.lightingTimer * 0.55);
      this.blackoutIntensity = wave > 0.45 ? Math.min(0.62, (wave - 0.45) * 1.05) : 0;
    } else {
      this.blackoutIntensity = 0;
    }
  }

  resolveCircleObstacles(entity, radius) {
    const pad = CONFIG.WORLD.BOUNDARY_PADDING;
    const minX = pad + radius;
    const maxX = CONFIG.WORLD.WIDTH - pad - radius;
    const minY = pad + radius;
    const maxY = CONFIG.WORLD.HEIGHT - pad - radius;

    let hitWall = false;
    if (entity.x < minX) { entity.x = minX; hitWall = true; }
    if (entity.x > maxX) { entity.x = maxX; hitWall = true; }
    if (entity.y < minY) { entity.y = minY; hitWall = true; }
    if (entity.y > maxY) { entity.y = maxY; hitWall = true; }

    for (const rect of this.solidRects) {
      if (rect.isOpenGate) continue;
      const closestX = Math.max(rect.x, Math.min(entity.x, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(entity.y, rect.y + rect.h));
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius) {
        hitWall = true;
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const overlap = radius - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
        } else {
          const leftPen = (entity.x + radius) - rect.x;
          const rightPen = (rect.x + rect.w) - (entity.x - radius);
          const topPen = (entity.y + radius) - rect.y;
          const bottomPen = (rect.y + rect.h) - (entity.y - radius);
          const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
          if (minPen === leftPen) entity.x = rect.x - radius;
          else if (minPen === rightPen) entity.x = rect.x + rect.w + radius;
          else if (minPen === topPen) entity.y = rect.y - radius;
          else entity.y = rect.y + rect.h + radius;
        }
      }
    }

    if (entity.x < minX) { entity.x = minX; hitWall = true; }
    if (entity.x > maxX) { entity.x = maxX; hitWall = true; }
    if (entity.y < minY) { entity.y = minY; hitWall = true; }
    if (entity.y > maxY) { entity.y = maxY; hitWall = true; }

    return hitWall;
  }

  checkDynamicHazardCollisions(player) {
    const r = player.radius;

    for (const v of this.vehicles) {
      const halfW = v.w * 0.5;
      const halfH = v.h * 0.5;
      const closestX = Math.max(v.x - halfW, Math.min(player.x, v.x + halfW));
      const closestY = Math.max(v.y - halfH, Math.min(player.y, v.y + halfH));
      const dist = Math.hypot(player.x - closestX, player.y - closestY);
      if (dist < r) {
        return { hit: true, source: v.name, knockX: v.dir * 160, knockY: (player.y >= v.y ? 1 : -1) * 140 };
      }
    }

    for (const rot of this.rotatingHazards) {
      const endX = rot.x + Math.cos(rot.angle) * rot.armLength;
      const endY = rot.y + Math.sin(rot.angle) * rot.armLength;
      const dist = this._pointToSegmentDist(player.x, player.y, rot.x, rot.y, endX, endY);
      if (dist < r + 9) {
        const nx = -Math.sin(rot.angle) * Math.sign(rot.angularSpeed);
        const ny = Math.cos(rot.angle) * Math.sign(rot.angularSpeed);
        return { hit: true, source: rot.label, knockX: nx * 180, knockY: ny * 180 };
      }
    }

    return { hit: false };
  }

  /**
   * Anti-farm Hazard Juke check:
   * Requires the vehicle or rotor arm to be actively approaching the player within the threat lane,
   * and places a 4.0s cooldown on that specific hazard so players cannot farm jukes beside a road.
   */
  isNearDynamicHazard(player, margin = 30) {
    const r = player.radius + margin;
    for (const v of this.vehicles) {
      if (v.jukeCooldown > 0) continue;
      const halfW = v.w * 0.5;
      const halfH = v.h * 0.5;
      const closestX = Math.max(v.x - halfW, Math.min(player.x, v.x + halfW));
      const closestY = Math.max(v.y - halfH, Math.min(player.y, v.y + halfH));
      const dist = Math.hypot(player.x - closestX, player.y - closestY);
      // Must be in or right on the edge of the vehicle's vertical sweep and the vehicle must be moving toward player's X
      const approaching = (player.x - v.x) * v.dir > -halfW * 0.5;
      const inLaneBand = Math.abs(player.y - v.y) <= halfH + player.radius + 14;
      if (dist < r && approaching && inLaneBand) {
        v.jukeCooldown = 4.0;
        return true;
      }
    }
    for (const rot of this.rotatingHazards) {
      if (rot.jukeCooldown > 0) continue;
      const endX = rot.x + Math.cos(rot.angle) * rot.armLength;
      const endY = rot.y + Math.sin(rot.angle) * rot.armLength;
      if (this._pointToSegmentDist(player.x, player.y, rot.x, rot.y, endX, endY) < r) {
        // Check that the rotating arm's tangential velocity is moving toward the player
        const tx = -Math.sin(rot.angle) * Math.sign(rot.angularSpeed);
        const ty = Math.cos(rot.angle) * Math.sign(rot.angularSpeed);
        const midX = (rot.x + endX) * 0.5;
        const midY = (rot.y + endY) * 0.5;
        const dot = (player.x - midX) * tx + (player.y - midY) * ty;
        if (dot > 0) {
          rot.jukeCooldown = 4.0;
          return true;
        }
      }
    }
    return false;
  }

  getAreaEffectAt(x, y) {
    let slippery = false;
    let inSmoke = false;
    for (const ah of this.areaHazards) {
      if (Math.hypot(x - ah.x, y - ah.y) <= ah.radius) {
        if (ah.type === 'slippery') slippery = true;
        if (ah.type === 'smoke') inSmoke = true;
      }
    }
    return { slippery, inSmoke };
  }

  _pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }
}
