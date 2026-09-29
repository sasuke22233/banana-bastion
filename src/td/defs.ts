export type TowerKind = 'dart' | 'tack' | 'bomb' | 'ice' | 'super';
export type MoabKind = 'moab' | 'bfb' | 'zomg';

export const TOTAL_ROUNDS = 40;
export const START_CASH = 650;
export const START_LIVES = 100;
export const SELL_RATE = 0.7;

export interface TierInfo { name: string; desc: string; cost: number }
export interface UpgradePath { name: string; tiers: TierInfo[] }

export interface TowerDef {
  id: TowerKind;
  name: string;
  cost: number;
  color: string;
  blurb: string;
  range: number;
  rate: number;
  damage: number;
  pierce: number;
  projSpeed: number;
  camo: boolean;
  lead: boolean;
  paths: [UpgradePath, UpgradePath];
}

export const TOWER_DEFS: TowerDef[] = [
  {
    id: 'dart', name: 'Dart Monkey', cost: 180, color: '#ffc93c',
    blurb: 'Hurls sharp darts at the first balloon in range.',
    range: 98, rate: 0.95, damage: 1, pierce: 1, projSpeed: 720, camo: false, lead: false,
    paths: [
      { name: 'SHARP SHOTS', tiers: [
        { name: 'Long Darts', desc: '+22 attack range', cost: 120 },
        { name: 'Enhanced Eyesight', desc: '+16 range, can hit Camo', cost: 260 },
        { name: 'Juggernaut', desc: '+2 damage, +2 pierce', cost: 900 },
      ] },
      { name: 'RAPID FIRE', tiers: [
        { name: 'Quick Shots', desc: 'Throws 28% faster', cost: 140 },
        { name: 'Very Quick Shots', desc: 'Throws 38% faster', cost: 320 },
        { name: 'Triple Darts', desc: 'Throws 3 darts at once', cost: 850 },
      ] },
    ],
  },
  {
    id: 'tack', name: 'Tack Shooter', cost: 300, color: '#e8574b',
    blurb: 'Sprays tacks in every direction when balloons get close.',
    range: 84, rate: 1.05, damage: 1, pierce: 1, projSpeed: 560, camo: false, lead: false,
    paths: [
      { name: 'OVERCLOCK', tiers: [
        { name: 'Faster Shooting', desc: 'Shoots 28% faster', cost: 220 },
        { name: 'Even Faster Shooting', desc: 'Shoots 40% faster', cost: 340 },
        { name: 'Super Tack', desc: '16 tacks +16 range', cost: 950 },
      ] },
      { name: 'WIDE LOAD', tiers: [
        { name: 'Bigger Radius', desc: '+24 attack range', cost: 180 },
        { name: 'Tack Sprayer', desc: 'Shoots twice as fast', cost: 520 },
        { name: 'Inferno Ring', desc: '+1 damage, +1 pierce', cost: 1300 },
      ] },
    ],
  },
  {
    id: 'bomb', name: 'Bomb Cannon', cost: 520, color: '#7f8794',
    blurb: 'Lobs explosive shells — the only way to crack Lead.',
    range: 108, rate: 1.4, damage: 2, pierce: 99, projSpeed: 520, camo: false, lead: true,
    paths: [
      { name: 'BLAST POWER', tiers: [
        { name: 'Bigger Bombs', desc: '+16 blast radius', cost: 300 },
        { name: 'Heavy Bombs', desc: '+2 damage, +8 radius', cost: 470 },
        { name: 'Recursive Cluster', desc: '+3 damage, +24 radius', cost: 1450 },
      ] },
      { name: 'RELOAD', tiers: [
        { name: 'Faster Reload', desc: 'Fires 25% faster', cost: 260 },
        { name: 'Long Range Bombs', desc: '+32 range, can hit Camo', cost: 420 },
        { name: 'Bomb Blitz', desc: '+4 damage, fires faster', cost: 1350 },
      ] },
    ],
  },
  {
    id: 'ice', name: 'Ice Monkey', cost: 450, color: '#63d8ff',
    blurb: 'Freezes every balloon around it and slows the herd.',
    range: 90, rate: 1.5, damage: 1, pierce: 99, projSpeed: 0, camo: false, lead: false,
    paths: [
      { name: 'DEEP FREEZE', tiers: [
        { name: 'Long Range', desc: '+26 freeze radius', cost: 200 },
        { name: 'Permafrost', desc: 'Slows to 30% for 2.6s', cost: 520 },
        { name: 'Absolute Zero', desc: '+2 damage, brutal slow', cost: 1400 },
      ] },
      { name: 'FROST BITE', tiers: [
        { name: 'Faster Attack', desc: 'Pulses 28% faster', cost: 240 },
        { name: 'Ice Shards', desc: '+1 damage per pulse', cost: 460 },
        { name: 'Cryo Shell', desc: 'Hits Camo and Lead', cost: 1100 },
      ] },
    ],
  },
  {
    id: 'super', name: 'Super Monkey', cost: 2400, color: '#8b62e8',
    blurb: 'Absurd attack speed with a huge range. Late-game carry.',
    range: 134, rate: 0.17, damage: 1, pierce: 1, projSpeed: 900, camo: false, lead: false,
    paths: [
      { name: 'RAW POWER', tiers: [
        { name: 'Super Range', desc: '+30 attack range', cost: 700 },
        { name: 'Laser Beam', desc: '+1 damage, pops Lead', cost: 1500 },
        { name: 'Plasma Blasts', desc: '+2 damage, faster', cost: 4000 },
      ] },
      { name: 'RAPID FIRE', tiers: [
        { name: 'Rapid Fire', desc: 'Shoots 25% faster', cost: 600 },
        { name: 'Extra Darts', desc: 'Throws 2 darts at once', cost: 1300 },
        { name: 'Epic Range', desc: '+40 range, hits Camo', cost: 2500 },
      ] },
    ],
  },
];

