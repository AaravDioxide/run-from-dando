// js/maps.js — Seeded Map Generation, traffic-safe terminals, and walled full-span Afterparty/Carnival gates

import { CONFIG, SeededRandom } from './config.js';
import { Pathfinder } from './pathfinding.js';

export class MapManager {
  constructor() {
    this.currentMapId = 'downtown';
    this.currentSeed = 'DANDO-001';
    this.mapData = null;
  }

  loadMap(mapId = 'downtown', seedStr = '', difficultyId = 'normal') {
    this.currentMapId = CONFIG.MAPS[mapId] ? mapId : 'downtown';
    const rng = new SeededRandom(seedStr || SeededRandom.generateSeedString());
    this.currentSeed = rng.seedStr;

    const meta = CONFIG.MAPS[this.currentMapId];
    const diff = CONFIG.DIFFICULTIES[difficultyId] || CONFIG.DIFFICULTIES.normal;
    const W = CONFIG.WORLD.WIDTH;
    const H = CONFIG.WORLD.HEIGHT;
    const initialDist = diff.initialDist || CONFIG.PLAYER_DEFAULTS.INITIAL_PURSUER_DIST;

    const base = {
      id: this.currentMapId,
      seed: this.currentSeed,
      meta,
      width: W,
      height: H,
      playerSpawn: { x: 1200, y: 900 },
      pursuerSpawn: { x: 1200, y: 900 + initialDist },
      exitZone: { x: 1200, y: 150, radius: 58, active: false },
      terminalLocations: [],
      patrolWaypoints: [
        { x: 600, y: 380 },
        { x: 1800, y: 380 },
        { x: 1200, y: 900 },
        { x: 600, y: 1380 },
        { x: 1800, y: 1380 }
      ],
      decorZones: [],
      buildings: [],
      trafficLanes: [],
      timedGates: [],
      rotatingHazards: [],
      areaHazards: [],
      lightingState: { blackoutFactor: 0, timer: 0 }
    };

    if (this.currentMapId === 'downtown') {
      this._buildDowntown(base, rng);
    } else if (this.currentMapId === 'afterparty') {
      this._buildAfterparty(base, rng);
    } else if (this.currentMapId === 'carnival') {
      this._buildCarnival(base, rng);
    }

    // Validate spawns and exit zone against solid buildings
    base.playerSpawn = Pathfinder.findSafePointNear(base.playerSpawn.x, base.playerSpawn.y, base.buildings, 42);
    base.pursuerSpawn = Pathfinder.findSafePointNear(base.pursuerSpawn.x, base.pursuerSpawn.y, base.buildings, 42);
    const safeExit = Pathfinder.findSafePointNear(base.exitZone.x, base.exitZone.y, base.buildings, 64);
    base.exitZone.x = safeExit.x;
    base.exitZone.y = safeExit.y;

    // Validate terminals so they sit outside all buildings AND at least 75 units clear of any traffic lane
    base.terminalLocations = base.terminalLocations.map(pos => {
      let adjY = pos.y;
      for (const lane of base.trafficLanes) {
        if (Math.abs(adjY - lane.y) < 75) {
          adjY = lane.y + (adjY >= lane.y ? 95 : -95);
        }
      }
      return Pathfinder.findSafePointNear(pos.x, adjY, base.buildings, 56);
    });

    this.mapData = base;
    return base;
  }

