import type { ReactNode } from 'react';
import { label, object, time } from './api';

const statuses: Record<string, string> = {
  queued: '대기', running: '실행 중', retry: '재시도 대기', done: '완료', failed: '실패',
  complete: '처리 완료', unavailable: '도구·연결 확인 필요', 'not-requested': '요청하지 않음',
  draft: '초안', review: '검토 대기', published: '공개', withdrawn: '철회',
  prepared: '공개본 준비', approved: '승인', unreviewed: '검토 필요',
  collect: '자료 수집', normalize: '정제', produce: '자료 제작', publish: '발행',
  local: '로컬 공개본', github: 'GitHub 전달', open: '접수', reviewing: '검토 중', pending: '접수', resolved: '처리 완료', rejected: '반려',
};

export function Status({ value }: { value: unknown }) {
  const code = label(value, 'unknown');
  return <span className={`status status-${/^[a-z-]+$/.test(code) ? code : 'unknown'}`}>{statuses[code] ?? code}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty-symbol" aria-hidden="true">▤</span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function ErrorNotice({ error }: { error: string }) {
  return <div className="notice notice-error" role="alert"><strong>확인이 필요합니다</strong><p>{error}</p></div>;
}

export function Panel({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{actions && <div className="panel-actions">{actions}</div>}</div>{children}</section>;
}

export function RawTable({ data, columns, empty = '아직 기록이 없습니다' }: { data: unknown[]; columns: { key: string; title: string; render?: (row: Record<string, unknown>) => ReactNode }[]; empty?: string }) {
  if (!data.length) return <Empty title={empty}>작업이 실행되면 이곳에 실제 처리 이력이 표시됩니다.</Empty>;
  return <div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.title}</th>)}</tr></thead><tbody>{data.map((entry, index) => {
    const row = object(entry);
    return <tr key={label(row.id, String(index))}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : label(row[column.key])}</td>)}</tr>;
  })}</tbody></table></div>;
}

export function DateCell({ value }: { value: unknown }) { return <span className="date">{time(value)}</span>; }

export function Check({ children, checked, onChange, disabled = false }: { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /><span>{children}</span></label>;
}
