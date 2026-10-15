// js/renderer.js — Normalized-Zoom Top-Down Canvas Renderer, Off-Screen Vehicle/Terminal/Radar+ Pointers, and North-Wall Safe Silhouettes

import { CONFIG } from './config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewScale = 1;
    this.viewWidth = this.width;
    this.viewHeight = this.height;

    this.camera = { x: 1200, y: 900, shakeX: 0, shakeY: 0, shakeIntensity: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // FIXED: Normalize camera zoom so phones, laptops, and 4K monitors see a consistent arena field-of-view (~1180u wide)
    const targetW = CONFIG.WORLD.TARGET_VIEW_WIDTH || 1180;
    const targetH = 820;
    const scaleX = this.width / targetW;
    const scaleY = this.height / targetH;
    this.viewScale = Math.max(0.54, Math.min(1.65, Math.min(scaleX, scaleY * 1.15)));
    this.viewWidth = this.width / this.viewScale;
    this.viewHeight = this.height / this.viewScale;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  addScreenShake(amount = 8, reducedMotion = false) {
    if (reducedMotion) return;
    this.camera.shakeIntensity = Math.min(20, this.camera.shakeIntensity + amount);
  }

  updateCamera(targetX, targetY, dt, reducedMotion = false) {
    const lerp = 1 - Math.pow(0.001, dt);
    this.camera.x += (targetX - this.camera.x) * lerp;
    this.camera.y += (targetY - this.camera.y) * lerp;

    if (this.camera.shakeIntensity > 0.1 && !reducedMotion) {
      this.camera.shakeX = (Math.random() - 0.5) * 2 * this.camera.shakeIntensity;
      this.camera.shakeY = (Math.random() - 0.5) * 2 * this.camera.shakeIntensity;
      this.camera.shakeIntensity *= Math.pow(0.02, dt);
    } else {
      this.camera.shakeX = 0;
      this.camera.shakeY = 0;
      this.camera.shakeIntensity = 0;
    }
  }

  render(gameState) {
    const ctx = this.ctx;
    const {
      mapData,
      player,
      pursuer,
      npcManager,
      obstacleManager,
      powerUpManager,
      modeManager,
      particles,
      floatingTexts,
      settings,
      equipped
    } = gameState;

    if (!mapData) return;

    const highContrast = Boolean(settings?.highContrast);
    const colorblind = Boolean(settings?.colorblindMode);
    const reducedMotion = Boolean(settings?.reducedMotion);
    const hasRadarPlus = Boolean(equipped?.unlockedCosmetics?.includes('upgrade_radar'));

    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(0, 0, this.width, this.height);

    const camLeft = this.camera.x - this.viewWidth * 0.5 + this.camera.shakeX;
    const camTop = this.camera.y - this.viewHeight * 0.5 + this.camera.shakeY;

    ctx.save();
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(-camLeft, -camTop);

    this._drawArenaGround(ctx, mapData, camLeft, camTop);
    this._drawDecorZones(ctx, mapData, reducedMotion);
    this._drawAreaHazards(ctx, obstacleManager.areaHazards, colorblind, highContrast);
    this._drawModeObjectives(ctx, mapData, modeManager, colorblind);
    this._drawPickups(ctx, powerUpManager.pickups, colorblind, highContrast);

    if (powerUpManager.activeDecoy) {
      this._drawDecoy(ctx, powerUpManager.activeDecoy);
    }

    // Telemetry HUD+ Perk: draws Dando's active A* target vector line on the ground
    if (hasRadarPlus && gameState.state === 'PLAYING' && pursuer.path && pursuer.path.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 51, 0, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pursuer.x, pursuer.y);
      for (const wp of pursuer.path) {
        ctx.lineTo(wp.x, wp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    this._drawVehicles(ctx, obstacleManager.vehicles, colorblind, highContrast);
    this._drawNPCs(ctx, npcManager.npcs, colorblind, highContrast);
    this._drawBuildings3D(ctx, obstacleManager.solidRects, camLeft, camTop, highContrast, colorblind);
    // Draw Player and Pursuer AFTER 3D buildings so north-wall roof parallax never hides the player or Dando!
    this._drawPlayer(ctx, player, powerUpManager, equipped, highContrast);
    this._drawPursuer(ctx, pursuer, highContrast, colorblind);
    this._drawRotatingHazards(ctx, obstacleManager.rotatingHazards, highContrast);
    this._drawParticles(ctx, particles);
    this._drawFloatingTexts(ctx, floatingTexts);

    ctx.restore();

    this._drawScreenOverlays(ctx, gameState, reducedMotion);
    if (gameState.state === 'PLAYING') {
      this._drawOffscreenIndicators(ctx, player, pursuer, obstacleManager, powerUpManager, modeManager, mapData, settings, equipped, camLeft, camTop);
    }

    if (settings?.showMinimap !== false && gameState.state === 'PLAYING') {
      this._drawMinimap(ctx, mapData, player, pursuer, obstacleManager, modeManager, powerUpManager);
    }
  }

  _drawArenaGround(ctx, mapData, camLeft, camTop) {
    const W = mapData.width;
    const H = mapData.height;
    const pad = CONFIG.WORLD.BOUNDARY_PADDING;

    ctx.fillStyle = mapData.meta.groundColor;
    ctx.fillRect(0, 0, W, H);

    const tile = 80;
    const startX = Math.max(0, Math.floor(camLeft / tile) * tile);
    const endX = Math.min(W, camLeft + this.viewWidth + tile);
    const startY = Math.max(0, Math.floor(camTop / tile) * tile);
    const endY = Math.min(H, camTop + this.viewHeight + tile);

    ctx.strokeStyle = mapData.meta.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += tile) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += tile) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    ctx.strokeStyle = mapData.meta.themeColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  }

  _drawDecorZones(ctx, mapData, reducedMotion) {
    const now = performance.now() * 0.001;
    for (const z of mapData.decorZones) {
      if (z.type === 'road_h' || z.type === 'road_v') {
        ctx.fillStyle = '#161920';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = 'rgba(229, 255, 0, 0.24)';
        ctx.setLineDash([28, 28]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (z.type === 'road_h') {
          ctx.moveTo(z.x, z.y + z.h * 0.5);
          ctx.lineTo(z.x + z.w, z.y + z.h * 0.5);
        } else {
          ctx.moveTo(z.x + z.w * 0.5, z.y);
          ctx.lineTo(z.x + z.w * 0.5, z.y + z.h);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (z.type === 'dancefloor') {
        const cols = 7;
        const rows = 6;
        const cw = z.w / cols;
        const ch = z.h / rows;
        const palette = ['rgba(244,63,94,0.10)', 'rgba(245,196,81,0.08)', 'rgba(255,255,255,0.04)', 'rgba(52,211,153,0.08)'];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = reducedMotion ? (r + c) % palette.length : Math.floor(now * 1.6 + r + c) % palette.length;
            ctx.fillStyle = palette[idx];
            ctx.fillRect(z.x + c * cw + 2, z.y + r * ch + 2, cw - 4, ch - 4);
          }
        }
        ctx.strokeStyle = 'rgba(255, 51, 0, 0.65)';
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x, z.y, z.w, z.h);
      } else if (z.type === 'corridor') {
        ctx.fillStyle = 'rgba(229, 255, 0, 0.03)';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = 'rgba(229, 255, 0, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(z.x, z.y, z.w, z.h);
      } else if (z.type === 'carnival_ring') {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.18)';
        ctx.lineWidth = 2;
        ctx.strokeRect(z.x, z.y, z.w, z.h);
      }
    }
  }

  _drawAreaHazards(ctx, areaHazards, colorblind, highContrast) {
    for (const ah of areaHazards) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ah.x, ah.y, ah.radius, 0, Math.PI * 2);
      if (ah.type === 'slippery') {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.16)';
        ctx.fill();
        ctx.strokeStyle = highContrast ? '#ffffff' : '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(180, 185, 195, 0.20)';
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (colorblind) {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ah.type === 'slippery' ? '⚠ SLICK' : '☁ SMOKE', ah.x, ah.y + 4);
      }
      ctx.restore();
    }
  }

  _drawModeObjectives(ctx, mapData, modeManager, colorblind) {
    if (modeManager.modeId !== 'escape_mission') return;

    for (const term of modeManager.terminals) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(term.x, term.y, term.radius, 0, Math.PI * 2);
      ctx.fillStyle = term.completed ? 'rgba(0, 255, 136, 0.22)' : 'rgba(229, 255, 0, 0.16)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = term.completed ? '#00ff88' : '#e5ff00';
      ctx.stroke();

      if (!term.completed && term.progress > 0) {
        const ratio = term.progress / term.hackTime;
        ctx.beginPath();
        ctx.arc(term.x, term.y, term.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      const pct = Math.round((term.progress / term.hackTime) * 100);
      const labelTxt = term.completed
        ? '✓ UNLOCKED'
        : (pct > 0 ? `HACKING ${pct}%` : `${term.label} [STAND NEAR]`);
      ctx.fillText(labelTxt, term.x, term.y + 4);
      ctx.restore();
    }

    const ex = mapData.exitZone;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
    ctx.fillStyle = ex.active ? 'rgba(0, 255, 136, 0.28)' : 'rgba(255, 51, 0, 0.14)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ex.active ? '#00ff88' : '#ff3300';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ex.active ? '▲ EXTRACTION OPEN ▲' : 'EXIT LOCKED (3 TERMS)', ex.x, ex.y + 4);
    ctx.restore();
  }

  _drawPickups(ctx, pickups, colorblind, highContrast) {
    for (const p of pickups) {
      const bobY = Math.sin(p.bobPhase) * 3;
      const isStar = p.type === 'score_star';
      const def = isStar
        ? { color: '#e5ff00', symbol: '★', name: 'STAR' }
        : CONFIG.POWERUPS[p.type] || CONFIG.POWERUPS.energy_drink;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - 10, p.y + 10, 20, 6);

      ctx.save();
      ctx.translate(p.x, p.y + bobY);
      ctx.fillStyle = def.color;
      ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);

      ctx.lineWidth = highContrast ? 3 : 2;
      ctx.strokeStyle = '#090a0c';
      ctx.strokeRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);

      ctx.fillStyle = '#090a0c';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.symbol, 0, 1);

      if (colorblind) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(def.name.split(' ')[0], 0, -p.radius - 7);
      }
      ctx.restore();
    }
  }

  _drawDecoy(ctx, decoy) {
    ctx.save();
    ctx.translate(decoy.x, decoy.y);
    ctx.strokeStyle = '#ff3300';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-20, -20, 40, 40);
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 51, 0, 0.7)';
    ctx.fillRect(-12, -12, 24, 24);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`DECOY ${decoy.remaining.toFixed(1)}s`, 0, -25);
    ctx.restore();
  }

  _drawVehicles(ctx, vehicles, colorblind, highContrast) {
    for (const v of vehicles) {
      ctx.save();
      ctx.translate(v.x, v.y);

      ctx.fillStyle = 'rgba(229, 255, 0, 0.13)';
      ctx.beginPath();
      const frontX = v.dir * (v.w * 0.5);
      ctx.moveTo(frontX, -10);
      ctx.lineTo(frontX + v.dir * 120, -36);
      ctx.lineTo(frontX + v.dir * 120, 36);
      ctx.lineTo(frontX, 10);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.fillRect(-v.w * 0.5 + 4, -v.h * 0.5 + 5, v.w, v.h);

      ctx.fillStyle = v.color;
      ctx.fillRect(-v.w * 0.5, -v.h * 0.5, v.w, v.h);
      ctx.strokeStyle = highContrast ? '#ffffff' : '#090a0c';
      ctx.lineWidth = 2;
      ctx.strokeRect(-v.w * 0.5, -v.h * 0.5, v.w, v.h);

      ctx.fillStyle = '#111318';
      ctx.fillRect(v.dir > 0 ? 8 : -28, -v.h * 0.38, 20, v.h * 0.76);

      if (colorblind) {
        ctx.fillStyle = '#090a0c';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('▲ VEH', 0, 3);
      }
      ctx.restore();
    }
  }

  _drawNPCs(ctx, npcs, colorblind, highContrast) {
    for (const n of npcs) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(n.x, n.y + 11, n.radius * 0.85, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (n.type === 'security') {
        ctx.strokeStyle = 'rgba(255, 51, 0, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 54, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = highContrast ? 2.5 : 1.5;
      ctx.strokeStyle = highContrast ? '#ffffff' : '#090a0c';
      ctx.stroke();

      const icons = {
        civilian: '•',
        panicked: '!',
        security: '✖',
        distractor: '◎',
        helper: '★'
      };
      ctx.fillStyle = '#090a0c';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icons[n.type] || '•', n.x, n.y);

      if (colorblind) {
        ctx.fillStyle = '#e5e7eb';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(n.label, n.x, n.y - n.radius - 6);
      }

      if (n.barkTimer > 0 && n.barkText) {
        ctx.fillStyle = '#090a0c';
        ctx.fillRect(n.x - 58, n.y - 34, 116, 16);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(n.x - 58, n.y - 34, 116, 16);
        ctx.fillStyle = '#e5ff00';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(n.barkText, n.x, n.y - 23);
      }
    }
  }

  _drawPlayer(ctx, player, powerUpManager, equipped, highContrast) {
    const skinItem = CONFIG.SHOP_ITEMS.find(i => i.id === equipped?.skin);
    const trailItem = CONFIG.SHOP_ITEMS.find(i => i.id === equipped?.trail);
    const primaryColor = skinItem?.color || player.archetype.color;
    const trailColor = trailItem?.color || '#e5ff00';

    for (const ai of player.afterimages) {
      ctx.save();
      ctx.globalAlpha = ai.alpha * 0.4;
      ctx.fillStyle = trailColor;
      ctx.beginPath();
      ctx.arc(ai.x, ai.y, player.radius * 0.88, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 13, player.radius, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Strong visual ring burst when landing a successful dodge juke
    if (player.jukeFlashTimer > 0) {
      ctx.save();
      const ringProgress = 1 - player.jukeFlashTimer / 0.35;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, 1 - ringProgress);
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 8 + ringProgress * 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (powerUpManager.hasEffect('bubble_shield')) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.fillStyle = 'rgba(0, 229, 255, 0.20)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.isInvulnerable() && !player.cheatGodMode && Math.floor(performance.now() / 60) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    ctx.rotate(player.facingAngle);

    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = highContrast ? 3 : 2;
    ctx.strokeStyle = '#090a0c';
    ctx.stroke();

    ctx.fillStyle = '#090a0c';
    ctx.fillRect(4, -7, 8, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, -5, 4, 10);

    ctx.restore();

    if (player.screamTimer > 0 && player.screamText) {
      ctx.save();
      const jx = (Math.random() - 0.5) * 3;
      const jy = (Math.random() - 0.5) * 3;
      ctx.font = '900 13px monospace';
      const tw = ctx.measureText(player.screamText).width + 22;
      const bx = player.x - tw * 0.5 + jx;
      const by = player.y - player.radius - 44 + jy;

      ctx.fillStyle = '#000000';
      ctx.fillRect(bx + 3, by + 3, tw, 24);
      ctx.fillStyle = '#e5ff00';
      ctx.fillRect(bx, by, tw, 24);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, tw, 24);

      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.fillText(player.screamText, player.x + jx, by + 16);
      ctx.restore();
    }
  }

  _drawPursuer(ctx, pursuer, highContrast, colorblind) {
    if (pursuer.state === 'Attacking' && pursuer.attackSubState === 'windup') {
      ctx.save();
      const progress = 1 - Math.max(0, pursuer.attackTimer / (pursuer.windupTotal || 0.44));
      ctx.strokeStyle = '#ff3300';
      ctx.fillStyle = `rgba(255, 51, 0, ${0.18 + progress * 0.22})`;
      ctx.lineWidth = 2.5;
      if (colorblind) ctx.setLineDash([8, 4]);
      ctx.beginPath();
      const angle = Math.atan2(pursuer.lungeDirY, pursuer.lungeDirX);
      ctx.moveTo(pursuer.x, pursuer.y);
      ctx.arc(pursuer.x, pursuer.y, CONFIG.PURSUER.LUNGE_RANGE + 30, angle - 0.30, angle + 0.30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#e5ff00';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ DODGE NOW! ⚠', pursuer.x, pursuer.y - 42);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 51, 0, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pursuer.x, pursuer.y, pursuer.radius * 1.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(pursuer.x, pursuer.y + 14, pursuer.radius, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(pursuer.x, pursuer.y);
    ctx.rotate(pursuer.facingAngle);

    ctx.fillStyle = '#f2efe9';
    ctx.beginPath();
    ctx.arc(0, 0, pursuer.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = highContrast ? 3.5 : 2.5;
    ctx.strokeStyle = '#ff3300';
    ctx.stroke();

    ctx.fillStyle = '#090a0c';
    ctx.fillRect(4, -10, 9, 20);
    ctx.strokeStyle = '#e5ff00';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, -10, 9, 20);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#ff3300';
    const stateLabel = pursuer.stunTimer > 0 ? 'STUNNED' : pursuer.state.toUpperCase();
    ctx.fillText(`DANDO [${stateLabel}]`, pursuer.x, pursuer.y - pursuer.radius - 8);

    if (pursuer.quipTimer > 0 && pursuer.activeQuip) {
      const text = pursuer.activeQuip;
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(text).width + 16;
      ctx.fillStyle = '#090a0c';
      ctx.strokeStyle = '#ff3300';
      ctx.lineWidth = 1.5;
      ctx.fillRect(pursuer.x - tw * 0.5, pursuer.y - pursuer.radius - 34, tw, 18);
      ctx.strokeRect(pursuer.x - tw * 0.5, pursuer.y - pursuer.radius - 34, tw, 18);
      ctx.fillStyle = '#f2efe9';
      ctx.fillText(text, pursuer.x, pursuer.y - pursuer.radius - 22);
    }
    ctx.restore();
  }

  _drawBuildings3D(ctx, solidRects, camLeft, camTop, highContrast, colorblind = false) {
    const camCenterX = camLeft + this.viewWidth * 0.5;
    const camCenterY = camTop + this.viewHeight * 0.5;

    for (const r of solidRects) {
      if (
        r.x + r.w < camLeft - 80 ||
        r.x > camLeft + this.viewWidth + 80 ||
        r.y + r.h < camTop - 80 ||
        r.y > camTop + this.viewHeight + 80
      ) {
        continue;
      }

      if (r.period !== undefined) {
        ctx.save();
        if (r.isOpenGate) {
          ctx.strokeStyle = r.isWarning ? '#e5ff00' : 'rgba(0, 255, 136, 0.55)';
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 2;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = r.isWarning ? '#e5ff00' : '#ff3300';
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = '#090a0c';
          ctx.lineWidth = 2;
          ctx.strokeRect(r.x, r.y, r.w, r.h);
        }
        if (colorblind) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          const statusSym = r.isWarning ? '⚠ WARN' : (r.isOpenGate ? 'OPEN' : '✖ CLOSED');
          ctx.fillText(statusSym, r.x + r.w * 0.5, r.y + r.h * 0.5 + 4);
        }
        ctx.restore();
        continue;
      }

      const h3d = r.height3D || 20;
      const cx = r.x + r.w * 0.5;
      const cy = r.y + r.h * 0.5;

      // Subtle, restrained 3D roof offset so geometry stays crisp
      const shiftX = Math.max(-10, Math.min(10, ((cx - camCenterX) / 700) * h3d * 0.4));
      const shiftY = Math.max(-11, Math.min(5, ((cy - camCenterY) / 700) * h3d * 0.4 - h3d * 0.30));

      const roofX = r.x + shiftX;
      const roofY = r.y + shiftY;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
      ctx.fillRect(r.x + 6, r.y + 7, r.w, r.h);

      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.fillStyle = r.color || '#1c1e24';
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + r.h);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.lineTo(roofX + r.w, roofY + r.h);
      ctx.lineTo(roofX, roofY + r.h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = r.color || '#1e222b';
      ctx.fillRect(roofX, roofY, r.w, r.h);

      ctx.lineWidth = highContrast ? 2.5 : 1.5;
      ctx.strokeStyle = highContrast ? '#ffffff' : (r.accent || '#64748b');
      ctx.strokeRect(roofX, roofY, r.w, r.h);

      if (r.label && r.w >= 180) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.50)';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(r.label, roofX + r.w * 0.5, roofY + r.h * 0.5 + 4);
      }
    }
  }

  _drawRotatingHazards(ctx, rotatingHazards, highContrast) {
    for (const rot of rotatingHazards) {
      const endX = rot.x + Math.cos(rot.angle) * rot.armLength;
      const endY = rot.y + Math.sin(rot.angle) * rot.armLength;

      ctx.save();
      ctx.strokeStyle = highContrast ? '#ffffff' : '#ff3300';
      ctx.lineWidth = 12;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(rot.x, rot.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.strokeStyle = '#e5ff00';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rot.x, rot.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawParticles(ctx, particles) {
    for (const pt of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
      ctx.restore();
    }
  }

  _drawFloatingTexts(ctx, floatingTexts) {
    for (const ft of floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
      ctx.fillStyle = ft.color || '#e5ff00';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  _drawScreenOverlays(ctx, gameState, reducedMotion) {
    const { obstacleManager, powerUpManager, modeManager, player } = gameState;

    let blackout = obstacleManager.blackoutIntensity || 0;
    if (modeManager.activeModifier?.blackoutBonus) {
      blackout = Math.max(blackout, modeManager.activeModifier.blackoutBonus);
    }
    if (reducedMotion) blackout *= 0.4;

    if (blackout > 0.02) {
      const grad = ctx.createRadialGradient(
        this.width * 0.5, this.height * 0.5, 95,
        this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.55
      );
      grad.addColorStop(0, 'rgba(9, 10, 12, 0)');
      grad.addColorStop(1, `rgba(9, 10, 12, ${blackout})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (powerUpManager.hasEffect('time_freeze')) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, this.width, this.height);
    }

    if (player.health === 1) {
      ctx.strokeStyle = 'rgba(255, 51, 0, 0.42)';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Draws off-screen directional pointers for Dando, Escape Terminals/Exit, approaching Vehicles, and Telemetry HUD+ perks.
   */
  _drawOffscreenIndicators(ctx, player, pursuer, obstacleManager, powerUpManager, modeManager, mapData, settings, equipped, camLeft, camTop) {
    const hasRadarPlus = Boolean(equipped?.unlockedCosmetics?.includes('upgrade_radar'));
    const indRadius = Math.min(this.width, this.height) * 0.34;
    const usedAngles = [];

    const isPointOnScreen = (wx, wy, margin = 30) => (
      wx >= camLeft + margin &&
      wx <= camLeft + this.viewWidth - margin &&
      wy >= camTop + margin &&
      wy <= camTop + this.viewHeight - margin
    );

    // 1. Dando Threat Pointer: only draw when Dando is off-screen, OR when Telemetry HUD+ is equipped (shows live distance)
    const dx = pursuer.x - player.x;
    const dy = pursuer.y - player.y;
    const dist = Math.hypot(dx, dy);
    const dandoOnScreen = isPointOnScreen(pursuer.x, pursuer.y, 24);
    if (!dandoOnScreen || hasRadarPlus) {
      const angle = Math.atan2(dy, dx);
      usedAngles.push(angle);
      const label = hasRadarPlus ? `DANDO ${Math.round(dist)}u` : 'DANDO';
      const r = dandoOnScreen ? indRadius - 34 : indRadius;
      this._drawPointerArrow(ctx, angle, r, dist < 340 ? '#ff3300' : '#e5ff00', label);
    }

    // 2. Telemetry HUD+ Perk: Nearest Power-Up / Score Star Pointer
    if (hasRadarPlus && powerUpManager.pickups.length > 0) {
      let nearestPk = null;
      let bestDist = Infinity;
      for (const pk of powerUpManager.pickups) {
        const d = Math.hypot(pk.x - player.x, pk.y - player.y);
        if (d < bestDist) {
          bestDist = d;
          nearestPk = pk;
        }
      }
      if (nearestPk && bestDist > 120) {
        const pAngle = Math.atan2(nearestPk.y - player.y, nearestPk.x - player.x);
        this._drawPointerArrow(ctx, pAngle, indRadius - 42, '#00e5ff', `ITEM ${Math.round(bestDist)}u`);
      }
    }

    // 3. Off-Screen Approaching Vehicle Warning Chevrons
    for (const v of obstacleManager.vehicles) {
      if (Math.abs(player.y - v.y) < 130) {
        const relX = v.x - player.x;
        const approaching = (v.dir > 0 && relX < 0 && relX > -720) || (v.dir < 0 && relX > 0 && relX < 720);
        if (approaching && !isPointOnScreen(v.x, v.y, 10)) {
          const vAngle = Math.atan2(v.y - player.y, v.x - player.x);
          this._drawPointerArrow(ctx, vAngle, indRadius - 12, '#e5ff00', '⚠ TRAFFIC');
        }
      }
    }

    // 4. Escape Mission Terminal / Helipad Pointers (staggered radially if two terminals sit at similar angles)
    if (modeManager.modeId === 'escape_mission') {
      if (!modeManager.exitUnlocked) {
        for (const term of modeManager.terminals) {
          if (term.completed) continue;
          const tdx = term.x - player.x;
          const tdy = term.y - player.y;
          const tdist = Math.hypot(tdx, tdy);
          if (!isPointOnScreen(term.x, term.y, 24) || tdist > 260) {
            const angle = Math.atan2(tdy, tdx);
            let radiusOffset = -22;
            for (const prevAngle of usedAngles) {
              if (Math.abs(angle - prevAngle) < 0.24) {
                radiusOffset -= 22;
              }
            }
            usedAngles.push(angle);
            this._drawPointerArrow(ctx, angle, indRadius + radiusOffset, '#e5ff00', `${term.label} (${Math.round(tdist)}u)`);
          }
        }
      } else if (mapData.exitZone.active) {
        const edx = mapData.exitZone.x - player.x;
        const edy = mapData.exitZone.y - player.y;
        const edist = Math.hypot(edx, edy);
        if (edist > 160) {
          this._drawPointerArrow(ctx, Math.atan2(edy, edx), indRadius - 18, '#00ff88', `EXIT (${Math.round(edist)}u)`);
        }
      }
    }
  }

  _drawPointerArrow(ctx, angle, radius, color, label) {
    const ix = this.width * 0.5 + Math.cos(angle) * radius;
    const iy = this.height * 0.5 + Math.sin(angle) * radius;

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (label) {
      ctx.save();
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(12, 14, 18, 0.82)';
      ctx.fillRect(ix - tw * 0.5, iy + 8, tw, 14);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(label, ix, iy + 18);
      ctx.restore();
    }
  }

  _drawMinimap(ctx, mapData, player, pursuer, obstacleManager, modeManager, powerUpManager) {
    const isCompact = this.width <= 820;
    const mapW = isCompact ? 112 : 140;
    const mapH = isCompact ? 84 : 105;
    const pad = 14;
    const x0 = this.width - mapW - pad;
    // FIXED: Position minimap cleanly below stacked top HUD on narrow/mobile viewports so it never overlaps
    const y0 = isCompact ? 124 : 62;
    const scaleX = mapW / mapData.width;
    const scaleY = mapH / mapData.height;

    ctx.save();
    ctx.fillStyle = 'rgba(12, 14, 18, 0.85)';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x0, y0, mapW, mapH);
    ctx.strokeRect(x0, y0, mapW, mapH);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
    for (const r of obstacleManager.solidRects) {
      if (r.isOpenGate) continue;
      ctx.fillRect(x0 + r.x * scaleX, y0 + r.y * scaleY, Math.max(2, r.w * scaleX), Math.max(2, r.h * scaleY));
    }

    ctx.fillStyle = '#e5ff00';
    for (const p of powerUpManager.pickups) {
      ctx.fillRect(x0 + p.x * scaleX - 1.5, y0 + p.y * scaleY - 1.5, 3, 3);
    }

    if (modeManager.modeId === 'escape_mission') {
      for (const t of modeManager.terminals) {
        ctx.fillStyle = t.completed ? '#00ff88' : '#e5ff00';
        ctx.fillRect(x0 + t.x * scaleX - 2.5, y0 + t.y * scaleY - 2.5, 5, 5);
      }
      if (mapData.exitZone.active) {
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(x0 + mapData.exitZone.x * scaleX - 3, y0 + mapData.exitZone.y * scaleY - 3, 6, 6);
      }
    }

    ctx.fillStyle = '#e5ff00';
    ctx.fillRect(x0 + player.x * scaleX - 3, y0 + player.y * scaleY - 3, 6, 6);

    ctx.fillStyle = '#ff3300';
    ctx.fillRect(x0 + pursuer.x * scaleX - 3, y0 + pursuer.y * scaleY - 3, 6, 6);

    ctx.restore();
  }
}
