import { createId } from "@/features/games/gameService";
import type { Game, ScoreEvent } from "@/types/game";

export const addScoreToGame = (game: Game, points: number, now: number): Game => {
  const player = game.players[game.current];
  const event: ScoreEvent = {
    id: createId(now),
    playerId: player.id,
    points,
    previous: player.score,
    next: player.score + points,
    at: new Date(now).toISOString(),
  };

  return {
    ...game,
    players: game.players.map((candidate, index) =>
      index === game.current ? { ...candidate, score: event.next } : candidate,
    ),
    events: [...game.events, event],
    current: (game.current + 1) % game.players.length,
    remaining: game.duration,
    lastTick: now,
  };
};

export const undoLatestScore = (game: Game, now: number): Game | null => {
  const lastEvent = [...game.events].reverse().find((event) => !event.undone);
  if (!lastEvent) return null;

  return {
    ...game,
    players: game.players.map((player) =>
      player.id === lastEvent.playerId ? { ...player, score: lastEvent.previous } : player,
    ),
    current: game.players.findIndex((player) => player.id === lastEvent.playerId),
    events: [
      ...game.events,
      { ...lastEvent, id: createId(now), undone: true, at: new Date(now).toISOString() },
    ],
  };
};
