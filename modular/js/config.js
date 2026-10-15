// js/config.js — Centralized tuning parameters, Seeded PRNG, DEVELOPER ALPHA BUILD 1 balance & Neo-Brutalist palette

export class SeededRandom {
  constructor(seedStr = '') {
    this.seedStr = String(seedStr || SeededRandom.generateSeedString()).trim().toUpperCase();
    this._state = SeededRandom._hashString(this.seedStr);
  }

  static generateSeedString() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let out = '';
    for (let i = 0; i < 8; i++) {
      if (i === 4) out += '-';
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  static _hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0) || 0x9e3779b9;
  }

  next() {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export const CONFIG = {
  GAME_TITLE: 'RUN FROM DANDO',
  BUILD_VERSION: 'DEVELOPER ALPHA BUILD 1',
  VERSION: 3,
  STORAGE_KEY: 'rfd_prealpha_save_v2',
  COOKIE_NAME: 'rfd_prealpha_cookie_v2',
  EXTERNAL_LINK: 'https://dando.in',

  WORLD: {
    WIDTH: 2400,
    HEIGHT: 1800,
    GRID_SIZE: 40, // 60 x 45 navigation grid
    BOUNDARY_PADDING: 40,
    TARGET_VIEW_WIDTH: 1180 // Normalized camera view width across phone/desktop/4K
  },

  SIMULATION: {
    FIXED_DT: 1 / 60,
    MAX_ACCUMULATED_TIME: 0.25,
    MAX_PARTICLES: 90,
    MAX_NPCS: 22, // Raised from 18 to 22 so Chaos (6 Checkers) still spawns both Insiders!
    MAX_PICKUPS: 12,
    PICKUP_SPAWN_INTERVAL: 3.8
  },

  PLAYER_DEFAULTS: {
    BASE_SPEED: 228,          // world units/second
    ACCELERATION: 1350,       // world units/second^2
    FRICTION: 1500,           // deceleration when releasing input
    RADIUS: 14,               // world units
    DODGE_COOLDOWN: 2.8,      // seconds
    DODGE_DURATION: 0.24,     // seconds
    DODGE_DISTANCE: 68,       // world units
    POST_DODGE_IFRAMES: 0.48, // brief invulnerability window
    DAMAGE_IFRAMES: 1.25,     // invulnerability after taking hit
    STARTING_HEALTH: 3,       // hits
    INITIAL_PURSUER_DIST: 390,// gives 4-5s of opening breathing room before first lunge
    SPRINT_MULTIPLIER: 1.38,
    MAX_STAMINA: 100,
    SPRINT_MIN_START: 15,     // hysteresis threshold
    SPRINT_DRAIN_RATE: 40,    // per second
    SPRINT_REGEN_RATE: 24,    // per second
    SPRINT_REGEN_DELAY: 0.80, // seconds
    EASTER_EGG_CHANCE: 0.01   // 1% chance per close-proximity check to scream "STOP FOLLOWING ME!"
  },

  PURSUER: {
    NAME: 'DANDO',
    RADIUS: 17,
    BASE_SPEED: 212,          // high-pressure baseline
    MAX_ESCALATED_SPEED: 294, // forces active juking, abilities, and pickups to survive at high Heat
    SPEED_ESCALATION_PER_SEC: 1.32,
    STALK_DURATION: 2.5,      // 2.5s opening orientation stalk (scaled by difficulty)
    STALK_SPEED_MULT: 0.88,
    INTERCEPT_LEAD_TIME: 0.62,
    LUNGE_LEAD_TIME: 0.28,    // aims lunges ahead of where the player is moving
    ATTACK_RANGE: 82,
    LUNGE_RANGE: 162,
    ATTACK_WINDUP: 0.45,      // crisp telegraph requiring timely dodge reaction
    ATTACK_ACTIVE_TIME: 0.26,
    LUNGE_SPEED_MULT: 2.40,
    ATTACK_RECOVERY_TIME: 0.90,
    ATTACK_COOLDOWN: 2.3,
    CLOSE_GRAB_DELAY: 0.26,
    SMOKE_SENSE_RADIUS: 92,   // Dando senses you if you stand right next to him inside smoke
    SEARCH_TIMEOUT: 5.5,
    CAMP_GRACE_TIME: 6.0,     // No anti-camp flush during the first 6s of a run
    CAMP_FLUSH_TIME: 4.5,     // 4.5s stationary triggers sonar ping
    SPRINT_HEARING_DIST: 360, // sprinting nearby alerts Dando while searching
    PATH_RECOMPUTE_INTERVAL: 0.22,
    LOS_MAX_DIST: 840,
    QUIPS: [
      'DANDO IS IN THE BUILDING!',
      'WHY ARE YOU RUNNING?!',
      'JUST SIGN THE RELEASE FORM!',
      'CHECKERS! CUT OFF THAT LANE!',
      'NOBODY LEAVES THE COMPOUND EARLY!',
      'YOU CANNOT HIDE IN THAT ALLEY!',
      'I ONLY WANT TO TALK!'
    ]
  },

  // Progressive Difficulty Wave System (Heat Levels 1 -> 5 every 16 seconds)
  HEAT_LEVELS: [
    { level: 1, thresholdSec: 0,  name: 'HEAT 01 // RECON',     speedBonus: 0,  hazardMult: 1.00, scoreBonus: 1.00 },
    { level: 2, thresholdSec: 16, name: 'HEAT 02 // PURSUIT',   speedBonus: 16, hazardMult: 1.12, scoreBonus: 1.15 },
    { level: 3, thresholdSec: 32, name: 'HEAT 03 // LOCKDOWN',  speedBonus: 32, hazardMult: 1.24, scoreBonus: 1.30 },
    { level: 4, thresholdSec: 48, name: 'HEAT 04 // OVERDRIVE', speedBonus: 48, hazardMult: 1.36, scoreBonus: 1.50 },
    { level: 5, thresholdSec: 64, name: 'HEAT 05 // MAX DANDO', speedBonus: 64, hazardMult: 1.48, scoreBonus: 1.80 }
  ],

  DIFFICULTIES: {
    easy: {
      id: 'easy',
      name: 'EASY',
      badge: '0.85x',
      description: 'Forgiving pursuit speed, 3.4s opening stalk, longer lunge telegraphs, +30% power-up duration.',
      pursuerSpeedMult: 0.86,
      escalationMult: 0.70,
      stalkDuration: 3.4,
      initialDist: 430,
      windupMult: 1.24,
      recoveryMult: 1.20,
      obstacleDensityMult: 0.80,
      hazardSpeedMult: 0.85,
      powerupDurationMult: 1.30,
      objectiveTimeBonus: 20,
      timeAttackTarget: 2200,
      scoreMult: 0.85,
      currencyMult: 0.90,
      unlockedByDefault: true
    },
    normal: {
      id: 'normal',
      name: 'NORMAL',
      badge: '1.0x',
      description: 'High-pressure pursuit (tuned to former Chaos intensity) with a fair 2.5s opening window.',
      pursuerSpeedMult: 1.05,
      escalationMult: 1.18,
      stalkDuration: 2.5,
      initialDist: 390,
      windupMult: 0.92,
      recoveryMult: 0.86,
      obstacleDensityMult: 1.15,
      hazardSpeedMult: 1.12,
      powerupDurationMult: 1.0,
      objectiveTimeBonus: 0,
      timeAttackTarget: 3600,
      scoreMult: 1.0,
      currencyMult: 1.0,
      unlockedByDefault: true
    },
    hard: {
      id: 'hard',
      name: 'HARD',
      badge: '1.35x',
      description: 'Relentless Dando speed, rapid lunge recovery, dense hazards, and arena mutators every 18s.',
      pursuerSpeedMult: 1.14,
      escalationMult: 1.45,
      stalkDuration: 1.8,
      initialDist: 350,
      windupMult: 0.80,
      recoveryMult: 0.74,
      obstacleDensityMult: 1.30,
      hazardSpeedMult: 1.25,
      powerupDurationMult: 0.85,
      objectiveTimeBonus: -12,
      timeAttackTarget: 5800,
      chaosEvents: true,
      chaosInterval: 18.0,
      scoreMult: 1.35,
      currencyMult: 1.35,
      unlockedByDefault: true
    },
    chaos: {
      id: 'chaos',
      name: 'CHAOS',
      badge: '1.75x',
      description: 'Overdrive apex pursuit, lightning 0.31s lunge windups, mutators every 12s, and 6 Checkers.',
      pursuerSpeedMult: 1.22,
      escalationMult: 1.75,
      stalkDuration: 1.4,
      initialDist: 330,
      windupMult: 0.70,
      recoveryMult: 0.62,
      obstacleDensityMult: 1.45,
      hazardSpeedMult: 1.35,
      powerupDurationMult: 0.78,
      objectiveTimeBonus: -20,
      timeAttackTarget: 8500,
      chaosEvents: true,
      chaosInterval: 12.0,
      scoreMult: 1.75,
      currencyMult: 1.80,
      unlockedByDefault: true
    }
  },

  MODES: {
    survival: {
      id: 'survival',
      name: 'SURVIVAL',
      tag: 'ENDLESS',
      description: 'Outlast Dando across 5 escalating Heat Waves (every 16s). Every second, juke, and pickup builds score.',
      rulesSummary: 'Survive as long as possible against progressive Heat waves.'
    },
    time_attack: {
      id: 'time_attack',
      name: 'TIME ATTACK',
      tag: 'SCORE TARGET',
      description: 'Hit the difficulty target score before the clock expires. Grab Score Stars (+250) and juke lunges (+140) to beat the timer!',
      rulesSummary: 'Hit the Target Score before time expires — running out of time is a loss!',
      baseDuration: 85,
      targetScore: 3600
    },
    escape_mission: {
      id: 'escape_mission',
      name: 'ESCAPE MISSION',
      tag: '3 TERMINALS',
      description: 'Stand inside 3 seeded Security Gate Terminals (1.6s each) to unlock the North Helipad Exit, then extract!',
      rulesSummary: 'Hack 3 Gate Terminals -> Enter North Extraction Zone to win.',
      requiredTerminals: 3,
      terminalHackTime: 1.6
    },
    endless_chaos: {
      id: 'endless_chaos',
      name: 'ENDLESS CHAOS',
      tag: 'MUTATORS',
      description: 'Global arena mutators trigger every 15 seconds (Turbo Traffic, Club Strobe Surge, Checker Stampede, Hyper Pickups).',
      rulesSummary: 'Mutators every 15s · +25% bonus score during Club Strobe Surge.',
      chaosInterval: 15.0
    }
  },

  ARCHETYPES: {
    balanced: {
      id: 'balanced',
      name: 'THE INTERN',
      role: 'BALANCED',
      cost: 0,
      unlockedByDefault: true,
      color: '#e5ff00',
      accent: '#ffffff',
      speed: 228,
      health: 3,
      dodgeCooldown: 2.8,
      dodgeDistance: 68,
      dodgeIframes: 0.48,
      staminaRegen: 26,
      abilityName: 'Smoke Pop',
      abilityCooldown: 11,
      abilityDesc: 'Drops a 3.6s smoke screen that breaks distant LOS (>92u) and boosts speed by +25% for 2.5s.',
      statsDisplay: { speed: 3, health: 3, dodge: 3 }
    },
    sprinter: {
      id: 'sprinter',
      name: 'TRACK STAR',
      role: 'SPRINTER',
      cost: 120,
      unlockedByDefault: false,
      color: '#00ff88',
      accent: '#e5ff00',
      speed: 254,
      health: 2,
      dodgeCooldown: 3.0,
      dodgeDistance: 72,
      dodgeIframes: 0.44,
      staminaRegen: 22,
      abilityName: 'Nitro Stride',
      abilityCooldown: 10,
      abilityDesc: 'Instantly refills stamina and grants 3.0 seconds of zero-drain +25% hyper sprint.',
      statsDisplay: { speed: 5, health: 2, dodge: 3 }
    },
    tank: {
      id: 'tank',
      name: 'EX-BOUNCER',
      role: 'TANK',
      cost: 150,
      unlockedByDefault: false,
      color: '#ff5500',
      accent: '#ffffff',
      speed: 208,
      health: 4,
      dodgeCooldown: 3.1,
      dodgeDistance: 62,
      dodgeIframes: 0.54,
      staminaRegen: 24,
      abilityName: 'Shockwave Shove',
      abilityCooldown: 11,
      abilityDesc: 'Emits a kinetic blast (220u) that knocks back NPCs and stuns Dando for 2.0s.',
      statsDisplay: { speed: 2, health: 5, dodge: 2 }
    },
    trickster: {
      id: 'trickster',
      name: 'ILLUSIONIST',
      role: 'TRICKSTER',
      cost: 180,
      unlockedByDefault: false,
      color: '#00e5ff',
      accent: '#e5ff00',
      speed: 234,
      health: 3,
      dodgeCooldown: 2.2,
      dodgeDistance: 88,
      dodgeIframes: 0.36,
      staminaRegen: 28,
      abilityName: 'Holo-Blink',
      abilityCooldown: 9,
      abilityDesc: 'Wall-safe phase blink up to 110 units forward while leaving a 3.8s decoy clone behind.',
      statsDisplay: { speed: 4, health: 3, dodge: 5 }
    }
  },

  MAPS: {
    downtown: {
      id: 'downtown',
      name: 'DOWNTOWN SECTOR',
      subtitle: 'MAP 01 // GRID STREETS',
      cost: 0,
      unlockedByDefault: true,
      themeColor: '#e5ff00',
      groundColor: '#121316',
      gridColor: 'rgba(255, 255, 255, 0.05)',
      wallTopColor: '#22242a',
      wallSideColor: '#0a0b0e',
      wallOutline: '#f2efe9',
      mechanicName: 'ACTIVE AVENUE TRAFFIC',
      description: 'Brutalist city grid with wide intersections, seeded block shifts, oil slicks, and high-speed vehicles.',
      scoreBonusMult: 1.0
    },
    afterparty: {
      id: 'afterparty',
      name: 'COMPOUND LOUNGE',
      subtitle: 'MAP 02 // STROBE BUNKER',
      cost: 0,
      unlockedByDefault: true,
      themeColor: '#ff3300',
      groundColor: '#141115',
      gridColor: 'rgba(255, 51, 0, 0.06)',
      wallTopColor: '#261f29',
      wallSideColor: '#0c090e',
      wallOutline: '#ff3300',
      mechanicName: 'STROBE DIMMERS & 4 GATES',
      description: 'Underground compound with strobe blackout waves, 4 full-width timed security gates, and North/South bypass corridors.',
      scoreBonusMult: 1.15
    },
    carnival: {
      id: 'carnival',
      name: 'INDUSTRIAL MIDWAY',
      subtitle: 'MAP 03 // ROTARY TURBINES',
      cost: 0,
      unlockedByDefault: true,
      themeColor: '#00ff88',
      groundColor: '#101514',
      gridColor: 'rgba(0, 255, 136, 0.06)',
      wallTopColor: '#1d2624',
      wallSideColor: '#080c0b',
      wallOutline: '#00ff88',
      mechanicName: 'ROTATING ARMS & CHUTE GATES',
      description: 'High-hazard rotary machinery, walled full-span chute barriers, and parade floats in clear midway lanes. +25% Score!',
      scoreBonusMult: 1.25
    }
  },

  POWERUPS: {
    energy_drink: {
      id: 'energy_drink',
      name: 'CAFFEINE SHOT',
      subtitle: 'Speed Boost',
      duration: 5.0,
      color: '#e5ff00',
      symbol: '⚡',
      shape: 'bolt',
      description: '+35% movement speed for 5 seconds.'
    },
    bubble_shield: {
      id: 'bubble_shield',
      name: 'RIOT SHIELD',
      subtitle: 'Hit Protection',
      duration: 8.0,
      color: '#00e5ff',
      symbol: '🛡',
      shape: 'circle',
      description: 'Blocks 1 hit or protects for 8 seconds.'
    },
    time_freeze: {
      id: 'time_freeze',
      name: 'EMP SLOWDOWN',
      subtitle: 'Dando Slow',
      duration: 3.5,
      color: '#ffffff',
      symbol: '❄',
      shape: 'diamond',
      description: 'Slows Dando and moving vehicles/machinery by 60% for 3.5 seconds.'
    },
    decoy: {
      id: 'decoy',
      name: 'HOLO DECOY',
      subtitle: 'False Target',
      duration: 4.5,
      color: '#ff3300',
      symbol: '🎭',
      shape: 'triangle',
      description: 'Spawns a loud distraction clone that lures Dando away for up to 4.5s.'
    },
    medkit: {
      id: 'medkit',
      name: 'MEDKIT',
      subtitle: 'Restore HP',
      duration: 0,
      color: '#00ff88',
      symbol: '✚',
      shape: 'cross',
      description: 'Restores +1 HP up to your archetype maximum (+100 Overheal Bonus at full HP).'
    }
  },

  SHOP_ITEMS: [
    { id: 'skin_default', category: 'skin', name: 'RAW CONCRETE', cost: 0, color: '#e5ff00', desc: 'Standard high-contrast acid yellow runner rig.' },
    { id: 'skin_cyber', category: 'skin', name: 'SIGNAL VERMILION', cost: 90, color: '#ff3300', desc: 'Industrial hazard orange-red chassis.' },
    { id: 'skin_gold', category: 'skin', name: 'STARK MONOCHROME', cost: 160, color: '#ffffff', desc: 'Pure bone-white brutalist silhouette.' },
    { id: 'skin_stealth', category: 'skin', name: 'ACID MINT', cost: 130, color: '#00ff88', desc: 'Phosphor green radar-grade coat.' },
    { id: 'trail_default', category: 'trail', name: 'VECTOR ECHO', cost: 0, color: '#e5ff00', desc: 'Sharp geometric motion afterimages.' },
    { id: 'trail_flame', category: 'trail', name: 'THERMAL WAKE', cost: 110, color: '#ff3300', desc: 'Leaves vermilion heat markers on dash.' },
    { id: 'trail_matrix', category: 'trail', name: 'PHOSPHOR GRID', cost: 140, color: '#00ff88', desc: 'Terminal green telemetry trail.' },
    { id: 'trail_rainbow', category: 'trail', name: 'STROBE FLASH', cost: 190, color: '#ffffff', desc: 'High-contrast monochrome strobe trace.' },
    { id: 'upgrade_magnet', category: 'upgrade', name: 'MAGNET COIL', cost: 120, color: '#e5ff00', desc: 'Increases pickup pull radius by +36 units.' },
    { id: 'upgrade_shoes', category: 'upgrade', name: 'CLEATED BOOTS', cost: 150, color: '#00e5ff', desc: 'Reduces oil/spill slide penalty by 65%.' },
    { id: 'upgrade_radar', category: 'upgrade', name: 'TELEMETRY HUD+', cost: 110, color: '#ff3300', desc: 'Shows live Dando distance, nearest Power-Up pointer, and Dando A* target vector.' }
  ],

  ACHIEVEMENTS: [
    { id: 'first_escape', name: 'FIRST ESCAPE', desc: 'Win a mode objective OR survive at least 45 seconds in an uncheated run.', reward: 60 },
    { id: 'untouchable', name: 'UNTOUCHABLE', desc: 'Survive for 60 seconds without taking damage in an uncheated run.', reward: 120 },
    { id: 'speed_demon', name: 'CAFFEINE FIEND', desc: 'Collect 5 Caffeine Shot speed boosts in one uncheated run.', reward: 100 },
    { id: 'maze_runner', name: 'MIDWAY SURVIVOR', desc: 'Survive in Industrial Midway for 120 seconds in an uncheated run.', reward: 160 },
    { id: 'chaos_certified', name: 'CHAOS CERTIFIED', desc: 'Survive at least 30s or win on Chaos difficulty without cheats.', reward: 140 },
    { id: 'juke_master', name: 'ANKLE BREAKER', desc: 'Perform 5 active-threat juke dodges in a single uncheated run.', reward: 110 },
    { id: 'mission_accomplished', name: 'EXTRACTION COMPLETE', desc: 'Hack all 3 terminals and reach the Extraction Zone in Escape Mission.', reward: 150 }
  ],

  DEFAULT_KEYS: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    dodge: 'Space',
    sprint: 'ShiftLeft',
    ability: 'KeyE',
    pause: 'Escape'
  }
};
