import type { SaveData } from '../game/upgrades';
import { formatNum } from '../game/upgrades';

interface Props {
  save: SaveData;
  onLaunch: () => void;
  onHangar: () => void;
  onToggleMute: () => void;
}

export function MainMenu({ save, onLaunch, onHangar, onToggleMute }: Props) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
      <button
        onClick={onToggleMute}
        className="btn-ghost absolute top-5 right-5 rounded-full px-4 py-2 text-xs"
        aria-label="Toggle sound"
      >
        {save.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}
      </button>

      <div className="flex flex-col items-center text-center">
        <div className="animate-float">
          <p className="font-body mb-3 text-[11px] font-semibold tracking-[0.5em] text-sky-300/70 uppercase animate-fade-up">
            Endless Space Arcade
          </p>
          <h1 className="font-display shimmer-text animate-title text-4xl font-black tracking-[0.18em] sm:text-6xl md:text-8xl">
            STARDRIFT
          </h1>
          <p className="font-body mt-4 text-sm text-slate-300/80 sm:text-base animate-fade-up [animation-delay:200ms]">
            Dodge. Collect. Chain combos. Drift into the void.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 animate-fade-up [animation-delay:350ms]">
          <button onClick={onLaunch} className="btn-primary animate-pulse-glow rounded-2xl px-14 py-5 text-lg sm:text-xl">
            ▶ LAUNCH
          </button>
          <button onClick={onHangar} className="btn-ghost rounded-xl px-8 py-3 text-sm">
            🛠 HANGAR
            {save.stardust > 0 && <span className="ml-3 text-yellow-300">✦ {formatNum(save.stardust)}</span>}
          </button>
        </div>

        <div className="glass mt-10 grid grid-cols-3 gap-6 rounded-2xl px-8 py-5 animate-fade-up [animation-delay:500ms]">
          <Stat label="Best Score" value={formatNum(save.highScore)} />
          <Stat label="Farthest" value={`${save.bestDistance.toFixed(1)} ly`} />
          <Stat label="Runs" value={formatNum(save.runs)} />
        </div>

        <p className="font-body mt-8 text-xs text-slate-400/70 animate-fade-up [animation-delay:650ms]">
          <span className="hidden sm:inline">Steer with <Key>MOUSE</Key> or <Key>WASD</Key> · Pause <Key>ESC</Key></span>
          <span className="sm:hidden">Drag anywhere to steer your ship</span>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-body text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">{label}</span>
      <span className="font-display mt-1 text-lg font-bold text-white sm:text-xl">{value}</span>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 rounded border border-slate-600 bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">{children}</kbd>;
}
