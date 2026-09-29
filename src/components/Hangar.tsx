import { SKINS, UPGRADES, formatNum, upgradeCost, type SaveData, type UpgradeId } from '../game/upgrades';
import { cn } from '../utils/cn';

interface Props {
  save: SaveData;
  onBuy: (id: UpgradeId) => void;
  onSelectSkin: (i: number) => void;
  onBack: () => void;
  onLaunch: () => void;
}

export function Hangar({ save, onBuy, onSelectSkin, onBack, onLaunch }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
      <div className="glass flex max-h-full w-full max-w-4xl flex-col rounded-3xl animate-fade-up">
        {/* header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
          <div>
            <h2 className="font-display text-xl font-black tracking-[0.2em] text-white sm:text-2xl">HANGAR</h2>
            <p className="font-body text-xs text-slate-400">Spend stardust to upgrade your ship</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-yellow-300/30 bg-yellow-300/10 px-4 py-2">
            <span className="text-yellow-300">✦</span>
            <span className="font-display text-lg font-bold text-yellow-200">{formatNum(save.stardust)}</span>
          </div>
        </div>

        {/* content */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4 sm:px-7">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {UPGRADES.map(def => {
              const level = save.upgrades[def.id];
              const maxed = level >= def.maxLevel;
              const cost = upgradeCost(def, level);
              const canAfford = save.stardust >= cost;
              return (
                <div
                  key={def.id}
                  className={cn(
                    'flex flex-col rounded-2xl border p-4 transition-colors',
                    maxed ? 'border-yellow-300/30 bg-yellow-300/5' : 'border-white/10 bg-white/[0.03] hover:border-sky-300/40',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-xl">{def.icon}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display truncate text-sm font-bold text-white">{def.name}</h3>
                      <p className="font-body text-xs leading-snug text-slate-400">{def.desc}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1">
                    {Array.from({ length: def.maxLevel }).map((_, i) => (
                      <span
                        key={i}
                        className={cn('h-1.5 flex-1 rounded-full', i < level ? (maxed ? 'bg-yellow-300' : 'bg-sky-400') : 'bg-white/10')}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-body text-xs text-sky-200/90">{def.effect(level)}</span>
                    {maxed ? (
                      <span className="font-display text-[10px] font-bold tracking-widest text-yellow-300">MAXED</span>
                    ) : (
                      <button
                        onClick={() => onBuy(def.id)}
                        disabled={!canAfford}
                        className={cn(
                          'font-display rounded-lg px-3 py-1.5 text-xs font-bold tracking-wider transition-all',
                          canAfford
                            ? 'bg-sky-400 text-slate-950 hover:bg-sky-300 hover:shadow-[0_0_16px_rgba(56,189,248,0.6)] active:scale-95'
                            : 'cursor-not-allowed bg-white/5 text-slate-500',
                        )}
                      >
                        ✦ {formatNum(cost)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* skins */}
          <div className="mt-6">
            <h3 className="font-display text-xs font-bold tracking-[0.3em] text-slate-300">SHIP PAINT</h3>
            <p className="font-body mb-3 text-xs text-slate-500">Unlock new colors by beating high scores</p>
            <div className="flex flex-wrap gap-2">
              {SKINS.map((skin, i) => {
                const unlocked = save.highScore >= skin.unlock;
                const selected = save.skin === i;
                return (
                  <button
                    key={skin.name}
                    onClick={() => unlocked && onSelectSkin(i)}
                    disabled={!unlocked}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 transition-all',
                      selected ? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/[0.02]',
                      unlocked ? 'hover:border-white/40' : 'cursor-not-allowed opacity-50',
                    )}
                    style={selected ? { boxShadow: `0 0 18px ${skin.color}66` } : undefined}
                  >
                    <svg width="22" height="26" viewBox="-16 -24 32 40">
                      <path d="M0 -23 L7 -5 L16 11 L6 9 L0 14 L-6 9 L-16 11 L-7 -5 Z" fill={skin.color} stroke={skin.accent} strokeWidth="1" />
                    </svg>
                    <div className="text-left">
                      <div className="font-display text-xs font-bold text-white">{skin.name}</div>
                      <div className="font-body text-[10px] text-slate-400">{unlocked ? (selected ? 'Equipped' : 'Unlocked') : `🔒 ${formatNum(skin.unlock)} pts`}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-7">
          <button onClick={onBack} className="btn-ghost rounded-xl px-5 py-2.5 text-xs">← BACK</button>
          <button onClick={onLaunch} className="btn-primary rounded-xl px-8 py-2.5 text-sm">▶ LAUNCH</button>
        </div>
      </div>
    </div>
  );
}
