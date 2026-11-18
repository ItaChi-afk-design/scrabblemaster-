import type { Game } from "@/types/game";

export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const getElapsedSeconds = (game: Game, now: number) => Math.floor((now - game.lastTick) / 1000);

export function tickTimedGame(game: Game, now: number): Game {
  const elapsed = getElapsedSeconds(game, now);
  if (elapsed <= 0) return game;

  if (elapsed < game.remaining) {
    return { ...game, remaining: game.remaining - elapsed, lastTick: now };
  }

  const overdue = elapsed - game.remaining;
  const turnsPassed = Math.floor(overdue / game.duration) + 1;

  return {
    ...game,
    current: (game.current + turnsPassed) % game.players.length,
    remaining: game.duration - (overdue % game.duration),
    running: true,
    lastTick: now,
  };
}

export const expireTimedGame = (game: Game, now: number): Game => ({
  ...game,
  remaining: 0,
  running: false,
  lastTick: now,
  pauseUntil: now + 2000,
});

export const advanceExpiredTurn = (game: Game, pauseUntil: number, now: number): Game =>
  game.pauseUntil !== pauseUntil
    ? game
    : {
        ...game,
        current: (game.current + 1) % game.players.length,
        remaining: game.duration,
        running: true,
        lastTick: now,
        pauseUntil: undefined,
      };

export const adjustTimedGame = (game: Game, delta: number, now: number): Game => {
  const remaining = Math.max(0, game.remaining + delta);
  return {
    ...game,
    remaining,
    lastTick: now,
    pauseUntil: remaining === 0 && game.running ? now + 2000 : undefined,
    running: game.running && remaining > 0,
  };
};

export const toggleTimedGame = (game: Game, now: number): Game => ({
  ...game,
  running: !game.running && game.remaining > 0,
  lastTick: now,
  pauseUntil: undefined,
});
