"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  History,
  Home,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import Image from "next/image";
import { WordChecker } from "./word-checker";
import { ThroneRoom } from "./throne-room";
import { readStoredJson, removeStoredValue, writeStoredJson } from "./lib/browser-storage";

/* ============================================================
   TYPES
   ============================================================ */

type Player = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
  score: number;
};

type Event = {
  id: string;
  playerId: string;
  points: number;
  previous: number;
  next: number;
  at: string;
  undone?: boolean;
};

type Game = {
  id: string;
  title: string;
  mode: "Classic" | "Timed";
  status: "active" | "finished";
  players: Player[];
  current: number; // index of the player whose turn it is
  duration: number; // seconds per turn
  remaining: number; // seconds left in the current turn
  running: boolean;
  lastTick: number; // timestamp (ms) of the last timer update
  pauseUntil?: number; // short pause after time runs out
  events: Event[];
  undo: boolean;
  differences: boolean;
  vibration: boolean;
  keepScreenAwake?: boolean;
  created: string;
};

type View =
  | "home"
  | "create"
  | "game"
  | "history"
  | "stats"
  | "throne"
  | "results"
  | "settings";

/* ============================================================
   CONSTANTS & HELPERS
   ============================================================ */

const STORAGE_KEY = "scrabble-score-v2";
const COLORS = ["#c66551", "#4b927f", "#c89835", "#6e79b5", "#a35c91"];
const MAX_PLAYERS = 8;
const ANIMAL_AVATARS = [
  "https://images.unsplash.com/photo-1552053831-71594a27632d",
  "https://images.unsplash.com/photo-1518791841217-8f162f1e1131",
  "https://images.unsplash.com/photo-1474511320723-9a56873867b5",
  "https://images.unsplash.com/photo-1564760055775-d63b17a55c44",
  "https://images.unsplash.com/photo-1546182990-dffeafbe841d",
  "https://images.unsplash.com/photo-1551986782-d0169b3f8fa7",
  "https://images.unsplash.com/photo-1484406566174-9da000fda645",
] as const;
const TURN_DURATIONS = [60, 120, 180, 300];
const getCurrentTime = () => Date.now();

