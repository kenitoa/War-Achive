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
  return <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="전쟁 아카이브 홈"><span className="brand-symbol" aria-hidden="true">W<span>⌜</span></span><span>전쟁 아카이브<small>WAR ARCHIVE</small></span></Link><button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? '닫기 ×' : '메뉴 ☰'}</button><nav id="main-navigation" aria-label="주요 메뉴" className={open ? 'main-nav open' : 'main-nav'}>{navigation.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? 'page' : undefined} onClick={() => setOpen(false)}>{item.label}</Link>)}<Link className="shelf-nav" href="/shelf/" onClick={() => setOpen(false)} aria-current={path.startsWith('/shelf') ? 'page' : undefined}>내 서재 <span>{shelf.status === 'ready' ? shelf.document.items.length : '·'}</span></Link></nav></div></header>;
}