  _buildDowntown(map, rng) {
    const candidates = [
      { x: 775, y: 310 },   // North Main St Plaza
      { x: 1625, y: 310 },  // North Sector Blvd Plaza
      { x: 1200, y: 1380 }, // South Central Plaza (below Broadway traffic)
      { x: 775, y: 900 },   // West Mid-Avenue Plaza
      { x: 1625, y: 900 }   // East Mid-Avenue Plaza
    ];
    map.terminalLocations = rng.shuffle(candidates);

    map.decorZones.push(
      { type: 'road_h', x: 40, y: 520, w: 2320, h: 150, label: '5TH AVE' },
      { type: 'road_h', x: 40, y: 1140, w: 2320, h: 150, label: 'BROADWAY' },
      { type: 'road_v', x: 700, y: 40, w: 150, h: 1720, label: 'MAIN ST' },
      { type: 'road_v', x: 1550, y: 40, w: 150, h: 1720, label: 'SECTOR BLVD' }
    );

    const jx1 = rng.int(-24, 24);
    const jx2 = rng.int(-24, 24);

    map.buildings.push(
      { x: 180, y: 160, w: 420, h: 260, height3D: 26, label: 'SECTOR TOWER', color: '#20232b', accent: '#e5ff00' },
      { x: 880 + jx1, y: 220, w: 195, h: 220, height3D: 22, label: 'RESERVE BANK', color: '#1a1d24', accent: '#d1d5db' },
      { x: 1325 + jx2, y: 220, w: 195, h: 220, height3D: 22, label: 'DATA EXCHANGE', color: '#20232b', accent: '#ff3300' },
      { x: 1800, y: 160, w: 420, h: 260, height3D: 26, label: 'MONOLITH BLOCK', color: '#1a1d24', accent: '#e5ff00' },

      { x: 180, y: 760, w: 420, h: 280, height3D: 24, label: 'DEPOT WEST', color: '#20232b', accent: '#d1d5db' },
      { x: 890, y: 730 + rng.int(-20, 20), w: 150, h: 120, height3D: 18, label: 'SUBSTATION A', color: '#1a1d24', accent: '#e5ff00' },
      { x: 1360, y: 730 + rng.int(-20, 20), w: 150, h: 120, height3D: 18, label: 'SUBSTATION B', color: '#1a1d24', accent: '#ff3300' },
      { x: 1800, y: 760, w: 420, h: 280, height3D: 24, label: 'DANDO HQ', color: '#20232b', accent: '#ff3300' },

      { x: 180, y: 1380, w: 420, h: 240, height3D: 24, label: 'FOUNDRY 09', color: '#1a1d24', accent: '#e5ff00' },
      { x: 880, y: 1440, w: 195, h: 190, height3D: 20, label: 'TRANSIT HUB', color: '#20232b', accent: '#d1d5db' },
      { x: 1325, y: 1440, w: 195, h: 190, height3D: 20, label: 'TERMINAL S', color: '#20232b', accent: '#00ff88' },
      { x: 1800, y: 1380, w: 420, h: 240, height3D: 24, label: 'BUNKER EAST', color: '#1a1d24', accent: '#ff3300' }
    );

    const dirFlip = rng.next() < 0.5 ? 1 : -1;
    map.trafficLanes.push(
      { y: 560, dir: 1 * dirFlip, speed: Math.round(rng.range(215, 245)), color: '#e5ff00', name: 'Interceptor Cab' },
      { y: 630, dir: -1 * dirFlip, speed: Math.round(rng.range(230, 260)), color: '#ff3300', name: 'Dando Armored SUV' },
      { y: 1180, dir: 1 * dirFlip, speed: Math.round(rng.range(220, 250)), color: '#e5e7eb', name: 'Patrol Van' },
      { y: 1250, dir: -1 * dirFlip, speed: Math.round(rng.range(210, 240)), color: '#00ff88', name: 'Courier Rig' }
    );

    map.areaHazards.push(
      { type: 'slippery', x: 775, y: 595, radius: 66, label: 'OIL SLICK' },
      { type: 'slippery', x: 1625, y: 1215, radius: 66, label: 'COOLANT SPILL' },
      { type: 'smoke', x: 1200 + rng.int(-90, 90), y: 450, radius: 78, label: 'STEAM VENT' }
    );
  }