// Unique id
const uid = (now: number) => `${now}-${Math.random().toString(36).slice(2)}`;
const getAnimalAvatar = (player: Player) =>
  player.avatarUrl ??
  ANIMAL_AVATARS[
    [...player.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
      ANIMAL_AVATARS.length
  ];
const getRandomAnimalAvatar = (players: Player[] = []) => {
  const assigned = new Set(players.map(getAnimalAvatar));
  const available = ANIMAL_AVATARS.filter((avatar) => !assigned.has(avatar));
  const choices = available.length ? available : ANIMAL_AVATARS;
  return choices[Math.floor(Math.random() * choices.length)];
};
const randomStartingPlayer = (playerCount: number) =>
  Math.floor(Math.random() * playerCount);

// 125 seconds -> "2:05"
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

const rankPlayers = (players: Player[]) => {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const highScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((player) => player.score === highScore);
  return {
    ranked,
    highScore,
    winners,
    kneelingPlayers: ranked.filter((player) => player.score < highScore),
  };
};

// Creates a brand new default game
const createFreshGame = (now: number): Game => ({
  id: uid(now),
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: ["player 1"].map((name, i) => ({
    id: uid(now),
    name,
    color: COLORS[i],
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

// Initial value for the "New game" form (no Date.now/uid so it's stable on first render)
const initialDraft: Game = {
  id: "draft",
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: [
    {
      id: "draft-1",
      name: "Alex Morgan",
      color: COLORS[0],
      avatarUrl: ANIMAL_AVATARS[0],
      score: 0,
    },
    {
      id: "draft-2",
      name: "Jamie Lee",
      color: COLORS[1],
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPlayer = (value: unknown): value is Player =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.color === "string" &&
  (value.avatarUrl === undefined ||
    (typeof value.avatarUrl === "string" &&
      ANIMAL_AVATARS.some((avatar) => avatar === value.avatarUrl))) &&
  typeof value.score === "number" &&
  Number.isFinite(value.score);

const isEvent = (value: unknown): value is Event =>
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

const isGame = (value: unknown): value is Game =>
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
  value.events.every(isEvent) &&
  typeof value.undo === "boolean" &&
  typeof value.differences === "boolean" &&
  typeof value.vibration === "boolean" &&
  (value.keepScreenAwake === undefined || typeof value.keepScreenAwake === "boolean") &&
  typeof value.created === "string";

/**
 * Advances the turn timer based on real elapsed time.
 * If more time passed than is left (e.g. the tab was in the background),
 * it skips ahead the correct number of turns.
 */
function tickTimedGame(game: Game, now: number): Game {
  const elapsed = Math.floor((now - game.lastTick) / 1000);
  if (elapsed <= 0) return game;

  // Normal case: still time left in this turn
  if (elapsed < game.remaining) {
    return { ...game, remaining: game.remaining - elapsed, lastTick: now };
  }

  // Turn(s) ran out while we weren't looking
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

/* ============================================================
   SMALL UI COMPONENTS
   ============================================================ */

function Avatar({ p, small = false }: { p: Player; small?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <i
      className={small ? "avatar small" : "avatar"}
      style={{ background: p.color, borderColor: p.color }}
    >
      {imageFailed ? (
        getInitials(p.name)
      ) : (
        <Image
          src={getAnimalAvatar(p)}
          alt={`${p.name}'s animal avatar`}
          width={small ? 27 : 38}
          height={small ? 27 : 38}
          onError={() => setImageFailed(true)}
        />
      )}
    </i>
  );
}

function Toggle({
  label,
  on,
  value,
}: {
  label: string;
  on: () => void;
  value: boolean;
}) {
  return (
    <button className="toggle" onClick={on}>
      <b>{label}</b>
      <span className={value ? "on" : ""}>
        <i />
      </span>
    </button>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <i>✦</i>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function HauntedDecorations() {
  return (
    <div className="hauntedDecorLayer" aria-hidden="true">
      <svg className="hauntedPageWeb hauntedPageWebLeft" viewBox="0 0 100 100">
        <path d="M0 0H100M0 0V100M0 0L72 72M0 0L100 35M0 0L35 100M12 0C12 12 0 12 0 12M30 0C30 30 0 30 0 30M50 0C50 50 0 50 0 50M70 0C70 70 0 70 0 70" />
      </svg>
      <svg className="hauntedPageWeb hauntedPageWebRight" viewBox="0 0 100 100">
        <path d="M0 0H100M0 0V100M0 0L72 72M0 0L100 35M0 0L35 100M12 0C12 12 0 12 0 12M30 0C30 30 0 30 0 30M50 0C50 50 0 50 0 50M70 0C70 70 0 70 0 70" />
      </svg>
      <svg className="hauntedHangingSpider hauntedHangingSpiderOne" viewBox="0 0 24 88">
        <path className="hauntedSilk" d="M12 0V59" />
        <g className="hauntedSpiderBody">
          <circle cx="12" cy="65" r="2" />
          <ellipse cx="12" cy="70" rx="3.5" ry="5" />
          <path d="M9 65 4 62M9 68 3 68M9 71 4 75M15 65 20 62M15 68 21 68M15 71 20 75" />
        </g>
      </svg>
      <svg className="hauntedHangingSpider hauntedHangingSpiderTwo" viewBox="0 0 24 88">
        <path className="hauntedSilk" d="M12 0V59" />
        <g className="hauntedSpiderBody">
          <circle cx="12" cy="65" r="2" />
          <ellipse cx="12" cy="70" rx="3.5" ry="5" />
          <path d="M9 65 4 62M9 68 3 68M9 71 4 75M15 65 20 62M15 68 21 68M15 71 20 75" />
        </g>
      </svg>
      <svg className="hauntedFloatingGhost hauntedFloatingGhostOne" viewBox="0 0 64 84">
        <path d="M32 4C16 4 7 17 7 34v39l11-8 9 10 10-10 10 9V34C47 17 40 4 32 4Z" />
        <ellipse cx="24" cy="34" rx="2.2" ry="3.4" />
        <ellipse cx="39" cy="34" rx="2.2" ry="3.4" />
        <path d="M27 44c3 3 7 3 10 0" />
      </svg>
      <svg className="hauntedFloatingGhost hauntedFloatingGhostTwo" viewBox="0 0 64 84">
        <path d="M32 4C16 4 7 17 7 34v39l11-8 9 10 10-10 10 9V34C47 17 40 4 32 4Z" />
        <ellipse cx="24" cy="34" rx="2.2" ry="3.4" />
        <ellipse cx="39" cy="34" rx="2.2" ry="3.4" />
        <path d="M27 44c3 3 7 3 10 0" />
      </svg>
      <svg className="hauntedBranch hauntedBranchLeft" viewBox="0 0 120 240">
        <path d="M5 238C30 194 24 154 48 116S68 47 103 4M39 132 8 96M45 121 77 92M67 71 53 38M79 54 112 39M25 181 2 154" />
      </svg>
      <svg className="hauntedBranch hauntedBranchRight" viewBox="0 0 120 240">
        <path d="M5 238C30 194 24 154 48 116S68 47 103 4M39 132 8 96M45 121 77 92M67 71 53 38M79 54 112 39M25 181 2 154" />
      </svg>
      <svg className="hauntedBat" viewBox="0 0 48 24">
        <path d="M24 8C17 1 11 2 6 4l3 7L1 8l3 12 9-5 5 7 6-7 6 7 5-7 9 5 3-12-8 3 3-7c-5-2-11-3-18 4Z" />
      </svg>
      <i className="hauntedDust hauntedDustOne" />
      <i className="hauntedDust hauntedDustTwo" />
      <i className="hauntedDust hauntedDustThree" />
      <i className="hauntedDust hauntedDustFour" />
    </div>
  );
}

function GameCard({
  game,
  on,
  resume = false,
}: {
  game: Game;
  on: () => void;
  resume?: boolean;
}) {
  const label = resume
    ? "Resume"
    : game.status === "active"
      ? "In progress"
      : "Finished";

  return (
    <button className={`gameCard ${resume ? "resume" : ""}`} onClick={on}>
      <i>{game.status === "finished" ? <Trophy /> : <Clock3 />}</i>
      <span>
        <b>{game.title}</b>
        <small>
          {game.players.length} players · {game.mode} mode
        </small>
      </span>
      <em>
        {label}
        <ChevronRight />
      </em>
    </button>
  );
}

/* ============================================================
   HOOK: keep the screen awake while playing
   ============================================================ */

function useScreenWakeLock(enabled: boolean, onError: (message: string) => void) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (!("wakeLock" in navigator)) {
      onError("Screen wake lock isn't supported by this browser.");
      return;
    }

    let cancelled = false;

    const requestLock = async () => {
      if (cancelled || document.visibilityState !== "visible" || lockRef.current) return;

      try {
        const lock = await navigator.wakeLock.request("screen");

        if (cancelled) {
          await lock.release();
          return;
        }

        lockRef.current = lock;

        // If the browser releases the lock, ask for it again
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) lockRef.current = null;
          if (!cancelled && document.visibilityState === "visible") void requestLock();
        });
      } catch {
        if (!cancelled) {
          onError("Couldn't keep the screen awake. Check browser support and permissions.");
        }
      }
    };

    // Browsers drop the lock when the tab is hidden, so re-request when it's visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void requestLock();
      else lockRef.current = null;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void requestLock();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);

      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) {
        void lock.release().catch(() => onError("Couldn't release the screen wake lock."));
      }
    };
  }, [enabled, onError]);
}

/* ============================================================
   MAIN APP
   ============================================================ */

export default function App() {
  /* ---------- State ---------- */
  const [games, setGames] = useState<Game[]>([]);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<Game>(initialDraft);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [pumpkinClicks, setPumpkinClicks] = useState(0);
  const [scoreFlash, setScoreFlash] = useState<{ playerId: string; id: string } | null>(null);
  const storageWarningShown = useRef(false);
  const scoreFlashTimer = useRef<number | undefined>(undefined);

  /* ---------- Derived values & refs ---------- */
  const game = games.find((g) => g.id === selected);
  const active = games.find((g) => g.status === "active");
  const gameRef = useRef<Game | undefined>(undefined);
  const audioContext = useRef<AudioContext | null>(null);
  const finishDialogRef = useRef<HTMLDialogElement>(null);

  // Replace a game with an updated copy
  const save = (g: Game) =>
    setGames((list) => list.map((x) => (x.id === g.id ? g : x)));

  // Update a game by id using a function
  const patch = (id: string, fn: (g: Game) => Game) =>
    setGames((list) => list.map((x) => (x.id === id ? fn(x) : x)));

  // Show a short message at the bottom of the screen
  const say = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(
    () => () => {
      if (scoreFlashTimer.current !== undefined) window.clearTimeout(scoreFlashTimer.current);
    },
    [],
  );

  /* ---------- Timer sounds ---------- */

  // Browsers only allow audio after a user action, so call this on click
  const unlockTimerSound = () => {
    if (typeof window.AudioContext === "undefined") {
      say("Timer sound isn't supported by this browser.");
      return;
    }
    const context = audioContext.current ?? new AudioContext();
    audioContext.current = context;
    void context.resume().catch(() => say("Could not enable timer sound."));
  };

  // secondsLeft = 0 plays the "time's up" buzz; otherwise a tick that gets
  // louder, faster and more urgent as the time runs out.
  const playTimerSound = useCallback(
    (secondsLeft = 0) => {
      const context = audioContext.current;
      if (!context) return;

      const play = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = "sine";

        // --- Time's up: long, low buzz ---
        if (secondsLeft === 0) {
          oscillator.type = "sawtooth";
          oscillator.frequency.setValueAtTime(150, now);
          oscillator.frequency.exponentialRampToValueAtTime(95, now + 1.6);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
          gain.gain.setValueAtTime(0.5, now + 1.35);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(now + 1.71);
          return;
        }

        // --- Countdown tick: changes by how close we are to zero ---
        const finalFive = secondsLeft <= 5;
        const finalTen = secondsLeft <= 10;
        const finalTwenty = secondsLeft <= 20;

        const frequency = finalFive
          ? 300 - secondsLeft * 15
          : finalTen
            ? 900 + (10 - secondsLeft) * 45
            : finalTwenty
              ? 650 + (20 - secondsLeft) * 25
              : 520;

        const volume = finalFive
          ? 0.27 + (5 - secondsLeft) * 0.03
          : finalTen
            ? 0.24
            : finalTwenty
              ? 0.16
              : 0.09;

        const duration = finalFive ? 0.3 : finalTen ? 0.22 : finalTwenty ? 0.18 : 0.12;

        // 6–10 seconds left gets a quick double beep
        const doubleBeep = finalTen && !finalFive;

        oscillator.type = finalFive ? "sawtooth" : "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        if (finalFive) {
          oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);
        }

        // First beep
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        // Second beep
        if (doubleBeep) {
          gain.gain.setValueAtTime(0.0001, now + duration + 0.04);
          gain.gain.exponentialRampToValueAtTime(volume, now + duration + 0.055);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.16);
        }

        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(now + duration + (doubleBeep ? 0.17 : 0.01));
      };

      if (context.state === "running") play();
      else void context.resume().then(play).catch(() => say("Could not play timer sound."));
    },
    [say],
  );

  /* ---------- Effects ---------- */

  // Keep a ref to the latest selected game (used inside the interval)
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // Load saved games from localStorage on first render
  useEffect(() => {
    const getStorage = () => window.localStorage;
    const loaded = readStoredJson(getStorage, STORAGE_KEY, (value): value is unknown[] => Array.isArray(value));
    if (loaded.status === "ok") {
      const saved = loaded.value ?? [];
      let repaired = 0;
      let skipped = 0;
      const loadedGames = saved.flatMap((entry): Game[] => {
        if (!isGame(entry)) {
          skipped += 1;
          return [];
        }

        const current =
          Number.isInteger(entry.current)
            ? ((entry.current % entry.players.length) + entry.players.length) %
              entry.players.length
            : 0;
        if (current !== entry.current) repaired += 1;

        return [{ ...entry, current }];
      });
      setGames(loadedGames);
      if (repaired || skipped) {
        setToast(
          `${repaired ? "A saved game's turn was reset. " : ""}${
            skipped ? `${skipped} invalid saved game${skipped === 1 ? "" : "s"} skipped.` : ""
          }`.trim(),
        );
      }
    } else if (loaded.status === "corrupt") {
      const removed = removeStoredValue(getStorage, STORAGE_KEY);
      storageWarningShown.current = true;
      setToast(removed
        ? "Saved games were damaged and couldn't be loaded."
        : "Saved games were damaged and couldn't be cleared.");
    } else {
      storageWarningShown.current = true;
      setToast("Browser storage is unavailable; game changes are kept in memory and won't persist after this tab closes.");
    }
    setReady(true);
  }, []);

  // Save games to localStorage whenever they change
  useEffect(() => {
    if (!ready) return;
    const written = writeStoredJson(() => window.localStorage, STORAGE_KEY, games);
    if (!written && !storageWarningShown.current) {
      storageWarningShown.current = true;
      say("Browser storage is unavailable; game changes are kept in memory and won't persist after this tab closes.");
    } else if (written) {
      storageWarningShown.current = false;
    }
  }, [games, ready, say]);

  // Turn countdown: runs every second while a timed game is running
  useEffect(() => {
    if (!game?.running || game.mode !== "Timed" || game.status !== "active") return;

    const interval = window.setInterval(() => {
      const current = gameRef.current;
      if (
        !current ||
        current.id !== game.id ||
        !current.running ||
        current.mode !== "Timed" ||
        current.status !== "active"
      ) {
        return;
      }

      const now = Date.now();
      const elapsed = Math.floor((now - current.lastTick) / 1000);
      const secondsLeft = current.remaining - elapsed;

      // Still time left: play a tick and update the clock
      if (secondsLeft > 0) {
        playTimerSound(secondsLeft);
        patch(current.id, (g) => tickTimedGame(g, now));
        return;
      }

      // Time's up: buzz, stop, and pause briefly before the next turn
      playTimerSound();
      patch(current.id, (g) => ({
        ...g,
        remaining: 0,
        running: false,
        lastTick: now,
        pauseUntil: now + 2000,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [game?.id, game?.running, game?.mode, game?.status, playTimerSound]);

  // After the "time's up" pause, move on to the next player
  useEffect(() => {
    if (!game?.pauseUntil || game.status !== "active") return;

    const pauseUntil = game.pauseUntil;
    const timeout = window.setTimeout(
      () => {
        const now = Date.now();
        patch(game.id, (g) =>
          g.pauseUntil !== pauseUntil
            ? g
            : {
                ...g,
                current: (g.current + 1) % g.players.length,
                remaining: g.duration,
                running: true,
                lastTick: now,
                pauseUntil: undefined,
              },
        );
      },
      Math.max(0, pauseUntil - Date.now()),
    );

    return () => clearTimeout(timeout);
  }, [game?.id, game?.pauseUntil, game?.status]);

  // Keep the screen on during an active game (if enabled in settings)
  useScreenWakeLock(
    Boolean(
      game?.keepScreenAwake &&
        game.status === "active" &&
        (view === "game" || view === "settings"),
    ),
    say,
  );

  /* ---------- Actions ---------- */

  // Open a game (active -> game screen, finished -> results screen)
  const open = (g: Game, v: View = g.status === "active" ? "game" : "results") => {
    if (g.mode === "Timed") unlockTimerSound();
    setSelected(g.id);
    setInput("");
    setView(v);
  };

  const goHome = () => {
    setSelected(undefined);
    setView("home");
  };

  const goTo = (v: View) => {
    setSelected(undefined);
    setView(v);
  };

  // Validate the "New game" form and start the game
  const start = (now: number) => {
    if (draft.players.length === 0) {
      return setError("Add at least one player to start a game.");
    }
    if (draft.players.length > MAX_PLAYERS) {
      return setError(`A game can have up to ${MAX_PLAYERS} players.`);
    }

    const names = draft.players.map((p) => p.name.trim());
    const hasEmptyName = names.some((n) => !n);
    const hasDuplicate = new Set(names.map((n) => n.toLowerCase())).size !== names.length;

    if (hasEmptyName || hasDuplicate) {
      return setError("Use a different name for each player.");
    }

    const newGame: Game = {
      ...draft,
      title: draft.title.trim() || "Scrabble Game",
      players: draft.players.map((p, i) => ({ ...p, name: names[i] })),
      current: randomStartingPlayer(draft.players.length),
      running: draft.mode === "Timed",
      lastTick: now,
    };

    setGames((list) => [newGame, ...list]);
    open(newGame);
  };

  // Add points for the current player, then pass the turn
  const addScore = (points: number, now: number) => {
    if (!game || !Number.isFinite(points) || !points) return;
    const scoredPlayer = game.players[game.current];
    if (scoreFlashTimer.current !== undefined) window.clearTimeout(scoreFlashTimer.current);
    setScoreFlash({ playerId: scoredPlayer.id, id: uid(now) });
    scoreFlashTimer.current = window.setTimeout(() => setScoreFlash(null), 650);

    patch(game.id, (g) => {
      const player = g.players[g.current];
      const event: Event = {
        id: uid(now),
        playerId: player.id,
        points,
        previous: player.score,
        next: player.score + points,
        at: new Date(now).toISOString(),
      };

      return {
        ...g,
        players: g.players.map((p, i) => (i === g.current ? { ...p, score: event.next } : p)),
        events: [...g.events, event],
        current: (g.current + 1) % g.players.length,
        remaining: g.duration,
        lastTick: now,
      };
    });

    if (game.vibration) navigator.vibrate?.(12);
    setInput("");
  };

  const adjustTimer = (delta: number) => {
    if (!game || game.mode !== "Timed" || game.status !== "active") return;

    const now = Date.now();
    const nextRemaining = Math.max(0, game.remaining + delta);

    save({
      ...game,
      remaining: nextRemaining,
      lastTick: now,
      pauseUntil: nextRemaining === 0 && game.running ? now + 2000 : undefined,
      running: game.running && nextRemaining > 0,
    });
  };

  // Undo the most recent score that hasn't already been undone
  const undoLastScore = (now: number) => {
    if (!game) return;

    const lastEvent = [...game.events].reverse().find((e) => !e.undone);
    if (!lastEvent) return say("There is no score to undo.");

    patch(game.id, (g) => ({
      ...g,
      players: g.players.map((p) =>
        p.id === lastEvent.playerId ? { ...p, score: lastEvent.previous } : p,
      ),
      current: g.players.findIndex((p) => p.id === lastEvent.playerId),
      events: [
        ...g.events,
        { ...lastEvent, id: uid(now), undone: true, at: new Date(now).toISOString() },
      ],
    }));

    say("Last score undone");
  };

  const newGame = () => {
    setDraft(createFreshGame(Date.now()));
    setError("");
    setView("create");
  };

  const clickHauntedBadge = () =>
    say("A whisper from beyond: the best words are written after dark.");

  const clickPumpkin = () => {
    if (pumpkinClicks === 2) {
      setPumpkinClicks(0);
      say("The pumpkin grins. The spirits are listening...");
      return;
    }

    setPumpkinClicks((count) => count + 1);
  };

  /* ---------- Shared layout pieces ---------- */

  const Header = ({ title, back = true }: { title: string; back?: boolean }) => (
    <header className={back ? "siteHeader" : "siteHeader dashboardHeader"}>
      <button
        className="icon"
        onClick={() => (back ? setView(game ? "game" : "home") : goHome())}
        aria-label={back ? "Back" : "Wordkeeper home"}
      >
        {back ? (
          <ChevronLeft />
        ) : (
          <span className="logo">
            S<sup>1</sup>
          </span>
        )}
      </button>

      <div className="brand">
        <small>WORDKEEPER</small>
        <h1>{title}</h1>
      </div>

      <div className="headerLinks">
        <button onClick={goHome}>Dashboard</button>
        <button onClick={() => goTo("history")}>History</button>
        <button onClick={() => goTo("stats")}>Statistics</button>
      </div>

      <button className="headerNew" onClick={newGame}>
        <Plus /> New game
      </button>

      {game && view === "game" ? (
        <button className="icon" onClick={() => setView("settings")} aria-label="Settings">
          <Settings />
        </button>
      ) : (
        back && <span className="space" />
      )}
    </header>
  );

  const Nav = () => (
    <nav>
      <button className={view === "home" ? "active" : ""} onClick={goHome}>
        <Home />
        Home
      </button>
      <button className={view === "history" ? "active" : ""} onClick={() => goTo("history")}>
        <History />
        History
      </button>
      <button className={view === "stats" ? "active" : ""} onClick={() => goTo("stats")}>
        <BarChart3 />
        Stats
      </button>
    </nav>
  );

  /* ============================================================
     SCREENS
     ============================================================ */

  // ---------- Loading ----------
  if (!ready) return <main className="loading">Loading your scorebook…</main>;

  // ---------- New game form ----------
  if (view === "create") {
    const updatePlayer = (index: number, changes: Partial<Player>) =>
      setDraft({
        ...draft,
        players: draft.players.map((p, i) => (i === index ? { ...p, ...changes } : p)),
      });

    return (
      <main className="app hauntedTheme gothicPages hauntedDecorated">
        <HauntedDecorations />
        <Header title="New game" />
        <section>
          <label>
            GAME NAME
            <input
              value={draft.title}
              onChange={(e) => {
                setError("");
                setDraft({ ...draft, title: e.target.value });
              }}
            />
          </label>

          {/* Mode */}
          <p>GAME MODE</p>
          <div className="modes">
            {(["Classic", "Timed"] as const).map((m) => (
              <button
                className={draft.mode === m ? "selected" : ""}
                onClick={() => setDraft({ ...draft, mode: m, running: false })}
                key={m}
              >
                <b>{m}</b>
                <small>{m === "Classic" ? "No turn timer" : "Timer per turn"}</small>
              </button>
            ))}
          </div>

          {/* Players */}
          <div className="line">
            <p>PLAYERS</p>
            <small>{draft.players.length} / {MAX_PLAYERS}</small>
          </div>

          {draft.players.map((p, i) => (
            <div className="player" key={p.id}>
              <Avatar p={p} />
              <input
                value={p.name}
                aria-label="Player name"
                onChange={(e) => updatePlayer(i, { name: e.target.value })}
              />
              {/* Click the dot to cycle through colors */}
              <button
                className="dot"
                style={{ background: p.color }}
                onClick={() =>
                  updatePlayer(i, {
                    color: COLORS[(COLORS.indexOf(p.color) + 1) % COLORS.length],
                  })
                }
              />
              <button
                className="remove"
                disabled={draft.players.length <= 1}
                onClick={() =>
                  setDraft({ ...draft, players: draft.players.filter((_, j) => j !== i) })
                }
              >
                <X />
              </button>
            </div>
          ))}

          {draft.players.length < MAX_PLAYERS && (
            <button
              className="addPlayer"
              onClick={() =>
                setDraft({
                  ...draft,
                  players: [
                    ...draft.players,
                    {
                      id: uid(Date.now()),
                      name: `Player ${draft.players.length + 1}`,
                      color: COLORS[draft.players.length % COLORS.length],
                      avatarUrl: getRandomAnimalAvatar(draft.players),
                      score: 0,
                    },
                  ],
                })
              }
            >
              <Plus />
              Add player
            </button>
          )}

          {/* Turn duration (Timed only) */}
          {draft.mode === "Timed" && (
            <>
              <p>TURN DURATION</p>
              <div className="duration">
                {TURN_DURATIONS.map((n) => (
                  <button
                    className={draft.duration === n ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, duration: n, remaining: n })}
                    key={n}
                  >
                    {n === 60 ? "1 min" : `${n / 60} min`}
                  </button>
                ))}
                <input
                  type="number"
                  min="10"
                  value={draft.duration}
                  onChange={(e) => {
                    const n = Math.max(10, +e.target.value || 10);
                    setDraft({ ...draft, duration: n, remaining: n });
                  }}
                />
              </div>
            </>
          )}

          {/* Options */}
          <div className="card">
            <Toggle
              label="Allow undo"
              value={draft.undo}
              on={() => setDraft({ ...draft, undo: !draft.undo })}
            />
            <Toggle
              label="Show score difference"
              value={draft.differences}
              on={() => setDraft({ ...draft, differences: !draft.differences })}
            />
            <Toggle
              label="Vibration feedback"
              value={draft.vibration}
              on={() => setDraft({ ...draft, vibration: !draft.vibration })}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button className="primary" onClick={() => start(getCurrentTime())}>
            Start game <ChevronRight />
          </button>
        </section>
      </main>
    );
  }

  // ---------- Live game ----------
  if (view === "game" && game) {
    const leadScore = Math.max(...game.players.map((p) => p.score));
    const currentPlayer = game.players[game.current];
    const rankedPlayers = game.players
      .map((player, playerIndex) => ({ player, playerIndex }))
      .sort((a, b) => b.player.score - a.player.score);

    const timerLabel = game.running
      ? "CURRENT TURN"
      : game.pauseUntil
        ? "TIME'S UP"
        : game.remaining
          ? "PAUSED"
          : "TIME EXPIRED";
    const finishGame = () => {
      finishDialogRef.current?.close();
      patch(game.id, (current) => ({
        ...current,
        status: "finished",
        running: false,
        pauseUntil: undefined,
      }));
      setView("throne");
    };

    return (
      <main className="app hauntedTheme gameScreen gothicPages hauntedDecorated">
        <HauntedDecorations />
        <Header title={game.title} back={false} />
        <section>
          {/* Timer */}
          {game.mode === "Timed" && (
            <div className={`timer ${game.remaining <= 20 ? "warn" : ""}`}>
              <div>
                <strong>{formatTime(game.remaining)}</strong>
                <small>{timerLabel}</small>
              </div>
              <aside>
                <button onClick={() => adjustTimer(-30)}>−30</button>
                <button
                  className="play"
                  onClick={() =>
                    save({
                      ...game,
                      running: !game.running && game.remaining > 0,
                      lastTick: Date.now(),
                      pauseUntil: undefined,
                    })
                  }
                >
                  {game.running ? <Pause /> : <Play />}
                </button>
                <button onClick={() => adjustTimer(30)}>+30</button>
              </aside>
            </div>
          )}

          <div className="meta">
            <b>
              <Clock3 />
              {game.mode} game
            </b>
          </div>

          <p className="turn">● {currentPlayer.name}&apos;s turn</p>

          <div className="leaderboardHeading">
            <div>
              <small>THE HAUNTED RANKINGS</small>
              <h2>Haunted leaderboard</h2>
            </div>
            <span>Tap a player to select their turn</span>
          </div>

          <div className="leaderboard">
            <div className="leaderboardHeader" aria-hidden="true">
              <span>RANK</span>
              <span className="leaderboardAvatarSpace" />
              <span>PLAYER</span>
              <span>POINTS</span>
            </div>
            <ol className="scores" aria-label="Player rankings">
              {rankedPlayers.map(({ player: p, playerIndex }, i) => {
                const rank =
                  rankedPlayers.findIndex(({ player }) => player.score === p.score) + 1;
                const isCurrent = playerIndex === game.current;

                return (
                  <li
                    className={`leaderboardItem ${scoreFlash?.playerId === p.id ? "scoreFlash" : ""}`}
                    key={`${p.id}-${rank}`}
                    style={{ animationDelay: `${Math.min(i * 45, 180)}ms` }}
                  >
                    <button
                      className={`leaderboardRow ${isCurrent ? "current" : ""} ${
                        scoreFlash?.playerId === p.id ? "scored" : ""
                      }`}
                      key={scoreFlash?.playerId === p.id ? scoreFlash.id : p.id}
                      onClick={() => save({ ...game, current: playerIndex, lastTick: Date.now() })}
                      aria-label={`Rank ${rank}, ${p.name}, ${p.score} points${
                        isCurrent ? ", playing now" : ""
                      }. Select this player as the current turn`}
                    >
                      <span className={`leaderboardRank ${rank === 1 ? "isLeader" : ""}`}>
                        {rank === 1 ? <Crown aria-hidden="true" /> : <span aria-hidden="true">{rank}</span>}
                      </span>
                      <Avatar p={p} />
                      <span className="leaderboardPlayer">
                        <b>{p.name}</b>
                        {isCurrent ? (
                          <small>Playing now</small>
                        ) : game.differences ? (
                          <small>
                            {p.score === leadScore
                              ? "Tied for the lead"
                              : `${leadScore - p.score} pts behind`}
                          </small>
                        ) : null}
                      </span>
                      <span className="leaderboardPoints">
                        <strong>{p.score}</strong>
                        <small>PTS</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Score entry */}
          <div className="entry">
            <div className="quick">
              {[5, 10, 15, -5].map((n) => (
                <button className={n < 0 ? "negative" : ""} onClick={() => addScore(n, Date.now())} key={n}>
                  {n > 0 ? "+" : ""}
                  {n}
                </button>
              ))}
            </div>

            <div className="scoreInput">
              <input
                placeholder="0"
                inputMode="numeric"
                value={input}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addScore(+input, Date.now());
                }}
                onChange={(e) => setInput(e.target.value.replace(/[^0-9-]/g, ""))}
              />
              <button
                className="primary"
                disabled={!input || !+input}
                onClick={() => addScore(+input, Date.now())}
              >
                Add score <Plus />
              </button>
            </div>

            {game.undo && (
              <button className="undo" onClick={() => undoLastScore(Date.now())}>
                <RotateCcw />
                Undo last score
              </button>
            )}
          </div>

          <button
            className="finishButton"
            onClick={() => finishDialogRef.current?.showModal()}
          >
            Finish game
          </button>
          <WordChecker />
        </section>

        <dialog
          ref={finishDialogRef}
          className="finishDialog"
          aria-labelledby="finishDialogTitle"
          aria-describedby="finishDialogDescription"
        >
          <div className="finishDialogContent">
            <div className="finishDialogHeading">
              <span className="finishDialogIcon">
                <Trophy />
              </span>
              <div>
                <span className="finishDialogEyebrow">GAME COMPLETE</span>
                <h2 id="finishDialogTitle">Finish this game?</h2>
              </div>
            </div>
            <p id="finishDialogDescription">
              Save the final scores and see who won. You can still start a rematch afterward.
            </p>

            <div className="finishScoreList">
              <span className="finishScoreLabel">FINAL SCORES</span>
              {rankedPlayers.map(({ player }) => (
                <div className="finishScoreRow" key={player.id}>
                  <Avatar p={player} small />
                  <b>{player.name}</b>
                  <strong>{player.score}</strong>
                </div>
              ))}
            </div>

            <div className="finishDialogActions">
              <button
                className="finishKeepButton"
                onClick={() => finishDialogRef.current?.close()}
              >
                Keep playing
              </button>
              <button className="finishConfirmButton" onClick={finishGame}>
                <Trophy />
                Finish game
              </button>
            </div>
          </div>
        </dialog>

        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  // ---------- History ----------
  if (view === "history") {
    // One game selected -> its score events. Otherwise -> list of all games.
    const gameList = game ? [game] : games;
    const events = gameList
      .flatMap((g) => g.events.map((e) => ({ g, e })))
      .filter((x) => filter === "all" || x.e.playerId === filter)
      .sort((a, b) => +new Date(b.e.at) - +new Date(a.e.at));

    return (
      <main className="app hauntedTheme gothicPages hauntedDecorated">
        <HauntedDecorations />
        <Header title={game ? "Score history" : "Game history"} back={!!game} />
        <section>
          {game ? (
            <>
              <div className="filters">
                <button
                  className={filter === "all" ? "selected" : ""}
                  onClick={() => setFilter("all")}
                >
                  All players
                </button>
                {game.players.map((p) => (
                  <button
                    className={filter === p.id ? "selected" : ""}
                    onClick={() => setFilter(p.id)}
                    key={p.id}
                  >
                    {p.name.split(" ")[0]}
                  </button>
                ))}
              </div>

              {events.length ? (
                events.map(({ e }) => {
                  const player = game.players.find((x) => x.id === e.playerId)!;
                  return (
                    <div className="event" key={e.id}>
                      <Avatar p={player} small />
                      <span>
                        <b>
                          {player.name} {e.undone ? "undid a score" : "added a score"}
                        </b>
                        <small>
                          {e.previous} → {e.next} · {new Date(e.at).toLocaleString()}
                        </small>
                      </span>
                      <strong className={e.undone || e.points < 0 ? "negative" : ""}>
                        {e.undone ? "UNDO" : `${e.points > 0 ? "+" : ""}${e.points}`}
                      </strong>
                    </div>
                  );
                })
              ) : (
                <Empty title="No scores yet" text="Score changes will appear here as you play." />
              )}
            </>
          ) : games.length ? (
            games.map((g) => <GameCard game={g} key={g.id} on={() => open(g)} />)
          ) : (
            <Empty
              title="Your scorebook is empty"
              text="Start a game and every score will be saved here."
            />
          )}
        </section>
        <Nav />
      </main>
    );
  }

  // ---------- Game settings ----------
  if (view === "settings" && game) {
    return (
      <main className="app hauntedTheme settingsScreen gothicPages hauntedDecorated">
        <HauntedDecorations />
        <Header title="Game settings" />
        <section className="settingsContent">
          <p className="settingsIntro">Fine-tune the options for this match.</p>

          <div className="settingsCard">
            <div className="settingsCardHeading">
              <div>
                <span className="settingsEyebrow">MATCH</span>
                <h2>Game setup</h2>
              </div>
              <span className="settingsMode">{game.mode}</span>
            </div>

            {game.mode === "Timed" && (
              <div className="settingsDuration">
                <div className="settingsRowLabel">
                  <b>Turn duration</b>
                  <small>Time each player has per turn</small>
                </div>
                <div className="duration">
                  {TURN_DURATIONS.map((n) => (
                    <button
                      className={game.duration === n ? "selected" : ""}
                      onClick={() => save({ ...game, duration: n, remaining: n })}
                      key={n}
                    >
                      {n === 60 ? "1m" : `${n / 60}m`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="settingsCard settingsOptions">
            <div className="settingsCardHeading">
              <div>
                <span className="settingsEyebrow">PREFERENCES</span>
                <h2>Scoring &amp; play</h2>
              </div>
            </div>
            <Toggle
              label="Allow undo"
              value={game.undo}
              on={() => save({ ...game, undo: !game.undo })}
            />
            <Toggle
              label="Show score difference"
              value={game.differences}
              on={() => save({ ...game, differences: !game.differences })}
            />
            <Toggle
              label="Vibration feedback"
              value={game.vibration}
              on={() => save({ ...game, vibration: !game.vibration })}
            />
            <Toggle
              label="Keep screen awake"
              value={game.keepScreenAwake ?? false}
              on={() => save({ ...game, keepScreenAwake: !game.keepScreenAwake })}
            />
            <p className="settingsHint">
              Prevents sleep while this active match is open. Browser support may vary.
            </p>
          </div>
        </section>

        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  // ---------- Throne Room ----------
  if (view === "throne" && game) {
    const { winners, kneelingPlayers } = rankPlayers(game.players);

    return (
      <ThroneRoom
        title={game.title}
        mode={game.mode}
        winners={winners}
        kneelingPlayers={kneelingPlayers}
        onReturnToResults={() => setView("results")}
        onStartNewGame={() => {
          setSelected(undefined);
          newGame();
        }}
      />
    );
  }

  // ---------- Results ----------
  if (view === "results" && game) {
    const { ranked, highScore, winners } = rankPlayers(game.players);

    // Start a new game with the same players and settings
    const playAgain = () => {
      const now = Date.now();
      const rematch: Game = {
        ...createFreshGame(now),
        title: game.title,
        mode: game.mode,
        duration: game.duration,
        remaining: game.duration,
        current: randomStartingPlayer(game.players.length),
        players: game.players.map((p, i) => ({
          ...p,
          id: uid(now),
          score: 0,
          color: COLORS[i],
        })),
      };
      setGames((list) => [rematch, ...list]);
      open(rematch, "game");
    };

    return (
      <main className="app hauntedTheme">
        <Header title="Game results" back={false} />
        <section className="results">
          <div className="winner">
            <Crown />
            <small>{winners.length > 1 ? "IT'S A TIE" : "WINNER"}</small>
            <h2>{winners.map((p) => p.name).join(" & ")}</h2>
            <b>{highScore} points</b>
          </div>

          <p>FINAL SCORES</p>
          {ranked.map((p, i) => (
            <div className="rank" key={p.id}>
              <small>{i + 1}</small>
              <Avatar p={p} />
              <b>{p.name}</b>
              <strong>{p.score}</strong>
            </div>
          ))}

          <button className="primary" onClick={playAgain}>
            Play again <ChevronRight />
          </button>
          <button className="secondary" onClick={() => goTo("history")}>
            View game history
          </button>
        </section>
      </main>
    );
  }

  // ---------- Statistics ----------
  if (view === "stats") {
    const finished = games.filter((g) => g.status === "finished");
    const allScores = finished.flatMap((g) => g.players.map((p) => p.score));
    const highest = allScores.length ? Math.max(...allScores) : 0;
    const average = allScores.length
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

    const summary: [string, number][] = [
      ["Games played", finished.length],
      ["Average score", average],
      ["Highest score", highest],
      ["Active games", games.filter((g) => g.status === "active").length],
    ];

    return (
      <main className="app hauntedTheme gothicPages hauntedDecorated">
        <HauntedDecorations />
        <Header title="Statistics" back={false} />
        <section>
          <div className="stats">
            {summary.map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>

          <div className="chart">
            <p>SCORE DISTRIBUTION</p>
            {allScores.length ? (
              <div className="bars">
                {/* Last 8 scores, bar height relative to the highest score */}
                {allScores.slice(-8).map((n, i) => (
                  <i key={i} style={{ height: `${Math.max(12, (n / highest) * 125)}px` }}>
                    <span>{n}</span>
                  </i>
                ))}
              </div>
            ) : (
              <Empty title="Nothing to chart yet" text="Finish a game to see score trends." />
            )}
          </div>
        </section>
        <Nav />
      </main>
    );
  }

  // ---------- Home (default) ----------
  const finishedCount = games.filter((g) => g.status === "finished").length;
  const activeCount = games.filter((g) => g.status === "active").length;

  return (
    <main className="app hauntedTheme gothicPages hauntedDecorated">
      <HauntedDecorations />
      <Header title="Wordkeeper" back={false} />
      <section className="home">
        <div className="dashboardHero">
          <div className="heroCopy">
            <button className="hauntedBadge" type="button" onClick={clickHauntedBadge}>
              HALLOWEEN SPECIAL
            </button>
            <h2>WORDKEEPER</h2>
            <p>The game never truly ends.</p>
            <button className="primary heroAction" onClick={newGame}>
              <span>
                <Plus />
                Start a new game
              </span>
              <ChevronRight />
            </button>
          </div>

          <div className="hauntedScene">
            <span className="hauntedMoon" aria-hidden="true" />
            <span className="hauntedMansion" aria-hidden="true" />
            <span className="hauntedTree hauntedTreeLeft" aria-hidden="true" />
            <span className="hauntedTree hauntedTreeRight" aria-hidden="true" />
            <span className="hauntedSceneGhost" aria-hidden="true">👻</span>
            <button
              className="hauntedPumpkin"
              type="button"
              onClick={clickPumpkin}
              aria-label="A hidden message. Click three times to reveal it."
              title="A little secret from the house"
            >
              <span aria-hidden="true">✦</span>
            </button>
            <span className="hauntedSceneCaption" aria-hidden="true">
              GATHER AT DUSK
              <b>WORDS AFTER DARK</b>
            </span>
          </div>
        </div>

        <div className="dashboardGrid">
          {/* Left: active game + recent games */}
          <div className="gamesPanel">
            {active && (
              <>
                <div className="sectionHeading">
                  <div>
                    <small>CONTINUE PLAYING</small>
                    <h2>On the board</h2>
                  </div>
                </div>
                <GameCard game={active} on={() => open(active, "game")} resume />
              </>
            )}

            <div className="sectionHeading">
              <div>
                <small>RECENT GAMES</small>
                <h2>Scorebook</h2>
              </div>
              <button onClick={() => goTo("history")}>
                View history <ChevronRight />
              </button>
            </div>

            <div className="gamesGrid">
              {games
                .filter((g) => g.id !== active?.id)
                .slice(0, 3)
                .map((g) => (
                  <GameCard game={g} key={g.id} on={() => open(g)} />
                ))}
            </div>

            {!games.length && (
              <Empty title="Ready when you are" text="Start a game to build your personal scorebook." />
            )}
          </div>

          {/* Right: quick stats */}
          <aside className="scorebookAside">
            <small>AT A GLANCE</small>
            <div>
              <b>{finishedCount}</b>
              <span>Games completed</span>
            </div>
            <div>
              <b>{activeCount}</b>
              <span>Game{activeCount === 1 ? "" : "s"} in progress</span>
            </div>
            <button onClick={() => goTo("stats")}>
              Explore statistics <ChevronRight />
            </button>
          </aside>
        </div>
      </section>

      <Nav />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </main>
  );
}
