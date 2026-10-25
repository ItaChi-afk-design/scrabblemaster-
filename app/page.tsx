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
  TriangleAlert,
  Trophy,
  X,
} from "lucide-react";
import { WordChecker } from "./word-checker";

/* ============================================================
   TYPES
   ============================================================ */

type Player = {
  id: string;
  name: string;
  color: string;
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
  | "results"
  | "settings";

/* ============================================================
   CONSTANTS & HELPERS
   ============================================================ */

const STORAGE_KEY = "scrabble-score-v2";
const COLORS = ["#c66551", "#4b927f", "#c89835", "#6e79b5", "#a35c91"];
const TURN_DURATIONS = [60, 120, 180, 300];

// Unique id
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const randomStartingPlayer = (playerCount: number) =>
  Math.floor(Math.random() * playerCount);

// 125 seconds -> "2:05"
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// "Alex Morgan" -> "AM"
const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

// Creates a brand new default game
const createFreshGame = (): Game => ({
  id: uid(),
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: ["player 1"].map((name, i) => ({
    id: uid(),
    name,
    color: COLORS[i],
    score: 0,
  })),
  current: 0,
  duration: 180,
  remaining: 180,
  running: false,
  lastTick: Date.now(),
  events: [],
  undo: true,
  differences: true,
  vibration: true,
  created: new Date().toISOString(),
});

// Initial value for the "New game" form (no Date.now/uid so it's stable on first render)
const initialDraft: Game = {
  id: "draft",
  title: "Friday Night Scrabble",
  mode: "Timed",
  status: "active",
  players: [
    { id: "draft-1", name: "Alex Morgan", color: COLORS[0], score: 0 },
    { id: "draft-2", name: "Jamie Lee", color: COLORS[1], score: 0 },
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
  return (
    <i className={small ? "avatar small" : "avatar"} style={{ background: p.color }}>
      {getInitials(p.name)}
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
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) {
        setGames([]);
        setToast("Saved games had an invalid format and couldn't be loaded.");
      } else {
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
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setGames([]);
      setToast("Saved games couldn't be read and were cleared.");
    }
    setReady(true);
  }, []);

  // Save games to localStorage whenever they change
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }, [games, ready]);

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
        patch(game.id, (g) =>
          g.pauseUntil !== pauseUntil
            ? g
            : {
                ...g,
                current: (g.current + 1) % g.players.length,
                remaining: g.duration,
                running: true,
                lastTick: Date.now(),
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
  const start = () => {
    if (draft.players.length === 0) {
      return setError("Add at least one player to start a game.");
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
      lastTick: Date.now(),
    };

    setGames((list) => [newGame, ...list]);
    open(newGame);
  };

  // Add points for the current player, then pass the turn
  const addScore = (points: number) => {
    if (!game || !Number.isFinite(points) || !points) return;

    patch(game.id, (g) => {
      const player = g.players[g.current];
      const event: Event = {
        id: uid(),
        playerId: player.id,
        points,
        previous: player.score,
        next: player.score + points,
        at: new Date().toISOString(),
      };

      return {
        ...g,
        players: g.players.map((p, i) => (i === g.current ? { ...p, score: event.next } : p)),
        events: [...g.events, event],
        current: (g.current + 1) % g.players.length,
        remaining: g.duration,
        lastTick: Date.now(),
      };
    });

    if (game.vibration) navigator.vibrate?.(12);
    setInput("");
  };

  // Undo the most recent score that hasn't already been undone
  const undoLastScore = () => {
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
        { ...lastEvent, id: uid(), undone: true, at: new Date().toISOString() },
      ],
    }));

    say("Last score undone");
  };

  const newGame = () => {
    setDraft(createFreshGame());
    setError("");
    setView("create");
  };

  /* ---------- Shared layout pieces ---------- */

  const Header = ({ title, back = true }: { title: string; back?: boolean }) => (
    <header className={back ? "siteHeader" : "siteHeader dashboardHeader"}>
      <button
        className="icon"
        onClick={() => (back ? setView(game ? "game" : "home") : goHome())}
        aria-label={back ? "Back" : "ScrabbleScore home"}
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
      <main className="app">
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
            <small>{draft.players.length} / 5</small>
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

          {draft.players.length < 5 && (
            <button
              className="addPlayer"
              onClick={() =>
                setDraft({
                  ...draft,
                  players: [
                    ...draft.players,
                    {
                      id: uid(),
                      name: `Player ${draft.players.length + 1}`,
                      color: COLORS[draft.players.length % COLORS.length],
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

          <button className="primary" onClick={start}>
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
      save({ ...game, status: "finished", running: false });
      setView("results");
    };

    return (
      <main className="app gameScreen">
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
                <button
                  onClick={() => save({ ...game, remaining: Math.max(0, game.remaining - 30) })}
                >
                  −30
                </button>
                <button
                  className="play"
                  onClick={() =>
                    save({
                      ...game,
                      running: !game.running && game.remaining > 0,
                      lastTick: Date.now(),
                    })
                  }
                >
                  {game.running ? <Pause /> : <Play />}
                </button>
                <button
                  onClick={() =>
                    save({ ...game, remaining: game.remaining + 30, lastTick: Date.now() })
                  }
                >
                  +30
                </button>
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
              <small>LIVE RANKINGS</small>
              <h2>Leaderboard</h2>
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
                    className="leaderboardItem"
                    key={`${p.id}-${rank}`}
                    style={{ animationDelay: `${Math.min(i * 45, 180)}ms` }}
                  >
                    <button
                      className={`leaderboardRow ${isCurrent ? "current" : ""}`}
                      onClick={() => save({ ...game, current: playerIndex, lastTick: Date.now() })}
                      aria-label={`Rank ${rank}, ${p.name}, ${p.score} points${
                        isCurrent ? ", playing now" : ""
                      }. Select this player as the current turn`}
                    >
                      <span className={`leaderboardRank ${rank === 1 ? "isLeader" : ""}`}>
                        {rank}
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
                <button className={n < 0 ? "negative" : ""} onClick={() => addScore(n)} key={n}>
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
                  if (e.key === "Enter") addScore(+input);
                }}
                onChange={(e) => setInput(e.target.value.replace(/[^0-9-]/g, ""))}
              />
              <button
                className="primary"
                disabled={!input || !+input}
                onClick={() => addScore(+input)}
              >
                Add score <Plus />
              </button>
            </div>

            {game.undo && (
              <button className="undo" onClick={undoLastScore}>
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
      <main className="app">
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
      <main className="app settingsScreen">
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

  // ---------- Results ----------
  if (view === "results" && game) {
    const ranked = [...game.players].sort((a, b) => b.score - a.score);
    const highScore = ranked[0].score;
    const winners = ranked.filter((p) => p.score === highScore);

    // Start a new game with the same players and settings
    const playAgain = () => {
      const rematch: Game = {
        ...createFreshGame(),
        title: game.title,
        mode: game.mode,
        duration: game.duration,
        remaining: game.duration,
        current: randomStartingPlayer(game.players.length),
        players: game.players.map((p, i) => ({
          ...p,
          id: uid(),
          score: 0,
          color: COLORS[i],
        })),
      };
      setGames((list) => [rematch, ...list]);
      open(rematch, "game");
    };

    return (
      <main className="app">
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
      <main className="app">
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
    <main className="app">
      <Header title="Your scorebook" back={false} />
      <section className="home">
        {/* Hero banner */}
        <div className="dashboardHero">
          <div className="heroCopy">
            <small>READY TO PLAY?</small>
            <h2>
              Your next word
              <br />
              wins.
            </h2>
            <p>
              Keep every score, turn, and triumphant triple-word finish in one beautifully simple
              scorebook.
            </p>
            <button className="primary heroAction" onClick={newGame}>
              <span>
                <Plus />
                Start a new game
              </span>
              <ChevronRight />
            </button>
          </div>

          <div className="tilePanel" aria-hidden="true">
            <i className="tile tileW">
              W<sup>4</sup>
            </i>
            <i className="tile tileO">
              O<sup>1</sup>
            </i>
            <i className="tile tileR">
              R<sup>1</sup>
            </i>
            <i className="tile tileD">
              D<sup>2</sup>
            </i>
            <span>
              MAKE EVERY
              <br />
              WORD COUNT
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
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
