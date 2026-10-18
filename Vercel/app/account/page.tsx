import { PageHeading } from '@/components/common';
import { AccountPanel } from '@/components/account';
export const metadata = { title: '계정' };
export default function AccountPage() { return <><PageHeading index="ACCOUNT / OPTIONAL CONNECTION" title="계정과 동기화" intro="브라우저 서재를 기본으로 사용하고, 연결된 서버가 있을 때 계정으로 기기 간 기록을 이어갑니다." /><AccountPanel /></>; }
