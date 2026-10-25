"use client";

import { BookOpen, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";

type Dictionary = "nwl" | "csw" | "both";
type DictionaryResult = { id: "nwl" | "csw"; label: string; valid: boolean };
type CheckResult = {
  status: "ok";
  outcome: "valid" | "invalid" | "checked";
  word: string;
  dictionaries: DictionaryResult[];
  definition: string | null;
  points: number | null;
  cached: boolean;
};
type FloatingPosition = { x: number; y: number };
type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosition: FloatingPosition;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  dragged: boolean;
};

const savedFloatingPosition = "word-checker-floating-position";

const getSavedFloatingPosition = (): FloatingPosition => {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(savedFloatingPosition) ?? "null") as unknown;
    if (!saved || typeof saved !== "object") return { x: 0, y: 0 };
    const position = saved as Record<string, unknown>;
    return typeof position.x === "number" && typeof position.y === "number"
      ? { x: position.x, y: position.y }
      : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
};

export function WordChecker() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [dictionary, setDictionary] = useState<Dictionary>("both");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({ x: 0, y: 0 });
  const requestId = useRef(0);
  const abortController = useRef<AbortController | null>(null);
  const pendingKey = useRef<string | null>(null);
  const cooldownUntil = useRef(0);
  const dragState = useRef<DragState | null>(null);
  const suppressOpen = useRef(false);
  const floatingPositionRef = useRef(floatingPosition);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const savedPosition = getSavedFloatingPosition();
      floatingPositionRef.current = savedPosition;
      setFloatingPosition(savedPosition);
    });
    return () => { cancelAnimationFrame(frame); abortController.current?.abort(); };
  }, []);

  const close = () => {
    requestId.current += 1;
    abortController.current?.abort();
    setLoading(false);
    setOpen(false);
  };

  const check = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = word.trim().toLowerCase();
    if (!/^[a-z]+$/.test(normalized)) {
      setResult(null);
      setError("Enter one word using letters A–Z.");
      return;
    }

    const key = `${dictionary}:${normalized}`;
    if (loading && pendingKey.current === key) return;
    if (Date.now() < cooldownUntil.current) {
      setError("Too many checks right now. Please wait a moment and try again.");
      return;
    }
    setError("");
    setResult(null);
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;
    const id = ++requestId.current;
    pendingKey.current = key;
    setLoading(true);
    try {
      const response = await fetch(`/api/word/${encodeURIComponent(normalized)}?dictionary=${dictionary}`, { signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = (payload && typeof payload === "object" ? payload : {}) as { error?: unknown; retryAfterSeconds?: unknown };
        if (response.status === 429) {
          const seconds = typeof failure.retryAfterSeconds === "number" ? failure.retryAfterSeconds : Number(response.headers.get("Retry-After")) || 30;
          cooldownUntil.current = Date.now() + Math.max(1, seconds) * 1_000;
        }
        throw new Error(typeof failure.error === "string" ? failure.error : "The dictionary service is temporarily unavailable. Your word has not been verified.");
      }
      const checked = payload && typeof payload === "object" && (payload as CheckResult).status === "ok" ? payload as CheckResult : null;
      if (!checked) throw new Error("The dictionary service returned an unexpected response. Your word has not been verified.");
      if (id === requestId.current) setResult(checked);
    } catch (caught) {
      if (id === requestId.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "Could not check that word.");
      }
    } finally {
      if (id === requestId.current) { setLoading(false); pendingKey.current = null; }
    }
  };

  const visibleResults = result?.dictionaries;

  const startDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (!window.matchMedia("(max-width: 699px)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: floatingPosition,
      minX: floatingPosition.x - bounds.left + 8,
      maxX: floatingPosition.x + window.innerWidth - bounds.right - 8,
      minY: floatingPosition.y - bounds.top + 8,
      maxY: floatingPosition.y + window.innerHeight - bounds.bottom - 8,
      dragged: false,
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const changeX = event.clientX - state.startClientX;
    const changeY = event.clientY - state.startClientY;
    event.preventDefault();
    if (Math.hypot(changeX, changeY) > 5) state.dragged = true;
    if (!state.dragged) return;
    const nextPosition = {
      x: Math.min(state.maxX, Math.max(state.minX, state.startPosition.x + changeX)),
      y: Math.min(state.maxY, Math.max(state.minY, state.startPosition.y + changeY)),
    };
    floatingPositionRef.current = nextPosition;
    setFloatingPosition(nextPosition);
  };

  const stopDragging = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    suppressOpen.current = state.dragged;
    dragState.current = null;
    if (state.dragged) {
      try {
        sessionStorage.setItem(savedFloatingPosition, JSON.stringify(floatingPositionRef.current));
      } catch {
        // Keep the position for this mounted screen even if storage is unavailable.
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      <button
        className="wordCheckerButton"
        style={{ transform: `translate(${floatingPosition.x}px, ${floatingPosition.y}px)` }}
        onPointerDown={startDragging}
        onPointerMove={drag}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onClick={(event) => {
          if (suppressOpen.current) {
            event.preventDefault();
            suppressOpen.current = false;
            return;
          }
          setOpen(true);
        }}
        aria-label="Open word checker"
      >
        <BookOpen />
        <span>Check word</span>
      </button>

      {open && (
        <div className="wordCheckerLayer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section className="wordCheckerSheet" role="dialog" aria-modal="true" aria-labelledby="word-checker-title">
            <header className="wordCheckerHeader">
              <div>
                <small>IN-GAME TOOL</small>
                <h2 id="word-checker-title">Word checker</h2>
              </div>
              <button className="wordCheckerClose" onClick={close} aria-label="Close word checker"><X /></button>
            </header>
            <form onSubmit={check}>
              <label className="wordCheckerLabel" htmlFor="word-to-check">WORD</label>
              <input id="word-to-check" className="wordCheckerInput" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} value={word} onChange={(event) => setWord(event.target.value.replace(/[^a-zA-Z]/g, ""))} placeholder="Enter a word" />
              <label className="wordCheckerLabel" htmlFor="dictionary">DICTIONARY</label>
              <select id="dictionary" className="wordCheckerSelect" value={dictionary} onChange={(event) => { abortController.current?.abort(); requestId.current += 1; setLoading(false); setDictionary(event.target.value as Dictionary); }}>
                <option value="nwl">US Scrabble (NWL2023)</option>
                <option value="csw">International (CSW24)</option>
                <option value="both">Compare both dictionaries</option>
              </select>
              <button className="wordCheckerSubmit" disabled={loading} type="submit">
                {loading ? <><LoaderCircle className="spinning" /> Checking…</> : <><BookOpen /> Check word</>}
              </button>
            </form>
            {error && <div className="wordCheckerError" role="alert"><span>{error}</span><button onClick={() => void check()}><RotateCcw /> Retry</button></div>}
            {result && <div className="wordCheckerResults" aria-live="polite">
              <p><b>{result.word.toUpperCase()}</b>{result.points === null ? " · Points unavailable" : ` · ${result.points} base points`}</p>
              {visibleResults?.map((item) => <div className={`wordCheckerVerdict ${item.valid ? "valid" : "invalid"}`} key={item.id}>
                <span>{item.valid ? <Check /> : <X />}</span><div><small>{item.label}</small><b>{item.valid ? "Valid word!" : "Not valid in the selected dictionary."}</b></div>
              </div>)}
              <div className="wordCheckerDefinition"><small>DEFINITION</small><p>{result.definition ?? "A definition is unavailable for this word."}</p></div>
            </div>}
            <p className="wordCheckerNote">Checks do not change scores, turns, or the timer.</p>
          </section>
        </div>
      )}
    </>
  );
}
