const UPSTREAM = "https://scrabble-checker.com/api/word/";
const CACHE_TTL_MS = positiveEnv("WORD_CHECK_CACHE_TTL_MS", 5 * 60_000);
const DEFAULT_COOLDOWN_MS = positiveEnv("WORD_CHECK_COOLDOWN_MS", 30_000);
const REQUEST_TIMEOUT_MS = positiveEnv("WORD_CHECK_TIMEOUT_MS", 8_000);

type Dictionary = "nwl" | "csw" | "both";
type ProviderResult = { word: string; dictionaries: { id: "nwl" | "csw"; label: string; valid: boolean }[]; definition: string | null; points: number | null };
const cache = new Map<string, { result: ProviderResult; expiresAt: number }>();
const inFlight = new Map<string, Promise<Response>>();
let cooldownUntil = 0;

function positiveEnv(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback; }
function retryAfterMs(value: string | null) { const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 15 * 60_000); const date = value ? Date.parse(value) : NaN; return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 15 * 60_000) : DEFAULT_COOLDOWN_MS; }
function rateLimited() { const retryAfterSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1_000)); return Response.json({ status: "rate_limited", error: "Too many checks right now. Please wait a moment and try again.", retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }); }
function valid(value: unknown): boolean | null { if (typeof value === "boolean") return value; if (!value || typeof value !== "object") return null; const record = value as Record<string, unknown>; const candidate = record.valid ?? record.validity; return typeof candidate === "boolean" ? candidate : null; }
function parse(word: string, value: unknown): ProviderResult | null { if (!value || typeof value !== "object") return null; const data = value as Record<string, unknown>; const nwl = valid(data.nwl2023 ?? data.nwl ?? data.NWL2023); const csw = valid(data.csw24 ?? data.csw ?? data.CSW24); if (nwl === null || csw === null) return null; const definition = typeof data.definition === "string" && data.definition.trim() ? data.definition.trim() : Array.isArray(data.definitions) ? data.definitions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join("; ") || null : null; return { word, dictionaries: [{ id: "nwl", label: "US Scrabble (NWL2023)", valid: nwl }, { id: "csw", label: "International (CSW24)", valid: csw }], definition, points: typeof data.points === "number" && Number.isFinite(data.points) ? data.points : null }; }
function success(result: ProviderResult, dictionary: Dictionary, cached = false) { const dictionaries = dictionary === "both" ? result.dictionaries : result.dictionaries.filter((item) => item.id === dictionary); const outcome = dictionaries.every((item) => item.valid) ? "valid" : dictionaries.every((item) => !item.valid) ? "invalid" : "checked"; return Response.json({ status: "ok", outcome, ...result, dictionaries, cached }); }

export async function GET(request: Request, context: RouteContext<"/api/word/[word]">) {
  const { word } = await context.params;
  const normalized = decodeURIComponent(word).trim().toLowerCase();

  const selection = new URL(request.url).searchParams.get("dictionary");
  const dictionary: Dictionary = selection === "nwl" || selection === "csw" || selection === "both" ? selection : "both";
  if (!/^[a-z]+$/.test(normalized) || normalized.length > 32) return Response.json({ status: "invalid_request", error: "Enter one word using letters A–Z." }, { status: 400 });
  const key = `${dictionary}:${normalized}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return success(cached.result, dictionary, true);
  if (cached) cache.delete(key);
  if (Date.now() < cooldownUntil) return rateLimited();
  const active = inFlight.get(key);
  if (active) return active.then((response) => response.clone());

  const work = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
    const upstream = await fetch(`${UPSTREAM}${encodeURIComponent(normalized)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
      if (upstream.status === 429) { cooldownUntil = Math.max(cooldownUntil, Date.now() + retryAfterMs(upstream.headers.get("Retry-After"))); return rateLimited(); }
      const body: unknown = await upstream.json().catch(() => null);
      if (!upstream.ok) return Response.json({ status: "provider_error", error: "The dictionary service is temporarily unavailable. Your word has not been verified." }, { status: 502 });
      const result = parse(normalized, body);
      if (!result) return Response.json({ status: "provider_error", error: "The dictionary service returned an unexpected response. Your word has not been verified." }, { status: 502 });
      cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return success(result, dictionary);
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError" ? "The dictionary service is temporarily unavailable. Your word has not been verified." : "Couldn't reach the dictionary service. Check your connection and try again.";
      return Response.json({ status: "unavailable", error: message }, { status: 503 });
    } finally { clearTimeout(timeout); }
  })();
  inFlight.set(key, work);
  try { return await work; } finally { inFlight.delete(key); }
}
