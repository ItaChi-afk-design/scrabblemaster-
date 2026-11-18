import { ChevronRight, Plus, X } from "lucide-react";
import { AppHeader, type AppNavigation } from "@/components/common/AppHeader";
import { Avatar } from "@/components/common/Avatar";
import { HauntedDecorations } from "@/components/common/HauntedDecorations";
import { Toggle } from "@/components/common/Toggle";
import { createDraftPlayer } from "@/features/games/gameService";
import { MAX_PLAYERS, PLAYER_COLORS, TURN_DURATIONS } from "@/lib/game-constants";
import type { Game, Player } from "@/types/game";

type CreateGameScreenProps = {
  draft: Game;
  error: string;
  navigation: AppNavigation;
  onDraftChange: (update: (draft: Game) => Game) => void;
  onClearError: () => void;
  onStart: () => void;
};

export function CreateGameScreen({
  draft,
  error,
  navigation,
  onDraftChange,
  onClearError,
  onStart,
}: CreateGameScreenProps) {
  const updatePlayer = (index: number, changes: Partial<Player>) => {
    onDraftChange((currentDraft) => ({
      ...currentDraft,
      players: currentDraft.players.map((player, playerIndex) =>
        playerIndex === index ? { ...player, ...changes } : player,
      ),
    }));
  };

  return (
    <main className="app hauntedTheme gothicPages hauntedDecorated">
      <HauntedDecorations />
      <AppHeader title="New game" {...navigation} onBack={navigation.onGoHome} />
      <section>
        <label>
          GAME NAME
          <input
            value={draft.title}
            onChange={(event) => {
              onClearError();
              onDraftChange((currentDraft) => ({ ...currentDraft, title: event.target.value }));
            }}
          />
        </label>

        <p>GAME MODE</p>
        <div className="modes">
          {(["Classic", "Timed"] as const).map((mode) => (
            <button
              className={draft.mode === mode ? "selected" : ""}
              onClick={() => onDraftChange((currentDraft) => ({ ...currentDraft, mode, running: false }))}
              key={mode}
            >
              <b>{mode}</b>
              <small>{mode === "Classic" ? "No turn timer" : "Timer per turn"}</small>
            </button>
          ))}
        </div>

        <div className="line">
          <p>PLAYERS</p>
          <small>{draft.players.length} / {MAX_PLAYERS}</small>
        </div>

        {draft.players.map((player, index) => (
          <div className="player" key={player.id}>
            <Avatar player={player} />
            <input
              value={player.name}
              aria-label="Player name"
              onChange={(event) => updatePlayer(index, { name: event.target.value })}
            />
            <button
              className="dot"
              style={{ background: player.color }}
              onClick={() =>
                updatePlayer(index, {
                  color: PLAYER_COLORS[(PLAYER_COLORS.indexOf(player.color as typeof PLAYER_COLORS[number]) + 1) % PLAYER_COLORS.length],
                })
              }
            />
            <button
              className="remove"
              disabled={draft.players.length <= 1}
              onClick={() =>
                onDraftChange((currentDraft) => ({
                  ...currentDraft,
                  players: currentDraft.players.filter((_, playerIndex) => playerIndex !== index),
                }))
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
              onDraftChange((currentDraft) => ({
                ...currentDraft,
                players: [...currentDraft.players, createDraftPlayer(currentDraft.players, Date.now())],
              }))
            }
          >
            <Plus />
            Add player
          </button>
        )}

        {draft.mode === "Timed" && (
          <>
            <p>TURN DURATION</p>
            <div className="duration">
              {TURN_DURATIONS.map((duration) => (
                <button
                  className={draft.duration === duration ? "selected" : ""}
                  onClick={() =>
                    onDraftChange((currentDraft) => ({
                      ...currentDraft,
                      duration,
                      remaining: duration,
                    }))
                  }
                  key={duration}
                >
                  {duration === 60 ? "1 min" : `${duration / 60} min`}
                </button>
              ))}
              <input
                type="number"
                min="10"
                value={draft.duration}
                onChange={(event) => {
                  const duration = Math.max(10, +event.target.value || 10);
                  onDraftChange((currentDraft) => ({ ...currentDraft, duration, remaining: duration }));
                }}
              />
            </div>
          </>
        )}

        <div className="card">
          <Toggle
            label="Allow undo"
            value={draft.undo}
            onToggle={() => onDraftChange((currentDraft) => ({ ...currentDraft, undo: !currentDraft.undo }))}
          />
          <Toggle
            label="Show score difference"
            value={draft.differences}
            onToggle={() =>
              onDraftChange((currentDraft) => ({ ...currentDraft, differences: !currentDraft.differences }))
            }
          />
          <Toggle
            label="Vibration feedback"
            value={draft.vibration}
            onToggle={() =>
              onDraftChange((currentDraft) => ({ ...currentDraft, vibration: !currentDraft.vibration }))
            }
          />
        </div>

        {error && <div className="error">{error}</div>}

        <button className="primary" onClick={onStart}>
          Start game <ChevronRight />
        </button>
      </section>
    </main>
  );
}
