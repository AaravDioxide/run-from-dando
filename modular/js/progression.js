// js/progression.js — Exact score math (separate hazard jukes, lunge jukes, and full-HP medkit overheals), Heat multipliers, and record threshold

import { CONFIG } from './config.js';

export class ProgressionManager {
  constructor(saveManager) {
    this.saveManager = saveManager;
  }

  getHeatLevelInfo(survivalTime = 0) {
    let current = CONFIG.HEAT_LEVELS[0];
    let next = null;
    for (let i = 0; i < CONFIG.HEAT_LEVELS.length; i++) {
      if (survivalTime >= CONFIG.HEAT_LEVELS[i].thresholdSec) {
        current = CONFIG.HEAT_LEVELS[i];
        next = CONFIG.HEAT_LEVELS[i + 1] || null;
      }
    }
    let progress = 1.0;
    if (next) {
      const span = next.thresholdSec - current.thresholdSec;
      progress = Math.max(0, Math.min(1, (survivalTime - current.thresholdSec) / span));
    }
    return { current, next, progress };
  }

  /**
   * Exact Score Formula:
   * - Hazard Jukes (`nearMisses`): +75 pts each
   * - Lunge Jukes (`attacksDodged`): +140 pts each (no longer double-counted in nearMisses)
   * - Full-HP Medkit Overheal (`overheals`): +100 pts each (no longer inflates nearMisses)
   * - Score Stars (`scoreStars`): +250 pts each
   */
  calculateScore(stats, difficultyId = 'normal', mapId = 'downtown', extraMult = 1.0) {
    const T = Math.floor(Math.max(0, stats.survivalTime || 0));
    const D = Math.max(0, stats.distanceTravelled || 0);
    const P = Math.floor(Math.max(0, stats.pickupsCollected || 0));
    const O = Math.floor(Math.max(0, stats.objectivesCompleted || 0));

    const timeScore = 10 * T;
    const distanceScore = Math.floor(D / 25);
    const pickupScore = 75 * P;
    const objectiveScore = 200 * O;

    const nearMissBonus = (stats.nearMisses || 0) * 75;
    const dodgeBonus = (stats.attacksDodged || 0) * 140;
    const overhealBonus = (stats.overheals || 0) * 100;
    const starBonus = (stats.scoreStars || 0) * 250;
    const heatInfo = this.getHeatLevelInfo(T).current;
    const heatBonus = (heatInfo.level - 1) * 90;
    const victoryBonus = stats.escaped ? 600 : 0;

    const rawTotal = timeScore + distanceScore + pickupScore + objectiveScore + nearMissBonus + dodgeBonus + overhealBonus + starBonus + heatBonus + victoryBonus;
    const diffMult = CONFIG.DIFFICULTIES[difficultyId]?.scoreMult || 1.0;
    const mapMult = CONFIG.MAPS[mapId]?.scoreBonusMult || 1.0;
    const heatMult = heatInfo.scoreBonus || 1.0;

    const totalMult = diffMult * mapMult * heatMult * extraMult;
    const finalScore = Math.round(rawTotal * totalMult);

    return {
      timeScore,
      distanceScore,
      pickupScore,
      objectiveScore,
      skillBonus: nearMissBonus + dodgeBonus + overhealBonus + starBonus + heatBonus + victoryBonus,
      multiplier: Number(totalMult.toFixed(2)),
      total: finalScore
    };
  }

  calculateCurrencyReward(stats, scoreBreakdown, difficultyId = 'normal') {
    const T = stats.survivalTime || 0;
    const D = stats.distanceTravelled || 0;
    const O = stats.objectivesCompleted || 0;
    const P = stats.pickupsCollected || 0;
    const totalJukes = (stats.nearMisses || 0) + (stats.attacksDodged || 0);

    const survivalCoins = Math.floor(T * 1.15);
    const distanceCoins = Math.floor(D / 160);
    const pickupCoins = P * 7;
    const objectiveCoins = O * 30;
    const jukeCoins = totalJukes * 10;
    const victoryCoins = stats.escaped ? 95 : 18;
    const diffMult = CONFIG.DIFFICULTIES[difficultyId]?.currencyMult || 1.0;

    return Math.max(10, Math.round((survivalCoins + distanceCoins + pickupCoins + objectiveCoins + jukeCoins + victoryCoins) * diffMult));
  }

