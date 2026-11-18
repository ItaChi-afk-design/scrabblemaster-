import { GAME_STORAGE_KEY, ANIMAL_AVATARS } from "@/lib/game-constants";
import { readStoredJson, removeStoredValue, writeStoredJson } from "@/app/lib/browser-storage";
import type { Game, Player, ScoreEvent } from "@/types/game";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPlayer = (value: unknown): value is Player =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.color === "string" &&
  (value.avatarUrl === undefined ||
    (typeof value.avatarUrl === "string" && ANIMAL_AVATARS.some((avatar) => avatar === value.avatarUrl))) &&
  typeof value.score === "number" &&
  Number.isFinite(value.score);

const isScoreEvent = (value: unknown): value is ScoreEvent =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.playerId === "string" &&
  typeof value.points === "number" &&
  Number.isFinite(value.points) &&
  typeof value.previous === "number" &&
  Number.isFinite(value.previous) &&
  typeof value.next === "number" &&
  Number.isFinite(value.next) &&
  typeof value.at === "string" &&
  (value.undone === undefined || typeof value.undone === "boolean");

export const isGame = (value: unknown): value is Game =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  (value.mode === "Classic" || value.mode === "Timed") &&
  (value.status === "active" || value.status === "finished") &&
  Array.isArray(value.players) &&
  value.players.length > 0 &&
  value.players.every(isPlayer) &&
  typeof value.current === "number" &&
  Number.isFinite(value.current) &&
  typeof value.duration === "number" &&
  Number.isFinite(value.duration) &&
  value.duration > 0 &&
  typeof value.remaining === "number" &&
  Number.isFinite(value.remaining) &&
  value.remaining >= 0 &&
  typeof value.running === "boolean" &&
  typeof value.lastTick === "number" &&
  Number.isFinite(value.lastTick) &&
  (value.pauseUntil === undefined ||
    (typeof value.pauseUntil === "number" && Number.isFinite(value.pauseUntil))) &&
  Array.isArray(value.events) &&
  value.events.every(isScoreEvent) &&
  typeof value.undo === "boolean" &&
  typeof value.differences === "boolean" &&
  typeof value.vibration === "boolean" &&
  (value.keepScreenAwake === undefined || typeof value.keepScreenAwake === "boolean") &&
  typeof value.created === "string";

export type StoredGames = { games: Game[]; message?: string; warningShown: boolean };

export const loadStoredGames = (): StoredGames => {
  const getStorage = () => window.localStorage;
  const loaded = readStoredJson(getStorage, GAME_STORAGE_KEY, (value): value is unknown[] => Array.isArray(value));
  if (loaded.status === "ok") {
    const saved = loaded.value ?? [];
    let repaired = 0;
    let skipped = 0;
    const games = saved.flatMap((entry): Game[] => {
      if (!isGame(entry)) {
        skipped += 1;
        return [];
      }

      const current = Number.isInteger(entry.current)
        ? ((entry.current % entry.players.length) + entry.players.length) % entry.players.length
        : 0;
      if (current !== entry.current) repaired += 1;
      return [{ ...entry, current }];
    });
    const message = repaired || skipped
      ? `${repaired ? "A saved game's turn was reset. " : ""}${
          skipped ? `${skipped} invalid saved game${skipped === 1 ? "" : "s"} skipped.` : ""
        }`.trim()
      : undefined;
    return { games, message, warningShown: false };
  }

  if (loaded.status === "corrupt") {
    const removed = removeStoredValue(getStorage, GAME_STORAGE_KEY);
    return {
      games: [],
      message: removed
        ? "Saved games were damaged and couldn't be loaded."
        : "Saved games were damaged and couldn't be cleared.",
      warningShown: true,
    };
  }

  return {
    games: [],
    message: "Browser storage is unavailable; game changes are kept in memory and won't persist after this tab closes.",
    warningShown: true,
  };
};

export const persistGames = (games: Game[]) =>
  writeStoredJson(() => window.localStorage, GAME_STORAGE_KEY, games);
