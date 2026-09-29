interface Props {
  onResume: () => void;
  onQuit: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export function PauseOverlay({ onResume, onQuit, muted, onToggleMute }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[3px]">
      <div className="glass w-full max-w-sm rounded-3xl px-8 py-8 text-center animate-pop">
        <h2 className="font-display text-3xl font-black tracking-[0.3em] text-white">PAUSED</h2>
        <p className="font-body mt-2 text-xs text-slate-400">Your ship is holding position in the void.</p>
        <div className="mt-7 flex flex-col gap-3">
          <button onClick={onResume} className="btn-primary rounded-xl px-8 py-3.5 text-sm">▶ RESUME</button>
          <button onClick={onToggleMute} className="btn-ghost rounded-xl px-6 py-3 text-xs">{muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}</button>
          <button onClick={onQuit} className="btn-ghost rounded-xl px-6 py-3 text-xs">✕ ABANDON RUN</button>
        </div>
        <p className="font-body mt-5 hidden text-[11px] text-slate-500 sm:block">Press <kbd className="rounded border border-slate-600 px-1 font-mono">ESC</kbd> to resume</p>
      </div>
    </div>
  );
}
