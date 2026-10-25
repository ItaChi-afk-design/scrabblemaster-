import assert from "node:assert/strict";
import test from "node:test";
import { createCommunityDictionary, normalizeWord } from "../app/lib/community-dictionary.ts";
import { readStoredJson, removeStoredValue, writeStoredJson } from "../app/lib/browser-storage.ts";
import { hasMalformedPercentEncoding } from "../app/lib/path-validation.ts";
import { isCurrentRequest } from "../app/lib/request-guard.ts";
import { WordResultCache } from "../app/lib/word-result-cache.ts";
import { createGetHandler, GET, HEAD, OPTIONS } from "../app/api/word/[word]/route.ts";

const contextFor = (word: string) => ({ params: Promise.resolve({ word }) });
const requestFor = (word: string, dictionary = "community") =>
  new Request(`http://localhost/api/word/${encodeURIComponent(word)}?dictionary=${dictionary}`);
const check = (word: string, dictionary = "community") =>
  GET(requestFor(word, dictionary), contextFor(word));

test("normalizes case and surrounding whitespace, rejecting invalid and overlong input", () => {
  assert.equal(normalizeWord("  HELLO  "), "hello");
  assert.equal(normalizeWord(""), null);
  assert.equal(normalizeWord("hello world"), null);
  assert.equal(normalizeWord("hello!"), null);
  assert.equal(normalizeWord("a".repeat(33)), null);
  assert.equal(normalizeWord("%E0%A4%A"), null);
  assert.equal(normalizeWord(null), null);
});

test("ENABLE2K accepts and rejects words using exact list membership", async () => {
  const present = await check("hello");
  const presentBody = await present.json();
  assert.equal(present.status, 200);
  assert.equal(presentBody.status, "ok");
  assert.equal(presentBody.dictionaries[0].label, "Community (ENABLE2K)");
  assert.equal(presentBody.dictionaries[0].valid, true);

  const absent = await check("scrabblemasterunlikelyword");
  const absentBody = await absent.json();
  assert.equal(absent.status, 200);
  assert.equal(absentBody.dictionaries[0].valid, false);
});

test("normalizes whitespace and case before dictionary lookup", async () => {
  const response = await check("  HELLO  ");
  const body = await response.json();
  assert.equal(body.word, "hello");
  assert.equal(body.dictionaries[0].valid, true);
});

test("returns 400 for malformed words and unsupported dictionary selections", async () => {
  for (const word of ["", "hello!", "hello world", "a".repeat(33), "%E0%A4%A"]) {
    const response = await check(word);
    assert.equal(response.status, 400, word);
    assert.equal((await response.json()).status, "invalid_request");
  }

  const unsupported = await check("hello", "community,unsupported");
  assert.equal(unsupported.status, 400);
  assert.equal((await unsupported.json()).status, "invalid_request");
});

test("malformed percent-encoding is detectable before Next route decoding", () => {
  assert.equal(hasMalformedPercentEncoding("%E0%A4%A"), true);
  assert.equal(hasMalformedPercentEncoding("hello%20world"), false);
});

test("official dictionary modes remain explicitly unavailable", async () => {
  for (const dictionary of ["nwl", "csw", "both"]) {
    const response = await check("hello", dictionary);
    const body = await response.json();
    assert.equal(response.status, 503, dictionary);
    assert.equal(body.status, "dictionary_unavailable");
  }
});

test("dictionary initialization failures return unavailable and are not cached", async () => {
  let lookups = 0;
  const handler = createGetHandler({
    dictionary: {
      lookup: () => {
        lookups += 1;
        return { available: false };
      },
    },
    cache: new WordResultCache(5, 300_000),
    now: () => 1_000,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await handler(requestFor("hello"), contextFor("hello"));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).status, "unavailable");
  }
  assert.equal(lookups, 2);
});

test("community dictionary loader failures never become negative word results", () => {
  const missing = createCommunityDictionary(() => []);
  const failed = createCommunityDictionary(() => { throw new Error("unavailable"); });
  assert.deepEqual(missing.lookup("hello"), { available: false });
  assert.deepEqual(failed.lookup("hello"), { available: false });
});

test("success results are cached", async () => {
  const first = await check("scrabble");
  const second = await check("scrabble");
  assert.equal((await first.json()).cached, false);
  assert.equal((await second.json()).cached, true);
});

test("result cache expires entries and evicts the least-recently-used item at capacity", () => {
  const cache = new WordResultCache<string>(2, 100);
  cache.set("a", "first", 0);
  cache.set("b", "second", 0);
  assert.equal(cache.get("a", 50), "first");
  cache.set("c", "third", 50);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("b", 50), undefined);
  assert.equal(cache.get("a", 50), "first");
  cache.set("a", "replacement", 60);
  assert.equal(cache.get("a", 60), "replacement");
  assert.equal(cache.get("c", 150), undefined);
  assert.equal(cache.get("a", 160), undefined);
  assert.equal(cache.size, 0);

  for (let i = 0; i < 10; i += 1) cache.set(String(i), String(i), 200);
  assert.equal(cache.size, 2);
});

test("GET, HEAD, and OPTIONS preserve their method behavior", async () => {
  const head = await HEAD(requestFor("hello"), contextFor("hello"));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("content-type"), "application/json");

  const options = OPTIONS();
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("allow"), "GET, HEAD, OPTIONS");
});

test("browser storage reports corrupt, unavailable, and quota-failure states without throwing", () => {
  let stored: string | null = "{";
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { stored = value; },
    removeItem: () => { stored = null; },
  };
  const getStorage = () => storage;
  const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

  assert.deepEqual(readStoredJson(getStorage, "games", isArray), { status: "corrupt" });
  stored = "[]";
  assert.deepEqual(readStoredJson(getStorage, "games", isArray), { status: "ok", value: [] });
  assert.equal(writeStoredJson(getStorage, "games", [{ id: "valid" }]), true);
  assert.equal(removeStoredValue(getStorage, "games"), true);

  const unavailable = () => { throw new Error("storage disabled"); };
  assert.deepEqual(readStoredJson(unavailable, "games", isArray), { status: "unavailable" });
  const getItemFailure = () => ({
    ...storage,
    getItem: () => { throw new Error("storage disabled"); },
  });
  assert.deepEqual(readStoredJson(getItemFailure, "games", isArray), { status: "unavailable" });
  assert.equal(writeStoredJson(unavailable, "games", []), false);
  assert.equal(removeStoredValue(unavailable, "games"), false);

  const quotaExceeded = () => ({
    ...storage,
    setItem: () => { throw new Error("quota exceeded"); },
    removeItem: () => { throw new Error("storage disabled"); },
  });
  assert.equal(writeStoredJson(quotaExceeded, "games", []), false);
  assert.equal(removeStoredValue(quotaExceeded, "games"), false);
});

test("stale checker responses are not considered current after a newer request", () => {
  const originalRequestId = 4;
  const currentRequestId = 5;
  assert.equal(isCurrentRequest(originalRequestId, currentRequestId), false);
  assert.equal(isCurrentRequest(currentRequestId, currentRequestId), true);
});
