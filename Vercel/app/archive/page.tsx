import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { ArchiveBrowser } from '@/components/archive-browser';
export const metadata = { title: '자료실' };
export default function ArchivePage() { return <><header className="page-heading"><p className="eyebrow">ARCHIVE / SOURCE MATERIALS</p><h1>자료실</h1></header><Suspense fallback={<p role="status">검색 조건을 불러오고 있습니다…</p>}><ArchiveBrowser data={archive()} /></Suspense></>; }
