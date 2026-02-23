import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene, type SceneBridge } from '../game/phaser/GameScene';
import type { DifficultyKey, GameEvent, GameState, GameSettings, InputState } from '../game/core';
import type { JoystickSnapshot, VirtualJoystick } from '../game/input/joystick';
import { reefTheme } from '../game/theme';

type Props = {
  difficulty: DifficultyKey;
  settings: GameSettings;
  getInputState: () => InputState;
  shouldStartRun: () => boolean;
  consumeStartRun: () => void;
  shouldRestartRun: () => boolean;
  consumeRestartRun: () => void;
  shouldTogglePause: () => boolean;
  consumeTogglePause: () => void;
  onState: (state: GameState) => void;
  onEvents: (events: GameEvent[]) => void;
  onRunStarted: () => void;
  onRunEnded: (state: GameState) => void;
};

export function GameCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const bridgeRef = useRef<SceneBridge | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = {
      getInputState: () => propsRef.current.getInputState(),
      onState: (state) => propsRef.current.onState(state),
      onEvents: (events) => propsRef.current.onEvents(events),
      onRunStarted: () => propsRef.current.onRunStarted(),
      onRunEnded: (state) => propsRef.current.onRunEnded(state),
      shouldStartRun: () => propsRef.current.shouldStartRun(),
      consumeStartRun: () => propsRef.current.consumeStartRun(),
      shouldRestartRun: () => propsRef.current.shouldRestartRun(),
      consumeRestartRun: () => propsRef.current.consumeRestartRun(),
      shouldTogglePause: () => propsRef.current.shouldTogglePause(),
      consumeTogglePause: () => propsRef.current.consumeTogglePause(),
      getDifficulty: () => propsRef.current.difficulty,
    };
  }

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 960,
      height: 540,
      backgroundColor: reefTheme.background,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [GameScene],
      audio: { noAudio: true },
      fps: { target: 60, forceSetTimeOut: true },
    });
    gameRef.current = game;
    game.scene.start('GameScene', { bridge: bridgeRef.current, theme: reefTheme });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas-host" ref={hostRef} aria-label="Game canvas" />;
}

export type { JoystickSnapshot, VirtualJoystick };
