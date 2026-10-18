'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { emptyShelf, parseShelf, SHELF_BACKUP_KEY, SHELF_KEY, ShelfSchema, type Shelf } from '@/lib/shelf';

const EVENT = 'war-archive:shelf';
function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(EVENT, callback); };
}
function snapshot(): string {
  try { return window.localStorage.getItem(SHELF_KEY) ?? ''; }
  catch { return '!storage-unavailable'; }
}
const serverSnapshot = (): string => '!loading';

export function useShelf() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return useMemo(() => {
    if (raw === '!loading') return { status: 'loading' as const, document: emptyShelf(), raw: '' };
    if (raw === '!storage-unavailable') return { status: 'unavailable' as const, document: emptyShelf(), raw: '' };
    if (!raw) return { status: 'ready' as const, document: emptyShelf(), raw };
    try { return { status: 'ready' as const, document: parseShelf(raw), raw }; }
    catch { return { status: 'corrupt' as const, document: emptyShelf(), raw }; }
  }, [raw]);
}

export function saveShelf(document: Shelf, allowRecovery = false): void {
  const next = ShelfSchema.parse({ ...document, updatedAt: new Date().toISOString() });
  const serialized = JSON.stringify(next);
  // Saved documents must remain readable by the same bounded import/recovery path.
  parseShelf(serialized);
  try {
    const previous = window.localStorage.getItem(SHELF_KEY);
    if (previous) {
      let valid = true;
      try { parseShelf(previous); } catch { valid = false; }
      if (valid) window.localStorage.setItem(SHELF_BACKUP_KEY, previous);
      else {
        if (!allowRecovery) throw new Error('손상된 서재를 덮어쓸 수 없습니다. 내 서재에서 복구하거나 원본을 내보내세요.');
        window.localStorage.setItem(`${SHELF_BACKUP_KEY}.damaged`, previous);
      }
    }
    window.localStorage.setItem(SHELF_KEY, serialized);
    window.dispatchEvent(new Event(EVENT));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '서재를 저장하지 못했습니다. 브라우저 저장 공간과 권한을 확인하세요.');
  }
}

export function restoreBackup(): void {
  const raw = window.localStorage.getItem(SHELF_BACKUP_KEY);
  if (!raw) throw new Error('복구할 이전 저장본이 없습니다.');
  saveShelf(parseShelf(raw), true);
}

export function downloadText(filename: string, value: string): void {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
