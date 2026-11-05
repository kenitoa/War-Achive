import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api } from './api';
import { ArchiveRecordSchema } from './generated-models';
import { ErrorNotice } from './components';

const Result=z.object({items:z.array(ArchiveRecordSchema),total:z.number().int(),page:z.number().int(),pageSize:z.number().int()});
export default function EvidencePicker({busy}:{busy:boolean}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[result,setResult]=useState<z.infer<typeof Result>|null>(null);
  const [selected,setSelected]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let live=true;setLoading(true);setError('');
    const timer=setTimeout(()=>{void api.request(`/records?status=published&pageSize=20&page=${page}&q=${encodeURIComponent(query)}`).then(raw=>{if(live)setResult(Result.parse(raw));}).catch(()=>{if(live)setError('근거 자료를 불러오지 못했습니다. 검색어 또는 연결을 확인해 주세요.');}).finally(()=>{if(live)setLoading(false);});},200);
    return()=>{live=false;clearTimeout(timer);};
  },[page,query]);
  const ids=Object.keys(selected);
  return <div className="evidence-picker">
    <label className="field">근거 자료 검색<input type="search" value={query} maxLength={200} onChange={event=>{setQuery(event.target.value);setPage(1);}} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} placeholder="공개 자료 제목"/></label>
    <p>선택 {ids.length} / 20개 · 검색·페이지를 이동해도 선택을 유지합니다.</p>
    {ids.map(id=><div key={id} className="evidence-picked"><input type="hidden" name="recordIds" value={id}/><span>{selected[id]}</span><button type="button" className="button button-secondary button-small" aria-label={`${selected[id]} 선택 해제`} disabled={busy} onClick={()=>setSelected(current=>Object.fromEntries(Object.entries(current).filter(([key])=>key!==id)))}>해제</button></div>)}
    {error&&<ErrorNotice error={error}/>}{loading&&<p role="status">자료 검색 중…</p>}
    {!loading&&result&&<><div className="evidence-options">{result.items.map(record=><label key={record.id}><input type="checkbox" checked={Boolean(selected[record.id])} disabled={busy||(!selected[record.id]&&ids.length>=20)} onChange={event=>setSelected(current=>event.target.checked?{...current,[record.id]:record.public.title}:Object.fromEntries(Object.entries(current).filter(([key])=>key!==record.id)))}/><span>{record.public.title}<small>{record.public.source.name} · {record.public.dates.display}</small></span></label>)}{!result.items.length&&<p>일치하는 공개 자료가 없습니다.</p>}</div><div className="row-actions"><button type="button" className="button button-secondary button-small" disabled={page<=1||busy} onClick={()=>setPage(value=>value-1)}>자료 이전</button><span>{page} / {Math.max(1,Math.ceil(result.total/20))}</span><button type="button" className="button button-secondary button-small" disabled={page*20>=result.total||busy} onClick={()=>setPage(value=>value+1)}>자료 다음</button></div></>}
  </div>;
}
