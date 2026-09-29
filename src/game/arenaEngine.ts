import { getHero, type HeroId } from './heroes';

type Team = 0 | 1;
type Rect = { x: number; y: number; w: number; h: number; kind: 'crate' | 'bush' };
type Fighter = {
  id: string; name: string; team: Team; hero: HeroId; x: number; y: number; angle: number;
  hp: number; maxHp: number; alive: boolean; respawn: number; cooldown: number; lastDamage: number;
  super: number; invulnerable: number; bot: boolean; kills: number; scraps: number; dash: number;
};
type Bullet = { x: number; y: number; vx: number; vy: number; life: number; team: Team; owner: string; damage: number; radius: number; color: string };
type Spark = { x: number; y: number; phase: number; born: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string };
type Zone = { x: number; y: number; radius: number; delay: number; life: number; team: Team; owner: string; damage: number; color: string; detonated: boolean };

export interface ArenaSnapshot {
  blue: number;
  red: number;
  timeLeft: number;
  hp: number;
  maxHp: number;
  super: number;
  alive: boolean;
  respawn: number;
  kills: number;
  scraps: number;
  paused: boolean;
}

export interface MatchResult extends ArenaSnapshot {
  winner: 'blue' | 'red' | 'draw';
  coins: number;
  duration: number;
}

interface Callbacks {
  onSnapshot: (snapshot: ArenaSnapshot) => void;
  onFinish: (result: MatchResult) => void;
  onPause: (paused: boolean) => void;
}

const GOAL = 10;
const MATCH_LENGTH = 90;
const TEAM_COLORS = ['#55d9ff', '#ff785d'] as const;
const TEAM_DARK = ['#15728d', '#a43b35'] as const;

export class ArenaEngine {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private snapshotClock = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private unit = 1;
  private arenaTop = 76;
  private arenaBottom = 0;
  private arenaLeft = 14;
  private arenaRight = 0;
  private obstacles: Rect[] = [];
  private fighters: Fighter[] = [];
  private bullets: Bullet[] = [];
  private sparks: Spark[] = [];
  private particles: Particle[] = [];
  private zones: Zone[] = [];
  private blueScore = 0;
  private redScore = 0;
  private timeLeft = MATCH_LENGTH;
  private elapsed = 0;
  private spawnClock = 1;
  private active = false;
  private finished = false;
  paused = false;
  private heroId: HeroId = 'juno';
  private keys = new Set<string>();
  private moveVector = { x: 0, y: 0 };
  private firing = false;
  private mouseAim: { x: number; y: number } | null = null;
  private mousePointer = false;
  private muted = false;
  private audio: AudioContext | null = null;
  private shake = 0;
  private flash = 0;
  private skyTime = 0;

