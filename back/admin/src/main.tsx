import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Status = {
  checkedAt: string;
  schedules: {
    collectionIntervalMs: number;
    publicationIntervalMs: number;
    nextCollectionAt: string | null;
    nextPublicationAt: string | null;
  };
  counts: {
    topics: number;
    collectedTopics: number;
    rawDocuments: number;
    labeledDocuments: number;
    informationizedRecords: number;
    publishedRecords: number;
  };
  state: {
    lastCollectedAt: string | null;
    lastPublishedAt: string | null;
    pendingTopicId: string | null;
    nextTopicId: string | null;
  };
  recentRecords: Array<{ id: string; title: string; period: string; region: string; published: boolean }>;
};

const emptyStatus: Status = {
  checkedAt: new Date().toISOString(),
  schedules: { collectionIntervalMs: 1_800_000, publicationIntervalMs: 2_400_000, nextCollectionAt: null, nextPublicationAt: null },
  counts: { topics: 0, collectedTopics: 0, rawDocuments: 0, labeledDocuments: 0, informationizedRecords: 0, publishedRecords: 0 },
  state: { lastCollectedAt: null, lastPublishedAt: null, pendingTopicId: null, nextTopicId: null },
  recentRecords: []
};

const stageMeta = [
  ["01", "역사 자료 수집", "COLLECTION", "30분마다 주제 1개", "raw/documents.json"],
  ["02", "중복 제거·라벨링", "LABELING", "수집 직후", "labeled/documents.json"],
  ["03", "역사 자료 정보화", "INFORMATIONIZATION", "라벨링 직후", "informationized/records.json"],
  ["04", "GitHub 누적 발행", "STATIC PUBLISH", "40분마다 기록 1개", "web/content/archive.json"],
  ["05", "GitHub Pages 배포", "PAGES DEPLOYMENT", "push 감지 즉시", "kenitoa.github.io/warsachive"]
];

function formatDate(value: string | null) {
  if (!value) return "기록 없음";
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function App() {
  const [status, setStatus] = useState<Status>(emptyStatus);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => fetch("./api/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Status> : Promise.reject(new Error(`status ${response.status}`)))
      .then((data) => { if (active) { setStatus(data); setConnected(true); } })
      .catch(() => { if (active) setConnected(false); });
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const stageCounts = useMemo(() => [
    `${status.counts.collectedTopics}/${status.counts.topics}`,
    String(status.counts.labeledDocuments),
    String(status.counts.informationizedRecords),
    String(status.counts.publishedRecords),
    connected ? "READY" : "WAIT"
  ], [connected, status.counts]);

  const selectedStage = stageMeta[selected];

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>WA</span><p>전쟁 역사 아카이브<small>NAS PROCESS CONTROL</small></p></div>
        <p className="navLabel">운영 목록 / INDEX</p>
        <nav aria-label="관리 메뉴">
          <a className="active" href="#pipeline"><span>01</span>처리 현황</a>
          <a href="#schedule"><span>02</span>스케줄</a>
          <a href="#records"><span>03</span>정보화 기록</a>
          <a href="https://github.com/kenitoa/warsachive/actions" target="_blank" rel="noreferrer"><span>04</span>GitHub 배포 ↗</a>
        </nav>
        <div className="asideStamp">NAS LOCAL<br /><small>PORT 9231</small></div>
        <p className="asideNote">자동 새로고침 · 15 SEC</p>
      </aside>

      <main>
        <header>
          <div><p className="eyebrow">ARCHIVE PIPELINE · LIVE STATUS</p><h1>NAS 처리 관제</h1></div>
          <div className={connected ? "connection online" : "connection offline"}><i /><span>{connected ? "상태 파일 연결" : "연결 대기"}</span><small>{formatDate(status.checkedAt)}</small></div>
        </header>

        <section className="notice">
          <span>STATUS</span><div><strong>{connected ? "NAS 데이터 볼륨을 정상적으로 읽고 있습니다." : "관리 서버의 상태 API를 기다리고 있습니다."}</strong><p>원시 자료와 중간 산출물은 NAS에만 남고 정보화가 끝난 기록만 GitHub 저장소로 이동합니다.</p></div><b>9231</b>
        </section>

        <section className="metrics" aria-label="처리 현황">
          <article><span>01 / TOPICS</span><strong>{status.counts.collectedTopics}<small> / {status.counts.topics}</small></strong><p>완료 주제</p></article>
          <article><span>02 / DOCUMENTS</span><strong>{status.counts.rawDocuments}<small> RAW</small></strong><p>수집 문서</p></article>
          <article><span>03 / PUBLISHED</span><strong>{status.counts.publishedRecords}<small> RECORDS</small></strong><p>GitHub 공개 완료</p></article>
        </section>

        <section className="panel" id="pipeline">
          <div className="sectionHeader"><div><p>PROCESS SEQUENCE</p><h2>자동 처리 단계</h2></div><span>단계를 눌러 저장 위치를 확인하세요.</span></div>
          <div className="pipeline">
            {stageMeta.map(([code, title, english, cadence], index) => (
              <button className={selected === index ? "stage active" : "stage"} key={code} onClick={() => setSelected(index)} aria-pressed={selected === index}>
                <span>{code}</span><em>{stageCounts[index]}</em><strong>{title}</strong><small>{english}</small><b>{cadence}</b>
              </button>
            ))}
          </div>
          <div className="selectedStage"><span>SELECTED / {selectedStage[0]}</span><h3>{selectedStage[1]}</h3><p>{selectedStage[3]}</p><code>{selectedStage[4]}</code></div>
        </section>

        <section className="scheduleGrid" id="schedule">
          <article><span>COLLECTOR / 30 MIN</span><h2>다음 수집</h2><strong>{formatDate(status.schedules.nextCollectionAt)}</strong><dl><div><dt>다음 주제</dt><dd>{status.state.nextTopicId ?? "대기 주제 없음"}</dd></div><div><dt>마지막 완료</dt><dd>{formatDate(status.state.lastCollectedAt)}</dd></div></dl></article>
          <article><span>PUBLISHER / 40 MIN</span><h2>다음 발행</h2><strong>{formatDate(status.schedules.nextPublicationAt)}</strong><dl><div><dt>발행 대기</dt><dd>{status.state.pendingTopicId ?? "대기 기록 없음"}</dd></div><div><dt>마지막 완료</dt><dd>{formatDate(status.state.lastPublishedAt)}</dd></div></dl></article>
        </section>

        <section className="panel" id="records">
          <div className="sectionHeader"><div><p>INFORMATIONIZED RECORDS</p><h2>최근 정보화 기록</h2></div><a href="https://kenitoa.github.io/warsachive/" target="_blank" rel="noreferrer">공개 페이지 →</a></div>
          {status.recentRecords.length > 0 ? <div className="recordTable">
            <div className="recordRow tableHead"><span>ID</span><span>기록명</span><span>시기·지역</span><span>상태</span></div>
            {status.recentRecords.map((record) => <div className="recordRow" key={record.id}><span>{record.id}</span><strong>{record.title}</strong><span>{record.period} · {record.region}</span><em className={record.published ? "published" : "waiting"}>{record.published ? "공개" : "발행 대기"}</em></div>)}
          </div> : <div className="empty"><span>EMPTY ARCHIVE</span><strong>아직 정보화된 기록이 없습니다.</strong><p>수집 스케줄러가 첫 주제를 처리하면 이곳에 표시됩니다.</p></div>}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
