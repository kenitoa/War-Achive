import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { ShelfView } from '@/components/shelf';
export const metadata = { title: '내 서재' };
export default function ShelfPage() { return <div className="shelf-page"><header className="shelf-page-heading"><h1>내 서재</h1></header><Suspense fallback={<p role="status">서재를 준비하고 있습니다…</p>}><ShelfView data={archive()} /></Suspense></div>; }
