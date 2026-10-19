"use client";
import { useEffect, useState } from "react";

const EVENT = "ghost-shelf:registry-count";

/** Broadcast a new registry count (called after a successful log). */
export function announceRegistryCount(n: number) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: n }));
}

export function RegistryCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/registry?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && j && typeof j.count === "number" && setCount(j.count))
      .catch(() => {});
    const onCount = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, onCount);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onCount);
    };
  }, []);
  return <span className="tnum">{count ?? 10}</span>;
}
