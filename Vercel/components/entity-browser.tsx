'use client';
import Link from '@/components/static-link';
import { useStaticQuery } from './query-state';
import type { PublicArchive } from '@/lib/generated-contract';
import { entityLabels } from '@/lib/labels';
import { routeId } from '@/lib/security';
import { EmptyState } from './common';

export function EntityBrowser({ data }: { data: PublicArchive }) {
  const params = useStaticQuery(); const q = (params.get('q') ?? '').trim().toLocaleLowerCase(); const type = params.get('type') ?? ''; const war = params.get('war') ?? '';
  const entities = data.entities.filter(entity => (!type || entity.type === type) && (!war || entity.warIds.includes(war)) && (!q || `${entity.name} ${entity.summary}`.toLocaleLowerCase().includes(q)));
  return <><form className="entity-filters explore-filters" action="/entities/"><label className="field">이름·설명 검색<input type="search" name="q" defaultValue={params.get('q') ?? ''} placeholder="인물, 사건, 장소…" maxLength={300} /></label><label className="field">기록 유형<select name="type" defaultValue={type}><option value="">모든 유형</option>{Object.entries(entityLabels).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label className="field">관련 전쟁<select name="war" defaultValue={war}><option value="">모든 전쟁</option>{data.wars.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button" type="submit">기록 찾기 ↗</button><Link className="text-link" href="/entities/">초기화</Link></form><p className="dictionary-count">{entities.length}개의 연결 기록</p>{entities.length ? <div className="entity-grid">{entities.map(entity => <article className="entity-card" key={entity.id}><p className="eyebrow">{entityLabels[entity.type]}</p><h3><Link href={`/entities/${routeId(entity.id)}/`}>{entity.name} ↗</Link></h3><p>{entity.summary}</p>{entity.location && <p className="fine-print">{entity.location.precision === 'exact' ? '위치 확인' : '지역 대표·추정 위치'} · {entity.location.name}</p>}<div className="tag-row">{data.wars.filter(item => entity.warIds.includes(item.id)).map(item => <Link className="tag" href={`/wars/${routeId(item.id)}/`} key={item.id}>{item.name}</Link>)}</div></article>)}</div> : <EmptyState title={data.entities.length ? '조건에 맞는 연결 기록이 없습니다' : '연결 기록을 준비하고 있습니다'} description="확인된 인물·조직·장소·장비·사건의 독립 기록을 제공합니다. 별도 기록이 없는 대상은 자료의 원 소장처 정보를 확인해 주세요." />}<p className="notice">이 사전은 현재 공개된 연결 기록입니다. 전체 인물·사건을 망라하지 않으며, 장소의 대표 좌표를 실제 전투·피해 위치로 확정하지 않습니다.</p></>;
}
