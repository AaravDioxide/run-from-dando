// js/pathfinding.js — Pre-allocated Grid A* navigation, line-of-sight raycasting, and post-rounding safe-point validation

import { CONFIG } from './config.js';

export class Pathfinder {
  constructor(worldWidth = CONFIG.WORLD.WIDTH, worldHeight = CONFIG.WORLD.HEIGHT, cellSize = CONFIG.WORLD.GRID_SIZE) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.totalCells = this.cols * this.rows;

    this.grid = new Uint8Array(this.totalCells);
    this.gScore = new Float32Array(this.totalCells);
    this.fScore = new Float32Array(this.totalCells);
    this.cameFrom = new Int32Array(this.totalCells);
    this.closed = new Uint8Array(this.totalCells);
  }

  rebuildGrid(solidRects, entityRadius = 16) {
    this.grid.fill(0);
    for (let c = 0; c < this.cols; c++) {
      this.setBlocked(c, 0, true);
      this.setBlocked(c, this.rows - 1, true);
    }
    for (let r = 0; r < this.rows; r++) {
      this.setBlocked(0, r, true);
      this.setBlocked(this.cols - 1, r, true);
    }

    const pad = Math.max(4, entityRadius * 0.45);
    for (const rect of solidRects) {
      if (rect.isOpenGate) continue;
      const minC = Math.max(0, Math.floor((rect.x - pad) / this.cellSize));
      const maxC = Math.min(this.cols - 1, Math.floor((rect.x + rect.w + pad) / this.cellSize));
      const minR = Math.max(0, Math.floor((rect.y - pad) / this.cellSize));
      const maxR = Math.min(this.rows - 1, Math.floor((rect.y + rect.h + pad) / this.cellSize));
      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          this.setBlocked(c, r, true);
        }
      }
    }
  }

  setBlocked(c, r, blocked) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
    this.grid[r * this.cols + c] = blocked ? 1 : 0;
  }

  isWalkable(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
    return this.grid[r * this.cols + c] === 0;
  }

  worldToGrid(x, y) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    return { c, r };
  }

  gridToWorld(c, r) {
    return {
      x: (c + 0.5) * this.cellSize,
      y: (r + 0.5) * this.cellSize
    };
  }

  findNearestWalkable(c, r, maxRadius = 14) {
    if (this.isWalkable(c, r)) return { c, r };
    for (let rad = 1; rad <= maxRadius; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          if (this.isWalkable(c + dc, r + dr)) {
            return { c: c + dc, r: r + dr };
          }
        }
      }
    }
    return { c, r };
  }

  static isPointClearOfSolids(x, y, solidRects = [], clearance = 26) {
    const pad = CONFIG.WORLD.BOUNDARY_PADDING + clearance;
    if (x < pad || x > CONFIG.WORLD.WIDTH - pad || y < pad || y > CONFIG.WORLD.HEIGHT - pad) {
      return false;
    }
    for (const r of solidRects) {
      if (r.isOpenGate) continue;
      if (
        x >= r.x - clearance &&
        x <= r.x + r.w + clearance &&
        y >= r.y - clearance &&
        y <= r.y + r.h + clearance
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validates rounded integer coordinates so rounding never places an entity on a clearance boundary,
   * and scans the arena grid as a fallback so it never returns an unvalidated coordinate.
   */
  static findSafePointNear(x, y, solidRects = [], clearance = 26) {
    const rx0 = Math.round(x);
    const ry0 = Math.round(y);
    if (Pathfinder.isPointClearOfSolids(rx0, ry0, solidRects, clearance)) {
      return { x: rx0, y: ry0 };
    }
    for (let radius = 20; radius <= 560; radius += 20) {
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const tx = Math.round(x + Math.cos(angle) * radius);
        const ty = Math.round(y + Math.sin(angle) * radius);
        if (Pathfinder.isPointClearOfSolids(tx, ty, solidRects, clearance)) {
          return { x: tx, y: ty };
        }
      }
    }
    // Full-arena grid scan fallback (guaranteed validated coordinate)
    let bestPt = { x: 1200, y: 900 };
    let bestDist = Infinity;
    for (let gx = 100; gx <= CONFIG.WORLD.WIDTH - 100; gx += 40) {
      for (let gy = 100; gy <= CONFIG.WORLD.HEIGHT - 100; gy += 40) {
        if (Pathfinder.isPointClearOfSolids(gx, gy, solidRects, clearance)) {
          const d = Math.hypot(gx - x, gy - y);
          if (d < bestDist) {
            bestDist = d;
            bestPt = { x: gx, y: gy };
          }
        }
      }
    }
    return bestPt;
  }

  hasLineOfSight(x1, y1, x2, y2, solidRects) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 4) return true;
    const steps = Math.ceil(dist / 20);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (const rect of solidRects) {
        if (rect.isOpenGate) continue;
        if (px >= rect.x - 6 && px <= rect.x + rect.w + 6 && py >= rect.y - 6 && py <= rect.y + rect.h + 6) {
          return false;
        }
      }
    }
    return true;
  }

  findPath(startX, startY, targetX, targetY, solidRects = []) {
    let start = this.worldToGrid(startX, startY);
    let goal = this.worldToGrid(targetX, targetY);

    start = this.findNearestWalkable(start.c, start.r);
    goal = this.findNearestWalkable(goal.c, goal.r);

    const goalWorld = this.gridToWorld(goal.c, goal.r);

    if (start.c === goal.c && start.r === goal.r) {
      return [goalWorld];
    }

    if (solidRects.length > 0 && this.hasLineOfSight(startX, startY, goalWorld.x, goalWorld.y, solidRects)) {
      return [goalWorld];
    }

    const gScore = this.gScore;
    const fScore = this.fScore;
    const cameFrom = this.cameFrom;
    const closed = this.closed;

    gScore.fill(Infinity);
    fScore.fill(Infinity);
    cameFrom.fill(-1);
    closed.fill(0);

    const startIdx = start.r * this.cols + start.c;
    const goalIdx = goal.r * this.cols + goal.c;

    gScore[startIdx] = 0;
    fScore[startIdx] = Math.hypot(goal.c - start.c, goal.r - start.r);

    const openList = [startIdx];
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
    ];

    let iterations = 0;
    const maxIterations = 3000;

    let closestIdx = startIdx;
    let closestDist = fScore[startIdx];

    while (openList.length > 0 && iterations < maxIterations) {
      iterations++;
      let bestPos = 0;
      let currentIdx = openList[0];
      let bestF = fScore[currentIdx];
      for (let i = 1; i < openList.length; i++) {
        const idx = openList[i];
        if (fScore[idx] < bestF) {
          bestF = fScore[idx];
          currentIdx = idx;
          bestPos = i;
        }
      }

      if (currentIdx === goalIdx) {
        return this._reconstructAndSmoothPath(cameFrom, currentIdx, goalWorld.x, goalWorld.y, solidRects);
      }

      openList.splice(bestPos, 1);
      closed[currentIdx] = 1;

      const cr = Math.floor(currentIdx / this.cols);
      const cc = currentIdx % this.cols;
      const distToGoal = Math.hypot(goal.c - cc, goal.r - cr);
      if (distToGoal < closestDist) {
        closestDist = distToGoal;
        closestIdx = currentIdx;
      }

      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.isWalkable(nc, nr)) continue;

        if (dc !== 0 && dr !== 0) {
          if (!this.isWalkable(cc + dc, cr) || !this.isWalkable(cc, cr + dr)) continue;
        }

        const nIdx = nr * this.cols + nc;
        if (closed[nIdx]) continue;

        const tentativeG = gScore[currentIdx] + cost;
        if (tentativeG < gScore[nIdx]) {
          cameFrom[nIdx] = currentIdx;
          gScore[nIdx] = tentativeG;
          fScore[nIdx] = tentativeG + Math.hypot(goal.c - nc, goal.r - nr);
          if (!openList.includes(nIdx)) {
            openList.push(nIdx);
          }
        }
      }
    }

    if (closestIdx !== startIdx) {
      const cw = this.gridToWorld(closestIdx % this.cols, Math.floor(closestIdx / this.cols));
      return this._reconstructAndSmoothPath(cameFrom, closestIdx, cw.x, cw.y, solidRects);
    }
    return [goalWorld];
  }

  _reconstructAndSmoothPath(cameFrom, currentIdx, finalX, finalY, solidRects) {
    const rawWaypoints = [];
    let curr = currentIdx;
    while (curr !== -1) {
      const r = Math.floor(curr / this.cols);
      const c = curr % this.cols;
      rawWaypoints.push(this.gridToWorld(c, r));
      curr = cameFrom[curr];
    }
    rawWaypoints.reverse();
    if (rawWaypoints.length > 0) {
      rawWaypoints[rawWaypoints.length - 1] = { x: finalX, y: finalY };
    } else {
      return [{ x: finalX, y: finalY }];
    }

    if (rawWaypoints.length <= 2 || !solidRects || solidRects.length === 0) {
      return rawWaypoints.slice(1);
    }

    const smoothed = [rawWaypoints[0]];
    let anchor = 0;
    while (anchor < rawWaypoints.length - 1) {
      let furthest = anchor + 1;
      for (let probe = rawWaypoints.length - 1; probe > anchor + 1; probe--) {
        if (this.hasLineOfSight(rawWaypoints[anchor].x, rawWaypoints[anchor].y, rawWaypoints[probe].x, rawWaypoints[probe].y, solidRects)) {
          furthest = probe;
          break;
        }
      }
      smoothed.push(rawWaypoints[furthest]);
      anchor = furthest;
    }

    return smoothed.slice(1);
  }
}
