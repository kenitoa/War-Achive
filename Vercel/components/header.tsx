'use client';
import Link from '@/components/static-link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useShelf } from './shelf-store';

const navigation = [{ href: '/wars/', label: '전쟁 탐색' }, { href: '/archive/', label: '자료실' }, { href: '/explore/', label: '지도·연표' }, { href: '/collections/', label: '주제별 모음' }, { href: '/entities/', label: '기록 사전' }];
export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const shelf = useShelf();
  return <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="전쟁 아카이브 홈"><span className="brand-symbol" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h6l2 2 2-2h6v16h-6l-2 1-2-1H4z" /><path d="M12 6v15M7 9h2M7 12h2M15 9h2M15 12h2" /></svg></span><span>전쟁 아카이브<small>기록으로 이해하는 역사</small></span></Link><button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? '닫기 ×' : '메뉴 ☰'}</button><nav id="main-navigation" aria-label="주요 메뉴" className={open ? 'main-nav open' : 'main-nav'}>{navigation.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? 'page' : undefined} onClick={() => setOpen(false)}>{item.label}</Link>)}<Link className="shelf-nav" href="/shelf/" onClick={() => setOpen(false)} aria-current={path.startsWith('/shelf') ? 'page' : undefined}>내 서재 <span>{shelf.status === 'ready' ? shelf.document.items.length : '·'}</span></Link></nav></div></header>;
}