  _buildAfterparty(map, rng) {
    const candidates = [
      { x: 560, y: 350 },
      { x: 1840, y: 350 },
      { x: 1200, y: 1440 },
      { x: 560, y: 1440 },
      { x: 1840, y: 1440 }
    ];
    map.terminalLocations = rng.shuffle(candidates);

    map.decorZones.push(
      { type: 'dancefloor', x: 850, y: 580, w: 700, h: 640, label: 'MAIN STROBE FLOOR' },
      { type: 'corridor', x: 100, y: 90, w: 2200, h: 120, label: 'NORTH BYPASS CORRIDOR' },
      { type: 'corridor', x: 100, y: 1590, w: 2200, h: 120, label: 'SOUTH BYPASS CORRIDOR' }
    );

    map.buildings.push(
      { x: 960, y: 250, w: 480, h: 160, height3D: 22, label: 'SOUND STAGE', color: '#241e29', accent: '#ff3300' },
      // West Wing (right edge at x = 470)
      { x: 220, y: 260, w: 250, h: 350, height3D: 24, label: 'WEST WING A', color: '#1c161f', accent: '#e5ff00' },
      { x: 220, y: 740, w: 250, h: 340, height3D: 24, label: 'WEST WING B', color: '#1c161f', accent: '#d1d5db' },
      { x: 220, y: 1200, w: 250, h: 320, height3D: 24, label: 'WEST WING C', color: '#1c161f', accent: '#ff3300' },

      // Inner Pillars (left edges at x = 650 and x = 1630, right edge of NE/SE at x = 1750)
      { x: 650, y: 470, w: 120, h: 210, height3D: 20, label: 'PILLAR NW', color: '#241e29', accent: '#d1d5db' },
      { x: 650, y: 1120, w: 120, h: 210, height3D: 20, label: 'PILLAR SW', color: '#241e29', accent: '#d1d5db' },
      { x: 1630, y: 470, w: 120, h: 210, height3D: 20, label: 'PILLAR NE', color: '#241e29', accent: '#e5ff00' },
      { x: 1630, y: 1120, w: 120, h: 210, height3D: 20, label: 'PILLAR SE', color: '#241e29', accent: '#e5ff00' },

      // East Wing (left edge at x = 1930)
      { x: 1930, y: 260, w: 250, h: 350, height3D: 24, label: 'EAST WING A', color: '#1c161f', accent: '#00ff88' },
      { x: 1930, y: 740, w: 250, h: 340, height3D: 24, label: 'EAST WING B', color: '#1c161f', accent: '#ff3300' },
      { x: 1930, y: 1200, w: 250, h: 320, height3D: 24, label: 'EAST WING C', color: '#1c161f', accent: '#e5ff00' }
    );

    // 4 Full-Span Timed Gates across both North (y=580) and South (y=1210) wing corridors
    const gatePeriod = Number(rng.range(6.2, 7.6).toFixed(1));
    map.timedGates.push(
      { x: 470, y: 580, w: 180, h: 30, period: gatePeriod, openDuration: 3.8, timer: rng.range(0, 3), isOpenGate: true, label: 'GATE NW' },
      { x: 1750, y: 580, w: 180, h: 30, period: gatePeriod, openDuration: 3.8, timer: rng.range(3, 6), isOpenGate: true, label: 'GATE NE' },
      { x: 470, y: 1210, w: 180, h: 30, period: gatePeriod, openDuration: 3.8, timer: rng.range(2, 5), isOpenGate: true, label: 'GATE SW' },
      { x: 1750, y: 1210, w: 180, h: 30, period: gatePeriod, openDuration: 3.8, timer: rng.range(0, 4), isOpenGate: true, label: 'GATE SE' }
    );

    map.areaHazards.push(
      { type: 'slippery', x: 960 + rng.int(-60, 60), y: 740 + rng.int(-40, 40), radius: 68, label: 'SLICK FLOOR' },
      { type: 'slippery', x: 1440 + rng.int(-60, 60), y: 1050 + rng.int(-40, 40), radius: 68, label: 'FOAM ZONE' },
      { type: 'smoke', x: 1200 + rng.int(-70, 70), y: 640, radius: 82, label: 'HAZE VENT N' },
      { type: 'smoke', x: 1200 + rng.int(-70, 70), y: 1160, radius: 82, label: 'HAZE VENT S' }
    );
  }

