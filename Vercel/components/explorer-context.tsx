'use client';
import { useEffect, useRef, useState } from 'react';
import Link from './static-link';
import { useStaticQuery } from './query-state';
import { references, warDossiers } from '@/lib/editorial';
import type { PublicArchive } from '@/lib/generated-contract';
import { routeId } from '@/lib/security';

export function ExplorerContext({ data }: { data: PublicArchive }) {
  const params = useStaticQuery();
  const [activeWar, setActiveWar] = useState<(typeof warDossiers)[number] | null>(null);
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const selectedWar = data.wars.some(war => war.id === params.get('war')) ? params.get('war') ?? '' : '';
  const dossiers = warDossiers.filter(dossier => (!selectedWar || dossier.warId === selectedWar) && data.wars.some(war => war.id === dossier.warId));
  const event = activeWar?.events[index];
  const war = data.wars.find(item => item.id === activeWar?.warId);
  const move = (delta: number) => setIndex(current => Math.max(0, Math.min((activeWar?.events.length ?? 1) - 1, current + delta)));
  useEffect(() => {
    if (!activeWar) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [activeWar]);

  return <section className="section historical-context" id="historical-context">
    <div className="section-heading"><div><p className="eyebrow">HISTORY / TIMELINE</p><h2>전쟁별 주요 전환점</h2></div></div>
    <div className="history-launchers">{dossiers.map(dossier => {
      const item = data.wars.find(entry => entry.id === dossier.warId);
      return <button type="button" className="history-launcher" key={dossier.warId} aria-haspopup="dialog" onClick={click => {
        trigger.current = click.currentTarget;
        setIndex(0);
        setActiveWar(dossier);
      }}><span className="history-orbit-icon" aria-hidden="true">＋</span><span className="history-launcher-period">{item?.period}</span><strong>{item?.name}</strong><span>{dossier.subtitle}</span><span className="history-launcher-action">{dossier.events.length}개 전환점 <span aria-hidden="true">↗</span></span></button>;
    })}</div>
    <dialog ref={dialog} className="hologram-dialog" aria-labelledby="hologram-title" onClose={() => setActiveWar(null)} onClick={click => {
      if (click.target === click.currentTarget) dialog.current?.close();
    }} onKeyDown={key => {
      if (key.key === 'ArrowRight') { key.preventDefault(); move(1); }
      if (key.key === 'ArrowLeft') { key.preventDefault(); move(-1); }
      if (key.key === 'Home') { key.preventDefault(); setIndex(0); }
      if (key.key === 'End' && activeWar) { key.preventDefault(); setIndex(activeWar.events.length - 1); }
    }}>
      {activeWar && event && <div className="hologram-shell">
        <header className="hologram-header"><div><span>HISTORICAL ATLAS · {war?.period}</span><h3 id="hologram-title">{war?.name}</h3></div><button type="button" className="hologram-close" aria-label="역사 연표 닫기" onClick={() => dialog.current?.close()}>✕</button></header>
        <div className="hologram-stage" onTouchStart={start => {
          touch.current = { x: start.touches[0].clientX, y: start.touches[0].clientY };
        }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={end => {
          const origin = touch.current;
          const finish = end.changedTouches[0];
          touch.current = null;
          if (origin && finish && Math.abs(finish.clientX - origin.x) > 40 && Math.abs(finish.clientX - origin.x) > Math.abs(finish.clientY - origin.y)) move(finish.clientX < origin.x ? 1 : -1);
        }}>
          <div className="hologram-orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className="hologram-window"><div className="hologram-track" style={{ transform: `translateX(-${index * 100}%)` }}>{activeWar.events.map((entry, position) => <article className="hologram-slide" key={entry.date} aria-hidden={position !== index}>
            <span className="hologram-sequence">CHAPTER {String(position + 1).padStart(2, '0')}</span><time>{entry.date}</time><h4>{entry.title}</h4><p>{entry.body}</p>
          </article>)}</div></div>
          <div className="hologram-navigation"><button type="button" aria-label="이전 사건" disabled={index === 0} onClick={() => move(-1)}>←</button><span aria-live="polite" aria-atomic="true">{String(index + 1).padStart(2, '0')} <span>/ {String(activeWar.events.length).padStart(2, '0')}</span><span className="sr-only"> {event.title}</span></span><button type="button" aria-label="다음 사건" disabled={index === activeWar.events.length - 1} onClick={() => move(1)}>→</button></div>
        </div>
        <nav className="hologram-chapters" aria-label="사건 선택">{activeWar.events.map((entry, position) => <button type="button" key={entry.date} aria-label={`${entry.date} ${entry.title}`} aria-current={position === index ? 'step' : undefined} onClick={() => setIndex(position)}><span />{entry.date}</button>)}</nav>
        <footer className="hologram-footer"><span>박물관·기록관 역사 해설</span><div><a href={references.find(source => source.id === event.sourceId)?.url} target="_blank" rel="noopener noreferrer">해설 출처 ↗</a><Link href={`/explore/?war=${routeId(activeWar.warId)}&from=${event.year}&to=${event.year}#record-explorer`} onClick={() => dialog.current?.close()}>{event.year}년 자료 →</Link></div></footer>
      </div>}
    </dialog>
  </section>;
}
