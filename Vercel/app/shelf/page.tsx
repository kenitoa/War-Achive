import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { PageHeading } from '@/components/common';
import { ShelfView } from '@/components/shelf';
export const metadata = { title: '내 서재' };
export default function ShelfPage() { return <><PageHeading index="MY LIBRARY / YOUR READING PATH" title="내 서재" intro="기록을 저장하고 메모를 남겨 보세요. 나만의 자료 모음을 만들고 서로 다른 출처를 비교할 수 있습니다." /><Suspense fallback={<p role="status">서재를 준비하고 있습니다…</p>}><ShelfView data={archive()} /></Suspense></>; }