export const getDef = (id: TowerKind): TowerDef => TOWER_DEFS.find(d => d.id === id)!;

export interface Stats {
  range: number; rate: number; damage: number; pierce: number; speed: number;
  camo: boolean; lead: boolean; aoe: number; shots: number; spread: number;
  slow: number; slowDur: number;
}

export function computeStats(def: TowerDef, a: number, b: number): Stats {
  let range = def.range, rate = def.rate, damage = def.damage, pierce = def.pierce;
  let camo = def.camo, lead = def.lead;
  let aoe = 0, shots = 1, spread = 0, slow = 1, slowDur = 0;

  if (def.id === 'dart') {
    if (a >= 1) range += 22;
    if (a >= 2) { range += 16; camo = true; }
    if (a >= 3) { damage += 2; pierce += 2; }
    if (b >= 1) rate *= 0.72;
    if (b >= 2) rate *= 0.62;
    if (b >= 3) { shots = 3; spread = 0.2; rate *= 0.95; }
  } else if (def.id === 'tack') {
    if (a >= 1) rate *= 0.72;
    if (a >= 2) rate *= 0.62;
    shots = a >= 3 ? 16 : 8;
    if (a >= 3) range += 16;
    if (b >= 1) range += 24;
    if (b >= 2) rate *= 0.5;
    if (b >= 3) { damage += 1; pierce += 1; }
  } else if (def.id === 'bomb') {
    aoe = 42;
    if (a >= 1) aoe += 16;
    if (a >= 2) { damage += 2; aoe += 8; }
    if (a >= 3) { damage += 3; aoe += 24; }
    if (b >= 1) rate *= 0.75;
    if (b >= 2) { range += 32; camo = true; }
    if (b >= 3) { damage += 4; rate *= 0.75; }
  } else if (def.id === 'ice') {
    slow = 0.5; slowDur = 1.6;
    if (a >= 1) range += 26;
    if (a >= 2) { slow = 0.3; slowDur = 2.6; }
    if (a >= 3) { damage += 2; slow = 0.18; slowDur = 3.2; }
    if (b >= 1) rate *= 0.72;
    if (b >= 2) damage += 1;
    if (b >= 3) { camo = true; lead = true; }
  } else if (def.id === 'super') {
    if (a >= 1) range += 30;
    if (a >= 2) { damage += 1; lead = true; }
    if (a >= 3) { damage += 2; rate *= 0.85; }
    if (b >= 1) rate *= 0.75;
    if (b >= 2) { shots = 2; spread = 0.13; }
    if (b >= 3) { range += 40; camo = true; }
  }
  return { range, rate, damage, pierce, speed: def.projSpeed, camo, lead, aoe, shots, spread, slow, slowDur };
}

export interface BalloonClass {
  name: string; color: string; speed: number; split: number;
}

/** Layer 1..10 → index 0..9 */
export const BLOON_CLASSES: BalloonClass[] = [
  { name: 'Red', color: '#ef3f45', speed: 1.0, split: 1 },
  { name: 'Blue', color: '#2f8df3', speed: 1.3, split: 1 },
  { name: 'Green', color: '#39c95b', speed: 1.6, split: 1 },
  { name: 'Yellow', color: '#ffd23a', speed: 2.0, split: 1 },
  { name: 'Pink', color: '#ff5fb0', speed: 2.4, split: 1 },
  { name: 'Black', color: '#33304a', speed: 2.6, split: 1 },
  { name: 'White', color: '#eef4ff', speed: 2.6, split: 1 },
  { name: 'Zebra', color: '#dcdce8', speed: 2.6, split: 1 },
  { name: 'Rainbow', color: '#8ee05a', speed: 2.5, split: 1 },
  { name: 'Ceramic', color: '#c98b52', speed: 1.5, split: 2 },
];

