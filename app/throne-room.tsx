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
  const laughAudio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches);
    const preferenceTimer = window.setTimeout(() => {
      updateMotionPreference();
      setSoundAvailable(Boolean(laughAudio.current?.canPlayType("audio/mpeg")));
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

  const playersByScore = [...winners, ...kneelingPlayers];
  const monarch = winners[0];
  const courtPlayers = playersByScore.filter((player) => player.id !== monarch.id);
  const revealComplete = reducedMotion || stage === "kneeling";
  const rankedPlayers = playersByScore.map((player, index) => ({
    player,
    rank: index + 1,
  }));

  const playLaugh = useCallback(async () => {
    const audio = laughAudio.current;
    if (!audio) return;

    audio.volume = 1;
    try {
      await audio.play();
      setSoundEnabled(true);
      setSoundError("");
    } catch (error) {
      setSoundEnabled(false);
      setSoundError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Autoplay was blocked. Tap Enable laughter to play the sound."
          : error instanceof Error
            ? `Laughter sound could not be played: ${error.message}`
            : "Laughter sound could not be played.",
      );
    }
  }, []);

  useEffect(() => {
    const audio = laughAudio.current;
    if (!audio) return;

    void playLaugh();
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [playLaugh]);

  const toggleSound = async () => {
    if (soundEnabled) {
      const audio = laughAudio.current;
      audio?.pause();
      if (audio) audio.currentTime = 0;
      setSoundEnabled(false);
      return;
    }

    if (!soundAvailable) {
      setSoundError("Sound is unavailable in this browser.");
      return;
    }

    await playLaugh();
  };

  return (
    <main className="app hauntedTheme throneRoomApp">
      <audio ref={laughAudio} src="/psycho_Bj24m2M.mp3" preload="auto" hidden aria-hidden="true" />
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
            aria-label={soundEnabled ? "Mute laughter sound" : "Enable laughter"}
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
              if (soundEnabled) {
                const audio = laughAudio.current;
                if (audio) audio.currentTime = 0;
                void playLaugh();
              }
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

