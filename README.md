# RUN FROM DANDO — DEVELOPER ALPHA BUILD 1

Fast-paced top-down survival chase game built with **pure HTML5, Industrial Neo-Brutalist CSS3, normalized-zoom Canvas 2D, Web Audio API, and deterministic seeded JavaScript**. Official portal link: [https://dando.in](https://dando.in).

## Quick Start

1. **Direct Standalone Launch (`run-from-dando-standalone.html`)**:
   Double-click `run-from-dando-standalone.html` in any modern desktop or mobile browser — all CSS and JavaScript modules are bundled inline so no local server is required.
2. **Modular ES6 Source (`modular/index.html`)**:
   Serve the `modular/` directory over any local HTTP server:
   ```bash
   python3 -m http.server 8080
   # Open http://localhost:8080
   ```

## Key Systems & Fixes in DEVELOPER ALPHA BUILD 1

- **Industrial Neo-Brutalist UI**: High-contrast concrete/acid-yellow/vermilion Swiss grid layout with hard offset shadows, clean telemetry readouts, and a live **UI Scale (`85%`–`115%`)** slider in Config.
- **100% Deterministic Seeded Runs + Seed Lock (`🔒`)**: Map generation, pickups, NPCs, Dando's patrol/quips, and Chaos mutators all run on `SeededRandom`. Lock any seed in the menu or click **Restart Sector / Replay Seed** to replay the exact same scenario.
- **Fair Opening Breathing Room & Calibrated Proximity Bar**: Easy (`430u`, `3.4s` stalk) and Normal (`390u`, `2.5s` stalk, plus `+1.4s` on a player's very first run) give players a fair opening window and a `6.0s` anti-camp grace period, while spawning 2 guaranteed early counterplay pickups near spawn. The Proximity bar reserves `CRITICAL` strictly for active lunge range (`<185u`).
- **Gameplay & Scoring Exploit Fixes**:
  - **Chaos & Hard Insiders Fixed**: Raised `MAX_NPCS` to `22` and prioritized `★ Insider` and `◎ Press` spawns so 2 Insiders always spawn on every difficulty.
  - **Medkit Overheal & Juke Separation**: Collecting a Medkit at full HP awards `OVERHEAL BONUS +100` without inflating `nearMisses` or triggering juke achievements. `LUNGE JUKED! +140` and `HAZARD JUKE +75` are tracked independently.
  - **Anti-Farming Hazard Jukes**: Hazard Jukes require a vehicle or rotor to be actively moving toward the player with a per-hazard cooldown.
  - **Balanced Smoke Pop & Checker Immunity**: Dando senses players within `92u` inside smoke and can grab on physical contact even while `Searching`. Being pinned by a Checker grants `3.2s` of pin immunity so multiple Checkers cannot chain-slow you.
  - **Full-Span Gates on Compound Lounge & Industrial Midway**: Compound Lounge features 4 full-span gates (`NW`, `NE`, `SW`, `SE`) and Industrial Midway features walled full-span `200u` central chute gates (`CHUTE N`, `CHUTE S`).