export interface MoabDef {
  name: string; hp: number; speed: number; color: string;
  lives: number; cash: number; children: { layer: number; count: number }[];
}

export const MOABS: Record<MoabKind, MoabDef> = {
  moab: { name: 'MOAB', hp: 180, speed: 0.62, color: '#5fa8e8', lives: 25, cash: 8, children: [{ layer: 10, count: 4 }] },
  bfb: { name: 'BFB', hp: 600, speed: 0.48, color: '#e05b4c', lives: 50, cash: 20, children: [{ layer: 10, count: 6 }] },
  zomg: { name: 'ZOMG', hp: 1400, speed: 0.36, color: '#4c4f6b', lives: 100, cash: 60, children: [{ layer: 10, count: 8 }] },
};

export const FLAG_CAMO = 1;
export const FLAG_REGROW = 2;
export const FLAG_LEAD = 4;

export type RoundEntry = [type: number | MoabKind, count: number, spacing: number, flags?: number];

export const ROUNDS: RoundEntry[][] = [
  [[1, 10, 1.0]],
  [[1, 14, 0.8], [2, 4, 0.9]],
  [[2, 12, 0.75], [1, 10, 0.5]],
  [[2, 16, 0.6], [3, 5, 0.9]],
  [[3, 16, 0.6], [2, 10, 0.5]],
  [[3, 20, 0.5], [4, 6, 0.8]],
  [[4, 18, 0.5], [2, 20, 0.35]],
  [[4, 20, 0.45], [5, 8, 0.7], [3, 12, 0.4]],
  [[2, 10, 0.5, 1], [4, 22, 0.4]],
  [[5, 20, 0.5], [3, 25, 0.35]],
  [[4, 30, 0.3], [5, 15, 0.45]],
  [[6, 10, 0.7], [2, 25, 0.3]],
  [[6, 8, 0.6, 4], [4, 25, 0.35]],
  [[7, 12, 0.6], [5, 25, 0.4]],
  [[9, 6, 1.0], [6, 16, 0.5]],
  [[3, 20, 0.4, 1], [6, 10, 0.6, 4]],
  [[10, 4, 1.4], [5, 30, 0.35]],
  [[5, 25, 0.4, 2], [4, 30, 0.3, 2]],
  [[6, 25, 0.4], [7, 18, 0.5]],
  [['moab', 1, 1], [9, 15, 0.5]],
  [[4, 30, 0.3, 1], [7, 20, 0.4]],
  [[10, 8, 1.2], [6, 14, 0.5, 4]],
  [[9, 20, 0.5, 2]],
  [[7, 35, 0.3], [5, 30, 0.3, 1]],
  [['moab', 2, 3], [9, 25, 0.4]],
  [[6, 20, 0.4, 1], [5, 40, 0.25]],
  [[10, 14, 1.0], [8, 20, 0.5]],
  [[10, 10, 1.0, 2], [6, 30, 0.35]],
  [[9, 40, 0.3, 1], [7, 30, 0.35]],
  [['bfb', 1, 1], [9, 30, 0.4]],
  [[10, 20, 0.9, 1]],
  [['moab', 3, 4], [6, 25, 0.4, 4]],
  [[9, 40, 0.3, 2]],
  [[10, 25, 0.8], [10, 12, 0.9, 1]],
  [['bfb', 2, 6], [10, 25, 0.7]],
  [[9, 45, 0.25, 1]],
  [[10, 40, 0.6]],
  [['moab', 5, 3], [9, 40, 0.3, 2]],
  [['bfb', 3, 5], [10, 30, 0.6]],
  [['zomg', 1, 1], ['bfb', 2, 6], ['moab', 4, 4]],
];

export interface SpawnGroup {
  type: number | MoabKind;
  count: number;
  spacing: number;
  flags: number;
  delay: number;
}

export function buildGroups(round: number): { groups: SpawnGroup[]; units: number } {
  const spec = ROUNDS[Math.min(round, ROUNDS.length) - 1] ?? ROUNDS[0];
  const groups: SpawnGroup[] = [];
  let t = 0;
  let units = 0;
  for (const [type, count, spacing, flags] of spec) {
    groups.push({ type, count, spacing, flags: flags ?? 0, delay: t });
    t += count * spacing;
    units += count;
  }
  return { groups, units };
}

export function roundIncome(round: number): number {
  return Math.round(120 + round * 14);
}
