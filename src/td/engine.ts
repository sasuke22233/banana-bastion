import {
  BLOON_CLASSES, FLAG_CAMO, FLAG_LEAD, FLAG_REGROW, MOABS, SELL_RATE, START_CASH, START_LIVES,
  TOTAL_ROUNDS, buildGroups, computeStats, getDef, roundIncome,
  type MoabKind, type SpawnGroup, type Stats, type TowerKind,
} from './defs';

export type Phase = 'build' | 'wave' | 'over' | 'win';

export interface UpgradeBtn {
  path: 0 | 1; tier: number; name: string; desc: string; cost: number;
  ok: boolean; reason: string | null;
}

export interface SelectedInfo {
  id: number; def: TowerKind; tierA: number; tierB: number; sell: number; pops: number;
  upgrades: UpgradeBtn[];
}

export interface Snapshot {
  lives: number; cash: number; round: number; total: number;
  phase: Phase; speed: number; paused: boolean; progress: number;
  build: TowerKind | null; pops: number; selected: SelectedInfo | null;
  msg: string | null; msgId: number;
}

interface Callbacks {
  onSnapshot: (s: Snapshot) => void;
}

interface Balloon {
  id: number; dist: number; x: number; y: number;
  layer: number; maxLayer: number;
  hp: number; moab: MoabKind | null;
  camo: boolean; lead: boolean; regrow: boolean; regrowT: number;
  slow: number; slowT: number; flash: number; wob: number;
  dead: boolean;
}

interface Tower {
  id: number; def: TowerKind; x: number; y: number;
  tierA: number; tierB: number; invested: number;
  cd: number; aim: number; recoil: number; stats: Stats; pops: number;
}

interface Proj {
  x: number; y: number; px: number; py: number; vx: number; vy: number; rot: number;
  dmg: number; pierce: number; hit: Set<number>; life: number;
  kind: 'dart' | 'tack' | 'bomb'; canCamo: boolean; canLead: boolean;
  aoe: number; color: string;
}

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Ring { x: number; y: number; r: number; maxR: number; life: number; max: number; color: string; w: number }
interface Float { x: number; y: number; life: number; text: string; color: string; size: number }

