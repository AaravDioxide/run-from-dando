// js/save.js — Versioned Cookie + localStorage dual persistence, schema validation, and settings-safe sandbox mode

import { CONFIG } from './config.js';

export class SaveManager {
  constructor() {
    this.storageAvailable = this._checkStorage();
    this.cookieAvailable = this._checkCookieSupport();
    this.memoryFallback = null;
    this.sandboxMode = false;
    this.preSandboxBackup = null;
    this.data = this.load();
  }

  _checkStorage() {
    try {
      const testKey = '__rfd_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  _checkCookieSupport() {
    try {
      return typeof document !== 'undefined' && typeof document.cookie === 'string';
    } catch (e) {
      return false;
    }
  }

  _writeCookie(serialized) {
    if (!this.cookieAvailable) return;
    try {
      const encoded = encodeURIComponent(serialized);
      document.cookie = `${CONFIG.COOKIE_NAME}=${encoded}; max-age=31536000; path=/; SameSite=Lax`;
    } catch (e) {
      // Ignore cookie write errors
    }
  }

  _readCookie() {
    if (!this.cookieAvailable || !document.cookie) return null;
    try {
      const prefix = `${CONFIG.COOKIE_NAME}=`;
      const parts = document.cookie.split(';');
      for (let part of parts) {
        part = part.trim();
        if (part.startsWith(prefix)) {
          return decodeURIComponent(part.substring(prefix.length));
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  _clearCookie() {
    if (!this.cookieAvailable) return;
    try {
      document.cookie = `${CONFIG.COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
    } catch (e) {
      // Ignore
    }
  }

  getDefaultProfile() {
    return {
      version: CONFIG.VERSION,
      currency: 200,
      bestScores: {
        survival: 0,
        time_attack: 0,
        escape_mission: 0,
        endless_chaos: 0
      },
      bestSurvivalTimes: {
        survival: 0,
        time_attack: 0,
        escape_mission: 0,
        endless_chaos: 0
      },
      statistics: {
        totalRuns: 0,
        lifetimeSurvivalTime: 0,
        lifetimeDistance: 0,
        totalPickups: 0,
        totalObjectives: 0,
        totalNearMisses: 0,
        escapesCompleted: 0
      },
      unlockedMaps: ['downtown', 'afterparty', 'carnival'],
      unlockedCharacters: ['balanced'],
      unlockedCosmetics: ['skin_default', 'trail_default'],
      equipped: {
        character: 'balanced',
        skin: 'skin_default',
        trail: 'trail_default',
        map: 'downtown',
        mode: 'survival',
        difficulty: 'normal'
      },
      achievements: {},
      dailyChallenges: this._generateDailyChallenges(),
      tutorialSeen: false,
      settings: {
        masterVolume: 0.8,
        musicVolume: 0.55,
        effectsVolume: 0.85,
        reducedMotion: false,
        highContrast: false,
        colorblindMode: false,
        uiScale: 1.0,
        showMinimap: true,
        keybinds: { ...CONFIG.DEFAULT_KEYS }
      }
    };
  }

  _generateDailyChallenges() {
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      date: todayStr,
      items: [
        { id: 'dc_survive_45', text: 'Survive 45s in a single run', target: 45, progress: 0, reward: 80, completed: false },
        { id: 'dc_pickups_4', text: 'Collect 4 power-ups across runs', target: 4, progress: 0, reward: 65, completed: false },
        { id: 'dc_dodge_3', text: 'Execute 3 active-threat juke dodges', target: 3, progress: 0, reward: 90, completed: false }
      ]
    };
  }

  ensureFreshDailyChallenges() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!this.data.dailyChallenges || this.data.dailyChallenges.date !== todayStr) {
      this.data.dailyChallenges = this._generateDailyChallenges();
      this.save();
    }
  }

  load() {
    const defaults = this.getDefaultProfile();
    try {
      let raw = null;
      if (this.storageAvailable) {
        raw = window.localStorage.getItem(CONFIG.STORAGE_KEY);
      }
      if (!raw) {
        raw = this._readCookie();
      }
      if (!raw && this.memoryFallback) {
        raw = this.memoryFallback;
      }
      if (!raw) return defaults;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;

      return this._validateAndMerge(defaults, parsed);
    } catch (err) {
      console.warn('Save data corrupted or unreadable; recovering with safe defaults.', err);
      return defaults;
    }
  }

  _validateAndMerge(defaults, loaded) {
    const merged = (typeof structuredClone === 'function')
      ? structuredClone(defaults)
      : JSON.parse(JSON.stringify(defaults));

    if (typeof loaded.currency === 'number' && Number.isFinite(loaded.currency) && loaded.currency >= 0) {
      merged.currency = Math.floor(loaded.currency);
    }

    if (loaded.bestScores && typeof loaded.bestScores === 'object') {
      for (const k of Object.keys(merged.bestScores)) {
        const val = loaded.bestScores[k];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
          merged.bestScores[k] = Math.floor(val);
        }
      }
    }

    if (loaded.bestSurvivalTimes && typeof loaded.bestSurvivalTimes === 'object') {
      for (const k of Object.keys(merged.bestSurvivalTimes)) {
        const val = loaded.bestSurvivalTimes[k];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
          merged.bestSurvivalTimes[k] = Number(val.toFixed(1));
        }
      }
    }

    if (loaded.statistics && typeof loaded.statistics === 'object') {
      for (const k of Object.keys(merged.statistics)) {
        const val = loaded.statistics[k];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
          merged.statistics[k] = val;
        }
      }
    }

    if (Array.isArray(loaded.unlockedMaps)) {
      const validMaps = loaded.unlockedMaps.filter(m => CONFIG.MAPS[m]);
      merged.unlockedMaps = Array.from(new Set([...merged.unlockedMaps, ...validMaps]));
    }

    if (Array.isArray(loaded.unlockedCharacters)) {
      const validChars = loaded.unlockedCharacters.filter(c => CONFIG.ARCHETYPES[c]);
      merged.unlockedCharacters = Array.from(new Set(['balanced', ...validChars]));
    }

    if (Array.isArray(loaded.unlockedCosmetics)) {
      merged.unlockedCosmetics = Array.from(new Set(['skin_default', 'trail_default', ...loaded.unlockedCosmetics]));
    }

    if (loaded.equipped && typeof loaded.equipped === 'object') {
      if (CONFIG.ARCHETYPES[loaded.equipped.character]) merged.equipped.character = loaded.equipped.character;
      if (CONFIG.MAPS[loaded.equipped.map]) merged.equipped.map = loaded.equipped.map;
      if (CONFIG.MODES[loaded.equipped.mode]) merged.equipped.mode = loaded.equipped.mode;
      if (CONFIG.DIFFICULTIES[loaded.equipped.difficulty]) merged.equipped.difficulty = loaded.equipped.difficulty;
      if (typeof loaded.equipped.skin === 'string') merged.equipped.skin = loaded.equipped.skin;
      if (typeof loaded.equipped.trail === 'string') merged.equipped.trail = loaded.equipped.trail;
    }

    if (loaded.achievements && typeof loaded.achievements === 'object') {
      for (const ach of CONFIG.ACHIEVEMENTS) {
        if (loaded.achievements[ach.id] === true) {
          merged.achievements[ach.id] = true;
        }
      }
    }

    if (
      loaded.dailyChallenges &&
      loaded.dailyChallenges.date === merged.dailyChallenges.date &&
      Array.isArray(loaded.dailyChallenges.items)
    ) {
      merged.dailyChallenges.items = merged.dailyChallenges.items.map((defItem) => {
        const found = loaded.dailyChallenges.items.find(i => i && i.id === defItem.id);
        if (!found) return defItem;
        return {
          ...defItem,
          progress: (typeof found.progress === 'number' && Number.isFinite(found.progress))
            ? Math.max(0, Math.min(defItem.target, Math.floor(found.progress)))
            : 0,
          completed: Boolean(found.completed)
        };
      });
    }

    if (typeof loaded.tutorialSeen === 'boolean') {
      merged.tutorialSeen = loaded.tutorialSeen;
    }

    if (loaded.settings && typeof loaded.settings === 'object') {
      const s = loaded.settings;
      const clamp01 = (v, def) => (typeof v === 'number' && Number.isFinite(v)) ? Math.max(0, Math.min(1, v)) : def;
      merged.settings.masterVolume = clamp01(s.masterVolume, defaults.settings.masterVolume);
      merged.settings.musicVolume = clamp01(s.musicVolume, defaults.settings.musicVolume);
      merged.settings.effectsVolume = clamp01(s.effectsVolume, defaults.settings.effectsVolume);
      merged.settings.reducedMotion = Boolean(s.reducedMotion);
      merged.settings.highContrast = Boolean(s.highContrast);
      merged.settings.colorblindMode = Boolean(s.colorblindMode);
      merged.settings.showMinimap = s.showMinimap !== undefined ? Boolean(s.showMinimap) : true;
      if (typeof s.uiScale === 'number' && s.uiScale >= 0.8 && s.uiScale <= 1.25) {
        merged.settings.uiScale = Number(s.uiScale.toFixed(2));
      }
      if (s.keybinds && typeof s.keybinds === 'object') {
        for (const k of Object.keys(defaults.settings.keybinds)) {
          if (typeof s.keybinds[k] === 'string' && s.keybinds[k].length > 0) {
            merged.settings.keybinds[k] = s.keybinds[k];
          }
        }
      }
    }

    return merged;
  }

  enterSandboxMode() {
    if (!this.sandboxMode) {
      this.preSandboxBackup = JSON.parse(JSON.stringify(this.data));
      this.sandboxMode = true;
    }
  }

  /**
   * Saves full profile when not in sandboxMode; when in sandboxMode, still persists user settings & keybinds
   * onto the pre-sandbox backup so volume/accessibility/keybinds are never lost!
   */
  save() {
    try {
      let targetObj = this.data;
      if (this.sandboxMode && this.preSandboxBackup) {
        this.preSandboxBackup.settings = JSON.parse(JSON.stringify(this.data.settings));
        this.preSandboxBackup.tutorialSeen = this.data.tutorialSeen;
        targetObj = this.preSandboxBackup;
      } else if (this.sandboxMode) {
        return false;
      }
      const serialized = JSON.stringify(targetObj);
      this.memoryFallback = serialized;
      if (this.storageAvailable) {
        window.localStorage.setItem(CONFIG.STORAGE_KEY, serialized);
      }
      this._writeCookie(serialized);
      return true;
    } catch (err) {
      console.warn('Failed to write save:', err);
      return false;
    }
  }

  resetProgress() {
    this.sandboxMode = false;
    this.preSandboxBackup = null;
    this._clearCookie();
    this.data = this.getDefaultProfile();
    this.save();
    return this.data;
  }

  unlockAllCheats() {
    this.enterSandboxMode();
    this.data.currency += 5000;
    this.data.unlockedCharacters = Object.keys(CONFIG.ARCHETYPES);
    this.data.unlockedMaps = Object.keys(CONFIG.MAPS);
    this.data.unlockedCosmetics = CONFIG.SHOP_ITEMS.map(i => i.id);
  }
}
