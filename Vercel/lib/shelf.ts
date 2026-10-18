import { z } from 'zod';

export const SHELF_KEY = 'war-archive.shelf.v1';
export const SHELF_BACKUP_KEY = 'war-archive.shelf.backup.v1';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const ShelfSchema = z.object({
  version: z.literal(1), updatedAt: z.iso.datetime(),
  items: z.array(z.object({
    recordId: z.string().min(1).max(200), savedAt: z.iso.datetime(), note: z.string().max(20000),
    collectionIds: z.array(z.string().min(1).max(100)).max(100),
  }).strict()).max(10000),
  collections: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(100) }).strict()).max(100),
}).strict().superRefine((doc, ctx) => {
  if (new Set(doc.items.map(item => item.recordId)).size !== doc.items.length) ctx.addIssue({ code: 'custom', message: '중복된 자료 ID가 있습니다.' });
  const ids = new Set(doc.collections.map(collection => collection.id));
  if (ids.size !== doc.collections.length) ctx.addIssue({ code: 'custom', message: '중복된 모음 ID가 있습니다.' });
  if (doc.items.some(item => item.collectionIds.some(id => !ids.has(id)))) ctx.addIssue({ code: 'custom', message: '존재하지 않는 모음 참조가 있습니다.' });
});
export type Shelf = z.infer<typeof ShelfSchema>;
export const emptyShelf = (): Shelf => ({ version: 1, updatedAt: new Date().toISOString(), items: [], collections: [] });

export function parseShelf(raw: string): Shelf {
  if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) throw new Error('서재 파일은 2MB 이하여야 합니다.');
  try { return ShelfSchema.parse(JSON.parse(raw)); }
  catch { throw new Error('올바른 서재 파일이 아닙니다. 원본 파일을 보관하고 형식과 손상 여부를 확인하세요.'); }
}

export function mergeShelves(current: Shelf, incoming: Shelf): Shelf {
  const collections = [...current.collections];
  const idMap = new Map<string, string>();
  for (const collection of incoming.collections) {
    const identical = collections.find(item => item.name === collection.name);
    const occupied = collections.some(item => item.id === collection.id);
    const id = identical?.id ?? (occupied ? `import-${collections.length}-${collection.id}`.slice(0, 100) : collection.id);
    idMap.set(collection.id, id);
    if (!identical) collections.push({ ...collection, id });
  }
  const items = current.items.map(item => ({ ...item, collectionIds: [...item.collectionIds] }));
  for (const item of incoming.items) {
    const collectionIds = item.collectionIds.map(id => idMap.get(id) ?? id);
    const currentItem = items.find(existing => existing.recordId === item.recordId);
    if (currentItem) {
      currentItem.collectionIds = [...new Set([...currentItem.collectionIds, ...collectionIds])];
      if (item.note && item.note !== currentItem.note) {
        currentItem.note = currentItem.note ? `${currentItem.note}\n\n[가져온 메모]\n${item.note}` : item.note;
      }
    } else items.push({ ...item, collectionIds });
  }
  return ShelfSchema.parse({ version: 1, updatedAt: new Date().toISOString(), items, collections });
}

export function shelfCitation(title: string, source: string, identifier: string, sourceUrl: string, accessedAt: string): string {
  return `${title}. ${source}, ${identifier}. ${sourceUrl} (접근일: ${accessedAt.slice(0, 10)}).`;
}
