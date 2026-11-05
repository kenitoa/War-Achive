import { Suspense } from 'react';
import { archive } from '@/lib/archive';
import { SectionTitle } from '@/components/common';
import { Explorer } from '@/components/explorer';
import { ExplorerContext } from '@/components/explorer-context';
import { RoomOverview, Chapters, GuideCards } from '@/components/reading-room';

export const metadata = { title: '지도·연표' };
export default function ExplorePage() {
  const data = archive();
  const dated = data.records.filter(record => record.dates.start).length;
  const located = data.records.filter(record => record.location).length;
  return <div className="reading-room"><header className="page-heading"><p className="eyebrow">열람실 02 / 시간과 장소</p><h1>시간과 장소로 읽기</h1></header><RoomOverview items={[{ label: '위치가 있는 자료', value: `${located} / ${data.records.length}`, detail: '원자료의 제공 좌표만 표시해요' }, { label: '시작 시기가 있는 자료', value: `${dated} / ${data.records.length}`, detail: '자료에 적힌 시기이며 사건 날짜와 다를 수 있어요' }, { label: '좌표 없는 자료', value: data.records.length - located, detail: '지도 밖의 기록도 목록에서 읽을 수 있어요' }]} /><section className="explorer-room" id="record-explorer"><Suspense fallback={<p role="status">지도를 준비하고 있어요…</p>}><Explorer data={data} /></Suspense></section><Suspense fallback={<p role="status">역사 연표를 준비하고 있어요…</p>}><ExplorerContext data={data} /></Suspense><section className="section map-reading-guide"><SectionTitle eyebrow="지도를 읽는 기준" title="지점과 시간을 해석하는 방법" /><Chapters chapters={[{ title: '점 하나가 말하는 범위', body: '지도는 개별 자료의 제공 좌표를 보여줘요. 촬영 장소·기념물 위치·소장 설명의 지점일 수 있으며 전장 전체나 이동 경로를 뜻하지 않아요. 추정·지역 범위 표시는 정확한 한 지점과 구분해요.' }, { title: '기록의 날짜와 사건의 날짜', body: '자료의 생산·대상 시기, 디지털 등록 날짜, 전쟁의 기간은 서로 다를 수 있어요. 기간 필터는 공개 메타데이터를 기준으로 작동해요. 역사 연표의 사건과 검색된 기록의 직접 관계는 각 원자료에서 다시 확인해요.' }, { title: '보이지 않는 점도 기록', body: '좌표가 없다는 이유로 자료가 없는 것은 아니에요. 전체 자료실과 연표에서 함께 탐색할 수 있어요. 가까운 점을 묶은 표시는 개별 위치를 대체하지 않으며 주변 자료 목록에서 각각의 좌표를 확인할 수 있어요.' }]} /></section><section className="section"><SectionTitle title="장소 너머의 이야기" href="/collections/" linkText="모든 주제" /><GuideCards data={data} ids={['transport-and-supply', 'memory-and-remembrance', 'reading-photographs']} /></section></div>;
}

