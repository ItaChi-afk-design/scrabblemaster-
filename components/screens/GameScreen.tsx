"use client";

import { useRef } from "react";
import { Clock3, Crown, Pause, Play, Plus, RotateCcw, Trophy } from "lucide-react";
import { AppHeader, type AppNavigation } from "@/components/common/AppHeader";
import { Avatar } from "@/components/common/Avatar";
import { HauntedDecorations } from "@/components/common/HauntedDecorations";
import { formatTime } from "@/features/timer/timerService";
import type { Game, ScoreFlash } from "@/types/game";
import { WordChecker } from "@/app/word-checker";

type GameScreenProps = {
  game: Game;
  input: string;
  scoreFlash: ScoreFlash | null;
  toast: string;
  navigation: AppNavigation;
  onInputChange: (input: string) => void;
  onAdjustTimer: (delta: number) => void;
  onToggleTimer: () => void;
  onSelectPlayer: (index: number) => void;
  onAddScore: (points: number) => void;
  onUndoLastScore: () => void;
  onFinishGame: () => void;
  onOpenSettings: () => void;
};

export function GameScreen({
  game,
  input,
  scoreFlash,
  toast,
  navigation,
  onInputChange,
  onAdjustTimer,
  onToggleTimer,
  onSelectPlayer,
  onAddScore,
  onUndoLastScore,
  onFinishGame,
  onOpenSettings,
}: GameScreenProps) {
  const finishDialogRef = useRef<HTMLDialogElement>(null);
  const leadScore = Math.max(...game.players.map((player) => player.score));
  const currentPlayer = game.players[game.current];
  const rankedPlayers = game.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .sort((first, second) => second.player.score - first.player.score);
  const timerLabel = game.running
    ? "CURRENT TURN"
    : game.pauseUntil
      ? "TIME'S UP"
      : game.remaining
        ? "PAUSED"
        : "TIME EXPIRED";

  const finishGame = () => {
    finishDialogRef.current?.close();
    onFinishGame();
  };

  return (
    <main className="app hauntedTheme gameScreen gothicPages hauntedDecorated">
      <HauntedDecorations />
      <AppHeader title={game.title} back={false} {...navigation} onOpenSettings={onOpenSettings} />
      <section>
        {game.mode === "Timed" && (
          <div className={`timer ${game.remaining <= 20 ? "warn" : ""}`}>
            <div>
              <strong>{formatTime(game.remaining)}</strong>
              <small>{timerLabel}</small>
            </div>
            <aside>
              <button onClick={() => onAdjustTimer(-30)}>−30</button>
              <button className="play" onClick={onToggleTimer}>
                {game.running ? <Pause /> : <Play />}
              </button>
              <button onClick={() => onAdjustTimer(30)}>+30</button>
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
            {rankedPlayers.map(({ player, playerIndex }, index) => {
              const rank = rankedPlayers.findIndex(({ player: candidate }) => candidate.score === player.score) + 1;
              const isCurrent = playerIndex === game.current;

              return (
                <li
                  className={`leaderboardItem ${scoreFlash?.playerId === player.id ? "scoreFlash" : ""}`}
                  key={`${player.id}-${rank}`}
                  style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }}
                >
                  <button
                    className={`leaderboardRow ${isCurrent ? "current" : ""} ${
                      scoreFlash?.playerId === player.id ? "scored" : ""
                    }`}
                    key={scoreFlash?.playerId === player.id ? scoreFlash.id : player.id}
                    onClick={() => onSelectPlayer(playerIndex)}
                    aria-label={`Rank ${rank}, ${player.name}, ${player.score} points${
                      isCurrent ? ", playing now" : ""
                    }. Select this player as the current turn`}
                  >
                    <span className={`leaderboardRank ${rank === 1 ? "isLeader" : ""}`}>
                      {rank === 1 ? <Crown aria-hidden="true" /> : <span aria-hidden="true">{rank}</span>}
                    </span>
                    <Avatar player={player} />
                    <span className="leaderboardPlayer">
                      <b>{player.name}</b>
                      {isCurrent ? (
                        <small>Playing now</small>
                      ) : game.differences ? (
                        <small>
                          {player.score === leadScore ? "Tied for the lead" : `${leadScore - player.score} pts behind`}
                        </small>
                      ) : null}
                    </span>
                    <span className="leaderboardPoints">
                      <strong>{player.score}</strong>
                      <small>PTS</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="entry">
          <div className="quick">
            {[5, 10, 15, -5].map((points) => (
              <button className={points < 0 ? "negative" : ""} onClick={() => onAddScore(points)} key={points}>
                {points > 0 ? "+" : ""}
                {points}
              </button>
            ))}
          </div>

          <div className="scoreInput">
            <input
              placeholder="0"
              inputMode="numeric"
              value={input}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAddScore(+input);
              }}
              onChange={(event) => onInputChange(event.target.value.replace(/[^0-9-]/g, ""))}
            />
            <button className="primary" disabled={!input || !+input} onClick={() => onAddScore(+input)}>
              Add score <Plus />
            </button>
          </div>

          {game.undo && (
            <button className="undo" onClick={onUndoLastScore}>
              <RotateCcw />
              Undo last score
            </button>
          )}
        </div>

        <button className="finishButton" onClick={() => finishDialogRef.current?.showModal()}>
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
                <Avatar player={player} small />
                <b>{player.name}</b>
                <strong>{player.score}</strong>
              </div>
            ))}
          </div>

          <div className="finishDialogActions">
            <button className="finishKeepButton" onClick={() => finishDialogRef.current?.close()}>
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
