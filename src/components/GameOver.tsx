import { useEffect, useState } from 'react';
import type { RunStats } from '../game/types';
import { SECTORS } from '../game/engine';
import { SKINS, formatNum } from '../game/upgrades';

interface Props {
  stats: RunStats;
  highScore: number;
  prevHighScore: number;
  onRetry: () => void;
  onHangar: () => void;
  onMenu: () => void;
}

function useCountUp(target: number, duration = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function GameOver({ stats, highScore, prevHighScore, onRetry, onHangar, onMenu }: Props) {
  const score = useCountUp(stats.score);
  const unlockedSkin = SKINS.find(s => s.unlock > prevHighScore && stats.score >= s.unlock);
  const mins = Math.floor(stats.time / 60);
  const secs = Math.floor(stats.time % 60);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="glass w-full max-w-lg rounded-3xl px-6 py-7 text-center animate-pop sm:px-10">
        <p className="font-body text-[11px] font-semibold tracking-[0.45em] text-red-300/80 uppercase">Signal lost</p>
        <h2 className="font-display mt-1 text-3xl font-black tracking-[0.15em] text-white sm:text-4xl">SHIP DESTROYED</h2>

        <div className="mt-6">
          <p className="font-body text-xs tracking-[0.3em] text-slate-400 uppercase">Final score</p>
          <p className={`font-display text-5xl font-black tabular-nums sm:text-6xl ${stats.newBest ? 'text-glow-gold text-yellow-300' : 'text-glow-cyan text-white'}`}>
            {formatNum(score)}
          </p>
          {stats.newBest ? (
            <p className="font-display mt-2 inline-block rounded-full border border-yellow-300/40 bg-yellow-300/10 px-4 py-1 text-xs font-bold tracking-[0.25em] text-yellow-300 animate-pop [animation-delay:600ms]">
              ★ NEW BEST SCORE ★
            </p>
          ) : (
            <p className="font-body mt-2 text-xs text-slate-400">Best: {formatNum(highScore)}</p>
          )}
          {unlockedSkin && (
            <p className="font-body mt-2 text-xs text-fuchsia-300 animate-fade-up [animation-delay:800ms]">
              🎨 New paint unlocked: <span className="font-bold">{unlockedSkin.name}</span>
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-yellow-300/25 bg-yellow-300/10 py-3">
          <span className="font-body text-xs tracking-[0.25em] text-yellow-200/80 uppercase">Stardust earned</span>
          <span className="font-display text-xl font-bold text-yellow-300">+{formatNum(stats.stardust)} ✦</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-left">
          <Cell label="Distance" value={`${stats.distance.toFixed(1)} ly`} />
          <Cell label="Sector" value={`${stats.sector + 1} · ${SECTORS[stats.sector].name}`} small />
          <Cell label="Survived" value={`${mins}:${secs.toString().padStart(2, '0')}`} />
          <Cell label="Crystals" value={formatNum(stats.crystals)} />
          <Cell label="Max combo" value={`${stats.maxCombo}×`} />
          <Cell label="Close calls" value={formatNum(stats.nearMisses)} />
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button onClick={onRetry} className="btn-primary rounded-xl px-8 py-3.5 text-sm">↻ FLY AGAIN</button>
          <button onClick={onHangar} className="btn-ghost rounded-xl px-6 py-3.5 text-xs">🛠 HANGAR</button>
          <button onClick={onMenu} className="btn-ghost rounded-xl px-6 py-3.5 text-xs">MENU</button>
        </div>
        <p className="font-body mt-4 hidden text-[11px] text-slate-500 sm:block">Press <kbd className="rounded border border-slate-600 px-1 font-mono">SPACE</kbd> to fly again</p>
      </div>
    </div>
  );
}

function Cell({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="font-body text-[10px] tracking-[0.2em] text-slate-400 uppercase">{label}</div>
      <div className={`font-display mt-0.5 truncate font-bold text-white ${small ? 'text-xs' : 'text-sm'}`}>{value}</div>
    </div>
  );
}
