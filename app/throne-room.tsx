"use client";

import { Crown, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ThroneRoomPlayer = {
  id: string;
  name: string;
  color: string;
  score: number;
};

type RevealStage = "dark" | "throne" | "ruler" | "kneeling";

type ThroneRoomProps = {
  title: string;
  mode: "Classic" | "Timed";
  winners: ThroneRoomPlayer[];
  kneelingPlayers: ThroneRoomPlayer[];
  onReturnToResults: () => void;
  onStartNewGame: () => void;
};

export function ThroneRoom({
  title,
  mode,
  winners,
  kneelingPlayers,
  onReturnToResults,
  onStartNewGame,
}: ThroneRoomProps) {
  const [stage, setStage] = useState<RevealStage>("dark");
  const [replay, setReplay] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundAvailable, setSoundAvailable] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");
  const audioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches);
    const preferenceTimer = window.setTimeout(() => {
      updateMotionPreference();
      setSoundAvailable(typeof window.AudioContext !== "undefined");
    }, 0);
    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      window.clearTimeout(preferenceTimer);
      motionPreference.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const revealThrone = window.setTimeout(() => setStage("throne"), 450);
    const revealRuler = window.setTimeout(() => setStage("ruler"), 1500);
    const revealPlayers = window.setTimeout(() => setStage("kneeling"), 2550);

    return () => {
      window.clearTimeout(revealThrone);
      window.clearTimeout(revealRuler);
      window.clearTimeout(revealPlayers);
    };
  }, [replay, reducedMotion]);

  useEffect(() => {
    return () => {
      void audioContext.current?.close();
    };
  }, []);

  const playSound = useCallback(
    (frequency: number, duration: number, volume: number) => {
      const context = audioContext.current;
      if (!soundEnabled || !context || context.state !== "running") return;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    },
    [soundEnabled],
  );

  const playersByScore = [...winners, ...kneelingPlayers];
  const monarch = winners[0];
  const courtPlayers = playersByScore.filter((player) => player.id !== monarch.id);
  const revealComplete = reducedMotion || stage === "kneeling";
  const rankedPlayers = playersByScore.map((player, index) => ({
    player,
    rank: index + 1,
  }));

  const toggleSound = async () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      return;
    }

    if (!soundAvailable) {
      setSoundError("Sound is unavailable in this browser.");
      return;
    }

    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      await context.resume();
      setSoundEnabled(true);
      setSoundError("");
    } catch (error) {
      setSoundEnabled(false);
      setSoundError(
        error instanceof Error ? `Sound could not be enabled: ${error.message}` : "Sound could not be enabled.",
      );
    }
  };

  useEffect(() => {
    if (!soundEnabled) return;
    if (stage === "throne") playSound(110, 0.9, 0.12);
    if (stage === "ruler") playSound(392, 0.7, 0.08);
    if (stage === "kneeling") playSound(262, 0.55, 0.06);
  }, [stage, soundEnabled, playSound]);

  return (
    <main className="app hauntedTheme throneRoomApp">
      <div className="throneRoomShell">
        <section
          className="throneRoomScene"
          data-stage={reducedMotion ? "kneeling" : stage}
          aria-label={`Final scores for ${title}, ${mode} match, in the Monarch's throne room`}
        >
          <button
            className="throneRoomSound"
            type="button"
            onClick={() => void toggleSound()}
            disabled={!soundAvailable}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? "Mute reveal sound" : "Enable reveal sound"}
          >
            {soundEnabled ? <Volume2 /> : <VolumeX />}
            <span>{soundAvailable ? (soundEnabled ? "Sound on" : "Sound off") : "Sound unavailable"}</span>
          </button>
          <aside className="monarchLeaderboard" aria-label="Final leaderboard">
            <ol>
              {rankedPlayers.map(({ player, rank }) => {
                return (
                  <li className={player.id === monarch.id ? "isChampion" : ""} key={player.id}>
                    <span className="monarchRank">{rank === 1 ? <Crown /> : `${rank}.`}</span>
                    <span className="monarchPlayerName">{player.name}</span>
                    <strong>{player.score}</strong>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="throneRoomWinner">
            <div className="monarchWinnerCrown" aria-hidden="true"><Crown /></div>
            <div className="monarchWinnerNames">
              <article>
                <h2>{monarch.name}</h2>
              </article>
            </div>
          </div>

          <div className="monarchCourt" aria-label="Other players">
            {courtPlayers.map((player, index) => (
              <div className="monarchCourtMember" key={player.id} data-order={index}>
                <span className="monarchCourtLabel">
                  <b>{player.name}</b>
                </span>
              </div>
            ))}
          </div>

          <p className="throneRoomStageAnnouncement" aria-live="polite">
            {revealComplete
              ? winners.length > 1
                ? `Shared victory. ${winners.map((player) => `${player.name}, ${player.score} points`).join("; ")}. ${monarch.name} holds the throne by stable player order.`
                : `${monarch.name} reigns with ${monarch.score} points.`
              : "The final scores are being revealed."}
          </p>
        </section>

        {revealComplete && (
          <p className="hauntedChampionWhisper" aria-live="polite">
            {winners.length > 1
              ? "Mga walang bitaw haha !"
              : "Mga walng bitaw haha!"}
          </p>
        )}

        {soundError && <p className="throneRoomSoundError" role="status">{soundError}</p>}

        <div className="throneRoomActions">
          <button
            className="throneRoomReplay"
            type="button"
            onClick={() => {
              setStage("dark");
              setReplay((value) => value + 1);
            }}
          >
            <RotateCcw /> Replay reveal
          </button>
          <button className="throneRoomResults" type="button" onClick={onReturnToResults}>
            Return to results
          </button>
          <button className="throneRoomNewGame" type="button" onClick={onStartNewGame}>
            Start a new game
          </button>
        </div>
      </div>
    </main>
  );
}
