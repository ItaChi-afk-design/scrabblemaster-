"use client";

import { useEffect, useRef, useState } from "react";
import { loadStoredGames, persistGames } from "@/features/storage/gameStorage";
import type { Game } from "@/types/game";

export function usePersistedGames(onNotice: (message: string) => void) {
  const [games, setGames] = useState<Game[]>([]);
  const [ready, setReady] = useState(false);
  const storageWarningShown = useRef(false);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    const loaded = loadStoredGames();
    setGames(loaded.games);
    storageWarningShown.current = loaded.warningShown;
    if (loaded.message) onNoticeRef.current(loaded.message);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const written = persistGames(games);
    if (!written && !storageWarningShown.current) {
      storageWarningShown.current = true;
      onNoticeRef.current(
        "Browser storage is unavailable; game changes are kept in memory and won't persist after this tab closes.",
      );
    } else if (written) {
      storageWarningShown.current = false;
    }
  }, [games, ready]);

  return { games, setGames, ready };
}
