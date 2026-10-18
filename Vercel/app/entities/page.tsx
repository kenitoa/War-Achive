import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { PageHeading } from '@/components/common';
import { EntityBrowser } from '@/components/entity-browser';
export const metadata = { title: '기록 사전' };
export default function EntitiesPage() { return <><PageHeading index="CONNECTIONS / PEOPLE, PLACES & EVENTS" title="기록 사전" intro="전쟁과 자료를 연결하는 이름들. 사람, 조직, 장소, 장비와 사건을 출처에서부터 살펴봅니다." /><Suspense fallback={<p role="status">연결 기록을 준비하고 있습니다…</p>}><EntityBrowser data={archive()} /></Suspense></>; }
