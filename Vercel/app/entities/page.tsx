import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { EntityBrowser } from '@/components/entity-browser';
import { dictionaryEntries } from '@/lib/dictionary';
export const metadata = { title: '기록 사전' };
export default function EntitiesPage() { const data = archive(); return <><header className="page-heading"><p className="eyebrow">기록 사전 / 항목별 근거</p><h1>기록 사전</h1></header><Suspense fallback={<p role="status">사전 항목을 준비하고 있습니다…</p>}><EntityBrowser data={data} entries={dictionaryEntries(data)} /></Suspense></>; }
