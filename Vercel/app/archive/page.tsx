import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { PageHeading } from '@/components/common';
import { ArchiveBrowser } from '@/components/archive-browser';
export const metadata = { title: '자료실' };
export default function ArchivePage() { return <><PageHeading index="ARCHIVE / SOURCE MATERIALS" title="자료실" intro="문서와 사진, 목소리에 남은 기록. 출처와 맥락을 따라 자료를 찾아보세요." /><Suspense fallback={<p role="status">검색 조건을 불러오고 있습니다…</p>}><ArchiveBrowser data={archive()} /></Suspense></>; }
