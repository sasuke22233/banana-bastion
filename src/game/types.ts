export type PowerUpType = 'shield' | 'magnet' | 'slowmo' | 'blaster' | 'nova';

export interface Asteroid {
  x: number; y: number; vx: number; vy: number; r: number;
  rot: number; rotSpeed: number; verts: number[];
  craters: { x: number; y: number; r: number }[];
  hp: number; shade: number; minDist: number; hit: boolean;
}

export interface Crystal {
  x: number; y: number; vx: number; vy: number; fall: number;
  r: number; hue: number; phase: number; golden: boolean;
}

export interface Comet {
  x: number; y: number; vx: number; vy: number; r: number; delay: number;
  trail: { x: number; y: number }[]; minDist: number; hit: boolean;
}

export interface Mine { x: number; y: number; vx: number; vy: number; r: number; phase: number; }

export interface PowerUp { x: number; y: number; vy: number; type: PowerUpType; phase: number; r: number; }

export interface Bullet { x: number; y: number; vy: number; }

export interface BlackHole { x: number; y: number; vy: number; r: number; pull: number; angle: number; }

export interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  size: number; color: string; drag: number; glow: boolean;
}

export interface Ring { x: number; y: number; r: number; maxR: number; life: number; maxLife: number; color: string; width: number; }

export interface FloatingText {
  x: number; y: number; text: string; life: number; maxLife: number;
  color: string; size: number; vy: number; font?: 'display' | 'body';
}

export interface Star { x: number; y: number; size: number; phase: number; }
export interface Nebula { x: number; y: number; r: number; hueOff: number; vx: number; vy: number; alpha: number; }

export interface RunConfig {
  maxHp: number;
  magnetRange: number;
  durationMult: number;
  crystalValue: number;
  luck: number;
  agility: number;
  startShield: boolean;
  skin: number;
  bestScore: number;
}

export interface RunStats {
  score: number;
  distance: number;
  crystals: number;
  stardust: number;
  destroyed: number;
  nearMisses: number;
  maxCombo: number;
  time: number;
  sector: number;
  newBest: boolean;
}
