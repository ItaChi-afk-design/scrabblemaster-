import { COMMUNITY_DICTIONARY, communityDictionary, normalizeWord } from "../../../lib/community-dictionary.ts";
import { WordResultCache } from "../../../lib/word-result-cache.ts";

const CACHE_TTL_MS = positiveEnv("WORD_CHECK_CACHE_TTL_MS", 5 * 60_000);
const CACHE_CAPACITY = 1_000;

type Dictionary = "community" | "nwl" | "csw" | "both";
type DictionaryResult = { id: "community"; label: string; valid: boolean };
type LookupResult = { word: string; dictionaries: DictionaryResult[]; definition: null; points: null };
type WordRouteContext = { params: Promise<{ word: string }> };
type WordRouteDependencies = {
  dictionary: typeof communityDictionary;
  cache: WordResultCache<LookupResult>;
  now: () => number;
};
const dependencies: WordRouteDependencies = {
  dictionary: communityDictionary,
  cache: new WordResultCache(CACHE_CAPACITY, CACHE_TTL_MS),
  now: Date.now,
};

function positiveEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function success(result: LookupResult, cached = false) {
  const valid = result.dictionaries.every((item) => item.valid);
  return Response.json({ status: "ok", outcome: valid ? "valid" : "invalid", ...result, cached });
}

function unavailable(dictionary: Exclude<Dictionary, "community">) {
  const name = dictionary === "nwl" ? "NWL2023" : dictionary === "csw" ? "CSW24" : "NWL2023 and CSW24";
  return Response.json({
    status: "dictionary_unavailable",
    error: `${name} is unavailable because no authorized, compatible source is configured. Your word has not been verified against an official dictionary.`,
  }, { status: 503 });
}

export function createGetHandler(
  { dictionary: dictionaryStore, cache: resultCache, now }: WordRouteDependencies = dependencies,
) {
  const inFlight = new Map<string, Promise<Response>>();

  return async function GET(request: Request, context: WordRouteContext) {
    const { word } = await context.params;
    const normalized = normalizeWord(word);
    const selection = new URL(request.url).searchParams.get("dictionary");
    const dictionary: Dictionary | null = selection === null || selection === "community"
      ? "community"
      : selection === "nwl" || selection === "csw" || selection === "both" ? selection : null;

    if (!normalized) {
      return Response.json({ status: "invalid_request", error: "Enter one word using letters A-Z." }, { status: 400 });
    }
    if (!dictionary) {
      return Response.json({ status: "invalid_request", error: "Choose a supported dictionary mode." }, { status: 400 });
    }
    if (dictionary !== "community") return unavailable(dictionary);

    const key = `${COMMUNITY_DICTIONARY.id}:${normalized}`;
    const cached = resultCache.get(key, now());
    if (cached) return success(cached, true);
    const active = inFlight.get(key);
    if (active) return active.then((response) => response.clone());

    const work = (async () => {
      try {
        const lookup = dictionaryStore.lookup(normalized);
        if (!lookup.available) {
          return Response.json({
            status: "unavailable",
            error: "The Community Dictionary (ENABLE2K) is temporarily unavailable. Your word has not been verified.",
          }, { status: 503 });
        }
        const result: LookupResult = {
          word: normalized,
          dictionaries: [{ ...COMMUNITY_DICTIONARY, valid: lookup.valid }],
          definition: null,
          points: null,
        };
        resultCache.set(key, result, now());
        return success(result);
      } catch {
        return Response.json({
          status: "unavailable",
          error: "The Community Dictionary (ENABLE2K) is temporarily unavailable. Your word has not been verified.",
        }, { status: 503 });
      }
    })();
    inFlight.set(key, work);
    try {
      return await work;
    } finally {
      inFlight.delete(key);
    }
  };
}

export const GET = createGetHandler();

export async function HEAD(request: Request, context: WordRouteContext) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } });
}
