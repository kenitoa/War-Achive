import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { PageHeading } from '@/components/common';
import { Explorer } from '@/components/explorer';
export const metadata = { title: '지도·연표' };
export default function ExplorePage() { return <><PageHeading index="EXPLORE / TIME & PLACE" title="시간과 장소의 기록" intro="같은 시기의 기록, 같은 장소의 다른 시선. 지점이나 연표 항목을 선택해 연결된 자료를 살펴보세요." /><Suspense fallback={<p role="status">지도를 준비하고 있습니다…</p>}><Explorer data={archive()} /></Suspense></>; }