const BASE_SPEED = 84;
const PATH: [number, number][] = [
  [-0.05, 0.14], [0.22, 0.14], [0.22, 0.36], [0.05, 0.36], [0.05, 0.60], [0.45, 0.60],
  [0.45, 0.09], [0.63, 0.09], [0.63, 0.44], [0.80, 0.44], [0.80, 0.74], [0.56, 0.74],
  [0.56, 0.93], [1.05, 0.93],
];
const TOP_H = 64;
const DOCK_H = 132;
const TAU = Math.PI * 2;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TDGame {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private w = 0; private h = 0; private dpr = 1;
  private play = { x: 0, y: 0, w: 0, h: 0 };
  private terrain: HTMLCanvasElement;
  private blockers: { x: number; y: number; r: number }[] = [];
  private pts: { x: number; y: number }[] = [];
  private segs: { ax: number; ay: number; bx: number; by: number; len: number; start: number }[] = [];
  private pathLen = 0;
  private pathW = 54;

  private balloons: Balloon[] = [];
  private towers: Tower[] = [];
  private projs: Proj[] = [];
  private parts: Part[] = [];
  private rings: Ring[] = [];
  private floats: Float[] = [];

  private cash = START_CASH;
  private lives = START_LIVES;
  private round = 1;
  private phase: Phase = 'build';
  private speed = 1;
  private paused = false;
  private pops = 0;
  private nextId = 1;
  private towerId = 1;

  private groups: SpawnGroup[] = [];
  private waveTime = 0;
  private spawned = 0;
  private totalUnits = 0;

  private build: TowerKind | null = null;
  private selected: Tower | null = null;
  private pointer = { x: 0, y: 0, inside: false };
  private msg: string | null = null;
  private msgId = 0;
  private msgT = 0;
  private pushT = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement, private cb: Callbacks) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.terrain = document.createElement('canvas');
    this.resize();
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.pushSnapshot();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKey);
  }

  // ------------------------------------------------------------- commands
  setBuild(kind: TowerKind | null) {
    this.build = kind;
    if (kind) this.selected = null;
    this.pushSnapshot();
  }

  setSpeed(n: number) { this.speed = n; this.pushSnapshot(); }
  togglePause() { this.paused = !this.paused; this.pushSnapshot(); }

  startRound() {
    if (this.phase !== 'build') return;
    const { groups, units } = buildGroups(this.round);
    this.groups = groups;
    this.totalUnits = units;
    this.groupCounts.clear();
    this.spawned = 0;
    this.waveTime = 0;
    this.phase = 'wave';
    this.paused = false;
    this.pushSnapshot();
  }

  buyUpgrade(path: 0 | 1) {
    const t = this.selected;
    if (!t) return;
    const def = getDef(t.def);
    const tier = path === 0 ? t.tierA : t.tierB;
    const other = path === 0 ? t.tierB : t.tierA;
    if (tier >= 3) { this.flash('MAXED OUT'); return; }
    if (tier >= 2 && other < 1) { this.flash('PUT 1 POINT IN THE OTHER PATH FIRST'); return; }
    const info = def.paths[path].tiers[tier];
    if (this.cash < info.cost) { this.flash('NOT ENOUGH CASH'); return; }
    this.cash -= info.cost;
    t.invested += info.cost;
    if (path === 0) t.tierA++; else t.tierB++;
    t.stats = computeStats(def, t.tierA, t.tierB);
    this.ring(t.x, t.y, t.stats.range, '#ffffff', 0.4, 2);
    this.pushSnapshot();
  }

  deselect() { this.selected = null; this.pushSnapshot(); }

  sell() {
    const t = this.selected;
    if (!t) return;
    const value = Math.round(t.invested * SELL_RATE);
    this.cash += value;
    this.float(t.x, t.y - 20, `+$${value}`, '#ffe07a', 16);
    this.towers = this.towers.filter(x => x !== t);
    this.selected = null;
    this.pushSnapshot();
  }

  restart() {
    this.balloons = []; this.towers = []; this.projs = []; this.parts = []; this.rings = []; this.floats = [];
    this.cash = START_CASH; this.lives = START_LIVES; this.round = 1;
    this.phase = 'build'; this.speed = 1; this.paused = false; this.pops = 0;
    this.build = null; this.selected = null; this.spawned = 0; this.waveTime = 0;
    this.groups = []; this.totalUnits = 0;
    this.pushSnapshot();
  }

  quit() { this.restart(); }

  // ------------------------------------------------------------- input
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
    this.pointer.inside = true;
  };
  private onLeave = () => { this.pointer.inside = false; };
  private onContext = (e: Event) => { e.preventDefault(); if (this.build) { this.build = null; this.pushSnapshot(); } };
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (this.build) { this.build = null; this.pushSnapshot(); }
      else this.togglePause();
    }
    const onBody = document.activeElement === document.body || document.activeElement === this.canvas;
    if (e.code === 'Space' && this.phase === 'build' && onBody) { e.preventDefault(); this.startRound(); }
  };
  private onDown = (e: PointerEvent) => {
    if (e.button === 2) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.pointer.x = x; this.pointer.y = y;
    if (this.phase === 'over' || this.phase === 'win' || this.paused) return;
    if (this.build) { this.tryPlace(x, y); return; }
    const hit = this.towerAt(x, y);
    this.selected = hit;
    this.pushSnapshot();
  };

  private towerAt(x: number, y: number) {
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      if ((t.x - x) ** 2 + (t.y - y) ** 2 < 24 * 24) return t;
    }
    return null;
  }

  private tryPlace(x: number, y: number) {
    const kind = this.build!;
    const def = getDef(kind);
    if (this.cash < def.cost) { this.flash('NOT ENOUGH CASH'); return; }
    if (!this.canPlace(x, y)) { this.flash('CAN’T BUILD THERE'); return; }
    this.cash -= def.cost;
    const t: Tower = {
      id: this.towerId++, def: kind, x, y, tierA: 0, tierB: 0, invested: def.cost,
      cd: 0, aim: -Math.PI / 2, recoil: 0, stats: computeStats(def, 0, 0), pops: 0,
    };
    this.towers.push(t);
    this.ring(x, y, 44, '#ffffff', 0.4, 2);
    this.selected = t;
    this.build = null;
    this.pushSnapshot();
  }

  private canPlace(x: number, y: number) {
    const r = 20;
    const p = this.play;
    if (x < p.x + r + 6 || x > p.x + p.w - r - 6 || y < p.y + r + 6 || y > p.y + p.h - r - 6) return false;
    for (const b of this.blockers) if ((b.x - x) ** 2 + (b.y - y) ** 2 < (b.r + r) ** 2) return false;
    for (const t of this.towers) if ((t.x - x) ** 2 + (t.y - y) ** 2 < (r + 20) ** 2) return false;
    const half = this.pathW / 2 + r + 4;
    for (const s of this.segs) if (this.pointSeg(x, y, s.ax, s.ay, s.bx, s.by) < half) return false;
    return true;
  }

  private pointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cy = ay + dy * t;
    return Math.hypot(px - cx, py - cy);
  }

  private flash(text: string) { this.msg = text; this.msgId++; this.msgT = 1.5; this.pushSnapshot(); }

  // ------------------------------------------------------------- layout
  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const narrow = this.w < 760;
    this.play = {
      x: 0, y: TOP_H,
      w: this.w, h: this.h - TOP_H - (narrow ? 176 : DOCK_H) - 8,
    };
    this.pathW = Math.max(40, Math.min(62, this.play.w * 0.052));
    this.buildPath();
    this.buildTerrain();
  };

  private buildPath() {
    this.pts = PATH.map(([fx, fy]) => ({ x: this.play.x + fx * this.play.w, y: this.play.y + fy * this.play.h }));
    this.segs = [];
    let start = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      this.segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len, start });
      start += len;
    }
    this.pathLen = start;
    for (const b of this.balloons) b.dist = Math.min(b.dist, this.pathLen);
  }

  private posAt(dist: number) {
    const d = Math.max(0, Math.min(this.pathLen, dist));
    for (const s of this.segs) {
      if (d <= s.start + s.len) {
        const t = (d - s.start) / (s.len || 1);
        return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t };
      }
    }
    const last = this.segs[this.segs.length - 1];
    return { x: last.bx, y: last.by };
  }

  private angleAt(dist: number) {
    const a = this.posAt(Math.max(0, dist - 6));
    const b = this.posAt(Math.min(this.pathLen, dist + 6));
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private buildTerrain() {
    const p = this.play;
    const c = this.terrain;
    c.width = Math.max(1, Math.floor(this.w * this.dpr));
    c.height = Math.max(1, Math.floor(this.h * this.dpr));
    const g = c.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);

    // dark backdrop behind the playfield
    g.fillStyle = '#1b2b3a';
    g.fillRect(0, 0, this.w, this.h);

    // grass
    const grad = g.createLinearGradient(0, p.y, 0, p.y + p.h);
    grad.addColorStop(0, '#79c24d');
    grad.addColorStop(0.55, '#6cb845');
    grad.addColorStop(1, '#5faa3e');
    g.fillStyle = grad;
    this.rr(g, p.x + 8, p.y + 6, p.w - 16, p.h - 6, 18);
    g.fill();

    const rnd = mulberry32(1337);
    g.save();
    this.rr(g, p.x + 8, p.y + 6, p.w - 16, p.h - 6, 18);
    g.clip();

    // grass mottling
    for (let i = 0; i < 190; i++) {
      const x = p.x + rnd() * p.w, y = p.y + rnd() * p.h;
      const r = 12 + rnd() * 46;
      g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,90,30,0.07)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, TAU); g.fill();
    }
    // little grass tufts + flowers
    for (let i = 0; i < 320; i++) {
      const x = p.x + rnd() * p.w, y = p.y + rnd() * p.h;
      if (this.distToPath(x, y) < this.pathW * 0.75) continue;
      if (rnd() > 0.82) {
        g.fillStyle = ['#fff3a8', '#ffd0e6', '#ffffff'][Math.floor(rnd() * 3)];
        g.beginPath(); g.arc(x, y, 2.1, 0, TAU); g.fill();
        g.fillStyle = '#f6b93b'; g.beginPath(); g.arc(x, y, 0.9, 0, TAU); g.fill();
      } else {
        g.strokeStyle = 'rgba(46,120,44,0.5)';
        g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 6); g.moveTo(x, y); g.lineTo(x + 3.4, y - 5.4); g.stroke();
      }
    }

    // ---- path
    const trace = () => {
      g.beginPath();
      g.moveTo(this.pts[0].x, this.pts[0].y);
      for (let i = 1; i < this.pts.length; i++) g.lineTo(this.pts[i].x, this.pts[i].y);
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    trace(); g.strokeStyle = 'rgba(60,44,24,0.45)'; g.lineWidth = this.pathW + 16; g.stroke();
    trace(); g.strokeStyle = '#c9a76a'; g.lineWidth = this.pathW + 8; g.stroke();
    trace(); g.strokeStyle = '#e8d3a6'; g.lineWidth = this.pathW; g.stroke();
    trace(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.setLineDash([14, 18]); g.stroke(); g.setLineDash([]);

    // pebbles on the path
    for (let i = 0; i < 170; i++) {
      const d = rnd() * this.pathLen;
      const pt = this.posAt(d);
      const off = (rnd() - 0.5) * this.pathW * 0.8;
      const ang = this.angleAt(d) + Math.PI / 2;
      const x = pt.x + Math.cos(ang) * off, y = pt.y + Math.sin(ang) * off;
      g.fillStyle = rnd() > 0.5 ? 'rgba(160,128,74,0.5)' : 'rgba(255,247,224,0.55)';
      g.beginPath(); g.ellipse(x, y, 3 + rnd() * 3.5, 2.4 + rnd() * 2, rnd() * 3, 0, TAU); g.fill();
    }

    // entrance / exit markers
    this.entrance(g, this.pts[0].x + 64, this.pts[0].y, '#ff8a5c');
    this.entrance(g, this.pts[this.pts.length - 1].x - 74, this.pts[this.pts.length - 1].y, '#5cc9ff');

    // ---- trees & rocks (placement blockers)
    this.blockers = [];
    for (let i = 0; i < 46; i++) {
      const x = p.x + 30 + rnd() * (p.w - 60);
      const y = p.y + 30 + rnd() * (p.h - 60);
      const r = 26 + rnd() * 10;
      if (this.distToPath(x, y) < this.pathW / 2 + r + 14) continue;
      if (Math.abs(x - this.pts[0].x) < 90 && Math.abs(y - this.pts[0].y) < 70) continue;
      if (rnd() < 0.68) { this.blockers.push({ x, y, r: r * 0.82 }); this.tree(g, x, y, r, rnd); }
      else { this.blockers.push({ x, y, r: r * 0.55 }); this.rock(g, x, y, r * 0.6, rnd); }
    }
    g.restore();

    // frame
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4;
    this.rr(g, p.x + 8, p.y + 6, p.w - 16, p.h - 6, 18); g.stroke();
  }

  private entrance(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(x, y + 26, 34, 11, 0, 0, TAU); g.fill();
    g.fillStyle = color;
    g.fillRect(x - 4, y - 44, 8, 58);
    g.fillStyle = '#8b5a2b'; g.beginPath(); g.arc(x, y + 22, 9, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(x + 2, y - 42); g.lineTo(x + 46, y - 32); g.lineTo(x + 2, y - 20); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.moveTo(x + 6, y - 38); g.lineTo(x + 36, y - 31); g.lineTo(x + 6, y - 26); g.closePath(); g.fill();
    g.restore();
  }

  private tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: () => number) {
    g.save();
    g.fillStyle = 'rgba(20,60,25,0.3)';
    g.beginPath(); g.ellipse(x + 6, y + r * 0.72, r * 0.95, r * 0.34, 0, 0, TAU); g.fill();
    g.fillStyle = '#8a5a34';
    g.fillRect(x - 5, y - 4, 10, r * 0.75);
    g.fillStyle = '#3f9142';
    g.beginPath(); g.arc(x - r * 0.4, y - r * 0.18, r * 0.56, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + r * 0.42, y - r * 0.1, r * 0.5, 0, TAU); g.fill();
    g.fillStyle = '#4fb154';
    g.beginPath(); g.arc(x, y - r * 0.5, r * 0.66, 0, TAU); g.fill();
    g.fillStyle = '#69c96a';
    g.beginPath(); g.arc(x - r * 0.2, y - r * 0.7, r * 0.3, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = rnd() > 0.5 ? '#e0524b' : '#ffd93d';
      const a = rnd() * TAU, d = rnd() * r * 0.55;
      g.beginPath(); g.arc(x + Math.cos(a) * d, y - r * 0.4 + Math.sin(a) * d, 3.4, 0, TAU); g.fill();
    }
    g.restore();
  }

  private rock(g: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: () => number) {
    g.save();
    g.fillStyle = 'rgba(20,60,25,0.28)';
    g.beginPath(); g.ellipse(x + 4, y + r * 0.7, r * 1.05, r * 0.4, 0, 0, TAU); g.fill();
    g.fillStyle = '#98a0a8';
    g.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, rr = r * (0.72 + rnd() * 0.34);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#b8c0c8';
    g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.3, r * 0.4, r * 0.26, -0.4, 0, TAU); g.fill();
    g.restore();
  }

  private distToPath(x: number, y: number) {
    let min = Infinity;
    for (const s of this.segs) min = Math.min(min, this.pointSeg(x, y, s.ax, s.ay, s.bx, s.by));
    return min;
  }

  private rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rad = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }

  // ------------------------------------------------------------- loop
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(0.06, Math.max(0, dt));
    this.time += dt;
    if (!this.paused && this.phase !== 'over' && this.phase !== 'win') this.update(dt * this.speed);
    this.decay(dt);
    this.render();
    this.pushT += dt;
    if (this.pushT >= 0.1) { this.pushT = 0; this.pushSnapshot(); }
  };

  private decay(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
      p.vx *= Math.pow(0.94, dt * 60);
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt; f.y -= 34 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) { this.msg = null; this.pushSnapshot(); }
    }
  }

  private update(dt: number) {
    if (this.phase === 'wave') this.updateWave(dt);
    this.updateBalloons(dt);
    this.updateTowers(dt);
    this.updateProjs(dt);
    if (this.lives <= 0 && this.phase !== 'over') {
      this.lives = 0;
      this.phase = 'over';
      this.pushSnapshot();
    }
  }

  private updateWave(dt: number) {
    this.waveTime += dt;
    for (const g of this.groups) {
      while (g.delay + this.spawnCount(g) * g.spacing <= this.waveTime && this.spawnCount(g) < g.count) {
        this.spawn(g);
        this.setCount(g, this.spawnCount(g) + 1);
      }
    }
    if (this.spawned >= this.totalUnits && this.balloons.length === 0) this.completeRound();
  }

  private groupCounts = new Map<SpawnGroup, number>();
  private spawnCount(g: SpawnGroup) { return this.groupCounts.get(g) ?? 0; }
  private setCount(g: SpawnGroup, v: number) { this.groupCounts.set(g, v); }

  private completeRound() {
    const income = roundIncome(this.round);
    this.cash += income;
    this.float(this.play.w / 2, this.play.y + this.play.h * 0.4, `+ $${income}`, '#ffe07a', 26);
    if (this.round >= TOTAL_ROUNDS) {
      this.phase = 'win';
    } else {
      this.round++;
      this.phase = 'build';
      this.groups = [];
      this.totalUnits = 0;
      this.spawned = 0;
    }
    this.pushSnapshot();
  }

  private spawn(g: SpawnGroup) {
    const flags = g.flags;
    if (typeof g.type === 'string') {
      const def = MOABS[g.type];
      this.balloons.push({
        id: this.nextId++, dist: 0, x: 0, y: 0,
        layer: 0, maxLayer: 0, hp: def.hp, moab: g.type,
        camo: (flags & FLAG_CAMO) > 0, lead: false, regrow: false, regrowT: 0,
        slow: 1, slowT: 0, flash: 0, wob: Math.random() * TAU, dead: false,
      });
    } else {
      this.balloons.push({
        id: this.nextId++, dist: 0, x: 0, y: 0,
        layer: g.type, maxLayer: g.type, hp: g.type, moab: null,
        camo: (flags & FLAG_CAMO) > 0, lead: (flags & FLAG_LEAD) > 0,
        regrow: (flags & FLAG_REGROW) > 0, regrowT: 0,
        slow: 1, slowT: 0, flash: 0, wob: Math.random() * TAU, dead: false,
      });
    }
    this.spawned++;
  }

  private updateBalloons(dt: number) {
    for (const b of this.balloons) {
      if (b.dead) continue;
      if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) b.slow = 1; }
      if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
      if (b.regrow) {
        b.regrowT += dt;
        if (b.regrowT >= 3 && !b.moab && b.layer < b.maxLayer) { b.layer++; b.hp++; b.regrowT = 0; }
      }
      const cls = b.moab ? MOABS[b.moab].speed : BLOON_CLASSES[b.layer - 1].speed;
      const sp = BASE_SPEED * cls * b.slow;
      b.dist += sp * dt;
      b.wob += dt * (5 + cls);
      if (b.dist >= this.pathLen) { this.leak(b); continue; }
      const p = this.posAt(b.dist);
      b.x = p.x; b.y = p.y;
    }
    this.balloons = this.balloons.filter(b => !b.dead);
  }

  private leak(b: Balloon) {
    b.dead = true;
    const cost = b.moab ? MOABS[b.moab].lives : b.layer;
    this.lives -= cost;
    const p = this.posAt(this.pathLen);
    this.float(p.x - 40, p.y - 20, `-${cost} ♥`, '#ff6b6b', 20);
    this.ring(p.x, p.y, 60, '#ff6b6b', 0.35, 3);
    if (this.lives <= 0) { this.lives = 0; this.phase = 'over'; this.pushSnapshot(); }
  }

  // ------------------------------------------------------------- combat
  private canHit(b: Balloon, st: { camo: boolean; lead: boolean }) {
    if (b.camo && !st.camo) return false;
    if (b.lead && !st.lead) return false;
    return true;
  }

  private updateTowers(dt: number) {
    for (const t of this.towers) {
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
      t.cd -= dt;
      const target = this.pickTarget(t);
      if (target) {
        const ang = Math.atan2(target.y - t.y, target.x - t.x);
        let d = ang - t.aim;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        t.aim += d * Math.min(1, dt * 14);
        if (t.cd <= 0) this.fire(t, target);
      } else {
        t.aim += Math.sin(this.time * 0.7 + t.id) * dt * 0.4;
      }
    }
  }

  private pickTarget(t: Tower) {
    const st = t.stats;
    let best: Balloon | null = null;
    for (const b of this.balloons) {
      if (b.dead) continue;
      if (!this.canHit(b, st)) continue;
      const d = Math.hypot(b.x - t.x, b.y - t.y);
      if (d > st.range) continue;
      if (!best || b.dist > best.dist) best = b;
    }
    return best;
  }

  private fire(t: Tower, target: Balloon) {
    const st = t.stats;
    t.cd = st.rate;
    t.recoil = 1;
    const def = getDef(t.def);

    if (t.def === 'ice') {
      this.ring(t.x, t.y, st.range, '#9fe8ff', 0.4, 3);
      for (const b of this.balloons) {
        if (b.dead || !this.canHit(b, st)) continue;
        if (Math.hypot(b.x - t.x, b.y - t.y) > st.range) continue;
        this.damage(b, st.damage, t, st);
        b.slow = Math.min(b.slow, st.slow);
        b.slowT = Math.max(b.slowT, st.slowDur);
      }
      return;
    }

    const base = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.def === 'tack') {
      const n = st.shots;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + this.time;
        this.projs.push(this.mkProj(t, a, 'tack'));
      }
      return;
    }
    for (let i = 0; i < st.shots; i++) {
      const off = st.shots === 1 ? 0 : (i - (st.shots - 1) / 2) * st.spread;
      this.projs.push(this.mkProj(t, base + off, t.def === 'bomb' ? 'bomb' : 'dart'));
    }
    void def;
  }

  private mkProj(t: Tower, ang: number, kind: Proj['kind']): Proj {
    const st = t.stats;
    const speed = st.speed;
    const sx = t.x + Math.cos(ang) * 16, sy = t.y + Math.sin(ang) * 16 - 6;
    return {
      x: sx, y: sy, px: sx, py: sy,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, rot: ang,
      dmg: st.damage, pierce: st.pierce, hit: new Set<number>(),
      life: (st.range * 1.3) / speed, kind,
      canCamo: st.camo, canLead: st.lead, aoe: st.aoe, color: getDef(t.def).color,
    };
  }

  private updateProjs(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let remove = p.life <= 0 || p.x < -40 || p.x > this.w + 40 || p.y < 0 || p.y > this.h;

      if (p.kind === 'bomb') {
        for (const b of this.balloons) {
          if (b.dead) continue;
          if (this.pointSeg(b.x, b.y, p.px, p.py, p.x, p.y) < (b.moab ? 40 : 16)) { remove = true; break; }
        }
        if (remove) { this.explode(p); this.projs.splice(i, 1); }
        continue;
      }

      for (const b of this.balloons) {
        if (b.dead || p.hit.has(b.id)) continue;
        if (!this.canHit(b, { camo: p.canCamo, lead: p.canLead })) continue;
        const rad = b.moab ? 32 : 14;
        if (this.pointSeg(b.x, b.y, p.px, p.py, p.x, p.y) < rad) {
          this.damage(b, p.dmg, null, { camo: p.canCamo, lead: p.canLead });
          p.hit.add(b.id);
          p.pierce--;
          this.burst(p.x, p.y, 3, p.color, 60);
          if (p.pierce <= 0) { remove = true; break; }
        }
      }
      if (remove) this.projs.splice(i, 1);
    }
  }

  private explode(p: Proj) {
    const r = Math.max(30, p.aoe);
    this.ring(p.x, p.y, r, '#ffb347', 0.32, 4);
    this.burst(p.x, p.y, 16, '#ff9f43', 240);
    for (const b of this.balloons) {
      if (b.dead) continue;
      if (!this.canHit(b, { camo: p.canCamo, lead: p.canLead })) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) > r + (b.moab ? 26 : 10)) continue;
      this.damage(b, p.dmg, null, { camo: p.canCamo, lead: true });
    }
  }

  private damage(b: Balloon, dmg: number, tower: Tower | null, st: { camo: boolean; lead: boolean }) {
    if (b.dead || dmg <= 0) return;
    if (!this.canHit(b, st)) return;
    b.flash = 0.12;
    this.pops += dmg;
    if (tower) tower.pops += dmg;

    if (b.moab) {
      b.hp -= dmg;
      if (b.hp <= 0) this.killMoab(b);
      return;
    }

    const leftover = b.layer - dmg;
    if (leftover <= 0) {
      b.dead = true;
      this.cash += 1;
      const cls = BLOON_CLASSES[b.layer - 1];
      this.burst(b.x, b.y, b.lead ? 10 : 7, cls.color, 130);
      return;
    }
    const split = BLOON_CLASSES[b.layer - 1].split;
    if (split > 1) {
      b.dead = true;
      const q = Math.floor(leftover / split);
      let rest = leftover - q * split;
      for (let i = 0; i < split; i++) {
        let layer = q + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
        if (layer < 1) layer = 1;
        this.balloons.push({
          id: this.nextId++, dist: Math.max(0, b.dist - 4 + i * 8), x: b.x, y: b.y,
          layer, maxLayer: b.maxLayer, hp: layer, moab: null,
          camo: b.camo, lead: false, regrow: b.regrow, regrowT: 0,
          slow: b.slow, slowT: b.slowT, flash: 0.1, wob: Math.random() * TAU, dead: false,
        });
      }
      this.burst(b.x, b.y, 9, BLOON_CLASSES[b.layer - 1].color, 150);
      return;
    }
    b.layer = leftover;
    b.hp = leftover;
    if (b.lead && leftover < b.maxLayer) { b.lead = false; this.burst(b.x, b.y, 6, '#c9d2da', 140); }
    this.burst(b.x, b.y, 3, BLOON_CLASSES[leftover - 1].color, 90);
  }

  private killMoab(b: Balloon) {
    b.dead = true;
    const def = MOABS[b.moab!];
    this.cash += def.cash;
    this.burst(b.x, b.y, 34, def.color, 260);
    this.ring(b.x, b.y, 80, def.color, 0.4, 4);
    for (const c of def.children) {
      for (let i = 0; i < c.count; i++) {
        this.balloons.push({
          id: this.nextId++, dist: Math.max(0, b.dist - 10 + i * 9), x: b.x, y: b.y,
          layer: c.layer, maxLayer: c.layer, hp: c.layer, moab: null,
          camo: b.camo, lead: false, regrow: false, regrowT: 0,
          slow: b.slow, slowT: b.slowT, flash: 0.12, wob: Math.random() * TAU, dead: false,
        });
      }
    }
  }

  private burst(x: number, y: number, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (0.35 + Math.random()) * speed;
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.3 + Math.random() * 0.35, max: 0.65, size: 2 + Math.random() * 3.5, color,
      });
    }
    if (this.parts.length > 700) this.parts.splice(0, this.parts.length - 700);
  }

  private ring(x: number, y: number, maxR: number, color: string, life: number, w: number) {
    this.rings.push({ x, y, r: maxR * 0.25, maxR, life, max: life, color, w });
  }

  private float(x: number, y: number, text: string, color: string, size: number) {
    this.floats.push({ x, y, life: 1.3, text, color, size });
  }

  // ------------------------------------------------------------- snapshot
  private pushSnapshot() {
    const t = this.selected;
    let selected: SelectedInfo | null = null;
    if (t) {
      const def = getDef(t.def);
      const upgrades: UpgradeBtn[] = [];
      ([0, 1] as const).forEach(path => {
        const tier = path === 0 ? t.tierA : t.tierB;
        const other = path === 0 ? t.tierB : t.tierA;
        for (let i = tier; i < 3; i++) {
          const info = def.paths[path].tiers[i];
          let reason: string | null = null;
          if (i >= 2 && other < 1) reason = 'Needs 1 point in the other path';
          else if (this.cash < info.cost) reason = 'Not enough cash';
          upgrades.push({
            path, tier: i, name: info.name, desc: info.desc, cost: info.cost,
            ok: reason === null, reason,
          });
        }
      });
      selected = {
        id: t.id, def: t.def, tierA: t.tierA, tierB: t.tierB,
        sell: Math.round(t.invested * SELL_RATE), pops: t.pops, upgrades,
      };
    }
    this.cb.onSnapshot({
      lives: Math.max(0, Math.round(this.lives)),
      cash: Math.floor(this.cash),
      round: this.round, total: TOTAL_ROUNDS,
      phase: this.phase, speed: this.speed, paused: this.paused,
      progress: this.totalUnits > 0 ? Math.min(1, this.spawned / this.totalUnits) : 0,
      build: this.build, pops: this.pops, selected,
      msg: this.msg, msgId: this.msgId,
    });
  }

  // ------------------------------------------------------------- render
  private render() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.drawImage(this.terrain, 0, 0, this.w, this.h);

    for (const t of this.towers) this.drawTower(g, t);
    const sorted = [...this.balloons].sort((a, b) => a.y - b.y);
    for (const b of sorted) this.drawBalloon(g, b);
    for (const p of this.projs) this.drawProj(g, p);

    for (const r of this.rings) {
      const k = r.life / r.max;
      g.globalAlpha = k;
      g.strokeStyle = r.color; g.lineWidth = r.w;
      g.beginPath(); g.arc(r.x, r.y, r.maxR * (1.15 - k * 0.9), 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;

    for (const p of this.parts) {
      const k = Math.max(0, p.life / p.max);
      g.globalAlpha = Math.min(1, k * 1.4);
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + k * 0.8), 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    g.textAlign = 'center';
    for (const f of this.floats) {
      const k = Math.min(1, f.life / 0.5);
      g.globalAlpha = k;
      g.font = `900 ${f.size}px "Lilita One", system-ui, sans-serif`;
      g.lineWidth = 4; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(20,30,20,0.75)';
      g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;

    // selection / ghost range rings
    if (this.selected) this.drawRange(g, this.selected.x, this.selected.y, this.selected.stats.range, '#ffffff');
    if (this.build && this.pointer.inside) {
      const ok = this.canPlace(this.pointer.x, this.pointer.y) && this.cash >= getDef(this.build).cost;
      this.drawRange(g, this.pointer.x, this.pointer.y, getDef(this.build).range, ok ? '#c9f36b' : '#ff6b6b');
      g.globalAlpha = 0.85;
      this.drawTower(g, {
        id: -1, def: this.build, x: this.pointer.x, y: this.pointer.y, tierA: 0, tierB: 0,
        invested: 0, cd: 0, aim: -Math.PI / 2, recoil: 0, pops: 0,
        stats: computeStats(getDef(this.build), 0, 0),
      }, !ok);
      g.globalAlpha = 1;
    }
  }

  private drawRange(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
    g.save();
    g.fillStyle = color === '#ffffff' ? 'rgba(255,255,255,0.08)' : color === '#c9f36b' ? 'rgba(201,243,107,0.16)' : 'rgba(255,107,107,0.16)';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = color; g.lineWidth = 2.2;
    g.setLineDash([9, 9]);
    g.lineDashOffset = -this.time * 24;
    g.stroke();
    g.setLineDash([]);
    g.restore();
  }

  private drawBalloon(g: CanvasRenderingContext2D, b: Balloon) {
    g.save();
    g.translate(b.x, b.y);
    if (b.moab) { this.drawMoab(g, b); g.restore(); return; }

    const cls = BLOON_CLASSES[b.layer - 1];
    const wob = Math.sin(b.wob) * 1.6;
    const scale = 0.86 + b.layer * 0.035;
    const w = 15 * scale, h = 19 * scale;

    g.fillStyle = 'rgba(20,50,25,0.25)';
    g.beginPath(); g.ellipse(3, h * 0.72, w * 0.7, 4, 0, 0, TAU); g.fill();

    g.translate(0, wob * -0.6);
    g.rotate(wob * 0.03);

    const body = () => {
      g.beginPath();
      g.moveTo(0, -h);
      g.bezierCurveTo(w * 0.95, -h * 0.8, w * 1.0, h * 0.25, 0, h * 0.55);
      g.bezierCurveTo(-w * 1.0, h * 0.25, -w * 0.95, -h * 0.8, 0, -h);
      g.closePath();
    };

    let fill: string | CanvasGradient = cls.color;
    if (b.lead) {
      const lg = g.createLinearGradient(-w, -h, w, h);
      lg.addColorStop(0, '#eef2f5'); lg.addColorStop(0.35, '#9aa6b1'); lg.addColorStop(0.6, '#c8d0d8'); lg.addColorStop(1, '#77828d');
      fill = lg;
    } else if (b.layer === 8) {
      const lg = g.createLinearGradient(-w, 0, w, 0);
      lg.addColorStop(0, '#2b2838'); lg.addColorStop(0.25, '#f4f7ff'); lg.addColorStop(0.5, '#2b2838'); lg.addColorStop(0.75, '#f4f7ff'); lg.addColorStop(1, '#2b2838');
      fill = lg;
    } else if (b.layer === 9) {
      const lg = g.createLinearGradient(-w, -h, w, h);
      ['#ff5f6d', '#ffc371', '#f9f871', '#7ce8a0', '#5ec7f5', '#b48cff'].forEach((c, i, arr) => lg.addColorStop(i / (arr.length - 1), c));
      fill = lg;
    } else if (b.layer === 10) {
      const lg = g.createLinearGradient(0, -h, 0, h);
      lg.addColorStop(0, '#e5b57e'); lg.addColorStop(1, '#96602f');
      fill = lg;
    } else {
      const lg = g.createRadialGradient(-w * 0.3, -h * 0.4, 1, 0, 0, h * 1.2);
      lg.addColorStop(0, 'rgba(255,255,255,0.75)');
      lg.addColorStop(0.28, cls.color);
      lg.addColorStop(1, cls.color);
      fill = lg;
    }
    g.fillStyle = fill;
    body(); g.fill();
    g.strokeStyle = 'rgba(30,25,50,0.55)'; g.lineWidth = 1.6; g.stroke();

    // specular highlight
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-w * 0.34, -h * 0.44, w * 0.2, h * 0.22, -0.5, 0, TAU); g.fill();
    // knot
    g.fillStyle = cls.color;
    g.beginPath(); g.moveTo(-3, h * 0.5); g.lineTo(3, h * 0.5); g.lineTo(0, h * 0.78); g.closePath(); g.fill();

    if (b.layer === 10) {
      g.strokeStyle = 'rgba(90,50,20,0.6)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-w * 0.5, -h * 0.35); g.lineTo(-w * 0.1, 0); g.lineTo(-w * 0.35, h * 0.25); g.stroke();
      g.beginPath(); g.moveTo(w * 0.45, -h * 0.2); g.lineTo(w * 0.1, h * 0.1); g.stroke();
    }

    if (b.camo) {
      g.strokeStyle = '#9ef03a'; g.lineWidth = 1.8;
      g.setLineDash([4, 4]); g.lineDashOffset = -this.time * 14;
      body(); g.stroke(); g.setLineDash([]);
    }
    if (b.regrow) {
      g.fillStyle = '#ff7ad9';
      g.beginPath(); g.arc(w * 0.6, -h * 0.5, 3.6, 0, TAU); g.fill();
      g.fillStyle = '#fff';
      g.font = '900 7px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('+', w * 0.6, -h * 0.5 + 0.5);
    }
    if (b.slow < 1) {
      g.fillStyle = 'rgba(170,235,255,0.55)';
      body(); g.fill();
      g.strokeStyle = 'rgba(235,252,255,0.9)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-w * 0.5, -h * 0.6); g.lineTo(-w * 0.1, -h * 0.1); g.lineTo(-w * 0.45, h * 0.2); g.stroke();
    }
    if (b.flash > 0) {
      g.globalAlpha = b.flash / 0.12;
      g.fillStyle = '#ffffff'; body(); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  private drawMoab(g: CanvasRenderingContext2D, b: Balloon) {
    const def = MOABS[b.moab!];
    const ang = this.angleAt(b.dist);
    g.save();
    g.rotate(ang);
    const w = b.moab === 'zomg' ? 86 : b.moab === 'bfb' ? 78 : 72;
    const h = w * 0.52;
    g.fillStyle = 'rgba(20,50,25,0.25)';
    g.beginPath(); g.ellipse(4, h * 0.7, w * 0.45, 6, 0, 0, TAU); g.fill();

    const lg = g.createLinearGradient(0, -h, 0, h);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.2, def.color); lg.addColorStop(1, shade(def.color));
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(25,25,45,0.7)'; g.lineWidth = 2.4; g.stroke();

    // nose + fins
    g.fillStyle = b.moab === 'zomg' ? '#2f3145' : '#e05b4c';
    g.beginPath(); g.ellipse(w / 2 - 8, 0, 11, h / 2 - 2, 0, 0, TAU); g.fill();
    g.fillStyle = '#f4d35e';
    g.fillRect(-w * 0.16, -h / 2 + 4, 9, h - 8);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-w * 0.14, -h * 0.22, w * 0.2, h * 0.14, -0.18, 0, TAU); g.fill();
    g.fillStyle = '#3b3f57';
    g.beginPath(); g.moveTo(-w / 2 + 6, 0); g.lineTo(-w / 2 - 12, -14); g.lineTo(-w / 2 + 4, -16); g.closePath(); g.fill();
    g.restore();

    // hp bar
    const ratio = Math.max(0, b.hp / def.hp);
    const bw = 62, bh = 7;
    g.fillStyle = 'rgba(20,25,40,0.75)';
    this.rr(g, b.x - bw / 2, b.y - h / 2 - 16, bw, bh, 4); g.fill();
    g.fillStyle = ratio > 0.5 ? '#7bed6b' : ratio > 0.25 ? '#ffd93d' : '#ff6b6b';
    this.rr(g, b.x - bw / 2, b.y - h / 2 - 16, bw * ratio, bh, 4); g.fill();
    g.font = '900 11px "Lilita One", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillStyle = '#ffffff';
    g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = 'rgba(20,25,40,0.8)';
    g.strokeText(def.name, b.x, b.y - h / 2 - 19);
    g.fillText(def.name, b.x, b.y - h / 2 - 19);
    g.textBaseline = 'alphabetic';
  }

  private drawProj(g: CanvasRenderingContext2D, p: Proj) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    if (p.kind === 'bomb') {
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath(); g.arc(1, 2, 8, 0, TAU); g.fill();
      g.fillStyle = '#31333d';
      g.beginPath(); g.arc(0, 0, 7.5, 0, TAU); g.fill();
      g.fillStyle = '#5b5f6d';
      g.beginPath(); g.arc(-2, -2, 3, 0, TAU); g.fill();
      g.strokeStyle = '#ffb347'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(4, -5); g.quadraticCurveTo(9, -11, 6, -13); g.stroke();
      g.fillStyle = '#fff2b0';
      g.beginPath(); g.arc(6, -13, 2.2, 0, TAU); g.fill();
    } else if (p.kind === 'tack') {
      g.fillStyle = '#dfe4ea';
      g.beginPath();
      g.moveTo(6, 0); g.lineTo(-3, 3); g.lineTo(-3, -3); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.stroke();
    } else {
      g.fillStyle = '#7a4f28';
      g.fillRect(-7, -1.6, 12, 3.2);
      g.fillStyle = '#e8e3d5';
      g.beginPath(); g.moveTo(5, -3.4); g.lineTo(11, 0); g.lineTo(5, 3.4); g.closePath(); g.fill();
      g.fillStyle = p.color;
      g.beginPath(); g.arc(-7, 0, 2.6, 0, TAU); g.fill();
    }
    g.restore();
  }

  private drawTower(g: CanvasRenderingContext2D, t: Tower, invalid = false) {
    const def = getDef(t.def);
    g.save();
    g.translate(t.x, t.y);

    if (invalid) g.filter = 'none';
    g.fillStyle = 'rgba(15,55,25,0.32)';
    g.beginPath(); g.ellipse(2, 12, 19, 8, 0, 0, TAU); g.fill();

    // wooden platform
    g.fillStyle = '#a4763f';
    g.beginPath(); g.arc(0, 6, 17, 0, TAU); g.fill();
    g.fillStyle = '#c08d4d';
    g.beginPath(); g.arc(0, 4, 17, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(80,50,20,0.5)'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, 4, 17, 0, TAU); g.stroke();

    // weapon behind the head
    g.save();
    g.rotate(t.aim);
    const rec = t.recoil * 3;
    g.translate(-rec, 0);
    if (t.def === 'dart') {
      g.fillStyle = '#6d4a25'; g.fillRect(2, -2.5, 20, 5);
      g.fillStyle = '#f0ead8'; g.beginPath(); g.moveTo(20, -5); g.lineTo(28, 0); g.lineTo(20, 5); g.closePath(); g.fill();
    } else if (t.def === 'bomb') {
      g.fillStyle = '#4a4e59'; g.fillRect(0, -6, 24, 12);
      g.fillStyle = '#6f7482'; g.fillRect(20, -7.5, 7, 15);
      g.fillStyle = '#2c2f38'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    } else if (t.def === 'tack') {
      g.fillStyle = '#cfd6de';
      g.beginPath(); g.arc(4, 0, 13, 0, TAU); g.fill();
      g.strokeStyle = '#8b93a0'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.fillStyle = '#eef2f6';
        g.beginPath();
        g.moveTo(4 + Math.cos(a) * 12, Math.sin(a) * 12);
        g.lineTo(4 + Math.cos(a + 0.2) * 9, Math.sin(a + 0.2) * 9);
        g.lineTo(4 + Math.cos(a - 0.2) * 9, Math.sin(a - 0.2) * 9);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#e8574b'; g.beginPath(); g.arc(4, 0, 4.5, 0, TAU); g.fill();
    } else if (t.def === 'ice') {
      g.fillStyle = '#bfefff'; g.fillRect(0, -2.4, 20, 4.8);
      g.save(); g.translate(24, 0);
      g.fillStyle = '#8fe4ff';
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate((i / 6) * TAU); g.fillRect(-1.6, -9, 3.2, 18); g.restore();
      }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill();
      g.restore();
    } else if (t.def === 'super') {
      g.fillStyle = '#6d4bd0';
      g.beginPath(); g.ellipse(-4, 0, 8, 11, 0, 0, TAU); g.fill();
      g.fillStyle = '#8b62e8';
      g.beginPath(); g.ellipse(6, 0, 5, 8, 0, 0, TAU); g.fill();
    }
    g.restore();

    // ears
    g.fillStyle = '#7d4f26';
    g.beginPath(); g.arc(-12, -4, 6.5, 0, TAU); g.arc(12, -4, 6.5, 0, TAU); g.fill();
    g.fillStyle = '#c58c58';
    g.beginPath(); g.arc(-12, -4, 3.4, 0, TAU); g.arc(12, -4, 3.4, 0, TAU); g.fill();
    // head
    g.fillStyle = '#8a5a2e';
    g.beginPath(); g.arc(0, -6, 12.5, 0, TAU); g.fill();
    g.fillStyle = '#e0b083';
    g.beginPath(); g.ellipse(0, -2, 8.4, 6.6, 0, 0, TAU); g.fill();
    // hat
    g.fillStyle = def.color;
    g.beginPath(); g.arc(0, -8, 12.6, Math.PI, TAU); g.fill();
    g.fillStyle = shade(def.color);
    g.beginPath(); g.ellipse(0, -8, 14.5, 3.4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(-4.5, -14, 5, 2.6, -0.5, 0, TAU); g.fill();
    // eyes follow aim
    const ex = Math.cos(t.aim) * 1.6, ey = Math.sin(t.aim) * 1.2;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(-4, -6.5, 3.4, 0, TAU); g.arc(4, -6.5, 3.4, 0, TAU); g.fill();
    g.fillStyle = '#241b17';
    g.beginPath(); g.arc(-4 + ex, -6.5 + ey, 1.7, 0, TAU); g.arc(4 + ex, -6.5 + ey, 1.7, 0, TAU); g.fill();
    // muzzle smile
    g.strokeStyle = '#7a4a26'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, -3.5, 3.6, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = '#6b4222';
    g.beginPath(); g.ellipse(0, -6.5, 1.8, 1.4, 0, 0, TAU); g.fill();

    if (invalid) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,60,60,0.55)';
      g.beginPath(); g.arc(0, -4, 26, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // tier pips
    const total = t.tierA + t.tierB;
    if (total > 0 && t.id !== -1) {
      for (let i = 0; i < total; i++) {
        const px = t.x - (total - 1) * 4 + i * 8;
        g.fillStyle = i < t.tierA ? '#ffe07a' : '#9be0ff';
        g.beginPath(); g.arc(px, t.y + 22, 2.8, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,30,50,0.6)'; g.lineWidth = 1; g.stroke();
      }
    }
    if (this.selected === t) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.4;
      g.beginPath(); g.arc(t.x, t.y, 22 + Math.sin(this.time * 6) * 1.5, 0, TAU); g.stroke();
    }
  }
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 55);
  const gg = Math.max(0, ((n >> 8) & 255) - 55);
  const b = Math.max(0, (n & 255) - 55);
  return `rgb(${r},${gg},${b})`;
}
