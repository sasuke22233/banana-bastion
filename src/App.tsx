import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { TDGame, type SelectedInfo, type Snapshot } from './td/engine';
import { START_CASH, START_LIVES, TOWER_DEFS, TOTAL_ROUNDS, type TowerKind } from './td/defs';
import menuBg from './assets/menu.jpg';

const EMPTY: Snapshot = {
  lives: START_LIVES, cash: START_CASH, round: 1, total: TOTAL_ROUNDS,
  phase: 'build', speed: 1, paused: false, progress: 0, build: null,
  pops: 0, selected: null, msg: null, msgId: 0,
};

interface GameRecord { best: number; wins: number }
const RECORD_KEY = 'banana-bastion-record-v1';
const loadRecord = (): GameRecord => {
  try { return { best: 0, wins: 0, ...(JSON.parse(localStorage.getItem(RECORD_KEY) ?? '{}') as Partial<GameRecord>) }; }
  catch { return { best: 0, wins: 0 }; }
};

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [record, setRecord] = useState<GameRecord>(loadRecord);
  const [help, setHelp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TDGame | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new TDGame(canvas, { onSnapshot: setSnap });
    gameRef.current = g;
    return () => { g.destroy(); gameRef.current = null; };
  }, [screen]);

  useEffect(() => {
    if (snap.phase !== 'over' && snap.phase !== 'win') { endedRef.current = false; return; }
    if (endedRef.current) return;
    endedRef.current = true;
    setRecord(prev => {
      const next: GameRecord = { best: Math.max(prev.best, snap.round), wins: prev.wins + (snap.phase === 'win' ? 1 : 0) };
      try { localStorage.setItem(RECORD_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [snap.phase, snap.round]);

  const game = () => gameRef.current;
  const toMenu = () => setScreen('menu');
  const retry = () => { endedRef.current = false; game()?.restart(); };

  const icons = useMemo<Record<TowerKind, ReactElement>>(() => ({
    dart: (
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <path d="M9 35 30 14" stroke="#8a5a2e" strokeWidth="5" strokeLinecap="round" />
        <path d="m28 12 10-4-4 10-6-6Z" fill="#f0ead8" stroke="#2b1b52" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 35 5 39l6 1 2-6-4 1Z" fill="#e8574b" stroke="#2b1b52" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="9" cy="35" r="2.4" fill="#2b1b52" />
      </svg>
    ),
    tack: (
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <g fill="#e6ebf2" stroke="#2b1b52" strokeWidth="2" strokeLinejoin="round">
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const x = 22 + Math.cos(a) * 17, y = 22 + Math.sin(a) * 17;
            const l = 22 + Math.cos(a + 0.32) * 7, m = 22 + Math.sin(a + 0.32) * 7;
            const l2 = 22 + Math.cos(a - 0.32) * 7, m2 = 22 + Math.sin(a - 0.32) * 7;
            return <path key={i} d={`M${x} ${y}L${l} ${m}L${l2} ${m2}Z`} />;
          })}
        </g>
        <circle cx="22" cy="22" r="9" fill="#e8574b" stroke="#2b1b52" strokeWidth="2.4" />
        <circle cx="22" cy="22" r="3" fill="#ffe07a" />
      </svg>
    ),
    bomb: (
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="21" cy="25" r="13" fill="#3a3d47" stroke="#2b1b52" strokeWidth="2.4" />
        <ellipse cx="16" cy="20" rx="4" ry="3" fill="#6f7482" />
        <path d="M29 14c3-4 7-4 9-1" stroke="#8a5a2e" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="39" cy="12" r="4" fill="#ffd93d" />
        <circle cx="39" cy="12" r="7" fill="#ffd93d" opacity=".35" />
      </svg>
    ),
    ice: (
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <g stroke="#63d8ff" strokeWidth="4" strokeLinecap="round">
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return <line key={i} x1="22" y1="22" x2={22 + Math.cos(a) * 16} y2={22 + Math.sin(a) * 16} />;
          })}
        </g>
        <g stroke="#d8f7ff" strokeWidth="2.6" strokeLinecap="round">
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            const x = 22 + Math.cos(a) * 11, y = 22 + Math.sin(a) * 11;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x + Math.cos(a + 0.9) * 5} y2={y + Math.sin(a + 0.9) * 5} />
                <line x1={x} y1={y} x2={x + Math.cos(a - 0.9) * 5} y2={y + Math.sin(a - 0.9) * 5} />
              </g>
            );
          })}
        </g>
        <circle cx="22" cy="22" r="4" fill="#eafcff" />
      </svg>
    ),
    super: (
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="9" cy="24" r="7" fill="#7d4f26" stroke="#2b1b52" strokeWidth="2.2" />
        <circle cx="35" cy="24" r="7" fill="#7d4f26" stroke="#2b1b52" strokeWidth="2.2" />
        <circle cx="22" cy="22" r="13" fill="#8a5a2e" stroke="#2b1b52" strokeWidth="2.4" />
        <path d="M9 20a13 13 0 0 1 26 0Z" fill="#8b62e8" stroke="#2b1b52" strokeWidth="2.2" strokeLinejoin="round" />
        <ellipse cx="22" cy="27" rx="8" ry="6" fill="#e0b083" />
        <circle cx="17" cy="21" r="3" fill="#fff" /><circle cx="27" cy="21" r="3" fill="#fff" />
        <circle cx="17.6" cy="21.4" r="1.5" fill="#241b17" /><circle cx="27.6" cy="21.4" r="1.5" fill="#241b17" />
        <ellipse cx="22" cy="25" rx="2" ry="1.5" fill="#6b4222" />
      </svg>
    ),
  }), []);

  if (screen === 'menu') {
    return (
      <div className="menu">
        <div className="menu-bg" style={{ backgroundImage: `url(${menuBg})` }} />
        <div className="menu-shade" />

        <header className="menu-top">
          <div className="medal"><span className="medal-ico">🏆</span><b>{record.best}</b><small>BEST ROUND</small></div>
          <div className="medal"><span className="medal-ico">🍌</span><b>{record.wins}</b><small>VICTORIES</small></div>
        </header>

        <main className="menu-main">
          <div className="logo-wrap">
            <div className="logo-kicker">MONKEY TOWER DEFENSE</div>
            <h1 className="logo"><span>BANANA</span><em>BASTION</em></h1>
            <div className="logo-sub">POP EVERY LAST BALLOON</div>
          </div>

          <div className="menu-actions">
            <button className="btn btn-green btn-big" onClick={() => setScreen('game')}>PLAY</button>
            <button className="btn btn-blue" onClick={() => setHelp(v => !v)}>{help ? 'CLOSE' : 'HOW TO PLAY'}</button>
          </div>

          {help && (
            <section className="help-panel">
              <h2>HOW TO PLAY</h2>
              <ul>
                <li><b>Build</b> monkeys on the grass — never on the sandy path.</li>
                <li><b>Start</b> a round and balloons stream in from the red flag.</li>
                <li><b>Tap a monkey</b> to open its two upgrade paths.</li>
                <li><b>Lead balloons</b> ignore darts — only bombs and lasers crack them.</li>
                <li><b>Camo balloons</b> need a tower with Camo detection.</li>
                <li><b>Survive all {TOTAL_ROUNDS} rounds</b> without losing your {START_LIVES} lives.</li>
              </ul>
              <div className="help-keys">
                <span><kbd>Space</kbd> start round</span><span><kbd>Esc</kbd> pause / cancel</span><span><kbd>RMB</kbd> cancel build</span>
              </div>
            </section>
          )}
        </main>

        <footer className="menu-foot">
          <span>A fast, free-to-play-style tower defense · progress saved locally</span>
          <button className="link-btn" onClick={() => { localStorage.removeItem(RECORD_KEY); setRecord({ best: 0, wins: 0 }); }}>reset progress</button>
        </footer>
      </div>
    );
  }

  const sel = snap.selected;
  const over = snap.phase === 'over' || snap.phase === 'win';

  return (
      <div className={`game ${sel && !snap.build ? 'has-panel' : ''}`}>
      <canvas ref={canvasRef} className="board" />

      <div className="hud">
        <div className="pill pill-lives" title="Lives">♥<b>{snap.lives}</b></div>
        <div className="pill pill-cash" title="Cash">${<b>{snap.cash}</b>}</div>
        <div className="round-pill">
          <span>ROUND {snap.round} / {snap.total}</span>
          <div className="round-bar"><i style={{ width: `${snap.progress * 100}%` }} /></div>
        </div>
        <div className="hud-right">
          <div className="speed-group">
            {[1, 2, 3].map(s => (
              <button key={s} className={`speed-btn ${snap.speed === s ? 'on' : ''}`} onClick={() => game()?.setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <button className="hud-btn" onClick={() => game()?.togglePause()} aria-label="Pause">{snap.paused ? '▶' : '❚❚'}</button>
          <button className="hud-btn quit" onClick={toMenu} aria-label="Quit to menu">✕</button>
        </div>
      </div>

      {snap.msg && <div className="toast" key={snap.msgId}>{snap.msg}</div>}

      {snap.phase === 'build' && !snap.paused && !over && (
        <button className="go-btn" onClick={() => game()?.startRound()}>
          <span className="go-play">▶</span>
          <span className="go-text">START<br />ROUND {snap.round}</span>
        </button>
      )}

      <div className="dock">
        {TOWER_DEFS.map(d => {
          const active = snap.build === d.id;
          const poor = snap.cash < d.cost;
          return (
            <button
              key={d.id}
              className={`tower-card ${active ? 'active' : ''} ${poor && !active ? 'poor' : ''}`}
              onClick={() => game()?.setBuild(active ? null : d.id)}
              title={`${d.name} — ${d.blurb}`}
            >
              <span className="card-icon">{icons[d.id]}</span>
              <span className="card-name">{d.name}</span>
              <span className="card-cost">${d.cost}</span>
            </button>
          );
        })}
      </div>

      {sel && !snap.build && !over && (
        <UpgradePanel sel={sel} onUpgrade={(p) => game()?.buyUpgrade(p)} onSell={() => game()?.sell()} onClose={() => game()?.deselect()} />
      )}

      {snap.paused && !over && (
        <div className="overlay">
          <div className="sheet">
            <div className="sheet-kicker">TAKE A BREATH</div>
            <h2>PAUSED</h2>
            <p>Round {snap.round} of {snap.total} · {snap.pops.toLocaleString('en-US')} pops</p>
            <button className="btn btn-green" onClick={() => game()?.togglePause()}>RESUME</button>
            <button className="btn btn-ghost" onClick={toMenu}>QUIT TO MENU</button>
          </div>
        </div>
      )}

      {over && (
        <div className="overlay">
          <div className={`sheet ${snap.phase === 'win' ? 'won' : ''}`}>
            <div className="sheet-kicker">{snap.phase === 'win' ? 'EVERY BALLOON POPPED' : 'THE BALLOONS BROKE THROUGH'}</div>
            <h2>{snap.phase === 'win' ? 'VICTORY!' : 'GAME OVER'}</h2>
            <div className="result-grid">
              <div><span>REACHED</span><b>Round {snap.round}</b></div>
              <div><span>POPS</span><b>{snap.pops.toLocaleString('en-US')}</b></div>
              <div><span>LIVES</span><b>{snap.lives}</b></div>
              <div><span>CASH</span><b>${snap.cash}</b></div>
            </div>
            <p className="record-note">{snap.round >= record.best ? `New best: round ${snap.round}!` : `Best round: ${record.best}`}</p>
            <button className="btn btn-green btn-big" onClick={retry}>PLAY AGAIN</button>
            <button className="btn btn-ghost" onClick={toMenu}>MENU</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradePanel({ sel, onUpgrade, onSell, onClose }: { sel: SelectedInfo; onUpgrade: (p: 0 | 1) => void; onSell: () => void; onClose: () => void }) {
  const def = TOWER_DEFS.find(d => d.id === sel.def)!;
  const paths = [0, 1] as const;
  return (
    <aside className="upgrades">
      <header className="up-head">
        <button className="up-close" onClick={onClose} aria-label="Close tower panel">✕</button>
        <div>
          <h3>{def.name}</h3>
          <div className="up-tier">
            {[0, 1].map(p => (
              <span key={p} className={`tier-tag t${p}`}>PATH {p + 1} · {p === 0 ? sel.tierA : sel.tierB}</span>
            ))}
          </div>
        </div>
        <div className="up-pops"><b>{sel.pops.toLocaleString('en-US')}</b><small>POPS</small></div>
      </header>
      <div className="up-paths">
        {paths.map(p => {
          const list = sel.upgrades.filter(u => u.path === p);
          return (
            <div className="up-path" key={p}>
              <div className="up-path-name">{def.paths[p].name}</div>
              {list.length === 0 && <div className="up-maxed">MAXED</div>}
              {list.map(u => (
                <button
                  key={`${u.path}-${u.tier}`}
                  className={`up-btn ${u.ok ? 'ok' : 'locked'}`}
                  onClick={() => u.ok && onUpgrade(p)}
                  title={u.reason ?? u.desc}
                >
                  <span className="up-btn-main"><b>{u.name}</b><small>{u.reason ?? u.desc}</small></span>
                  <span className="up-btn-cost">${u.cost}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <footer className="up-foot">
        <span>Tap empty grass to deselect</span>
        <button className="sell-btn" onClick={onSell}>SELL ${sel.sell}</button>
      </footer>
    </aside>
  );
}