  _buildCarnival(map, rng) {
    const candidates = [
      { x: 580, y: 310 },
      { x: 1820, y: 310 },
      { x: 1200, y: 1520 },
      { x: 580, y: 1500 },
      { x: 1820, y: 1500 }
    ];
    map.terminalLocations = rng.shuffle(candidates);

    map.decorZones.push(
      { type: 'carnival_ring', x: 560, y: 400, w: 1280, h: 1000, label: 'INDUSTRIAL MIDWAY' },
      { type: 'road_h', x: 40, y: 475, w: 2320, h: 90, label: 'NORTH PARADE TRACK' }
    );

    map.buildings.push(
      { x: 180, y: 180, w: 280, h: 210, height3D: 24, label: 'TURBINE HALL NW', color: '#1b2423', accent: '#e5ff00' },
      { x: 1940, y: 180, w: 280, h: 210, height3D: 24, label: 'TURBINE HALL NE', color: '#1b2423', accent: '#ff3300' },
      { x: 180, y: 1400, w: 280, h: 210, height3D: 24, label: 'PAVILION SW', color: '#1b2423', accent: '#00ff88' },
      { x: 1940, y: 1400, w: 280, h: 210, height3D: 24, label: 'PAVILION SE', color: '#1b2423', accent: '#d1d5db' },

      // North & South Booths with flanking chute walls so CHUTE N and CHUTE S span the full 200-unit central gap (x: 1100..1300)
      { x: 740, y: 220, w: 360, h: 120, height3D: 20, label: 'BOOTH N1', color: '#1b2423', accent: '#e5ff00' },
      { x: 1300, y: 220, w: 360, h: 120, height3D: 20, label: 'BOOTH N2', color: '#1b2423', accent: '#e5ff00' },
      { x: 740, y: 1450, w: 360, h: 120, height3D: 20, label: 'BOOTH S1', color: '#1b2423', accent: '#ff3300' },
      { x: 1300, y: 1450, w: 360, h: 120, height3D: 20, label: 'BOOTH S2', color: '#1b2423', accent: '#00ff88' },

      { x: 300, y: 740, w: 130, h: 340, height3D: 20, label: 'RAIL BLOCK W', color: '#1b2423', accent: '#00ff88' },
      { x: 1970, y: 740, w: 130, h: 340, height3D: 20, label: 'RAIL BLOCK E', color: '#1b2423', accent: '#00ff88' }
    );

    const spinFlip = rng.next() < 0.5 ? 1 : -1;
    map.rotatingHazards.push(
      { x: 780, y: 720, armLength: 142, angle: rng.range(0, 6.28), angularSpeed: 1.55 * spinFlip, hubRadius: 28, label: 'ROTOR NW' },
      { x: 1620, y: 720, armLength: 142, angle: rng.range(0, 6.28), angularSpeed: -1.55 * spinFlip, hubRadius: 28, label: 'ROTOR NE' },
      { x: 780, y: 1140, armLength: 138, angle: rng.range(0, 6.28), angularSpeed: -1.48 * spinFlip, hubRadius: 28, label: 'ROTOR SW' },
      { x: 1620, y: 1140, armLength: 138, angle: rng.range(0, 6.28), angularSpeed: 1.48 * spinFlip, hubRadius: 28, label: 'ROTOR SE' }
    );

    // Full-span 200u chute gates connecting Booth N1->N2 (x: 1100..1300) and Booth S1->S2 (x: 1100..1300)
    map.timedGates.push(
      { x: 1100, y: 265, w: 200, h: 30, period: 6.5, openDuration: 3.8, timer: rng.range(0, 3), isOpenGate: true, label: 'CHUTE N' },
      { x: 1100, y: 1495, w: 200, h: 30, period: 6.5, openDuration: 3.8, timer: rng.range(3, 6), isOpenGate: true, label: 'CHUTE S' }
    );

    map.trafficLanes.push(
      { y: 520, dir: rng.next() < 0.5 ? 1 : -1, speed: Math.round(rng.range(195, 225)), color: '#00ff88', name: 'Midway Float' }
    );

    map.areaHazards.push(
      { type: 'slippery', x: 1200 + rng.int(-70, 70), y: 700, radius: 64, label: 'GREASE PIT' },
      { type: 'smoke', x: 1200 + rng.int(-70, 70), y: 1120, radius: 74, label: 'EXHAUST CLOUD' }
    );
  }
}
