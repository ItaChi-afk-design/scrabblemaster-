"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  advanceExpiredTurn,
  expireTimedGame,
  getElapsedSeconds,
  tickTimedGame,
} from "@/features/timer/timerService";
import { TimerSounds } from "@/features/timer/timerSounds";
import { CountdownSpeech } from "@/features/timer/timerSpeech";
import type { Game } from "@/types/game";

type GameTimerOptions = {
  game: Game | undefined;
  patchGame: (id: string, update: (game: Game) => Game) => void;
  onError: (message: string) => void;
};

export function useGameTimer({ game, patchGame, onError }: GameTimerOptions) {
  const gameRef = useRef<Game | undefined>(game);
  const patchRef = useRef(patchGame);
  const onErrorRef = useRef(onError);
  const soundsRef = useRef<TimerSounds | null>(null);
  const speechRef = useRef<CountdownSpeech | null>(null);

  gameRef.current = game;
  patchRef.current = patchGame;
  onErrorRef.current = onError;
  if (!soundsRef.current) soundsRef.current = new TimerSounds();
  if (!speechRef.current) speechRef.current = new CountdownSpeech();

  const unlockTimerSound = useCallback(() => {
    soundsRef.current?.unlock(onErrorRef.current);
  }, []);

  const gameId = game?.id;
  const running = game?.running;
  const mode = game?.mode;
  const status = game?.status;
  const pauseUntil = game?.pauseUntil;

  useEffect(() => {
    return () => soundsRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!running || mode !== "Timed" || status !== "active") return;

    const interval = window.setInterval(() => {
      const current = gameRef.current;
      if (
        !current ||
        current.id !== gameId ||
        !current.running ||
        current.mode !== "Timed" ||
        current.status !== "active"
      ) {
        return;
      }

      const now = Date.now();
      const secondsLeft = current.remaining - getElapsedSeconds(current, now);
      if (secondsLeft > 0) {
        soundsRef.current?.play(secondsLeft, onErrorRef.current);
        speechRef.current?.announce(secondsLeft);
        patchRef.current(current.id, (currentGame) => tickTimedGame(currentGame, now));
        return;
      }

      speechRef.current?.stop();
      soundsRef.current?.play(0, onErrorRef.current);
      patchRef.current(current.id, (currentGame) => expireTimedGame(currentGame, now));
    }, 1000);

    return () => {
      window.clearInterval(interval);
      speechRef.current?.stop();
    };
  }, [gameId, mode, running, status]);

  useEffect(() => {
    if (!pauseUntil || status !== "active" || !gameId) return;

    const timeout = window.setTimeout(() => {
      patchRef.current(gameId, (currentGame) => advanceExpiredTurn(currentGame, pauseUntil, Date.now()));
    }, Math.max(0, pauseUntil - Date.now()));

    return () => window.clearTimeout(timeout);
  }, [gameId, pauseUntil, status]);

  return { unlockTimerSound };
}
