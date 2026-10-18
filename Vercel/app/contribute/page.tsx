import { Suspense } from 'react';
import { PageHeading } from '@/components/common';
import { RequestForm } from '@/components/request-form';
export const metadata = { title: '자료 제공' };
export default function ContributePage() { return <><PageHeading index="PARTICIPATE / CONTRIBUTION" title="기록을 이어 주세요" intro="소장한 기록이나 새로운 출처를 알려 주세요. 출처와 권리를 확인한 뒤 수록을 검토합니다." /><Suspense fallback={<p>접수 안내를 준비하고 있습니다…</p>}><RequestForm type="contribution" /></Suspense></>; }
