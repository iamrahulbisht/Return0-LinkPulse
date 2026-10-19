import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { LiveClick } from '../types';

export type LiveMode = 'connecting' | 'live' | 'polling';

export interface LiveState {
  mode: LiveMode;
  /** When we last heard from the server (a click, the stream opening, or a poll). */
  lastUpdate: number;
  /** Call this after a poll so "updated X s ago" stays true in polling mode. */
  markUpdated: () => void;
}

const POLL_MS = 10_000;

/**
 * Live clicks over Server-Sent Events, opened straight on the API domain
 * (a long stream through the Vercel rewrite can be cut by proxy timeouts).
 * If the stream drops, it reconnects with a fresh token; after repeated failures it
 * falls back to polling: `onPoll` runs every 10 s.
 */
export function useLiveClicks(onClick: (c: LiveClick) => void, onPoll?: () => void): LiveState {
  const [mode, setMode] = useState<LiveMode>('connecting');
  const [lastUpdate, setLastUpdate] = useState(() => Date.now());
  const clickRef = useRef(onClick);
  const pollRef = useRef(onPoll);
  clickRef.current = onClick;
  pollRef.current = onPoll;

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll) return;
      setMode('polling');
      poll = setInterval(() => {
        pollRef.current?.();
        setLastUpdate(Date.now());
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    const connect = async () => {
      if (stopped) return;
      try {
        const { url } = await api.stream.token();
        if (stopped) return;
        es = new EventSource(url);
        es.addEventListener('ready', () => {
          failures = 0;
          stopPolling();
          setMode('live');
          setLastUpdate(Date.now());
        });
        es.addEventListener('click', (ev) => {
          try {
            clickRef.current(JSON.parse((ev as MessageEvent).data) as LiveClick);
            setLastUpdate(Date.now());
          } catch {
            // ignore a bad message
          }
        });
        es.onerror = () => {
          // The token is only valid for 60 s, so get a new one instead of letting EventSource retry.
          es?.close();
          es = null;
          scheduleRetry();
        };
      } catch {
        scheduleRetry();
      }
    };
    const scheduleRetry = () => {
      if (stopped) return;
      failures++;
      if (failures >= 2) startPolling();
      retry = setTimeout(connect, Math.min(30_000, 2000 * failures));
    };

    void connect();
    return () => {
      stopped = true;
      es?.close();
      if (retry) clearTimeout(retry);
      stopPolling();
    };
  }, []);

  return { mode, lastUpdate, markUpdated: () => setLastUpdate(Date.now()) };
}

/** Re-renders every second, for "updated 3 s ago". */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
