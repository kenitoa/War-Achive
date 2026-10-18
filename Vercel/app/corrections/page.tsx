import { Suspense } from 'react';
import { PageHeading } from '@/components/common';
import { RequestForm } from '@/components/request-form';
export const metadata = { title: '정정 요청' };
export default function CorrectionsPage() { return <><PageHeading index="PARTICIPATE / CORRECTION" title="더 정확한 기록으로" intro="잘못된 정보, 빠진 출처, 공개 재검토가 필요한 자료를 근거와 함께 알려 주세요." /><Suspense fallback={<p>접수 안내를 준비하고 있습니다…</p>}><RequestForm type="correction" /></Suspense></>; }
