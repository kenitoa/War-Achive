import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Command = {
  id: string;
  action: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  output: string;
  deltas?: Record<string, number>;
};

type Status = {
  checkedAt: string;
  security: { adminAuthRequired: boolean; tokenConfigured: boolean; credentialsExposed: boolean };
  schedules: {
    collectionIntervalMs: number;
    processingDelayMs: number;
    publicationIntervalMs: number;
    schedulerRetryMs: number;
    nextCollectionAt: string | null;
    nextPublicationAt: string | null;
  };
  publishing: { repository: string; branch: string; contentPath: string; targetUrl: string };
  operations: { running: Command | null; recent: Command[] };
  errors: { collection: string | null; publication: string | null };
  counts: {
    topics: number;
    collectedTopics: number;
    rawDocuments: number;
    labeledDocuments: number;
    clusteredDocuments: number;
    eventClusters: number;
    informationizedRecords: number;
    informationizedDocuments: number;
    informationizedSources: number;
    publishedRecords: number;
    publishedDocuments: number;
    publishedSources: number;
    reviewDocuments: number;
  };
  sources: {
    configured: number;
    apiConfigured: number;
    activeApi: number;
    requiresEnv: number;
    missingRequiredEnv: number;
    paginatedApi: number;
    cursorTracked: number;
    missingRequiredEnvNames: string[];
  };
  quality: {
    minPublicationScore: number;
    lowConfidenceDocuments: number;
    outlierDocuments: number;
    rejectedDocuments: number;
    reviewDocuments: number;
  };
  publicationReadiness: {
    informationizedRecords: number;
    readyRecords: number;
    waitingRecords: number;
    alreadyPublishedRecords: number;
    belowQualityRecords: number;
    reviewBreakdown: {
      lowConfidence: number;
      outlier: number;
      rejected: number;
      reviewDecision: number;
    };
    nextReadyRecord: { id: string; title: string; qualityScore: number | null } | null;
  };
  state: {
    lastCollectionAttemptedAt: string | null;
    lastCollectedAt: string | null;
    lastPublicationAttemptedAt: string | null;
    lastPublishedAt: string | null;
    pendingTopicId: string | null;
    nextTopicId: string | null;
  };
  clusters: Array<{
    id: string;
    title: string;
    confidence: number;
    documentIds: string[];
    sentenceIds: string[];
    algorithm?: Record<string, string>;
    entityResolution?: { method: string; matchedExisting: boolean; score: number };
  }>;
  reviewDocuments: Array<{
    id: string;
    title: string;
    sourceUrl: string;
    eventClusterId: string;
    eventClusterTitle: string;
    eventClusterConfidence: number;
    qualityScore: number;
    qualityDecision: string;
    outlier: boolean;
    outlierReasons: string[];
  }>;
  publicationHistory: Array<{
    id: string;
    action: string;
    status: string;
    recordId: string | null;
    addedDocumentIds: string[];
    removedDocumentIds: string[];
    createdAt: string;
  }>;
  recentRecords: Array<{ id: string; title: string; period: string; region: string; published: boolean }>;
};

