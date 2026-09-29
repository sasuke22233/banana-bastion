import type { RunConfig } from './types';

export type UpgradeId = 'hull' | 'magnet' | 'core' | 'refinery' | 'luck' | 'thrusters' | 'shield';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
  baseCost: number;
  growth: number;
  effect: (lvl: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'hull', name: 'Reinforced Hull', icon: '🛡️', desc: 'Adds an extra hit point to your ship.', maxLevel: 3, baseCost: 220, growth: 2.3, effect: l => `${1 + l} HP` },
  { id: 'magnet', name: 'Tractor Beam', icon: '🧲', desc: 'Passively pulls in nearby crystals.', maxLevel: 5, baseCost: 80, growth: 1.8, effect: l => (l ? `${40 + l * 28} range` : 'Offline') },
  { id: 'core', name: 'Power Core', icon: '⚡', desc: 'Power-ups last longer.', maxLevel: 5, baseCost: 120, growth: 1.7, effect: l => `+${l * 20}% duration` },
  { id: 'refinery', name: 'Refinery', icon: '💎', desc: 'Every crystal yields more stardust.', maxLevel: 5, baseCost: 150, growth: 1.9, effect: l => `${(1 + l * 0.3).toFixed(1)}× stardust` },
  { id: 'luck', name: 'Lucky Charm', icon: '🍀', desc: 'Power-ups appear more often.', maxLevel: 4, baseCost: 180, growth: 1.8, effect: l => `+${l * 25}% frequency` },
  { id: 'thrusters', name: 'Ion Thrusters', icon: '🚀', desc: 'Ship reacts faster to your input.', maxLevel: 3, baseCost: 100, growth: 2.0, effect: l => `+${l * 15}% agility` },
  { id: 'shield', name: 'Pre-charged Shield', icon: '🔷', desc: 'Begin every run with a shield.', maxLevel: 1, baseCost: 650, growth: 1, effect: l => (l ? 'Armed' : 'Not installed') },
];

export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.growth, level));
}

export interface Skin { name: string; color: string; accent: string; unlock: number; }

export const SKINS: Skin[] = [
  { name: 'Comet', color: '#38bdf8', accent: '#e0f2fe', unlock: 0 },
  { name: 'Ember', color: '#fb923c', accent: '#fff7ed', unlock: 2500 },
  { name: 'Viper', color: '#4ade80', accent: '#f0fdf4', unlock: 7500 },
  { name: 'Nova', color: '#e879f9', accent: '#fdf4ff', unlock: 15000 },
  { name: 'Phantom', color: '#a78bfa', accent: '#f5f3ff', unlock: 30000 },
];

export interface SaveData {
  stardust: number;
  totalStardust: number;
  highScore: number;
  bestDistance: number;
  upgrades: Record<UpgradeId, number>;
  skin: number;
  runs: number;
  muted: boolean;
}

const KEY = 'stardrift-save-v1';

const defaultSave = (): SaveData => ({
  stardust: 0,
  totalStardust: 0,
  highScore: 0,
  bestDistance: 0,
  upgrades: { hull: 0, magnet: 0, core: 0, refinery: 0, luck: 0, thrusters: 0, shield: 0 },
  skin: 0,
  runs: 0,
  muted: false,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    return { ...base, ...parsed, upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function persist(save: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignore */
  }
}

export function buildConfig(save: SaveData): RunConfig {
  const u = save.upgrades;
  return {
    maxHp: 1 + u.hull,
    magnetRange: u.magnet ? 40 + u.magnet * 28 : 0,
    durationMult: 1 + u.core * 0.2,
    crystalValue: 1 + u.refinery * 0.3,
    luck: 1 + u.luck * 0.25,
    agility: 1 + u.thrusters * 0.15,
    startShield: u.shield > 0,
    skin: save.skin,
    bestScore: save.highScore,
  };
}

export const formatNum = (n: number) => Math.floor(n).toLocaleString('en-US');
