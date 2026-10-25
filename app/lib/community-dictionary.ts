import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export const COMMUNITY_DICTIONARY = {
  id: "community" as const,
  label: "Community (ENABLE2K)",
};

export const MAX_WORD_LENGTH = 32;

type DictionaryLoader = () => readonly string[];

export type CommunityDictionaryLookup =
  | { available: true; valid: boolean }
  | { available: false };

export type CommunityDictionary = {
  lookup: (word: string) => CommunityDictionaryLookup;
};

export function normalizeWord(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const word = value.trim().toLowerCase();
  return /^[a-z]+$/.test(word) && word.length <= MAX_WORD_LENGTH ? word : null;
}

function loadBundledEnable2k(): readonly string[] {
  const archivePath = path.join(process.cwd(), "app", "data", "enable2k.txt.gz");
  const contents = gunzipSync(readFileSync(archivePath)).toString("ascii");
  const words = contents.split(/\r?\n/).filter(Boolean);

  if (words.length < 100_000 || words.some((word) => !/^[a-z]+$/.test(word))) {
    throw new Error("The bundled ENABLE2K data is invalid.");
  }

  return words;
}

export function createCommunityDictionary(loadWords: DictionaryLoader = loadBundledEnable2k): CommunityDictionary {
  let words: Set<string> | null = null;
  let initializationFailed = false;

  const getWords = (): Set<string> | null => {
    if (words) return words;
    if (initializationFailed) return null;

    try {
      const loadedWords = loadWords();
      const nextWords = new Set(loadedWords);
      if (nextWords.size < 100_000) throw new Error("The bundled ENABLE2K data is incomplete.");
      words = nextWords;
      return words;
    } catch {
      initializationFailed = true;
      return null;
    }
  };

  return {
    lookup(word) {
      const initializedWords = getWords();
      return initializedWords
        ? { available: true, valid: initializedWords.has(word) }
        : { available: false };
    },
  };
}

// Module state is intentionally per process/instance. Each instance reads the same bundled archive.
export const communityDictionary = createCommunityDictionary();