function formatDate(value: string | null) {
  if (!value) return "기록 없음";
  return new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(value: number) {
  return `${Math.round(value / 60000)}분`;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

const deltaLabels: Record<string, string> = {
  rawDocuments: "raw",
  eventClusters: "clusters",
  informationizedRecords: "records",
  informationizedDocuments: "record docs",
  publishedRecords: "published records",
  publishedDocuments: "published docs",
  reviewDocuments: "review",
  readyRecords: "ready",
  waitingRecords: "waiting",
  belowQualityRecords: "low quality"
};

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function DeltaSummary({ deltas }: { deltas?: Record<string, number> }) {
  if (!deltas) return null;
  return (
    <div className="deltaList">
      {Object.entries(deltaLabels).map(([key, label]) => (
        <span key={key}>{label} {formatDelta(deltas[key] ?? 0)}</span>
      ))}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem("warArchiveAdminToken") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const authorized = token.length > 0 && !error?.includes("401");
  const authHeaders = useMemo(() => ({ authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () => fetch("./api/status", { cache: "no-store", headers: authHeaders })
      .then((response) => response.ok ? response.json() as Promise<Status> : Promise.reject(new Error(`status ${response.status}`)))
      .then((data) => {
        if (!active) return;
        setStatus(data);
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "status failed");
      });
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authHeaders, token]);

  function saveToken() {
    window.localStorage.setItem("warArchiveAdminToken", draftToken.trim());
    setToken(draftToken.trim());
  }

  async function runAction(action: string) {
    setBusyAction(action);
    setError(null);
    try {
      const response = await fetch("./api/actions", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json();
      const refreshed = await fetch("./api/status", { cache: "no-store", headers: authHeaders });
      if (refreshed.ok) setStatus(await refreshed.json());
      if (!response.ok) throw new Error(payload.error ?? payload.output ?? `action ${response.status}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "action failed");
    } finally {
      setBusyAction(null);
    }
  }

  if (!authorized || !status) {
    return (
      <main className="loginShell">
        <section className="loginPanel">
          <p className="eyebrow">WAR ARCHIVE ADMIN</p>
          <h1>관리자 토큰</h1>
          <div className="tokenRow">
            <input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="WAR_ARCHIVE_ADMIN_TOKEN" />
            <button onClick={saveToken}>접속</button>
          </div>
          {error ? <p className="errorText">{error}</p> : <p>상태 조회와 수동 작업은 토큰 인증 후에만 열립니다.</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside>
        <strong>War Archive</strong>
        <a href="#overview">Overview</a>
        <a href="#actions">Actions</a>
        <a href="#clusters">Clusters</a>
        <a href="#pages">Pages</a>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">NAS PROCESS CONTROL</p>
            <h1>관리자 대시보드</h1>
          </div>
          <div className="statusPill">{formatDate(status.checkedAt)}</div>
        </header>

        {error ? <section className="alert">{error}</section> : null}

        <section className="grid metrics" id="overview">
          <Metric label="RAW" value={status.counts.rawDocuments} detail="수집 문서" />
          <Metric label="CLUSTERS" value={status.counts.eventClusters} detail={`${status.counts.clusteredDocuments}개 문서 포함`} />
          <Metric label="RECORDS" value={status.counts.informationizedRecords} detail={`${status.counts.informationizedDocuments}개 자료 포함`} />
          <Metric label="PUBLISHED" value={status.counts.publishedDocuments} detail={`${status.counts.publishedRecords}개 공개 기록`} />
          <Metric label="REVIEW" value={status.counts.reviewDocuments} detail="검토 필요 문서" />
        </section>

        <section className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">PIPELINE</p>
              <h2>처리 상태</h2>
            </div>
            <span>{status.publishing.repository} / {status.publishing.branch}</span>
          </div>
          <div className="timeline">
            <div><b>수집</b><span>{formatMinutes(status.schedules.collectionIntervalMs)}</span><small>최근 {formatDate(status.state.lastCollectedAt)} / 다음 {formatDate(status.schedules.nextCollectionAt)}</small></div>
            <div><b>가공</b><span>{formatMinutes(status.schedules.processingDelayMs)}</span><small>문장 기반 군집화</small></div>
            <div><b>발행</b><span>{formatMinutes(status.schedules.publicationIntervalMs)}</span><small>시도 {formatDate(status.state.lastPublicationAttemptedAt)} / 성공 {formatDate(status.state.lastPublishedAt)} / 다음 {formatDate(status.schedules.nextPublicationAt)}</small></div>
            <div><b>Pages</b><span>즉시</span><small>{status.publishing.targetUrl}</small></div>
          </div>
        </section>

        <section className="panel" id="actions">
          <div className="panelHead">
            <div>
              <p className="eyebrow">CONTROL</p>
              <h2>수동 관리</h2>
            </div>
            <span>{status.operations.running ? `${status.operations.running.action} 실행 중` : "대기"}</span>
          </div>
          <div className="actionBar">
            {["collect", "publish", "rollback", "audit"].map((action) => (
              <button key={action} disabled={Boolean(busyAction || status.operations.running)} onClick={() => void runAction(action)}>
                {busyAction === action ? "실행 중" : action}
              </button>
            ))}
          </div>
          <div className="commandList">
            {status.operations.recent.map((command) => (
              <article key={command.id}>
                <b>{command.action}</b>
                <span>{command.status}</span>
                <small>{formatDate(command.finishedAt ?? command.startedAt)}</small>
                <DeltaSummary deltas={command.deltas} />
                {command.output ? <pre>{command.output}</pre> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="grid">
          <article className="panel">
            <p className="eyebrow">SOURCES</p>
            <h2>출처 상태</h2>
            <dl>
              <div><dt>전체</dt><dd>{status.sources.configured}</dd></div>
              <div><dt>API</dt><dd>{status.sources.apiConfigured}</dd></div>
              <div><dt>활성 API</dt><dd>{status.sources.activeApi}</dd></div>
              <div><dt>키 누락</dt><dd>{status.sources.missingRequiredEnv}</dd></div>
              <div><dt>페이지 수집</dt><dd>{status.sources.paginatedApi}</dd></div>
              <div><dt>커서 추적</dt><dd>{status.sources.cursorTracked}</dd></div>
            </dl>
            {status.sources.missingRequiredEnvNames.length > 0 ? (
              <p className="mutedText">{status.sources.missingRequiredEnvNames.join(", ")}</p>
            ) : null}
          </article>
          <article className="panel">
            <p className="eyebrow">QUALITY</p>
            <h2>신뢰도 필터</h2>
            <dl>
              <div><dt>최소 점수</dt><dd>{status.quality.minPublicationScore}</dd></div>
              <div><dt>이상치</dt><dd>{status.quality.outlierDocuments}</dd></div>
              <div><dt>거절</dt><dd>{status.quality.rejectedDocuments}</dd></div>
            </dl>
          </article>
        </section>

        <section className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">PUBLICATION READINESS</p>
              <h2>발행 가능성</h2>
            </div>
            <span>{status.publicationReadiness.nextReadyRecord ? status.publicationReadiness.nextReadyRecord.id : "대기"}</span>
          </div>
          <dl>
            <div><dt>정보화 기록</dt><dd>{status.publicationReadiness.informationizedRecords}</dd></div>
            <div><dt>정보화 자료</dt><dd>{status.counts.informationizedDocuments}</dd></div>
            <div><dt>발행 가능</dt><dd>{status.publicationReadiness.readyRecords}</dd></div>
            <div><dt>가공 대기</dt><dd>{status.publicationReadiness.waitingRecords}</dd></div>
            <div><dt>이미 공개 기록</dt><dd>{status.publicationReadiness.alreadyPublishedRecords}</dd></div>
            <div><dt>이미 공개 자료</dt><dd>{status.counts.publishedDocuments}</dd></div>
            <div><dt>품질 미달</dt><dd>{status.publicationReadiness.belowQualityRecords}</dd></div>
          </dl>
          <dl>
            <div><dt>낮은 군집 확신도</dt><dd>{status.publicationReadiness.reviewBreakdown.lowConfidence}</dd></div>
            <div><dt>검토 판정</dt><dd>{status.publicationReadiness.reviewBreakdown.reviewDecision}</dd></div>
            <div><dt>이상치</dt><dd>{status.publicationReadiness.reviewBreakdown.outlier}</dd></div>
            <div><dt>거절</dt><dd>{status.publicationReadiness.reviewBreakdown.rejected}</dd></div>
          </dl>
        </section>

        <section className="panel" id="clusters">
          <div className="panelHead">
            <div>
              <p className="eyebrow">ENTITY RESOLUTION</p>
              <h2>사건 군집</h2>
            </div>
            <span>DBSCAN {"->"} HDBSCAN {"->"} Isolation Forest {"->"} K-Means</span>
          </div>
          <div className="table">
            {status.clusters.map((cluster) => (
              <div className="row" key={cluster.id}>
                <b>{cluster.title}</b>
                <span>{cluster.id}</span>
                <span>{cluster.documentIds.length} docs</span>
                <span>{cluster.confidence}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">REVIEW QUEUE</p>
              <h2>오분류 검토</h2>
            </div>
            <span>{status.reviewDocuments.length} items</span>
          </div>
          <div className="table">
            {status.reviewDocuments.map((document) => (
              <div className="row" key={document.id}>
                <b>{document.title}</b>
                <span>{document.eventClusterTitle}</span>
                <span>{document.qualityDecision}</span>
                <span>{document.outlierReasons.join(", ") || document.qualityScore}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" id="pages">
          <div className="panelHead">
            <div>
              <p className="eyebrow">PAGES</p>
              <h2>발행 이력</h2>
            </div>
            <a href="https://github.com/kenitoa/warsachive/actions" target="_blank" rel="noreferrer">GitHub Actions</a>
          </div>
          <div className="table">
            {status.publicationHistory.map((entry) => (
              <div className="row" key={entry.id}>
                <b>{entry.recordId ?? entry.id}</b>
                <span>{entry.status}</span>
                <span>+{entry.addedDocumentIds.length}</span>
                <span>-{entry.removedDocumentIds.length}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
