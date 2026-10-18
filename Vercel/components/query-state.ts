'use client';
import { useMemo, useSyncExternalStore } from 'react';

const eventName = 'war-archive:query';
function subscribe(listener: () => void): () => void {
  window.addEventListener('popstate', listener); window.addEventListener(eventName, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(eventName, listener); };
}
const snapshot = (): string => window.location.search;
const serverSnapshot = (): string => '';

// Query filters belong to the already published snapshot, so they do not request
// server components or depend on a live Next.js/NAS server.
export function useStaticQuery(): URLSearchParams {
  const query = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return useMemo(() => new URLSearchParams(query), [query]);
}
export function navigateQuery(href: string, replace = false): void {
  const target = new URL(href, window.location.origin);
  if (target.origin !== window.location.origin || target.pathname !== window.location.pathname) { window.location.assign(target); return; }
  window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', `${target.pathname}${target.search}${target.hash}`);
  window.dispatchEvent(new Event(eventName));
}
