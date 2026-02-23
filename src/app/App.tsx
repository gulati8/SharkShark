import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { difficulties, type DifficultyKey, type GameEvent, type GameState, type InputState, type PlayModeKey, type SaveData } from '../game/core';
import { KeyboardInput } from '../game/input/keyboard';
import { SfxEngine } from '../game/audio/sfx';
import { VirtualJoystick } from '../game/input/joystick';
import { loadSaveData, saveSaveData, updateAfterRun } from '../game/persistence/localStore';

const modeLabels: Record<PlayModeKey, string> = {
  arcade: 'Arcade',
  campaign: 'Campaign',
  challenges: 'Challenges',
};

type AppEventHook = {
  type:
    | 'run_start'
    | 'run_end'
    | 'milestone'
    | 'apex_hit'
    | 'apex_kill'
    | 'ad_slot_view';
  mode: PlayModeKey;
  difficulty: DifficultyKey;
  value?: number;
};

export function App() {
  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [toast, setToast] = useState<string>('');
  const [modeToast, setModeToast] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);

  const keyboardRef = useRef<KeyboardInput | null>(null);
  const joystickRef = useRef<VirtualJoystick | null>(null);
  const sfxRef = useRef<SfxEngine | null>(null);
  const startRunRef = useRef(false);
  const restartRunRef = useRef(false);
  const togglePauseRef = useRef(false);
  const appEventsRef = useRef<AppEventHook[]>([]);

  if (!joystickRef.current) joystickRef.current = new VirtualJoystick();
  if (!sfxRef.current) sfxRef.current = new SfxEngine();

  useEffect(() => {
    const keyboard = new KeyboardInput(window);
    keyboardRef.current = keyboard;
    return () => keyboard.destroy(window);
  }, []);

  useEffect(() => {
    saveSaveData(saveData);
  }, [saveData]);

  useEffect(() => {
    sfxRef.current?.updateThreatIntensity(gameState?.apexThreat.intensity ?? 0, saveData.settings.soundEnabled);
  }, [gameState?.apexThreat.intensity, saveData.settings.soundEnabled]);

  useEffect(() => {
    sfxRef.current?.setGameplayAudioState(
      saveData.settings.soundEnabled,
      gameState?.mode === 'playing',
    );
  }, [saveData.settings.soundEnabled, gameState?.mode]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 900);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!modeToast) return;
    const id = window.setTimeout(() => setModeToast(''), 1200);
    return () => window.clearTimeout(id);
  }, [modeToast]);

  const requestStart = () => {
    void sfxRef.current?.unlock();
    startRunRef.current = true;
  };

  const requestRestart = () => {
    void sfxRef.current?.unlock();
    restartRunRef.current = true;
  };

  const requestPause = () => {
    void sfxRef.current?.unlock();
    togglePauseRef.current = true;
  };

  const joystick = joystickRef.current;
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => joystick.onPointerDown(e.nativeEvent);
  const onAnyGesture = () => { void sfxRef.current?.unlock(); };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => joystick.onPointerMove(e.nativeEvent);
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => joystick.onPointerUp(e.nativeEvent);

  const getInputState = (): InputState => {
    const keyboard = keyboardRef.current;
    const joystick = joystickRef.current;
    const k = keyboard?.readMovement() ?? { x: 0, y: 0 };
    const j = joystick?.getMovement() ?? { x: 0, y: 0 };
    const pausePressed = (keyboard?.consumePausePressed() ?? false);
    if (pausePressed) togglePauseRef.current = true;
    return {
      movement: { x: k.x + j.x, y: k.y + j.y },
      pausePressed: false,
    };
  };

  const handleEvents = (events: GameEvent[]) => {
    sfxRef.current?.playEvents(events, saveData.settings.soundEnabled);
    for (const e of events) {
      if (e.type === 'growth') setToast(`Growth tier ${e.sizeTier}`);
      if (e.type === 'extra-life') setToast('Extra life');
      if (e.type === 'milestone') setToast(`${e.value}k milestone`);
      if (e.type === 'milestone') appEventsRef.current.push({ type: 'milestone', mode: saveData.selectedMode, difficulty, value: e.value });
      if (e.type === 'apex-hit') appEventsRef.current.push({ type: 'apex_hit', mode: saveData.selectedMode, difficulty, value: e.points });
      if (e.type === 'apex-killed') appEventsRef.current.push({ type: 'apex_kill', mode: saveData.selectedMode, difficulty, value: e.points });
    }
  };

  const handleRunStarted = () => {
    appEventsRef.current.push({ type: 'run_start', mode: saveData.selectedMode, difficulty });
    setSaveData((prev) => ({
      ...prev,
      meta: { ...prev.meta, totalRuns: prev.meta.totalRuns + 1 },
      stats: { ...prev.stats, runsStarted: prev.stats.runsStarted + 1 },
    }));
  };

  const handleRunEnded = (state: GameState) => {
    appEventsRef.current.push({ type: 'run_end', mode: saveData.selectedMode, difficulty: state.difficulty.key, value: state.run.score });
    setSaveData((prev) => updateAfterRun(prev, state.difficulty.key, state.run.score, state.run.timeSeconds, state.run.preyEaten, state.player.sizeTier));
  };

  const difficulty = saveData.selectedDifficulty;
  const selectedMode = saveData.selectedMode;
  const arcadeActive = selectedMode === 'arcade';

  const chooseMode = (mode: PlayModeKey) => {
    setSaveData((prev) => ({ ...prev, selectedMode: mode }));
    appEventsRef.current.push({ type: 'ad_slot_view', mode, difficulty });
    if (mode !== 'arcade') {
      setModeToast(`${modeLabels[mode]} mode scaffolded; arcade gameplay active for now`);
    }
  };

  return (
    <div
      className="app-shell"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={onAnyGesture}
      onTouchStart={onAnyGesture}
    >
      <section className="game-panel">
        <GameCanvas
          difficulty={difficulty}
          settings={saveData.settings}
          getInputState={getInputState}
          shouldStartRun={() => startRunRef.current || !!keyboardRef.current?.consumeStartPressed()}
          consumeStartRun={() => { startRunRef.current = false; }}
          shouldRestartRun={() => restartRunRef.current || !!keyboardRef.current?.consumeStartPressed()}
          consumeRestartRun={() => { restartRunRef.current = false; }}
          shouldTogglePause={() => togglePauseRef.current}
          consumeTogglePause={() => { togglePauseRef.current = false; }}
          onState={setGameState}
          onEvents={handleEvents}
          onRunStarted={handleRunStarted}
          onRunEnded={handleRunEnded}
        />

        <div className="overlay-stack" aria-hidden="true">
          {gameState?.mode === 'title' && (
            <div className="center-card">
              <h1>{selectedMode === 'arcade' ? 'Reef Rush' : `${modeLabels[selectedMode]} Preview`}</h1>
              <p>
                {arcadeActive
                  ? 'Eat smaller swimmers. Avoid larger predators. Grow every 1000 points.'
                  : 'Mode framework is enabled. Arcade gameplay loop is active while campaign/challenges content is being authored.'}
              </p>
              <button type="button" onClick={requestStart}>Start Run</button>
            </div>
          )}
          {gameState?.mode === 'paused' && (
            <div className="center-card compact">
              <h2>Paused</h2>
              <button type="button" onClick={requestPause}>Resume</button>
            </div>
          )}
          {gameState?.mode === 'gameOver' && (
            <div className="center-card compact">
              <h2>Game Over</h2>
              <p>Score {gameState.run.score}</p>
              <button type="button" onClick={requestRestart}>Retry</button>
            </div>
          )}
        </div>

        <div className="hud">
          <div>Score: {gameState?.run.score ?? 0}</div>
          <div>Lives: {gameState?.player.lives ?? difficulties[difficulty].startingLives}</div>
          <div>Size: {gameState?.player.sizeTier ?? 1}</div>
          <div>High: {saveData.highScores[difficulty]}</div>
        </div>

        <div className="hud-actions">
          {gameState?.mode === 'playing' && (
            <button type="button" className="hud-btn" onClick={requestPause} aria-label="Pause">&#9646;&#9646;</button>
          )}
          <button type="button" className="hud-btn" onClick={() => setMenuOpen(true)} aria-label="Menu">&#9776;</button>
        </div>
      </section>

      {menuOpen && (
        <div className="menu-overlay" onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="menu-panel">
            <div className="menu-header">
              <h2>Menu</h2>
              <button type="button" className="menu-close" onClick={() => setMenuOpen(false)}>&times;</button>
            </div>

            <div className="menu-section">
              <label>
                Mode
                <select
                  value={selectedMode}
                  onChange={(e) => chooseMode(e.target.value as PlayModeKey)}
                >
                  {Object.entries(modeLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty
                <select
                  value={difficulty}
                  onChange={(e) => setSaveData((prev) => ({ ...prev, selectedDifficulty: e.target.value as DifficultyKey }))}
                >
                  {Object.values(difficulties).map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="menu-section">
              <h3>Settings</h3>
              {([
                ['soundEnabled', 'Sound'],
                ['musicEnabled', 'Music'],
                ['hapticsEnabled', 'Haptics'],
                ['reducedMotion', 'Reduced Motion'],
              ] as const).map(([key, label]) => (
                <label key={key} className="toggle-row">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={saveData.settings[key]}
                    onChange={(e) => setSaveData((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, [key]: e.target.checked },
                    }))}
                  />
                </label>
              ))}
            </div>

            <div className="menu-section">
              <h3>Stats</h3>
              <div className="stats-grid">
                <span>Runs</span><strong>{saveData.stats.runsStarted}</strong>
                <span>Deaths</span><strong>{saveData.stats.totalDeaths}</strong>
                <span>Prey Eaten</span><strong>{saveData.stats.totalPreyEaten}</strong>
                <span>Best Size</span><strong>{saveData.stats.bestSizeTier}</strong>
                <span>Highest Milestone</span><strong>{saveData.meta.highestMilestone}k</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="touch-joystick">
        {(() => {
          const snap = joystickRef.current?.snapshot();
          if (!snap?.active) return null;
          return (
            <>
              <div className="joystick-anchor" style={{ left: snap.center.x, top: snap.center.y }} />
              <div className="joystick-knob" style={{ left: snap.knob.x, top: snap.knob.y }} />
            </>
          );
        })()}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {modeToast && <div className="toast mode-toast">{modeToast}</div>}
    </div>
  );
}
