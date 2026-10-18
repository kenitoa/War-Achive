import type { PublicRecord, Entity } from './generated-contract';

export const kindLabels: Record<PublicRecord['kind'], string> = {
  document: '문서', photograph: '사진', map: '지도', video: '영상', audio: '음성·구술',
  newspaper: '신문·간행물', dataset: '통계·데이터', object: '유물', research: '연구 자료',
};
export const entityLabels: Record<Entity['type'], string> = {
  person: '인물', organization: '조직·부대', place: '장소', equipment: '장비·유물', event: '사건',
};
export const dateLabels: Record<PublicRecord['dates']['precision'], string> = {
  exact: '날짜 확인', year: '연도 단위', range: '기간', circa: '추정 시기', unknown: '날짜 미상',
};
export function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
}
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
