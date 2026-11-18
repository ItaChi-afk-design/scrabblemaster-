import { ANIMAL_AVATARS, MAX_PLAYERS, PLAYER_COLORS } from "@/lib/game-constants";
import type { Game, Player } from "@/types/game";

export const createId = (now: number) => `${now}-${Math.random().toString(36).slice(2)}`;

export const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export const getAnimalAvatar = (player: Player) =>
  player.avatarUrl ??
  ANIMAL_AVATARS[
    [...player.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
      ANIMAL_AVATARS.length
  ];

export const getRandomAnimalAvatar = (players: Player[] = []) => {
  const assigned = new Set(players.map(getAnimalAvatar));
  const available = ANIMAL_AVATARS.filter((avatar) => !assigned.has(avatar));
  const choices = available.length ? available : ANIMAL_AVATARS;
  return choices[Math.floor(Math.random() * choices.length)];
};

export const randomStartingPlayer = (playerCount: number) => Math.floor(Math.random() * playerCount);

export const createFreshGame = (now: number): Game => ({
  id: createId(now),
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: ["player 1"].map((name, index) => ({
    id: createId(now),
    name,
    color: PLAYER_COLORS[index],
    avatarUrl: getRandomAnimalAvatar(),
    score: 0,
  })),
  current: 0,
  duration: 180,
  remaining: 180,
  running: false,
  lastTick: now,
  events: [],
  undo: true,
  differences: true,
  vibration: true,
  created: new Date(now).toISOString(),
});

export const initialGameDraft: Game = {
  id: "draft",
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: [
    {
      id: "draft-1",
      name: "Alex Morgan",
      color: PLAYER_COLORS[0],
      avatarUrl: ANIMAL_AVATARS[0],
      score: 0,
    },
    {
      id: "draft-2",
      name: "Jamie Lee",
      color: PLAYER_COLORS[1],
      avatarUrl: ANIMAL_AVATARS[1],
      score: 0,
    },
  ],
  current: 0,
  duration: 180,
  remaining: 180,
  running: false,
  lastTick: 0,
  events: [],
  undo: true,
  differences: true,
  vibration: true,
  created: "",
};

export const createDraftPlayer = (players: Player[], now: number): Player => ({
  id: createId(now),
  name: `Player ${players.length + 1}`,
  color: PLAYER_COLORS[players.length % PLAYER_COLORS.length],
  avatarUrl: getRandomAnimalAvatar(players),
  score: 0,
});

export type StartGameResult = { game: Game } | { error: string };

export const startGameFromDraft = (draft: Game, now: number): StartGameResult => {
  if (draft.players.length === 0) return { error: "Add at least one player to start a game." };
  if (draft.players.length > MAX_PLAYERS) {
    return { error: `A game can have up to ${MAX_PLAYERS} players.` };
  }

  const names = draft.players.map((player) => player.name.trim());
  const hasEmptyName = names.some((name) => !name);
  const hasDuplicate = new Set(names.map((name) => name.toLowerCase())).size !== names.length;
  if (hasEmptyName || hasDuplicate) return { error: "Use a different name for each player." };

  return {
    game: {
      ...draft,
      title: draft.title.trim() || "Scrabble Game",
      players: draft.players.map((player, index) => ({ ...player, name: names[index] })),
      current: randomStartingPlayer(draft.players.length),
      running: draft.mode === "Timed",
      lastTick: now,
    },
  };
};

export const rankPlayers = (players: Player[]) => {
  const ranked = [...players].sort((first, second) => second.score - first.score);
  const highScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((player) => player.score === highScore);
  return {
    ranked,
    highScore,
    winners,
    kneelingPlayers: ranked.filter((player) => player.score < highScore),
  };
};

export const createRematch = (game: Game, now: number): Game => ({
  ...createFreshGame(now),
  title: game.title,
  mode: game.mode,
  duration: game.duration,
  remaining: game.duration,
  current: randomStartingPlayer(game.players.length),
  players: game.players.map((player, index) => ({
    ...player,
    id: createId(now),
    score: 0,
    color: PLAYER_COLORS[index],
  })),
});

export const getGameStatistics = (games: Game[]) => {
  const finishedGames = games.filter((game) => game.status === "finished");
  const allScores = finishedGames.flatMap((game) => game.players.map((player) => player.score));
  const highestScore = allScores.length ? Math.max(...allScores) : 0;
  const averageScore = allScores.length
    ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
    : 0;

  return {
    allScores,
    highestScore,
    summary: [
      ["Games played", finishedGames.length],
      ["Average score", averageScore],
      ["Highest score", highestScore],
      ["Active games", games.filter((game) => game.status === "active").length],
    ] as [string, number][],
  };
};
