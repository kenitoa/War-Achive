import Link from '@/components/static-link';
export default function NotFound() { return <div className="empty-state"><p className="eyebrow">404 / RECORD NOT FOUND</p><h1>기록을 찾을 수 없습니다</h1><p>주소를 확인하거나 자료실에서 다시 검색해 주세요. 현재 공개본에 포함되지 않은 기록일 수도 있습니다.</p><Link className="button" href="/archive/">자료실로 이동 ↗</Link></div>; }