  processRunResults(runStats) {
    this.saveManager.ensureFreshDailyChallenges();
    const profile = this.saveManager.data;
    const modeId = runStats.modeId || 'survival';
    const diffId = runStats.difficultyId || 'normal';
    const mapId = runStats.mapId || 'downtown';

    const scoreBreakdown = this.calculateScore(runStats, diffId, mapId, runStats.modifierScoreMult || 1.0);

    if (runStats.cheated) {
      return {
        scoreBreakdown,
        earnedCurrency: 0,
        isNewBestScore: false,
        isNewBestTime: false,
        newlyUnlockedAchievements: [],
        completedChallenges: [],
        cheatedRun: true
      };
    }

    let earnedCurrency = this.calculateCurrencyReward(runStats, scoreBreakdown, diffId);
    const totalActiveJukes = (runStats.nearMisses || 0) + (runStats.attacksDodged || 0);

    profile.statistics.totalRuns += 1;
    profile.statistics.lifetimeSurvivalTime += runStats.survivalTime;
    profile.statistics.lifetimeDistance += runStats.distanceTravelled;
    profile.statistics.totalPickups += runStats.pickupsCollected;
    profile.statistics.totalObjectives += runStats.objectivesCompleted;
    profile.statistics.totalNearMisses += totalActiveJukes;
    if (runStats.escaped) {
      profile.statistics.escapesCompleted += 1;
    }

    const qualifiesForRecordBanner = Boolean(runStats.escaped || runStats.survivalTime >= 15 || scoreBreakdown.total >= 500);

    const prevBestScore = profile.bestScores[modeId] || 0;
    const isNewBestScore = scoreBreakdown.total > prevBestScore && qualifiesForRecordBanner;
    if (scoreBreakdown.total > prevBestScore) {
      profile.bestScores[modeId] = scoreBreakdown.total;
      if (qualifiesForRecordBanner) earnedCurrency += 25;
    }

    const roundedSurvival = Number((runStats.survivalTime || 0).toFixed(1));
    const prevBestTime = profile.bestSurvivalTimes[modeId] || 0;
    const isNewBestTime = roundedSurvival > prevBestTime && qualifiesForRecordBanner;
    if (roundedSurvival > prevBestTime) {
      profile.bestSurvivalTimes[modeId] = roundedSurvival;
    }

    const newlyUnlockedAchievements = [];
    const unlockAch = (id) => {
      if (!profile.achievements[id]) {
        const ach = CONFIG.ACHIEVEMENTS.find(a => a.id === id);
        if (ach) {
          profile.achievements[id] = true;
          earnedCurrency += ach.reward;
          newlyUnlockedAchievements.push(ach);
        }
      }
    };

    if (runStats.escaped || runStats.survivalTime >= 45) {
      unlockAch('first_escape');
    }
    if (runStats.untouchableTime >= 60 || (runStats.survivalTime >= 60 && runStats.damageTaken === 0)) {
      unlockAch('untouchable');
    }
    if ((runStats.speedBoostsCollected || 0) >= 5) {
      unlockAch('speed_demon');
    }
    if (mapId === 'carnival' && runStats.survivalTime >= 120) {
      unlockAch('maze_runner');
    }
    if (diffId === 'chaos' && (runStats.escaped || runStats.survivalTime >= 30)) {
      unlockAch('chaos_certified');
    }
    if (totalActiveJukes >= 5) {
      unlockAch('juke_master');
    }
    if (modeId === 'escape_mission' && runStats.escaped) {
      unlockAch('mission_accomplished');
    }

    const completedChallenges = [];
    if (profile.dailyChallenges && Array.isArray(profile.dailyChallenges.items)) {
      for (const ch of profile.dailyChallenges.items) {
        if (ch.completed) continue;
        if (ch.id === 'dc_survive_45') {
          ch.progress = Math.max(ch.progress, Math.floor(runStats.survivalTime));
        } else if (ch.id === 'dc_pickups_4') {
          ch.progress += runStats.pickupsCollected;
        } else if (ch.id === 'dc_dodge_3') {
          ch.progress += totalActiveJukes;
        }
        if (ch.progress >= ch.target) {
          ch.progress = ch.target;
          ch.completed = true;
          earnedCurrency += ch.reward;
          completedChallenges.push(ch);
        }
      }
    }

    profile.currency += earnedCurrency;
    this.saveManager.save();

    return {
      scoreBreakdown,
      earnedCurrency,
      isNewBestScore,
      isNewBestTime,
      newlyUnlockedAchievements,
      completedChallenges,
      cheatedRun: false
    };
  }

  purchaseItem(itemType, itemId) {
    const profile = this.saveManager.data;

    if (itemType === 'character') {
      const charDef = CONFIG.ARCHETYPES[itemId];
      if (!charDef) return { ok: false, reason: 'INVALID ARCHETYPE' };
      if (profile.unlockedCharacters.includes(itemId)) {
        return { ok: false, reason: 'ALREADY UNLOCKED' };
      }
      if (profile.currency < charDef.cost) {
        return { ok: false, reason: 'INSUFFICIENT CRED' };
      }
      profile.currency -= charDef.cost;
      profile.unlockedCharacters.push(itemId);
      profile.equipped.character = itemId;
      this.saveManager.save();
      return { ok: true, balance: profile.currency };
    }

    if (itemType === 'cosmetic') {
      const itemDef = CONFIG.SHOP_ITEMS.find(i => i.id === itemId);
      if (!itemDef) return { ok: false, reason: 'INVALID ITEM' };
      if (profile.unlockedCosmetics.includes(itemId)) {
        return { ok: false, reason: 'ALREADY UNLOCKED' };
      }
      if (profile.currency < itemDef.cost) {
        return { ok: false, reason: 'INSUFFICIENT CRED' };
      }
      profile.currency -= itemDef.cost;
      profile.unlockedCosmetics.push(itemId);
      if (itemDef.category === 'skin') profile.equipped.skin = itemId;
      if (itemDef.category === 'trail') profile.equipped.trail = itemId;
      this.saveManager.save();
      return { ok: true, balance: profile.currency };
    }

    return { ok: false, reason: 'UNKNOWN CATEGORY' };
  }
}
