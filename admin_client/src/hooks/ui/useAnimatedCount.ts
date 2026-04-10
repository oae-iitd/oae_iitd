import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export type UseAnimatedCountOptions = {
  /** Animation length in ms */
  duration?: number;
  /** If true (default), values are rounded to integers at each frame */
  integer?: boolean;
};

/**
 * Animates from the previous value toward `target` (count-up). Cancels and
 * restarts cleanly when `target` changes.
 */
export function useAnimatedCount(target: number, options?: UseAnimatedCountOptions): number {
  const duration = options?.duration ?? 550;
  const integer = options?.integer ?? true;
  const safeTarget = Number.isFinite(target) ? target : 0;
  const to = integer ? Math.round(safeTarget) : safeTarget;

  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      queueMicrotask(() => {
        fromRef.current = to;
        setDisplay(to);
      });
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(progress);
      const raw = from + (to - from) * eased;
      const next = integer ? Math.round(raw) : raw;
      setDisplay(next);
      fromRef.current = next;
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration, integer]);

  return display;
}
