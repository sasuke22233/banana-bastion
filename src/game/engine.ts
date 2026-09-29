import type {
  Asteroid, BlackHole, Bullet, Comet, Crystal, FloatingText, Mine, Nebula, Particle,
  PowerUp, PowerUpType, Ring, RunConfig, RunStats, Star,
} from './types';
import { AudioEngine } from './audio';
import { SKINS } from './upgrades';
import { TAU, clamp, glowSprite, hypot, lerp, nebulaSprite, pick, rand, rgba } from './sprites';

export interface EngineCallbacks {
  onGameOver: (stats: RunStats) => void;
  onPause: (paused: boolean) => void;
}

export const SECTORS = [
  { name: 'Kuiper Reach', hue: 225 },
  { name: 'Crimson Nebula', hue: 345 },
  { name: 'Emerald Drift', hue: 155 },
  { name: 'Pulsar Fields', hue: 275 },
  { name: 'Amber Belt', hue: 30 },
  { name: 'Void Corridor', hue: 195 },
  { name: 'Event Horizon', hue: 305 },
];
export const SECTOR_LENGTH = 75;
const COMBO_TIME = 4.5;
const CRYSTAL_HUES = [190, 200, 285, 320, 160];

export const POWER_INFO: Record<PowerUpType, { color: string; label: string; icon: string }> = {
  shield: { color: '#38bdf8', label: 'SHIELD', icon: '◈' },
  magnet: { color: '#e879f9', label: 'MAGNET', icon: '◎' },
  slowmo: { color: '#22d3ee', label: 'TIME WARP', icon: '◷' },
  blaster: { color: '#fb923c', label: 'BLASTER', icon: '▲' },
  nova: { color: '#facc15', label: 'NOVA', icon: '✦' },
};

const DISPLAY = '"Orbitron", "Exo 2", sans-serif';
const BODY = '"Exo 2", "Orbitron", sans-serif';

interface Ship {
  x: number; y: number; vx: number; vy: number; tilt: number;
  hp: number; maxHp: number; invuln: number; shield: boolean; r: number;
}

const defaultConfig: RunConfig = {
  maxHp: 1, magnetRange: 0, durationMult: 1, crystalValue: 1, luck: 1, agility: 1,
  startShield: false, skin: 0, bestScore: 0,
};

export class Game {
  private ctx: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1; u = 1;
  mode: 'idle' | 'playing' | 'dead' = 'idle';
  paused = false;

  private raf = 0;
  private last = 0;
  private time = 0;
  private globalTime = 0;

  private pointer = { x: 0, y: 0, active: false, touch: false };
  private keys = new Set<string>();
  private lastInput: 'pointer' | 'keys' = 'pointer';

