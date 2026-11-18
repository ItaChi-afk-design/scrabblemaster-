export type GameMode = "Classic" | "Timed";

export type Player = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
  score: number;
};

export type ScoreEvent = {
  id: string;
  playerId: string;
  points: number;
  previous: number;
  next: number;
  at: string;
  undone?: boolean;
};

export type Game = {
  id: string;
  title: string;
  mode: GameMode;
  status: "active" | "finished";
  players: Player[];
  current: number;
  duration: number;
  remaining: number;
  running: boolean;
  lastTick: number;
  pauseUntil?: number;
  events: ScoreEvent[];
  undo: boolean;
  differences: boolean;
  vibration: boolean;
  keepScreenAwake?: boolean;
  created: string;
};

export type View =
  | "home"
  | "create"
  | "game"
  | "history"
  | "stats"
  | "throne"
  | "results"
  | "settings";

export type ScoreFlash = { playerId: string; id: string };
