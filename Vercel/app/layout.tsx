import type { Metadata } from 'next';
import Link from '@/components/static-link';
import { Header } from '@/components/header';
import { archive } from '@/lib/archive';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '전쟁 아카이브 — 기록으로 이해하는 역사', template: '%s | 전쟁 아카이브' },
  description: '전쟁의 문서·사진·증언을 출처와 맥락으로 연결하는 디지털 아카이브. 원자료, 불확실성, 이용 조건을 함께 확인하세요.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const data = archive();
  return <html lang="ko"><body><a className="skip-link" href="#main">본문 바로가기</a><Header /><main id="main" className="main-container">{children}</main><footer className="site-footer"><div className="footer-top"><div><p className="footer-brand">전쟁 아카이브<span>WAR ARCHIVE</span></p><p>기록을 보존하고, 맥락을 연결합니다.</p></div><nav aria-label="운영 안내"><Link href="/about/">소개·수집 현황</Link><Link href="/about/#policy">이용·공개 정책</Link><Link href="/contribute/">자료 제공</Link><Link href="/corrections/">정정 요청</Link><Link href="/account/">계정</Link></nav></div><div className="footer-bottom"><span>출처와 권리는 각 자료에 표시합니다.</span><span className="mono">PUBLIC RELEASE / {data.releaseId === 'unpublished' ? '아직 발행 전' : data.releaseId}</span></div></footer></body></html>;
}