  private ship: Ship = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0, hp: 1, maxHp: 1, invuln: 0, shield: false, r: 13 };
  private asteroids: Asteroid[] = [];
  private crystals: Crystal[] = [];
  private comets: Comet[] = [];
  private mines: Mine[] = [];
  private powerups: PowerUp[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatingText[] = [];
  private blackHole: BlackHole | null = null;
  private stars: Star[][] = [];
  private nebulae: Nebula[] = [];

  private config: RunConfig = defaultConfig;
  stats: RunStats = this.freshStats();
  private combo = 0;
  private comboTimer = 0;
  private multiplier = 1;
  private powers = { magnet: 0, slowmo: 0, blaster: 0 };
  private powerMax = { magnet: 1, slowmo: 1, blaster: 1 };
  private spawnAcc = { asteroid: 0, crystal: 0, comet: 0, powerup: 0, mine: 0, blackhole: 0, ambient: 0 };
  private shake = 0;
  private flash = 0;
  private flashColor = '#ffffff';
  private sector = 0;
  private sectorAnnounce = 0;
  private bgHue = 225;
  private targetHue = 225;
  private scorePunch = 0;
  private fireTimer = 0;
  private deathTimer = 0;
  private recordShown = false;
  private recordBanner = 0;
  private lowHpPulse = 0;

  constructor(private canvas: HTMLCanvasElement, private audio: AudioEngine, private cb: EngineCallbacks) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onPointer);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (document.fonts) {
      void document.fonts.load('900 20px Orbitron');
      void document.fonts.load('600 20px "Exo 2"');
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.audio.stopDrone();
  }

  // ------------------------------------------------------------ lifecycle
  private freshStats(): RunStats {
    return { score: 0, distance: 0, crystals: 0, stardust: 0, destroyed: 0, nearMisses: 0, maxCombo: 0, time: 0, sector: 0, newBest: false };
  }

  start(config: RunConfig) {
    this.config = config;
    this.mode = 'playing';
    this.paused = false;
    this.time = 0;
    this.stats = this.freshStats();
    this.asteroids = []; this.crystals = []; this.comets = []; this.mines = [];
    this.powerups = []; this.bullets = []; this.particles = []; this.rings = []; this.texts = [];
    this.blackHole = null;
    this.combo = 0; this.comboTimer = 0; this.multiplier = 1;
    this.powers = { magnet: 0, slowmo: 0, blaster: 0 };
    this.spawnAcc = { asteroid: -1.2, crystal: -0.3, comet: 0, powerup: 0.4, mine: 0, blackhole: 0, ambient: 0 };
    this.shake = 0; this.flash = 0;
    this.sector = 0; this.sectorAnnounce = 3; this.targetHue = SECTORS[0].hue;
    this.recordShown = false; this.recordBanner = 0;
    const s = this.ship;
    s.x = this.w / 2; s.y = this.h * 0.75; s.vx = 0; s.vy = 0; s.tilt = 0;
    s.maxHp = config.maxHp; s.hp = config.maxHp; s.invuln = 1.2; s.shield = config.startShield;
    this.pointer.active = false;
    this.audio.init();
    this.audio.startDrone();
    this.audio.sector();
    this.ring(s.x, s.y, 200 * this.u, 0.8, SKINS[config.skin].color, 3);
  }

  abort() {
    this.mode = 'idle';
    this.paused = false;
    this.audio.stopDrone();
    this.cb.onPause(false);
  }

  setPaused(p: boolean) {
    if (this.mode !== 'playing') return;
    if (this.paused === p) return;
    this.paused = p;
    this.cb.onPause(p);
    if (!p) this.last = performance.now();
  }

  // ------------------------------------------------------------ input
  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.u = clamp(Math.min(this.w, this.h) / 760, 0.55, 1.25);
    this.ship.r = 13 * this.u;
    this.initBackground();
    if (this.mode !== 'playing') { this.ship.x = this.w / 2; this.ship.y = this.h * 0.75; }
  };

  private onPointer = (e: PointerEvent) => {
    if (this.mode !== 'playing' || this.paused) return;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.touch = e.pointerType === 'touch';
    this.pointer.active = true;
    this.lastInput = 'pointer';
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.mode === 'playing') this.setPaused(!this.paused);
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
      if (this.mode === 'playing') e.preventDefault();
      this.keys.add(e.code);
      if (e.code !== 'Space') this.lastInput = 'keys';
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onVisibility = () => { if (document.hidden && this.mode === 'playing') this.setPaused(true); };

  // ------------------------------------------------------------ background
  private initBackground() {
    const mk = (n: number, min: number, max: number): Star[] =>
      Array.from({ length: n }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, size: rand(min, max) * this.u, phase: Math.random() * TAU }));
    const area = (this.w * this.h) / (1280 * 800);
    this.stars = [mk(Math.round(140 * area) + 40, 0.6, 1.3), mk(Math.round(70 * area) + 20, 1.1, 2), mk(Math.round(28 * area) + 8, 1.8, 3)];
    this.nebulae = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random() * this.w, y: Math.random() * this.h,
      r: rand(260, 520) * this.u * (this.w > 900 ? 1.3 : 1),
      hueOff: [0, 25, -30, 50, 10][i], vx: rand(-6, 6), vy: rand(8, 20), alpha: rand(0.5, 0.9),
    }));
  }

  // ------------------------------------------------------------ main loop
  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.globalTime += dt;
    if (!this.paused) this.update(dt);
    this.render();
  };

  private get difficulty() {
    const t = this.time;
    return (1 - Math.exp(-t / 85)) + t / 420;
  }
  private get baseSpeed() {
    return (170 + 250 * Math.min(this.difficulty, 2.6)) * (this.h / 900);
  }

  private update(dt: number) {
    const s = this.ship;
    if (this.mode === 'idle') {
      this.updateBackground(dt, 0.25);
      this.spawnAcc.ambient += dt;
      if (this.spawnAcc.ambient > 1.8 && this.asteroids.length < 6) {
        this.spawnAcc.ambient = 0;
        this.spawnAsteroid(rand(30, 90) * (this.h / 900), true);
      }
      this.updateEntities(dt, false);
      this.updateFx(dt);
      return;
    }
    if (this.mode === 'dead') {
      this.deathTimer -= dt;
      this.updateBackground(dt, 0.4);
      this.updateEntities(dt * 0.5, false);
      this.updateFx(dt);
      if (this.deathTimer <= 0) {
        this.mode = 'idle';
        this.audio.stopDrone();
        this.cb.onGameOver({ ...this.stats });
      }
      return;
    }

    this.time += dt;
    this.stats.time = this.time;
    const slow = this.powers.slowmo > 0;
    const wdt = dt * (slow ? 0.38 : 1);
    const diff = this.difficulty;

    // power timers
    (Object.keys(this.powers) as (keyof typeof this.powers)[]).forEach(k => { if (this.powers[k] > 0) this.powers[k] = Math.max(0, this.powers[k] - dt); });

    this.updateShip(dt);
    this.spawn(wdt, diff);
    this.updateEntities(wdt, true);
    this.checkCollisions(wdt);
    this.updateFx(dt);
    this.updateBackground(wdt, 1 + Math.min(diff, 2.5) * 0.6);

    // combo
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.multiplier = 1; }
    }

    // distance & passive score
    const dDist = wdt * (1 + Math.min(diff, 2.5));
    this.stats.distance += dDist;
    this.stats.score += dDist * 20;

    // sector progression
    const sec = Math.min(SECTORS.length - 1, Math.floor(this.stats.distance / SECTOR_LENGTH));
    if (sec !== this.sector) {
      this.sector = sec;
      this.stats.sector = sec;
      this.sectorAnnounce = 3.2;
      this.targetHue = SECTORS[sec].hue;
      this.audio.sector();
      this.stats.stardust += 10 + sec * 5;
      this.text(this.w / 2, this.h * 0.42, `+${10 + sec * 5} ✦ SECTOR BONUS`, '#facc15', 15, 2);
    }

    // new record
    if (!this.recordShown && this.config.bestScore > 0 && this.stats.score > this.config.bestScore) {
      this.recordShown = true;
      this.recordBanner = 3;
      this.audio.record();
    }
    if (this.stats.score > this.config.bestScore) this.stats.newBest = true;

    // low hp pulse
    this.lowHpPulse = s.hp === 1 && s.maxHp > 1 ? this.lowHpPulse + dt : 0;

    // blaster fire
    if (this.powers.blaster > 0) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.11;
        const bv = -1150 * (this.h / 900);
        this.bullets.push({ x: s.x - 7 * this.u, y: s.y - 10 * this.u, vy: bv }, { x: s.x + 7 * this.u, y: s.y - 10 * this.u, vy: bv });
        this.audio.shoot();
      }
    }
  }

  private updateShip(dt: number) {
    const s = this.ship;
    const u = this.u;
    const agility = this.config.agility;
    const maxSpeed = 1300 * u * agility;
    let dvx = 0, dvy = 0;

    const k = this.keys;
    const kx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const ky = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    if (kx !== 0 || ky !== 0) this.lastInput = 'keys';

    if (this.lastInput === 'keys') {
      const len = hypot(kx, ky) || 1;
      const sp = 620 * u * agility;
      dvx = (kx / len) * sp; dvy = (ky / len) * sp;
    } else if (this.pointer.active) {
      const ty = this.pointer.y - (this.pointer.touch ? 90 * u : 0);
      const gain = 11 * agility;
      dvx = (this.pointer.x - s.x) * gain;
      dvy = (ty - s.y) * gain;
      const sp = hypot(dvx, dvy);
      if (sp > maxSpeed) { dvx *= maxSpeed / sp; dvy *= maxSpeed / sp; }
    }
    const t = 1 - Math.exp(-dt * 16);
    s.vx = lerp(s.vx, dvx, t);
    s.vy = lerp(s.vy, dvy, t);
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    // black hole pull on ship
    const bh = this.blackHole;
    if (bh) {
      const dx = bh.x - s.x, dy = bh.y - s.y, d = hypot(dx, dy);
      if (d < bh.pull && d > 1) {
        const f = 460 * u * Math.pow(1 - d / bh.pull, 1.6);
        s.x += (dx / d) * f * dt; s.y += (dy / d) * f * dt;
      }
    }

    const m = s.r + 4;
    s.x = clamp(s.x, m, this.w - m);
    s.y = clamp(s.y, m + 60 * u, this.h - m - 10 * u);
    s.tilt = lerp(s.tilt, clamp(s.vx / (maxSpeed * 0.8), -1, 1) * 0.55, 1 - Math.exp(-dt * 10));
    if (s.invuln > 0) s.invuln -= dt;

    // engine trail
    const skin = SKINS[this.config.skin];
    const n = 2 + (this.powers.slowmo > 0 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: s.x + rand(-3, 3) * u - Math.sin(s.tilt) * 10 * u, y: s.y + 14 * u,
        vx: rand(-30, 30) * u - s.vx * 0.15, vy: rand(180, 320) * u - s.vy * 0.1,
        life: rand(0.25, 0.5), maxLife: 0.5, size: rand(2, 5) * u,
        color: Math.random() < 0.6 ? skin.color : '#ffffff', drag: 0.9, glow: true,
      });
    }
  }

  // ------------------------------------------------------------ spawning
  private spawn(dt: number, diff: number) {
    const a = this.spawnAcc;
    const d = Math.min(diff, 2.6);
    const wideMult = clamp(this.w / 900, 0.8, 1.6);

    a.asteroid += dt * (0.9 + 1.7 * d) * wideMult;
    while (a.asteroid > 1) { a.asteroid -= 1; this.spawnAsteroid(); }

    a.crystal += dt * 0.75;
    while (a.crystal > 1) { a.crystal -= 1; this.spawnCrystalPattern(); }

    if (this.sector >= 1) {
      a.comet += dt * (0.13 + 0.09 * d);
      while (a.comet > 1) { a.comet -= 1; this.spawnComet(); }
    }
    if (this.sector >= 2) {
      a.mine += dt * (0.15 + 0.08 * d) * wideMult;
      while (a.mine > 1) { a.mine -= 1; this.spawnMine(); }
    }
    if (this.sector >= 3 && !this.blackHole) {
      a.blackhole += dt * 0.04;
      if (a.blackhole > 1) { a.blackhole = 0; this.spawnBlackHole(); }
    }
    a.powerup += dt * 0.075 * this.config.luck;
    while (a.powerup > 1) { a.powerup -= 1; this.spawnPowerUp(); }
  }

  private spawnAsteroid(forceSpeed?: number, ambient = false) {
    const u = this.u;
    const roll = Math.random();
    const bigBias = Math.min(this.difficulty * 0.1, 0.2);
    const r = roll < 0.55 - bigBias ? rand(11, 19) * u : roll < 0.88 - bigBias * 0.5 ? rand(22, 34) * u : rand(38, 58) * u;
    const n = 9 + Math.floor(Math.random() * 5);
    const verts = Array.from({ length: n }, () => rand(0.72, 1.08));
    const craters = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => {
      const ang = Math.random() * TAU, dist = rand(0.1, 0.55) * r;
      return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: rand(0.12, 0.3) * r };
    });
    const sizeMult = r < 20 * u ? 1.2 : r < 36 * u ? 1 : 0.72;
    const vy = forceSpeed ?? this.baseSpeed * rand(0.8, 1.3) * sizeMult;
    this.asteroids.push({
      x: rand(r, this.w - r), y: -r - 10, vx: rand(-45, 45) * u * (ambient ? 0.3 : 1), vy,
      r, rot: Math.random() * TAU, rotSpeed: rand(-1.6, 1.6), verts, craters,
      hp: r < 20 * u ? 1 : r < 36 * u ? 2 : 4, shade: rand(-6, 8), minDist: Infinity, hit: false,
    });
  }

  private makeCrystal(x: number, y: number, golden = false, burst = false): Crystal {
    const fall = this.baseSpeed * 0.85;
    return {
      x, y, vx: burst ? rand(-220, 220) * this.u : 0, vy: burst ? rand(-260, 60) * this.u : fall, fall,
      r: (golden ? 11 : 8) * this.u, hue: golden ? 48 : pick(CRYSTAL_HUES), phase: Math.random() * TAU, golden,
    };
  }

  private spawnCrystalPattern() {
    const u = this.u, w = this.w;
    const golden = Math.random() < 0.06;
    const roll = Math.random();
    const gap = 42 * u;
    if (golden) { this.crystals.push(this.makeCrystal(rand(40 * u, w - 40 * u), -20 * u, true)); return; }
    if (roll < 0.35) {
      this.crystals.push(this.makeCrystal(rand(30 * u, w - 30 * u), -20 * u));
    } else if (roll < 0.6) {
      const x = rand(40 * u, w - 40 * u);
      for (let i = 0; i < 5; i++) this.crystals.push(this.makeCrystal(x, -20 * u - i * gap));
    } else if (roll < 0.8) {
      const x = rand(80 * u, w - 80 * u), dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 5; i++) this.crystals.push(this.makeCrystal(clamp(x + dir * i * gap * 0.8, 20 * u, w - 20 * u), -20 * u - i * gap));
    } else {
      const cx = rand(120 * u, w - 120 * u);
      for (let i = 0; i < 7; i++) this.crystals.push(this.makeCrystal(clamp(cx + Math.sin(i * 0.9) * 90 * u, 20 * u, w - 20 * u), -20 * u - i * gap * 0.9));
    }
  }

  private spawnComet() {
    const u = this.u, fromLeft = Math.random() < 0.5;
    const sp = this.baseSpeed * 2.1;
    const ang = rand(0.35, 0.75);
    const x = fromLeft ? rand(-40 * u, this.w * 0.3) : rand(this.w * 0.7, this.w + 40 * u);
    this.comets.push({
      x, y: -30 * u, vx: (fromLeft ? 1 : -1) * Math.cos(ang) * sp * 0.8, vy: Math.sin(ang) * sp + sp * 0.3,
      r: 11 * u, delay: 0.9, trail: [], minDist: Infinity, hit: false,
    });
    this.audio.warning();
  }

  private spawnMine() {
    const u = this.u;
    this.mines.push({ x: rand(40 * u, this.w - 40 * u), y: -30 * u, vx: rand(-30, 30) * u, vy: this.baseSpeed * 0.6, r: 15 * u, phase: Math.random() * TAU });
  }

  private spawnBlackHole() {
    const u = this.u;
    this.blackHole = { x: rand(this.w * 0.25, this.w * 0.75), y: -200 * u, vy: 62 * (this.h / 900), r: 22 * u, pull: 300 * u, angle: 0 };
    this.text(this.w / 2, this.h * 0.3, 'GRAVITY ANOMALY DETECTED', '#c084fc', 16, 2.5);
    this.audio.warning();
  }

  private spawnPowerUp() {
    const u = this.u;
    const pool: PowerUpType[] = ['magnet', 'magnet', 'slowmo', 'slowmo', 'blaster', 'blaster', 'shield', 'shield', 'nova'];
    const type = this.ship.shield ? pick(pool.filter(p => p !== 'shield')) : pick(pool);
    this.powerups.push({ x: rand(40 * u, this.w - 40 * u), y: -30 * u, vy: this.baseSpeed * 0.65, type, phase: Math.random() * TAU, r: 16 * u });
  }

  // ------------------------------------------------------------ entity updates
  private updateEntities(dt: number, playing: boolean) {
    const u = this.u, s = this.ship, w = this.w, h = this.h;
    const bh = this.blackHole;

    const pullToward = (o: { x: number; y: number }, strength: number, swirl: number): boolean => {
      if (!bh) return false;
      const dx = bh.x - o.x, dy = bh.y - o.y, d = hypot(dx, dy);
      if (d < bh.pull && d > 1) {
        const f = strength * u * Math.pow(1 - d / bh.pull, 1.4);
        o.x += ((dx / d) * f - (dy / d) * f * swirl) * dt;
        o.y += ((dy / d) * f + (dx / d) * f * swirl) * dt;
        return d < bh.r;
      }
      return false;
    };

    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.rotSpeed * dt;
      if (a.x < a.r && a.vx < 0) a.vx = -a.vx; else if (a.x > w - a.r && a.vx > 0) a.vx = -a.vx;
      if (pullToward(a, 520, 0.8)) { this.burst(a.x, a.y, 8, '#c084fc', 3 * u); this.asteroids.splice(i, 1); continue; }
      if (a.y > h + a.r + 20) { this.asteroids.splice(i, 1); continue; }
      if (playing) {
        const d = hypot(a.x - s.x, a.y - s.y);
        if (d < a.minDist) a.minDist = d;
        if (a.y > s.y + a.r + s.r && !a.hit && a.minDist < a.r + s.r + 30 * u) {
          a.hit = true;
          this.nearMiss(a.x, a.y, 30);
        }
      }
    }

    const magnetR = this.powers.magnet > 0 ? 320 * u : this.config.magnetRange * u;
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      c.phase += dt * 3;
      c.vx *= Math.exp(-dt * 2.5);
      c.vy = lerp(c.vy, c.fall, 1 - Math.exp(-dt * 2.5));
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (playing && magnetR > 0) {
        const dx = s.x - c.x, dy = s.y - c.y, d = hypot(dx, dy);
        if (d < magnetR && d > 1) {
          const f = (this.powers.magnet > 0 ? 900 : 560) * u * (1.15 - d / magnetR);
          c.x += (dx / d) * f * dt; c.y += (dy / d) * f * dt;
        }
      }
      if (pullToward(c, 640, 1.2)) { this.burst(c.x, c.y, 4, `hsl(${c.hue},90%,70%)`, 2 * u); this.crystals.splice(i, 1); continue; }
      if (c.y > h + 30 || c.x < -40 || c.x > w + 40) this.crystals.splice(i, 1);
    }

    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.trail.unshift({ x: c.x, y: c.y });
      if (c.trail.length > 18) c.trail.pop();
      if (Math.random() < 0.7) this.particles.push({ x: c.x + rand(-4, 4) * u, y: c.y + rand(-4, 4) * u, vx: -c.vx * 0.1 + rand(-40, 40) * u, vy: -c.vy * 0.1 + rand(-40, 40) * u, life: rand(0.3, 0.6), maxLife: 0.6, size: rand(2, 4) * u, color: '#bae6fd', drag: 0.95, glow: true });
      if (playing) {
        const d = hypot(c.x - s.x, c.y - s.y);
        if (d < c.minDist) c.minDist = d;
        if (c.y > s.y + c.r + s.r && !c.hit && c.minDist < c.r + s.r + 44 * u) { c.hit = true; this.nearMiss(c.x, c.y, 60); }
      }
      if (c.y > h + 60 * u || c.x < -120 * u || c.x > w + 120 * u) this.comets.splice(i, 1);
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.x += m.vx * dt; m.y += m.vy * dt; m.phase += dt * 4;
      if (m.x < m.r || m.x > w - m.r) m.vx = -m.vx;
      if (pullToward(m, 420, 0.6)) { this.explodeMine(m, i, false); continue; }
      if (m.y > h + m.r + 10) this.mines.splice(i, 1);
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += p.vy * dt; p.phase += dt * 2;
      p.x += Math.sin(p.phase) * 20 * u * dt;
      if (p.y > h + 40) this.powerups.splice(i, 1);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20) this.bullets.splice(i, 1);
    }

    if (bh) {
      bh.y += bh.vy * dt; bh.angle += dt * 1.8;
      if (Math.random() < 0.5) {
        const ang = Math.random() * TAU, d = bh.pull * rand(0.5, 0.95);
        this.particles.push({ x: bh.x + Math.cos(ang) * d, y: bh.y + Math.sin(ang) * d, vx: 0, vy: 0, life: 1.2, maxLife: 1.2, size: rand(1.5, 3) * u, color: Math.random() < 0.5 ? '#c084fc' : '#f0abfc', drag: 1, glow: true });
      }
      if (bh.y > h + bh.pull) this.blackHole = null;
    }
  }

  private checkCollisions(dt: number) {
    const s = this.ship, u = this.u;

    // crystals
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      if (hypot(c.x - s.x, c.y - s.y) < c.r + s.r + 6 * u) { this.collect(c); this.crystals.splice(i, 1); }
    }
    // powerups
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      if (hypot(p.x - s.x, p.y - s.y) < p.r + s.r + 8 * u) { this.activatePower(p); this.powerups.splice(i, 1); }
    }
    // bullets vs asteroids/mines
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let consumed = false;
      for (let j = this.asteroids.length - 1; j >= 0 && !consumed; j--) {
        const a = this.asteroids[j];
        if (Math.abs(a.x - b.x) < a.r && Math.abs(a.y - b.y) < a.r && hypot(a.x - b.x, a.y - b.y) < a.r) {
          consumed = true;
          a.hp--;
          this.burst(b.x, b.y, 3, '#fdba74', 2 * u, 120);
          if (a.hp <= 0) this.destroyAsteroid(j, true);
        }
      }
      for (let j = this.mines.length - 1; j >= 0 && !consumed; j--) {
        const m = this.mines[j];
        if (hypot(m.x - b.x, m.y - b.y) < m.r) { consumed = true; this.explodeMine(m, j, true); }
      }
      if (consumed) this.bullets.splice(i, 1);
    }
    // asteroid vs ship
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (hypot(a.x - s.x, a.y - s.y) < a.r * 0.9 + s.r) {
        a.hit = true;
        if (s.invuln <= 0) {
          this.burst(a.x, a.y, 14, '#a8a29e', 3 * u);
          this.asteroids.splice(i, 1);
          this.damage();
        }
      }
    }
    // comet vs ship
    for (const c of this.comets) {
      if (c.delay <= 0 && hypot(c.x - s.x, c.y - s.y) < c.r + s.r) { c.hit = true; if (s.invuln <= 0) this.damage(); }
    }
    // mines vs ship
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (hypot(m.x - s.x, m.y - s.y) < m.r + s.r + 2 * u) { this.explodeMine(m, i, true); }
    }
    // black hole core
    const bh = this.blackHole;
    if (bh && hypot(bh.x - s.x, bh.y - s.y) < bh.r + s.r) {
      if (s.invuln <= 0) {
        this.damage();
        const dx = s.x - bh.x, dy = s.y - bh.y, d = hypot(dx, dy) || 1;
        s.x = bh.x + (dx / d) * bh.pull * 0.9; s.y = clamp(bh.y + (dy / d) * bh.pull * 0.9, 80 * u, this.h - 40 * u);
      }
    }
    void dt;
  }

  // ------------------------------------------------------------ game events
  private collect(c: Crystal) {
    this.combo++;
    this.comboTimer = COMBO_TIME;
    this.multiplier = Math.min(10, 1 + Math.floor(this.combo / 4) * 0.5);
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    const pts = Math.round((c.golden ? 60 : 10) * this.multiplier);
    this.stats.score += pts;
    this.stats.crystals++;
    this.stats.stardust += this.config.crystalValue * (c.golden ? 5 : 1);
    this.scorePunch = 1;
    const col = c.golden ? '#fde047' : hslToHex(c.hue, 90, 75);
    this.text(c.x, c.y - 10 * this.u, `+${pts}`, col, c.golden ? 18 : 13, 0.8);
    this.burst(c.x, c.y, c.golden ? 18 : 7, col, 2.5 * this.u, 160);
    if (c.golden) this.ring(c.x, c.y, 90 * this.u, 0.5, '#fde047', 2);
    if (this.combo > 0 && this.combo % 10 === 0) this.text(this.ship.x, this.ship.y - 50 * this.u, `${this.combo} COMBO!`, '#f0abfc', 18, 1.1, 'display');
    this.audio.collect(this.combo, c.golden);
  }

  private nearMiss(x: number, y: number, base: number) {
    this.combo += 2;
    this.comboTimer = COMBO_TIME;
    this.multiplier = Math.min(10, 1 + Math.floor(this.combo / 4) * 0.5);
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    const pts = Math.round(base * this.multiplier);
    this.stats.score += pts;
    this.stats.nearMisses++;
    this.scorePunch = 1;
    this.shake = Math.max(this.shake, 3);
    this.text(this.ship.x, this.ship.y - 40 * this.u, `CLOSE CALL +${pts}`, '#fbbf24', 14, 0.9, 'display');
    this.audio.nearMiss();
    void x; void y;
  }

  private activatePower(p: PowerUp) {
    const info = POWER_INFO[p.type];
    const dur = this.config.durationMult;
    this.ring(p.x, p.y, 120 * this.u, 0.6, info.color, 3);
    this.burst(p.x, p.y, 20, info.color, 3 * this.u, 220);
    switch (p.type) {
      case 'shield': this.ship.shield = true; this.audio.shieldUp(); break;
      case 'magnet': this.powers.magnet = 8 * dur; this.powerMax.magnet = 8 * dur; this.audio.powerup(); break;
      case 'slowmo': this.powers.slowmo = 5 * dur; this.powerMax.slowmo = 5 * dur; this.audio.powerup(); break;
      case 'blaster': this.powers.blaster = 7 * dur; this.powerMax.blaster = 7 * dur; this.fireTimer = 0; this.audio.powerup(); break;
      case 'nova': this.nova(); break;
    }
    this.text(p.x, p.y - 30 * this.u, info.label, info.color, 18, 1.2, 'display');
  }

  private nova() {
    this.flash = 1; this.flashColor = '#fef9c3';
    this.shake = 22;
    this.ring(this.ship.x, this.ship.y, Math.max(this.w, this.h) * 1.2, 0.9, '#facc15', 6);
    for (let i = this.asteroids.length - 1; i >= 0; i--) this.destroyAsteroid(i, false);
    for (let i = this.mines.length - 1; i >= 0; i--) { const m = this.mines[i]; this.burst(m.x, m.y, 14, '#f87171', 3 * this.u); this.mines.splice(i, 1); }
    for (const c of this.comets) { this.burst(c.x, c.y, 14, '#bae6fd', 3 * this.u); }
    this.comets = [];
    this.audio.nova();
  }

  private destroyAsteroid(i: number, split: boolean) {
    const a = this.asteroids[i];
    this.asteroids.splice(i, 1);
    const u = this.u;
    const pts = Math.round((a.r > 36 * u ? 40 : a.r > 20 * u ? 25 : 15) * this.multiplier);
    this.stats.score += pts;
    this.stats.destroyed++;
    this.burst(a.x, a.y, Math.round(8 + a.r / u / 3), '#d6d3d1', 3 * u, 220);
    this.burst(a.x, a.y, 6, '#fb923c', 2.5 * u, 180);
    this.text(a.x, a.y, `+${pts}`, '#fdba74', 12, 0.7);
    const nCrystals = clamp(Math.floor(a.r / (16 * u)), 1, 4);
    for (let k = 0; k < nCrystals; k++) this.crystals.push(this.makeCrystal(a.x, a.y, false, true));
    if (split && a.r > 26 * u) {
      for (let k = 0; k < 2; k++) {
        const r = a.r * 0.55;
        const n = 8 + Math.floor(Math.random() * 4);
        this.asteroids.push({
          x: a.x + (k ? 1 : -1) * r, y: a.y, vx: (k ? 1 : -1) * rand(70, 140) * u + a.vx, vy: a.vy * rand(0.85, 1.1),
          r, rot: Math.random() * TAU, rotSpeed: rand(-3, 3), verts: Array.from({ length: n }, () => rand(0.72, 1.08)),
          craters: [{ x: 0, y: 0, r: r * 0.25 }], hp: r < 20 * u ? 1 : 2, shade: a.shade, minDist: Infinity, hit: false,
        });
      }
    }
    this.shake = Math.max(this.shake, a.r > 36 * u ? 8 : 3);
    this.audio.explode(a.r > 36 * u);
  }

  private explodeMine(m: Mine, index: number, hurt: boolean) {
    this.mines.splice(index, 1);
    const u = this.u, R = 110 * u;
    this.ring(m.x, m.y, R * 1.3, 0.5, '#f87171', 4);
    this.burst(m.x, m.y, 26, '#f87171', 3.5 * u, 320);
    this.burst(m.x, m.y, 12, '#fde68a', 3 * u, 260);
    this.shake = Math.max(this.shake, 12);
    this.flash = Math.max(this.flash, 0.35); this.flashColor = '#fca5a5';
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      if (hypot(a.x - m.x, a.y - m.y) < R + a.r) this.destroyAsteroid(i, false);
    }
    if (hurt && hypot(this.ship.x - m.x, this.ship.y - m.y) < R + this.ship.r && this.ship.invuln <= 0) this.damage();
    this.audio.explode(true);
  }

  private damage() {
    const s = this.ship;
    if (s.invuln > 0) return;
    if (s.shield) {
      s.shield = false;
      s.invuln = 1.2;
      this.ring(s.x, s.y, 140 * this.u, 0.5, '#38bdf8', 4);
      this.burst(s.x, s.y, 24, '#7dd3fc', 3 * this.u, 260);
      this.text(s.x, s.y - 50 * this.u, 'SHIELD DOWN', '#7dd3fc', 15, 1, 'display');
      this.shake = Math.max(this.shake, 10);
      this.audio.shieldBreak();
      return;
    }
    s.hp--;
    s.invuln = 1.6;
    this.combo = 0; this.comboTimer = 0; this.multiplier = 1;
    this.shake = 20;
    this.flash = 0.7; this.flashColor = '#ef4444';
    this.burst(s.x, s.y, 30, '#f97316', 3.5 * this.u, 300);
    this.burst(s.x, s.y, 14, '#ffffff', 2.5 * this.u, 240);
    this.audio.hit();
    if (s.hp <= 0) this.die();
    else this.text(s.x, s.y - 50 * this.u, 'HULL DAMAGED', '#f87171', 15, 1, 'display');
  }

  private die() {
    this.mode = 'dead';
    this.deathTimer = 1.9;
    const s = this.ship, u = this.u;
    const skin = SKINS[this.config.skin];
    this.shake = 34;
    this.flash = 1; this.flashColor = '#ffffff';
    this.burst(s.x, s.y, 70, skin.color, 4 * u, 420);
    this.burst(s.x, s.y, 50, '#fbbf24', 3.5 * u, 380);
    this.burst(s.x, s.y, 30, '#ffffff', 3 * u, 300);
    this.ring(s.x, s.y, 300 * u, 1.0, '#ffffff', 5);
    this.ring(s.x, s.y, 200 * u, 0.7, skin.color, 3);
    this.stats.stardust = Math.round(this.stats.stardust + Math.floor(this.stats.distance / 10));
    this.stats.score = Math.floor(this.stats.score);
    this.audio.explode(true);
    this.audio.gameOver();
  }

  // ------------------------------------------------------------ fx helpers
  private burst(x: number, y: number, n: number, color: string, size: number, speed = 200) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * TAU, sp = rand(0.2, 1) * speed * this.u;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.35, 0.9), maxLife: 0.9, size: rand(0.5, 1.4) * size, color, drag: 0.93, glow: Math.random() < 0.5 });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }
  private ring(x: number, y: number, maxR: number, life: number, color: string, width: number) {
    this.rings.push({ x, y, r: 0, maxR, life, maxLife: life, color, width });
  }
  private text(x: number, y: number, text: string, color: string, size: number, life: number, font: 'display' | 'body' = 'body') {
    this.texts.push({ x, y, text, life, maxLife: life, color, size: size * this.u, vy: -50 * this.u, font });
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.maxLife;
      r.r = r.maxR * (1 - Math.pow(1 - t, 3));
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.9, dt * 60);
    }
    if (this.shake > 0) { this.shake *= Math.exp(-dt * 7); if (this.shake < 0.2) this.shake = 0; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.scorePunch > 0) this.scorePunch = Math.max(0, this.scorePunch - dt * 5);
    if (this.sectorAnnounce > 0) this.sectorAnnounce -= dt;
    if (this.recordBanner > 0) this.recordBanner -= dt;
    // hue drift toward target (shortest path)
    const dh = ((this.targetHue - this.bgHue + 540) % 360) - 180;
    this.bgHue = (this.bgHue + dh * (1 - Math.exp(-dt * 0.8)) + 360) % 360;
  }

  private updateBackground(dt: number, speedMult: number) {
    const speeds = [22, 55, 120];
    const hh = this.h / 900;
    for (let l = 0; l < this.stars.length; l++) {
      const v = speeds[l] * speedMult * hh;
      for (const st of this.stars[l]) {
        st.y += v * dt;
        if (st.y > this.h + 4) { st.y = -4; st.x = Math.random() * this.w; }
      }
    }
    for (const n of this.nebulae) {
      n.x += n.vx * dt; n.y += n.vy * speedMult * dt * 0.8;
      if (n.y - n.r > this.h) { n.y = -n.r; n.x = Math.random() * this.w; }
      if (n.x + n.r < 0) n.x = this.w + n.r; else if (n.x - n.r > this.w) n.x = -n.r;
    }
  }

  // ------------------------------------------------------------ rendering
  private render() {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    this.drawBackground();
    if (this.blackHole) this.drawBlackHole(this.blackHole);
    this.drawCrystals();
    this.drawPowerUps();
    this.drawMines();
    this.drawAsteroids();
    this.drawComets();
    this.drawBullets();
    this.drawParticles();
    if (this.mode === 'playing') this.drawShip();
    this.drawRings();
    this.drawTexts();
    ctx.restore();

    if (this.powers.slowmo > 0 && this.mode === 'playing') {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(34,211,238,0)');
      g.addColorStop(1, `rgba(34,211,238,${0.22 * Math.min(1, this.powers.slowmo)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (this.lowHpPulse > 0) {
      const a = (Math.sin(this.lowHpPulse * 5) * 0.5 + 0.5) * 0.28;
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(239,68,68,0)'); g.addColorStop(1, `rgba(239,68,68,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.55;
      ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.mode === 'playing') this.drawHUD();
  }

  private drawBackground() {
    const ctx = this.ctx, w = this.w, h = this.h, hue = this.bgHue;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${hue}, 45%, 4%)`);
    g.addColorStop(1, `hsl(${(hue + 20) % 360}, 40%, 8%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    for (const n of this.nebulae) {
      ctx.globalAlpha = n.alpha;
      ctx.drawImage(nebulaSprite(hue + n.hueOff), n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.globalAlpha = 1;

    const t = this.globalTime;
    const fast = this.mode === 'playing' && this.difficulty > 0.6;
    const alphas = [0.5, 0.75, 1];
    for (let l = 0; l < this.stars.length; l++) {
      ctx.fillStyle = `rgba(255,255,255,${alphas[l]})`;
      for (const st of this.stars[l]) {
        const tw = 0.55 + 0.45 * Math.sin(t * 2.5 + st.phase);
        ctx.globalAlpha = tw * alphas[l];
        if (l === 2 && fast) {
          const len = st.size * (3 + Math.min(this.difficulty, 2.5) * 4);
          ctx.fillRect(st.x, st.y - len, st.size * 0.8, len);
        } else {
          ctx.fillRect(st.x, st.y, st.size, st.size);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawShip() {
    const ctx = this.ctx, s = this.ship, u = this.u;
    const skin = SKINS[this.config.skin];
    const blink = s.invuln > 0 && Math.floor(s.invuln * 14) % 2 === 0;
    ctx.save();
    ctx.translate(s.x, s.y);
    // passive magnet ring
    const magnetR = this.powers.magnet > 0 ? 320 * u : this.config.magnetRange * u;
    if (magnetR > 0) {
      ctx.globalAlpha = this.powers.magnet > 0 ? 0.35 + 0.15 * Math.sin(this.globalTime * 6) : 0.12;
      ctx.strokeStyle = '#e879f9'; ctx.lineWidth = 1.5;
      ctx.setLineDash([6 * u, 8 * u]); ctx.lineDashOffset = -this.globalTime * 40;
      ctx.beginPath(); ctx.arc(0, 0, magnetR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.rotate(s.tilt);
    ctx.globalAlpha = blink ? 0.3 : 1;

    // engine glow
    const flick = 0.8 + Math.random() * 0.35;
    ctx.drawImage(glowSprite(skin.color), -22 * u, 2 * u, 44 * u, 44 * u * flick);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = (blink ? 0.3 : 1) * 0.85;
    ctx.beginPath(); ctx.moveTo(-5 * u, 13 * u); ctx.lineTo(5 * u, 13 * u); ctx.lineTo(0, (13 + 16 * flick) * u); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = blink ? 0.3 : 1;

    // hull
    const grad = ctx.createLinearGradient(0, -22 * u, 0, 14 * u);
    grad.addColorStop(0, skin.accent); grad.addColorStop(0.45, skin.color); grad.addColorStop(1, rgba(skin.color, 0.6));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -23 * u);
    ctx.lineTo(7 * u, -5 * u);
    ctx.lineTo(16 * u, 11 * u);
    ctx.lineTo(6 * u, 9 * u);
    ctx.lineTo(0, 14 * u);
    ctx.lineTo(-6 * u, 9 * u);
    ctx.lineTo(-16 * u, 11 * u);
    ctx.lineTo(-7 * u, -5 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    // cockpit
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(0, -7 * u, 2.6 * u, 6 * u, 0, 0, TAU); ctx.fill();
    // wing lights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-13 * u, 9 * u, 1.6 * u, 0, TAU); ctx.arc(13 * u, 9 * u, 1.6 * u, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(-s.tilt);

    // shield
    if (s.shield) {
      const pulse = 0.55 + 0.25 * Math.sin(this.globalTime * 5);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowSprite('#38bdf8'), -46 * u, -46 * u, 92 * u, 92 * u);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + this.globalTime; const x = Math.cos(a) * 31 * u, y = Math.sin(a) * 31 * u; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawAsteroids() {
    const ctx = this.ctx;
    for (const a of this.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y); ctx.rotate(a.rot);
      ctx.beginPath();
      const n = a.verts.length;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU, r = a.r * a.verts[i];
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(-a.r, -a.r, a.r * 0.6, a.r);
      g.addColorStop(0, `hsl(28, 14%, ${40 + a.shade}%)`);
      g.addColorStop(1, `hsl(24, 12%, ${14 + a.shade * 0.5}%)`);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (const c of a.craters) { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }

  private drawCrystals() {
    const ctx = this.ctx;
    for (const c of this.crystals) {
      const col = c.golden ? '#fde047' : `hsl(${c.hue},90%,70%)`;
      const glowCol = c.golden ? '#facc15' : hslToHex(c.hue);
      const gs = c.r * (c.golden ? 7 : 5);
      ctx.globalAlpha = c.golden ? 0.9 : 0.6;
      ctx.drawImage(glowSprite(glowCol), c.x - gs / 2, c.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(c.x, c.y);
      const sx = 0.55 + 0.45 * Math.abs(Math.cos(c.phase));
      ctx.scale(sx, 1);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -c.r); ctx.lineTo(c.r * 0.7, 0); ctx.lineTo(0, c.r); ctx.lineTo(-c.r * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.moveTo(0, -c.r * 0.6); ctx.lineTo(c.r * 0.3, 0); ctx.lineTo(0, c.r * 0.2); ctx.lineTo(-c.r * 0.3, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  private drawPowerUps() {
    const ctx = this.ctx, u = this.u;
    for (const p of this.powerups) {
      const info = POWER_INFO[p.type];
      const pulse = 1 + 0.12 * Math.sin(p.phase * 2.5);
      const gs = p.r * 6 * pulse;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(glowSprite(info.color), p.x - gs / 2, p.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.phase * 0.6);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const x = Math.cos(a) * p.r * pulse, y = Math.sin(a) * p.r * pulse; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = 'rgba(2,6,23,0.75)'; ctx.fill();
      ctx.strokeStyle = info.color; ctx.lineWidth = 2.2 * u; ctx.stroke();
      ctx.rotate(-p.phase * 0.6);
      ctx.fillStyle = info.color;
      ctx.font = `${16 * u}px ${BODY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(info.icon, 0, 1 * u);
      ctx.restore();
    }
  }

  private drawMines() {
    const ctx = this.ctx, u = this.u;
    for (const m of this.mines) {
      const d = hypot(m.x - this.ship.x, m.y - this.ship.y);
      const near = clamp(1 - d / (260 * u), 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(m.phase * (1 + near * 3));
      const gs = m.r * (4 + pulse * 2 + near * 3);
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      ctx.drawImage(glowSprite('#ef4444'), m.x - gs / 2, m.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(m.x, m.y); ctx.rotate(m.phase * 0.3);
      ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 3 * u;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * m.r * 1.35, Math.sin(a) * m.r * 1.35); }
      ctx.stroke();
      ctx.fillStyle = '#292524';
      ctx.beginPath(); ctx.arc(0, 0, m.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#57534e'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = `rgba(248,113,113,${0.5 + pulse * 0.5})`;
      ctx.beginPath(); ctx.arc(0, 0, m.r * 0.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  private drawComets() {
    const ctx = this.ctx, u = this.u;
    for (const c of this.comets) {
      if (c.delay > 0) {
        // entry warning
        const blink = Math.floor(c.delay * 10) % 2 === 0;
        if (blink) {
          const wx = clamp(c.x + c.vx * 0.25, 20 * u, this.w - 20 * u), wy = 70 * u;
          ctx.fillStyle = '#f87171';
          ctx.beginPath(); ctx.moveTo(wx, wy - 14 * u); ctx.lineTo(wx + 13 * u, wy + 9 * u); ctx.lineTo(wx - 13 * u, wy + 9 * u); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#0f0a0a'; ctx.font = `700 ${14 * u}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', wx, wy + 1 * u);
        }
        continue;
      }
      // trail
      for (let i = 0; i < c.trail.length - 1; i++) {
        const t = 1 - i / c.trail.length;
        ctx.strokeStyle = `rgba(186,230,253,${t * 0.7})`;
        ctx.lineWidth = c.r * 1.6 * t;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(c.trail[i].x, c.trail[i].y); ctx.lineTo(c.trail[i + 1].x, c.trail[i + 1].y); ctx.stroke();
      }
      const gs = c.r * 7;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glowSprite('#7dd3fc'), c.x - gs / 2, c.y - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.75, 0, TAU); ctx.fill();
    }
  }

  private drawBullets() {
    const ctx = this.ctx, u = this.u;
    ctx.strokeStyle = '#fdba74'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 14 * u); }
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    for (const b of this.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 8 * u); }
    ctx.stroke();
  }

  private drawBlackHole(bh: BlackHole) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(bh.x, bh.y);
    const gs = bh.pull * 1.6;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(glowSprite('#7e22ce'), -gs / 2, -gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    // accretion disk
    ctx.rotate(bh.angle * 0.5);
    for (let i = 0; i < 4; i++) {
      const rx = bh.r * (2 + i * 0.7), ry = bh.r * (0.8 + i * 0.28);
      ctx.strokeStyle = i % 2 ? `rgba(240,171,252,${0.55 - i * 0.1})` : `rgba(251,146,60,${0.5 - i * 0.1})`;
      ctx.lineWidth = (3.5 - i * 0.6) * this.u;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, bh.angle * (0.3 + i * 0.1), 0, TAU); ctx.stroke();
    }
    ctx.rotate(-bh.angle * 0.5);
    // lensing ring
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2 * this.u;
    ctx.beginPath(); ctx.arc(0, 0, bh.r * 1.12, 0, TAU); ctx.stroke();
    // core
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, bh.r, 0, TAU); ctx.fill();
    // pull radius hint
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 10]);
    ctx.beginPath(); ctx.arc(0, 0, bh.pull, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      if (p.glow) {
        const s = p.size * 4;
        ctx.drawImage(glowSprite(p.color.startsWith('#') ? p.color : '#ffffff'), p.x - s / 2, p.y - s / 2, s, s);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawRings() {
    const ctx = this.ctx;
    for (const r of this.rings) {
      const a = r.life / r.maxLife;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * this.u * (0.4 + a);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts() {
    const ctx = this.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.life / t.maxLife;
      const a = p < 0.3 ? p / 0.3 : 1;
      const scale = 1 + (1 - Math.min(1, (1 - p) * 6)) * 0.4;
      ctx.globalAlpha = a;
      ctx.font = `${t.font === 'display' ? 900 : 700} ${t.size * scale}px ${t.font === 'display' ? DISPLAY : BODY}`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHUD() {
    const ctx = this.ctx, u = this.u, w = this.w, pad = 18 * u;
    const st = this.stats, s = this.ship;
    ctx.textBaseline = 'top';

    // score
    ctx.textAlign = 'left';
    ctx.font = `600 ${11 * u}px ${BODY}`;
    ctx.fillStyle = 'rgba(226,232,240,0.6)';
    ctx.fillText('SCORE', pad, pad);
    const punch = 1 + this.scorePunch * 0.18;
    ctx.save();
    ctx.translate(pad, pad + 15 * u); ctx.scale(punch, punch);
    ctx.font = `900 ${30 * u}px ${DISPLAY}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(56,189,248,0.8)'; ctx.shadowBlur = 12 * this.scorePunch;
    ctx.fillText(Math.floor(st.score).toLocaleString('en-US'), 0, 0);
    ctx.restore();
    ctx.font = `600 ${11 * u}px ${BODY}`;
    ctx.fillStyle = st.newBest ? '#facc15' : 'rgba(226,232,240,0.5)';
    ctx.fillText(st.newBest ? '★ NEW BEST' : `BEST ${Math.floor(this.config.bestScore).toLocaleString('en-US')}`, pad, pad + 52 * u);

    // multiplier + combo bar
    if (this.combo > 0) {
      const tier = (this.multiplier - 1) / 9;
      const col = tier < 0.2 ? '#7dd3fc' : tier < 0.5 ? '#f0abfc' : tier < 0.8 ? '#fbbf24' : '#f87171';
      ctx.font = `900 ${20 * u}px ${DISPLAY}`;
      ctx.fillStyle = col;
      ctx.fillText(`×${this.multiplier.toFixed(1)}`, pad, pad + 70 * u);
      ctx.font = `600 ${11 * u}px ${BODY}`;
      ctx.fillStyle = 'rgba(226,232,240,0.6)';
      ctx.fillText(`${this.combo} COMBO`, pad + 68 * u, pad + 76 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(pad, pad + 96 * u, 130 * u, 3 * u);
      ctx.fillStyle = col;
      ctx.fillRect(pad, pad + 96 * u, 130 * u * clamp(this.comboTimer / COMBO_TIME, 0, 1), 3 * u);
    }

    // distance + sector (right)
    ctx.textAlign = 'right';
    ctx.font = `600 ${11 * u}px ${BODY}`;
    ctx.fillStyle = 'rgba(226,232,240,0.6)';
    ctx.fillText('DISTANCE', w - pad, pad);
    ctx.font = `900 ${24 * u}px ${DISPLAY}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${st.distance.toFixed(1)} ly`, w - pad, pad + 15 * u);
    const sec = SECTORS[this.sector];
    ctx.font = `700 ${11 * u}px ${BODY}`;
    ctx.fillStyle = `hsl(${sec.hue}, 90%, 72%)`;
    ctx.fillText(`SECTOR ${this.sector + 1} · ${sec.name.toUpperCase()}`, w - pad, pad + 48 * u);
    // sector progress bar
    const prog = (st.distance % SECTOR_LENGTH) / SECTOR_LENGTH;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(w - pad - 130 * u, pad + 66 * u, 130 * u, 3 * u);
    ctx.fillStyle = `hsl(${sec.hue}, 90%, 65%)`;
    ctx.fillRect(w - pad - 130 * u, pad + 66 * u, 130 * u * (this.sector === SECTORS.length - 1 ? 1 : prog), 3 * u);

    // hull cells (center top)
    const cellW = 22 * u, gap = 6 * u;
    const total = s.maxHp * cellW + (s.maxHp - 1) * gap;
    let x0 = w / 2 - total / 2;
    for (let i = 0; i < s.maxHp; i++) {
      const alive = i < s.hp;
      ctx.beginPath();
      const cx = x0 + cellW / 2, cy = pad + 10 * u, r = cellW / 2;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU - Math.PI / 6; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath();
      if (alive) {
        const pulse = this.lowHpPulse > 0 ? 0.6 + 0.4 * Math.sin(this.lowHpPulse * 8) : 1;
        ctx.fillStyle = s.hp === 1 && s.maxHp > 1 ? `rgba(248,113,113,${pulse})` : '#38bdf8';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(148,163,184,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      x0 += cellW + gap;
    }
    ctx.textAlign = 'center';
    ctx.font = `600 ${10 * u}px ${BODY}`;
    ctx.fillStyle = 'rgba(226,232,240,0.5)';
    ctx.fillText('HULL', w / 2, pad + 26 * u);
    if (s.shield) {
      ctx.fillStyle = '#7dd3fc';
      ctx.font = `700 ${11 * u}px ${BODY}`;
      ctx.fillText('◈ SHIELD ACTIVE', w / 2, pad + 42 * u);
    }

    // active powers (bottom-left)
    let py = this.h - pad - 14 * u;
    (['blaster', 'slowmo', 'magnet'] as const).forEach(k => {
      if (this.powers[k] <= 0) return;
      const info = POWER_INFO[k];
      const frac = this.powers[k] / this.powerMax[k];
      ctx.textAlign = 'left';
      ctx.font = `700 ${11 * u}px ${BODY}`;
      ctx.fillStyle = info.color;
      ctx.fillText(`${info.icon} ${info.label}`, pad, py - 14 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(pad, py, 140 * u, 4 * u);
      ctx.fillStyle = info.color;
      ctx.fillRect(pad, py, 140 * u * frac, 4 * u);
      py -= 32 * u;
    });

    // sector announce
    if (this.sectorAnnounce > 0) {
      const t = this.sectorAnnounce;
      const a = t > 2.6 ? (3.2 - t) / 0.6 : t < 0.8 ? t / 0.8 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${13 * u}px ${BODY}`;
      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.fillText(`ENTERING SECTOR ${this.sector + 1}`, w / 2, this.h * 0.3 - 26 * u);
      ctx.font = `900 ${34 * u}px ${DISPLAY}`;
      ctx.fillStyle = `hsl(${sec.hue}, 95%, 78%)`;
      ctx.shadowColor = `hsl(${sec.hue}, 95%, 60%)`; ctx.shadowBlur = 24;
      ctx.fillText(sec.name.toUpperCase(), w / 2, this.h * 0.3 + 4 * u);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (this.recordBanner > 0) {
      const a = clamp(Math.min(this.recordBanner, 3 - this.recordBanner) * 2, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${26 * u}px ${DISPLAY}`;
      ctx.fillStyle = '#fde047';
      ctx.shadowColor = '#facc15'; ctx.shadowBlur = 20;
      ctx.fillText('★ NEW RECORD ★', w / 2, this.h * 0.42);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (this.time < 3 && this.mode === 'playing') {
      ctx.globalAlpha = clamp(1 - (this.time - 2) , 0, 1) * 0.8;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${13 * u}px ${BODY}`;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(this.pointer.touch ? 'Drag to steer · collect crystals · dodge everything' : 'Move mouse or WASD to steer · collect crystals · dodge everything', w / 2, this.h * 0.6);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }
}

function hslToHex(h: number, s = 90, l = 65): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
