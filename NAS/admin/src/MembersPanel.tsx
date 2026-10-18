import { useState } from 'react';
import { api, label, object, time } from './api';
import { Empty, ErrorNotice, Panel, RawTable } from './components';

export default function MembersPanel({ members }: { members: unknown[] }) {
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState<Record<string, unknown> | null>(null);
  const issueReset = async () => {
    if (!selected || pending) return;
    setPending(true); setError(''); setReset(null);
    try {
      const result = object(await api.request(`/members/${encodeURIComponent(label(selected.id))}/reset`, { method: 'POST' }));
      if (typeof result.token !== 'string' || !result.token || typeof result.expiresAt !== 'string' || Number.isNaN(Date.parse(result.expiresAt))) throw new Error('복구 코드 응답을 확인할 수 없습니다. API 버전을 확인해 주세요.');
      setReset(result);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : '재설정 코드를 발급하지 못했습니다.'); }
    finally { setPending(false); }
  };
  return <div className="split"><Panel title="등록 계정" eyebrow="MEMBERS"><p className="panel-description">서재 동기화를 사용하는 계정입니다. 운영자가 발급한 복구 코드는 별도 전달 절차로 안내해야 합니다.</p><RawTable data={members} empty="등록된 계정이 없습니다" columns={[
    { key: 'displayName', title: '표시 이름' },
    { key: 'email', title: '이메일' },
    { key: 'emailVerified', title: '이메일 확인', render: (row) => <span className="subtle">{row.emailVerified === true ? '확인됨' : '미확인'}</span> },
    { key: 'actions', title: '복구', render: (row) => <button className="text-button" onClick={() => { setSelected(row); setReset(null); setError(''); }}>비밀번호 재설정 →</button> },
  ]} /></Panel><Panel title="계정 복구 코드" eyebrow="ACCOUNT RECOVERY">{!selected ? <Empty title="복구할 계정을 선택하세요" /> : <div className="form-stack"><h3>{label(selected.displayName)}</h3><p className="subtle">{label(selected.email)}</p><p className="subtle">재설정 코드는 일회용이며 만료 시간이 있습니다. 계정 소유자를 확인한 뒤 발급하고, 본인에게 별도로 전달하세요. 이메일은 자동 발송되지 않습니다.</p>{error && <ErrorNotice error={error} />}{!reset ? <button className="button" disabled={pending} onClick={() => void issueReset()}>{pending ? '발급 중…' : '이 계정의 재설정 코드 발급'}</button> : <div className="reset-code-box"><strong>일회용 코드가 발급되었습니다.</strong><label>재설정 코드<textarea readOnly value={label(reset.token, '')} rows={3} spellCheck={false} /></label><p>만료 {time(reset.expiresAt)}</p><p>화면을 닫으면 코드는 지워집니다. 재발급하면 기존 코드의 사용 가능 여부가 달라질 수 있습니다.</p><button className="button button-secondary" onClick={() => { setReset(null); setSelected(null); }}>코드를 지우고 닫기</button></div>}</div>}</Panel></div>;
}
