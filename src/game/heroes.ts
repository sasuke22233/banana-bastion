export type HeroId = 'juno' | 'brix' | 'glitch';

export interface Hero {
  id: HeroId;
  name: string;
  title: string;
  color: string;
  accent: string;
  hp: number;
  speed: number;
  damage: number;
  fireRate: number;
  range: number;
  shotSpeed: number;
  shots: number;
  spread: number;
  superName: string;
  superDescription: string;
  vibe: string;
}

export const HEROES: Hero[] = [
  {
    id: 'juno', name: 'Juno', title: 'The Neon Courier', color: '#c7f36b', accent: '#ff9f58',
    hp: 118, speed: 235, damage: 22, fireRate: 0.46, range: 315, shotSpeed: 620,
    shots: 1, spread: 0, superName: 'Slipstream', superDescription: 'Zip forward and knock back nearby rivals.', vibe: 'Quick feet. Quicker wit.',
  },
  {
    id: 'brix', name: 'Brix', title: 'The Scrap Tank', color: '#ff865f', accent: '#ffd166',
    hp: 168, speed: 178, damage: 13, fireRate: 0.76, range: 245, shotSpeed: 470,
    shots: 5, spread: 0.3, superName: 'Ground Pound', superDescription: 'Blast a shockwave around yourself.', vibe: 'Small talk. Big impact.',
  },
  {
    id: 'glitch', name: 'Glitch', title: 'The Pixel Ghost', color: '#a886ff', accent: '#66e3ff',
    hp: 98, speed: 255, damage: 34, fireRate: 0.9, range: 400, shotSpeed: 760,
    shots: 1, spread: 0, superName: 'Lag Spike', superDescription: 'Drop a delayed pulse anywhere in range.', vibe: 'You saw nothing. Probably.',
  },
];

export const getHero = (id: HeroId) => HEROES.find(hero => hero.id === id) ?? HEROES[0];