  constructor(private canvas: HTMLCanvasElement, private callbacks: Callbacks) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('pointerup', this.globalPointerUp);
    document.addEventListener('visibilitychange', this.visibilityChange);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerdown', this.pointerDown);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('pointerup', this.globalPointerUp);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    void this.audio?.close();
  }

  start(heroId: HeroId) {
    this.heroId = heroId;
    this.active = true;
    this.finished = false;
    this.paused = false;
    this.blueScore = 0;
    this.redScore = 0;
    this.timeLeft = MATCH_LENGTH;
    this.elapsed = 0;
    this.snapshotClock = 0;
    this.spawnClock = 1;
    this.bullets = [];
    this.sparks = [];
    this.particles = [];
    this.zones = [];
    this.shake = 0;
    this.flash = 0;
    this.keys.clear();
    this.moveVector = { x: 0, y: 0 };
    this.firing = false;
    this.mouseAim = null;
    this.mousePointer = false;
    this.obstacles = this.makeObstacles();
    this.fighters = this.makeFighters();
    for (let i = 0; i < 3; i++) this.spawnSpark(this.width / 2 + (i - 1) * 36 * this.unit, this.centerY + (i % 2 ? 18 : -12) * this.unit);
    this.initAudio();
    this.playTone(390, 0.14, 'triangle', 0.045);
    this.callbacks.onPause(false);
    this.callbacks.onSnapshot(this.getSnapshot());
    this.last = performance.now();
  }

  setPaused(value: boolean) {
    if (!this.active || this.finished || this.paused === value) return;
    this.paused = value;
    if (!value) this.last = performance.now();
    this.callbacks.onPause(value);
  }

  setMoveVector(x: number, y: number) {
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    this.moveVector.x = x;
    this.moveVector.y = y;
  }

  setFiring(value: boolean) {
    this.firing = value;
  }

  useSuper() {
    const player = this.fighters.find(f => f.id === 'player');
    if (!player?.alive || player.super < 100 || this.paused || !this.active) return;
    this.castSuper(player);
  }

  toggleSound() {
    this.muted = !this.muted;
    return this.muted;
  }

  setSoundMuted(value: boolean) { this.muted = value; }

  getSoundMuted() { return this.muted; }

  private get centerY() { return (this.arenaTop + this.arenaBottom) / 2; }

  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.unit = Math.max(0.52, Math.min(1.16, Math.min(this.width, this.height) / 740));
    this.arenaTop = 76 * this.unit;
    this.arenaBottom = this.height - 42 * this.unit;
    this.arenaLeft = 14 * this.unit;
    this.arenaRight = this.width - this.arenaLeft;
    if (this.active && !this.finished) {
      this.obstacles = this.makeObstacles();
      this.fighters.forEach(f => {
        f.x = this.clampX(f.x, this.radius(f));
        f.y = this.clampY(f.y, this.radius(f));
      });
    }
  };

  private get arenaH() { return this.arenaBottom - this.arenaTop; }

  private makeObstacles(): Rect[] {
    const u = this.unit;
    const block = (x: number, y: number, w: number, h: number, kind: Rect['kind'] = 'crate'): Rect => ({ x, y, w, h, kind });
    const cY = this.centerY;
    const items = [
      block(this.width * 0.31 - 40 * u, this.arenaTop + this.arenaH * 0.27, 80 * u, 31 * u),
      block(this.width * 0.69 - 40 * u, this.arenaTop + this.arenaH * 0.27, 80 * u, 31 * u),
      block(this.width * 0.31 - 40 * u, this.arenaTop + this.arenaH * 0.68, 80 * u, 31 * u),
      block(this.width * 0.69 - 40 * u, this.arenaTop + this.arenaH * 0.68, 80 * u, 31 * u),
      block(this.width * 0.5 - 22 * u, cY - 22 * u, 44 * u, 44 * u),
      block(this.width * 0.17 - 29 * u, this.arenaTop + this.arenaH * 0.5 - 30 * u, 58 * u, 27 * u, 'bush'),
      block(this.width * 0.83 - 29 * u, this.arenaTop + this.arenaH * 0.5 + 10 * u, 58 * u, 27 * u, 'bush'),
    ];
    // Give portrait screens wider lanes around the center objective.
    if (this.width < this.height * 0.72) {
      items.splice(4, 1, block(this.width * 0.5 - 18 * u, cY - 18 * u, 36 * u, 36 * u));
    }
    return items;
  }

  private makeFighters(): Fighter[] {
    const y = this.centerY;
    const make = (id: string, name: string, team: Team, hero: HeroId, x: number, fy: number, bot: boolean): Fighter => {
      const data = getHero(hero);
      return {
        id, name, team, hero, x, y: fy, angle: team === 0 ? 0 : Math.PI,
        hp: data.hp, maxHp: data.hp, alive: true, respawn: 0, cooldown: Math.random() * 0.25,
        lastDamage: -10, super: bot ? 8 : 0, invulnerable: 1.2, bot, kills: 0, scraps: 0, dash: 0,
      };
    };
    return [
      make('player', 'YOU', 0, this.heroId, this.width * 0.14, y, false),
      make('blue-a', 'MICA', 0, this.heroId === 'brix' ? 'juno' : 'brix', this.width * 0.21, y - 70 * this.unit, true),
      make('blue-b', 'PIP', 0, this.heroId === 'glitch' ? 'juno' : 'glitch', this.width * 0.21, y + 70 * this.unit, true),
      make('red-a', 'CRUMB', 1, 'brix', this.width * 0.86, y, true),
      make('red-b', 'ZAP', 1, 'glitch', this.width * 0.79, y - 72 * this.unit, true),
      make('red-c', 'DOT', 1, 'juno', this.width * 0.79, y + 72 * this.unit, true),
    ];
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(0.05, Math.max(0, dt));
    this.skyTime += dt;
    if (this.active && !this.paused && !this.finished) this.update(dt);
    this.draw();
  };

  private update(dt: number) {
    this.elapsed += dt;
    this.timeLeft = Math.max(0, MATCH_LENGTH - this.elapsed);
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && this.sparks.length < 7) {
      this.spawnClock = 3.9 + Math.random() * 1.2;
      this.spawnSpark(this.width * (0.43 + Math.random() * 0.14), this.centerY + (Math.random() - 0.5) * 100 * this.unit);
    }
    this.updateFighters(dt);
    this.updateBullets(dt);
    this.updateSparks(dt);
    this.updateZones(dt);
    this.updateParticles(dt);
    this.shake *= Math.exp(-dt * 8);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.snapshotClock += dt;
    if (this.snapshotClock >= 0.12) {
      this.snapshotClock = 0;
      this.callbacks.onSnapshot(this.getSnapshot());
    }
    if (this.blueScore >= GOAL || this.redScore >= GOAL || this.timeLeft <= 0) this.finish();
  }

  private updateFighters(dt: number) {
    const player = this.fighters[0];
    for (const f of this.fighters) {
      if (!f.alive) {
        f.respawn -= dt;
        if (f.respawn <= 0) this.respawn(f);
        continue;
      }
      f.cooldown = Math.max(0, f.cooldown - dt);
      f.invulnerable = Math.max(0, f.invulnerable - dt);
      f.dash = Math.max(0, f.dash - dt);
      if (f.hp < f.maxHp && this.elapsed - f.lastDamage > 2.4) f.hp = Math.min(f.maxHp, f.hp + dt * 12);

      const hero = getHero(f.hero);
      let dx = 0, dy = 0;
      let target: Fighter | null = null;
      let aimPoint: { x: number; y: number } | null = null;

      if (f.id === 'player') {
        const keyX = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
        const keyY = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
        const moveX = this.moveVector.x || keyX;
        const moveY = this.moveVector.y || keyY;
        const len = Math.hypot(moveX, moveY) || 1;
        dx = moveX / len;
        dy = moveY / len;
        target = this.nearestEnemy(f);
        if (this.mouseAim && this.mousePointer) aimPoint = this.mouseAim;
        else if (target) aimPoint = target;
        if (aimPoint) f.angle = Math.atan2(aimPoint.y - f.y, aimPoint.x - f.x);
        if ((this.firing || this.keys.has('Space')) && f.cooldown <= 0) this.fire(f);
      } else {
        target = this.nearestEnemy(f);
        const spark = this.nearestSpark(f);
        const combatRange = hero.range * this.unit * (f.hero === 'brix' ? 0.65 : 0.78);
        if (target) {
          aimPoint = target;
          const vx = target.x - f.x, vy = target.y - f.y, dist = Math.hypot(vx, vy) || 1;
          f.angle = Math.atan2(vy, vx);
          if (dist > combatRange * 0.88) { dx = vx / dist; dy = vy / dist; }
          else if (dist < combatRange * 0.43) { dx = -vx / dist * 0.72; dy = -vy / dist * 0.72; }
          else {
            const side = Math.sin(this.elapsed * 1.3 + f.x * 0.01) > 0 ? 1 : -1;
            dx = (-vy / dist) * 0.48 * side;
            dy = (vx / dist) * 0.48 * side;
          }
          const clear = this.hasLineOfSight(f.x, f.y, target.x, target.y);
          if (dist < hero.range * this.unit && clear && f.cooldown <= 0) this.fire(f);
          if (f.super >= 100 && dist < (f.hero === 'glitch' ? hero.range * this.unit : 230 * this.unit)) this.castSuper(f, target);
        } else if (spark) {
          const vx = spark.x - f.x, vy = spark.y - f.y, dist = Math.hypot(vx, vy) || 1;
          dx = vx / dist; dy = vy / dist;
        }
      }

      const speed = hero.speed * this.unit * (f.dash > 0 ? 2.55 : 1);
      if (dx !== 0 || dy !== 0) {
        const norm = Math.hypot(dx, dy) || 1;
        this.moveFighter(f, (dx / norm) * speed * dt, (dy / norm) * speed * dt);
      }
      if (f.dash > 0 && Math.random() < 0.85) this.addParticle(f.x, f.y, (Math.random() - 0.5) * 45, (Math.random() - 0.5) * 45, 0.35, getHero(f.hero).color, 4 * this.unit);
    }
    // A player who is not aiming manually automatically tracks the closest rival.
    if (player?.alive && !this.mousePointer) {
      const target = this.nearestEnemy(player);
      if (target) player.angle = Math.atan2(target.y - player.y, target.x - player.x);
    }
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.x > this.width || b.y < this.arenaTop - 30 || b.y > this.arenaBottom + 20 || this.pointBlocked(b.x, b.y)) {
        if (b.life <= 0 || this.pointBlocked(b.x, b.y)) this.addParticle(b.x, b.y, 0, 0, 0.16, b.color, 3 * this.unit);
        this.bullets.splice(i, 1);
        continue;
      }
      let hit = false;
      for (const f of this.fighters) {
        if (!f.alive || f.team === b.team || f.invulnerable > 0) continue;
        const r = this.radius(f) + b.radius;
        if ((f.x - b.x) ** 2 + (f.y - b.y) ** 2 < r * r) {
          this.damage(f, b.damage, b.owner, b.vx, b.vy);
          this.addParticle(b.x, b.y, 0, 0, 0.24, b.color, 6 * this.unit);
          hit = true;
          break;
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }
  }

  private updateSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.phase += dt * 3;
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const r = 20 * this.unit + this.radius(f);
        if ((f.x - s.x) ** 2 + (f.y - s.y) ** 2 < r * r) {
          if (f.team === 0) this.blueScore++; else this.redScore++;
          f.scraps++;
          this.sparks.splice(i, 1);
          this.burst(s.x, s.y, '#baff5a', 10);
          if (f.id === 'player') this.playTone(820 + this.blueScore * 28, 0.11, 'sine', 0.06);
          break;
        }
      }
    }
  }

  private updateZones(dt: number) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.delay > 0) {
        z.delay -= dt;
        if (z.delay <= 0 && !z.detonated) {
          z.detonated = true;
          this.shake = Math.max(this.shake, 7 * this.unit);
          this.flash = 0.18;
          this.burst(z.x, z.y, z.color, 28);
          for (const f of this.fighters) {
            if (!f.alive || f.team === z.team) continue;
            const dist = Math.hypot(f.x - z.x, f.y - z.y);
            if (dist < z.radius + this.radius(f)) this.damage(f, z.damage, z.owner, f.x - z.x, f.y - z.y);
          }
          if (z.owner === 'player') this.playTone(170, 0.25, 'sawtooth', 0.055, 70);
        }
      } else {
        z.life -= dt;
        if (z.life <= 0) this.zones.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.94, dt * 60);
      p.vy *= Math.pow(0.94, dt * 60);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private fire(f: Fighter) {
    const hero = getHero(f.hero);
    f.cooldown = hero.fireRate;
    const spread = hero.spread;
    const start = -(hero.shots - 1) / 2;
    for (let i = 0; i < hero.shots; i++) {
      const angle = f.angle + (start + i) * spread / Math.max(1, hero.shots - 1);
      const origin = this.radius(f) + 5 * this.unit;
      const speed = hero.shotSpeed * this.unit;
      this.bullets.push({
        x: f.x + Math.cos(angle) * origin, y: f.y + Math.sin(angle) * origin,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: hero.range * this.unit / speed + 0.18, team: f.team, owner: f.id,
        damage: hero.damage, radius: (f.hero === 'brix' ? 5 : 4) * this.unit, color: hero.accent,
      });
    }
    if (f.id === 'player') this.playTone(f.hero === 'brix' ? 210 : f.hero === 'glitch' ? 680 : 420, 0.06, 'square', 0.018, 120);
  }

  private castSuper(f: Fighter, target?: Fighter | null) {
    if (f.super < 100) return;
    f.super = 0;
    const hero = getHero(f.hero);
    const enemies = this.fighters.filter(other => other.alive && other.team !== f.team);
    const damageAround = (x: number, y: number, radius: number, damage: number) => {
      for (const enemy of enemies) {
        const dx = enemy.x - x, dy = enemy.y - y, dist = Math.hypot(dx, dy);
        if (dist < radius + this.radius(enemy)) this.damage(enemy, damage, f.id, dx, dy, 440 * this.unit);
      }
      this.burst(x, y, hero.color, 30);
      this.shake = Math.max(this.shake, 8 * this.unit);
    };

    if (f.hero === 'juno') {
      const oldX = f.x, oldY = f.y;
      const dashLength = 175 * this.unit;
      this.moveFighter(f, Math.cos(f.angle) * dashLength, Math.sin(f.angle) * dashLength);
      f.dash = 0.42;
      damageAround(f.x, f.y, 76 * this.unit, 40);
      this.ringEffect(oldX, oldY, 30 * this.unit, hero.color);
    } else if (f.hero === 'brix') {
      damageAround(f.x, f.y, 148 * this.unit, 46);
      this.ringEffect(f.x, f.y, 150 * this.unit, hero.color);
    } else {
      let x = target?.x ?? f.x + Math.cos(f.angle) * 220 * this.unit;
      let y = target?.y ?? f.y + Math.sin(f.angle) * 220 * this.unit;
      const dx = x - f.x, dy = y - f.y, dist = Math.hypot(dx, dy);
      if (dist > hero.range * this.unit) {
        const factor = hero.range * this.unit / dist;
        x = f.x + dx * factor; y = f.y + dy * factor;
      }
      this.zones.push({ x, y, radius: 108 * this.unit, delay: 0.5, life: 0.34, team: f.team, owner: f.id, damage: 52, color: hero.color, detonated: false });
    }
    if (f.id === 'player') this.playTone(220, 0.5, 'triangle', 0.08, 880);
  }

  private damage(target: Fighter, amount: number, ownerId: string, knockX: number, knockY: number, knock = 90 * this.unit) {
    if (!target.alive) return;
    target.hp -= amount;
    target.lastDamage = this.elapsed;
    const owner = this.fighters.find(f => f.id === ownerId);
    if (owner) owner.super = Math.min(100, owner.super + amount * 0.42);
    if (target.id === 'player') this.flash = Math.max(this.flash, 0.2);
    const dist = Math.hypot(knockX, knockY) || 1;
    this.moveFighter(target, (knockX / dist) * knock * 0.12, (knockY / dist) * knock * 0.12);
    if (target.hp > 0) {
      if (Math.random() < 0.48) this.addParticle(target.x, target.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.25, getHero(target.hero).accent, 3 * this.unit);
      return;
    }
    target.hp = 0;
    target.alive = false;
    target.respawn = 2.3;
    target.super = Math.max(0, target.super - 25);
    this.burst(target.x, target.y, getHero(target.hero).color, 24);
    this.ringEffect(target.x, target.y, 42 * this.unit, TEAM_COLORS[target.team]);
    for (let i = 0; i < 2; i++) this.spawnSpark(target.x + (Math.random() - 0.5) * 28 * this.unit, target.y + (Math.random() - 0.5) * 28 * this.unit);
    if (owner) owner.kills++;
    if (ownerId === 'player') this.playTone(130, 0.22, 'sawtooth', 0.035, 48);
    this.shake = Math.max(this.shake, 3.5 * this.unit);
  }

  private respawn(f: Fighter) {
    f.alive = true;
    f.hp = f.maxHp;
    f.respawn = 0;
    f.invulnerable = 1.25;
    const blue = f.team === 0;
    const index = this.fighters.filter(other => other.team === f.team).indexOf(f);
    f.x = blue ? this.width * (index === 0 ? 0.14 : 0.21) : this.width * (index === 0 ? 0.86 : 0.79);
    f.y = this.centerY + (index - 1) * 70 * this.unit;
    f.super = Math.max(0, f.super - 10);
    f.lastDamage = this.elapsed;
    this.ringEffect(f.x, f.y, 38 * this.unit, TEAM_COLORS[f.team]);
  }

  private spawnSpark(x: number, y: number) {
    const pad = 30 * this.unit;
    this.sparks.push({
      x: Math.max(this.arenaLeft + pad, Math.min(this.arenaRight - pad, x)),
      y: Math.max(this.arenaTop + pad, Math.min(this.arenaBottom - pad, y)),
      phase: Math.random() * Math.PI * 2, born: this.elapsed,
    });
  }

  private nearestEnemy(f: Fighter) {
    let best: Fighter | null = null, bestDist = Infinity;
    for (const other of this.fighters) {
      if (!other.alive || other.team === f.team) continue;
      const dist = (other.x - f.x) ** 2 + (other.y - f.y) ** 2;
      if (dist < bestDist) { bestDist = dist; best = other; }
    }
    return best;
  }

  private nearestSpark(f: Fighter) {
    let best: Spark | null = null, bestDist = Infinity;
    for (const spark of this.sparks) {
      const dist = (spark.x - f.x) ** 2 + (spark.y - f.y) ** 2;
      if (dist < bestDist) { bestDist = dist; best = spark; }
    }
    return best;
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number) {
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.pointBlocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  private pointBlocked(x: number, y: number) {
    return this.obstacles.some(r => r.kind === 'crate' && x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2);
  }

  private moveFighter(f: Fighter, dx: number, dy: number) {
    const r = this.radius(f);
    const x = this.clampX(f.x + dx, r);
    if (!this.circleBlocked(x, f.y, r)) f.x = x;
    const y = this.clampY(f.y + dy, r);
    if (!this.circleBlocked(f.x, y, r)) f.y = y;
  }

  private circleBlocked(x: number, y: number, radius: number) {
    for (const rect of this.obstacles) {
      if (rect.kind !== 'crate') continue;
      const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
      const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
      if ((x - cx) ** 2 + (y - cy) ** 2 < radius * radius) return true;
    }
    return false;
  }

  private clampX(x: number, r: number) { return Math.max(this.arenaLeft + r, Math.min(this.arenaRight - r, x)); }
  private clampY(y: number, r: number) { return Math.max(this.arenaTop + r, Math.min(this.arenaBottom - r, y)); }
  private radius(f: Fighter) { return (f.hero === 'brix' ? 19 : 16) * this.unit; }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    const winner = this.blueScore > this.redScore ? 'blue' : this.redScore > this.blueScore ? 'red' : 'draw';
    const won = winner === 'blue';
    const snapshot = this.getSnapshot();
    const coins = Math.max(8, (won ? 24 : 12) + snapshot.scraps * 2 + snapshot.kills * 3);
    this.callbacks.onFinish({ ...snapshot, winner, coins, duration: this.elapsed });
    this.playTone(won ? 560 : 170, 0.5, 'triangle', 0.06, won ? 920 : 62);
  }

  private getSnapshot(): ArenaSnapshot {
    const player = this.fighters.find(f => f.id === 'player');
    return {
      blue: this.blueScore, red: this.redScore, timeLeft: this.timeLeft,
      hp: player?.hp ?? 0, maxHp: player?.maxHp ?? 100,
      super: player?.super ?? 0, alive: player?.alive ?? true,
      respawn: player?.respawn ?? 0, kills: player?.kills ?? 0,
      scraps: player?.scraps ?? 0, paused: this.paused,
    };
  }

  private initAudio() {
    if (this.audio) {
      if (this.audio.state === 'suspended') void this.audio.resume();
      return;
    }
    try {
      const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Constructor) this.audio = new Constructor();
    } catch { this.audio = null; }
  }

  private playTone(freq: number, duration: number, type: OscillatorType, volume: number, endFreq?: number) {
    if (this.muted || !this.audio) return;
    const now = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain); gain.connect(this.audio.destination);
    osc.start(now); osc.stop(now + duration + 0.01);
  }

  private burst(x: number, y: number, color: string, amount: number) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (35 + Math.random() * 180) * this.unit;
      this.addParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0.28 + Math.random() * 0.35, color, (2 + Math.random() * 4) * this.unit);
    }
    if (this.particles.length > 520) this.particles.splice(0, this.particles.length - 520);
  }

  private addParticle(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number) {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  private ringEffect(x: number, y: number, radius: number, color: string) {
    this.zones.push({ x, y, radius, delay: 0, life: 0.34, team: 0, owner: '', damage: 0, color, detonated: true });
  }

  private keyDown = (event: KeyboardEvent) => {
    if (!this.active || this.finished) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.setPaused(!this.paused);
      return;
    }
    if (this.paused) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if ((event.code === 'KeyE' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') && !event.repeat) this.useSuper();
  };

  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private pointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = this.canvas.getBoundingClientRect();
    this.mouseAim = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    this.mousePointer = true;
  };

  private pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !this.active || this.paused) return;
    this.pointerMove(event);
    this.firing = true;
  };

  private globalPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.firing = false;
  };

  private visibilityChange = () => {
    if (document.hidden && this.active && !this.finished) this.setPaused(true);
  };

  // --------------------------------------------------------------- drawing
  private draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0 && this.active) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawGround();
    this.drawObstacles();
    this.drawZones();
    this.drawSparks();
    this.drawBulletsOnCanvas();
    this.drawFighters();
    this.drawParticlesOnCanvas();
    ctx.restore();
    if (this.flash > 0 && this.active) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawGround() {
    const ctx = this.ctx, u = this.unit;
    const bg = ctx.createLinearGradient(0, 0, this.width, this.height);
    bg.addColorStop(0, '#162037'); bg.addColorStop(1, '#221b3b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.width, this.height);

    const x = this.arenaLeft, y = this.arenaTop, w = this.arenaRight - this.arenaLeft, h = this.arenaH;
    this.roundRect(ctx, x, y, w, h, 17 * u);
    const floor = ctx.createLinearGradient(0, y, 0, y + h);
    floor.addColorStop(0, '#344f45'); floor.addColorStop(1, '#27443d');
    ctx.fillStyle = floor; ctx.fill();
    ctx.save();
    this.roundRect(ctx, x, y, w, h, 17 * u); ctx.clip();
    // Soft alternating field panels keep the floor readable without fighting the action.
    const stripeW = Math.max(42 * u, w / 14);
    for (let i = 0; i < Math.ceil(w / stripeW); i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(197,235,129,0.028)' : 'rgba(9,21,28,0.06)';
      ctx.fillRect(x + i * stripeW, y, stripeW, h);
    }
    ctx.strokeStyle = 'rgba(219,247,181,0.11)';
    ctx.lineWidth = 1.3 * u;
    ctx.setLineDash([5 * u, 9 * u]);
    ctx.beginPath(); ctx.moveTo(this.width / 2, y + 12 * u); ctx.lineTo(this.width / 2, y + h - 12 * u); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(this.width / 2, this.centerY, 68 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(this.width / 2, this.centerY, 3 * u, 0, Math.PI * 2); ctx.fillStyle = 'rgba(230,255,190,0.3)'; ctx.fill();
    // Side lanes.
    ctx.fillStyle = 'rgba(12,26,32,0.08)';
    ctx.fillRect(x, y + h * 0.44, w, h * 0.12);
    ctx.restore();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = 'rgba(230,255,190,0.28)';
    this.roundRect(ctx, x, y, w, h, 17 * u); ctx.stroke();

    // Stadium bulbs around the playfield.
    const bulbs = Math.max(8, Math.floor(w / (52 * u)));
    for (let i = 0; i < bulbs; i++) {
      const bx = x + 18 * u + i * (w - 36 * u) / Math.max(1, bulbs - 1);
      ctx.fillStyle = `rgba(215,247,154,${0.2 + Math.sin(this.skyTime * 2 + i) * 0.08})`;
      ctx.beginPath(); ctx.arc(bx, y + 5 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, y + h - 5 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawObstacles() {
    const ctx = this.ctx, u = this.unit;
    for (const r of this.obstacles) {
      if (r.kind === 'bush') {
        ctx.fillStyle = 'rgba(10,31,28,0.35)';
        this.roundRect(ctx, r.x, r.y + 4 * u, r.w, r.h, 13 * u); ctx.fill();
        const leaves = 5;
        for (let i = 0; i < leaves; i++) {
          const lx = r.x + 9 * u + i * (r.w - 18 * u) / (leaves - 1);
          ctx.fillStyle = i % 2 ? '#638b4e' : '#79a956';
          ctx.beginPath(); ctx.ellipse(lx, r.y + r.h * 0.52 + (i % 2) * 3 * u, 12 * u, 10 * u, -0.25, 0, Math.PI * 2); ctx.fill();
        }
        continue;
      }
      ctx.fillStyle = 'rgba(3,10,14,0.3)';
      this.roundRect(ctx, r.x, r.y + 6 * u, r.w, r.h, 7 * u); ctx.fill();
      ctx.fillStyle = '#635e58';
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 7 * u); ctx.fill();
      ctx.fillStyle = '#82786a';
      this.roundRect(ctx, r.x + 2 * u, r.y + 1 * u, r.w - 4 * u, Math.max(7 * u, r.h * 0.32), 5 * u); ctx.fill();
      ctx.strokeStyle = 'rgba(18,27,31,0.55)'; ctx.lineWidth = 1.2 * u;
      this.roundRect(ctx, r.x, r.y, r.w, r.h, 7 * u); ctx.stroke();
      for (const boltX of [r.x + 7 * u, r.x + r.w - 7 * u]) {
        ctx.fillStyle = '#3d4543';
        ctx.beginPath(); ctx.arc(boltX, r.y + r.h / 2, 2 * u, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,227,171,0.12)';
      ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.28, r.y + 3 * u); ctx.lineTo(r.x + r.w * 0.38, r.y + r.h - 4 * u); ctx.stroke();
    }
  }

  private drawZones() {
    const ctx = this.ctx;
    for (const z of this.zones) {
      const telegraph = z.delay > 0;
      const p = telegraph ? 0.5 + 0.5 * Math.sin(this.skyTime * 19) : 1 - z.life / 0.34;
      const r = telegraph ? z.radius * (0.82 + 0.18 * p) : z.radius * (0.6 + p * 0.5);
      ctx.save();
      ctx.globalAlpha = telegraph ? 0.5 + p * 0.28 : Math.max(0, z.life / 0.34);
      ctx.fillStyle = z.color;
      ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= 0.35;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * this.unit; ctx.stroke();
      ctx.restore();
    }
  }

  private drawSparks() {
    const ctx = this.ctx, u = this.unit;
    for (const spark of this.sparks) {
      const bob = Math.sin(spark.phase) * 3 * u;
      const pulse = 1 + Math.sin(spark.phase * 1.4) * 0.1;
      ctx.save(); ctx.translate(spark.x, spark.y + bob); ctx.scale(pulse, pulse);
      ctx.shadowColor = '#c4ff6e'; ctx.shadowBlur = 15 * u;
      ctx.fillStyle = '#c4ff6e';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 4;
        const rr = i % 2 === 0 ? 9 * u : 4.2 * u;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#f7ffd9'; ctx.beginPath(); ctx.arc(-1.5 * u, -2 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawBulletsOnCanvas() {
    const ctx = this.ctx, u = this.unit;
    for (const b of this.bullets) {
      ctx.save();
      ctx.strokeStyle = b.color; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'round';
      ctx.shadowColor = b.color; ctx.shadowBlur = 9 * u;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#fff7e5'; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  private drawFighters() {
    const ctx = this.ctx;
    for (const f of this.fighters) {
      if (!f.alive) {
        if (f.respawn < 1.6) {
          ctx.save(); ctx.globalAlpha = 0.28;
          ctx.fillStyle = TEAM_COLORS[f.team]; ctx.font = '900 18px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(`${f.name} ${f.respawn.toFixed(0)}`, f.x, f.y); ctx.restore();
        }
        continue;
      }
      this.drawFighter(f);
    }
  }

  private drawFighter(f: Fighter) {
    const ctx = this.ctx, u = this.unit, r = this.radius(f), hero = getHero(f.hero);
    const blink = f.invulnerable > 0 && Math.floor(this.skyTime * 14) % 2 === 0;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.globalAlpha = blink ? 0.42 : 1;
    // Feet and team marker.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.76, r * 1.12, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = TEAM_COLORS[f.team];
    ctx.globalAlpha *= f.id === 'player' ? 0.65 : 0.38;
    ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 1.2, r * 0.47, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = blink ? 0.42 : 1;
    if (f.id === 'player') {
      ctx.strokeStyle = 'rgba(229,255,190,0.78)'; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(0, 0, r + 7 * u, 0, Math.PI * 2); ctx.stroke();
    }
    // Backpack.
    ctx.fillStyle = TEAM_DARK[f.team];
    this.roundRect(ctx, -r * 0.9, -r * 0.45, r * 0.63, r * 1.03, r * 0.22); ctx.fill();
    // Arms.
    ctx.fillStyle = hero.accent;
    ctx.beginPath(); ctx.arc(-r * 0.77, r * 0.22, r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.75, r * 0.2, r * 0.38, 0, Math.PI * 2); ctx.fill();
    // Body silhouette.
    ctx.fillStyle = '#17202a';
    ctx.beginPath(); ctx.ellipse(0, r * 0.14, r * 0.96, r * 0.97, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hero.color;
    ctx.beginPath(); ctx.ellipse(0, r * 0.08, r * 0.81, r * 0.83, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#17202a'; ctx.lineWidth = 2.2 * u; ctx.stroke();
    // Headgear by class.
    if (f.hero === 'juno') {
      ctx.fillStyle = hero.accent;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.46, r * 0.73, r * 0.44, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2d2';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.47, r * 0.43, r * 0.14, 0, Math.PI, Math.PI * 2); ctx.fill();
    } else if (f.hero === 'brix') {
      ctx.fillStyle = '#6d4038';
      this.roundRect(ctx, -r * 0.78, -r * 0.75, r * 1.56, r * 0.56, r * 0.18); ctx.fill();
      ctx.fillStyle = '#f5c267';
      this.roundRect(ctx, -r * 0.54, -r * 0.58, r * 1.08, r * 0.14, r * 0.05); ctx.fill();
    } else {
      ctx.fillStyle = '#6550b8';
      ctx.beginPath(); ctx.moveTo(-r * 0.72, -r * 0.12); ctx.lineTo(-r * 0.88, -r * 0.73); ctx.lineTo(-r * 0.25, -r * 0.51); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.72, -r * 0.12); ctx.lineTo(r * 0.88, -r * 0.73); ctx.lineTo(r * 0.25, -r * 0.51); ctx.closePath(); ctx.fill();
    }
    // Face and direction-facing pupils.
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath(); ctx.ellipse(-r * 0.23, -r * 0.08, r * 0.13, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.23, -r * 0.08, r * 0.13, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#17202a';
    ctx.beginPath(); ctx.arc(-r * 0.2 + Math.cos(f.angle) * r * 0.055, -r * 0.06 + Math.sin(f.angle) * r * 0.055, r * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.26 + Math.cos(f.angle) * r * 0.055, -r * 0.06 + Math.sin(f.angle) * r * 0.055, r * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#723f3c'; ctx.lineWidth = 1.1 * u;
    ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.15, 0.1, Math.PI - 0.1); ctx.stroke();
    // Weapon barrel.
    ctx.save(); ctx.rotate(f.angle);
    ctx.fillStyle = '#17202a';
    this.roundRect(ctx, r * 0.45, -r * 0.2, r * 0.78, r * 0.4, r * 0.12); ctx.fill();
    ctx.fillStyle = hero.accent;
    this.roundRect(ctx, r * 0.84, -r * 0.12, r * 0.38, r * 0.24, r * 0.08); ctx.fill();
    ctx.restore();
    ctx.restore();

    // Name and compact health bar.
    const barW = 37 * u, barY = f.y - r - 15 * u;
    ctx.fillStyle = 'rgba(14,19,31,0.78)';
    this.roundRect(ctx, f.x - barW / 2, barY, barW, 5 * u, 3 * u); ctx.fill();
    ctx.fillStyle = f.hp / f.maxHp < 0.3 ? '#ff6c5c' : '#b7ed5c';
    this.roundRect(ctx, f.x - barW / 2, barY, barW * Math.max(0, f.hp / f.maxHp), 5 * u, 3 * u); ctx.fill();
    ctx.font = `800 ${9 * u}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = f.id === 'player' ? '#efffbf' : 'rgba(255,248,231,0.86)';
    ctx.fillText(f.name, f.x, barY - 2 * u);
  }

  private drawParticlesOnCanvas() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8 * this.unit;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}