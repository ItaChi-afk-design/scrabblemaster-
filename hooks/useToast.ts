"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState("");
  const timeouts = useRef<number[]>([]);

  const say = useCallback((message: string) => {
    setToast(message);
    timeouts.current.push(window.setTimeout(() => setToast(""), 2200));
  }, []);

  useEffect(() => () => {
    timeouts.current.forEach((timeout) => window.clearTimeout(timeout));
  }, []);

  return { toast, say };
}
