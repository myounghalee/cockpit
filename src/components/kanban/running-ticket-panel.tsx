"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  X,
  Terminal as TerminalIcon,
  Square,
  Check,
  Copy,
  FileText,
  ChevronRight,
  Activity,
  Play,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
// markdown fontSize 공유 (Settings에서 조절)
import { useUpdateTicket } from "@/hooks/use-tickets";
import { useTicketDoc, type DocType } from "@/hooks/use-ticket-doc";
import { useQueryClient } from "@tanstack/react-query";
import type { Ticket, PdcaStage } from "@/types/ticket";
import { StagesCard } from "./stages-card";
import { ChecklistCard } from "./checklist-card";
import {
  ActionTimeline,
  type TimelineAction,
} from "./action-timeline";

interface Props {
  ticket: Ticket;
  projectId: string | null;
  onClose: () => void;
}

const PDCA_LABEL: Record<string, string> = {
  plan: "Plan",
  design: "Design",
  do: "Do",
  check: "Check",
  report: "Report",
};

/** 단계별로 어떤 문서를 미리 보여줄지 매핑. Do는 문서 없음(체크리스트로 대체) */
const STAGE_DOC: Record<string, { type: DocType; file: string } | null> = {
  plan: { type: "plan", file: "plan.md" },
  design: { type: "design", file: "design.md" },
  do: null,
  check: { type: "analysis", file: "analysis.md" },
  report: { type: "report", file: "report.md" },
};

function isPdcaStage(value: unknown): value is PdcaStage {
  return (
    value === "plan" ||
    value === "design" ||
    value === "do" ||
    value === "check" ||
    value === "report"
  );
}

function formatElapsed(startedAt: string | null, endAt?: number): string {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = endAt ?? Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function RunningTicketPanel({ ticket, projectId, onClose }: Props) {
  const router = useRouter();
  const createTab = useTerminalStore((s) => s.createTab);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const tabs = useTerminalStore((s) => s.tabs);
  const updateMut = useUpdateTicket(projectId);
  const markdownFontSize = useTerminalStore((s) => s.markdownFontSize);
  const qc = useQueryClient();
  const [advancing, setAdvancing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);

  const stage = isPdcaStage(ticket.pdcaStage) ? ticket.pdcaStage : null;
  const isLastStage = stage === "report";
  const isRunning = ticket.status === "in_progress";
  // 한 번이라도 실행된 적 있는가. startedAt이 생겼다는 건 /api/tickets/:id/run이
  // 성공한 적 있다는 뜻. 이 값이 false면 아직 "시작 전" 상태라 승인/중지/완료 버튼은 의미 없음.
  const hasBeenStarted = !!ticket.startedAt;

  const runTicket = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (err) {
      alert(`실행 실패: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  }, [ticket.id, qc, starting]);

  // 사용자가 PDCA 카드에서 탭 클릭하여 열람 중인 단계.
  // 티켓이 바뀌거나 stage가 다음 단계로 진행하면 자동으로 현재 단계로 sync.
  const [selectedStage, setSelectedStage] = useState<PdcaStage | null>(stage);
  useEffect(() => {
    setSelectedStage(stage);
  }, [ticket.id, stage]);

  const selectedDoc = selectedStage ? STAGE_DOC[selectedStage] : null;
  const docQuery = useTicketDoc(ticket.id, selectedDoc?.type ?? null);

  // 가로폭 리사이즈 (오버레이 형태) — localStorage에 저장하여 세션 간 유지
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 600;
    const saved = Number(
      window.localStorage.getItem("cockpit-running-panel-width"),
    );
    if (Number.isFinite(saved) && saved >= 320) return saved;
    return Math.floor(window.innerWidth / 2);
  });
  const resizingRef = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = window.innerWidth - e.clientX;
      const clamped = Math.min(
        Math.max(next, 320),
        Math.max(window.innerWidth - 320, 360),
      );
      setWidth(clamped);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(
        "cockpit-running-panel-width",
        String(width),
      );
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  // board의 컬럼 컨테이너가 좌우 스크롤 padding을 계산할 수 있도록
  // 현재 패널 폭을 CSS 변수로 노출. 언마운트 시 0으로 리셋.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--running-panel-width",
      `${width}px`,
    );
    return () => {
      document.documentElement.style.setProperty(
        "--running-panel-width",
        "0px",
      );
    };
  }, [width]);

  // 실행 중(in_progress)일 때만 1초마다 갱신. 끝나면 마지막 값을 고정.
  //   - completedAt이 있으면 그 시점까지로 정확히 계산
  //   - 없으면 status=review로 전환된 뒤 처음 본 시점을 종료로 간주(근사)
  const completedMs = ticket.completedAt
    ? new Date(ticket.completedAt).getTime()
    : undefined;
  const [elapsed, setElapsed] = useState(() =>
    formatElapsed(ticket.startedAt, isRunning ? undefined : completedMs),
  );
  useEffect(() => {
    if (!isRunning) {
      // 정지 상태: 완료 시각 또는 "지금 1회" 스냅샷으로 고정
      setElapsed(formatElapsed(ticket.startedAt, completedMs ?? Date.now()));
      return;
    }
    const id = setInterval(() => {
      setElapsed(formatElapsed(ticket.startedAt));
    }, 1000);
    return () => clearInterval(id);
  }, [ticket.startedAt, isRunning, completedMs]);

  // 실시간 로그 스트림 + 액션 타임라인 — SSE 구독
  const [logText, setLogText] = useState("");
  const [actions, setActions] = useState<TimelineAction[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogText("");
    setActions([]);
    const es = new EventSource(`/api/tickets/${ticket.id}/stream`);

    es.addEventListener("backfill", (ev: MessageEvent) => {
      setLogText(ev.data);
    });
    es.addEventListener("data", (ev: MessageEvent) => {
      setLogText((prev) => prev + ev.data);
    });
    es.addEventListener("action", (ev: MessageEvent) => {
      try {
        const a = JSON.parse(ev.data) as TimelineAction;
        setActions((prev) => {
          const idx = prev.findIndex((x) => x.id === a.id);
          if (idx >= 0) {
            // 기존 running 항목을 done/error로 업데이트 (name/summary는 유지)
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              status: a.status,
              ts: a.ts || next[idx].ts,
            };
            return next;
          }
          return [...prev, a];
        });
      } catch {
        // 잘못된 JSON은 스킵
      }
    });
    es.addEventListener("exit", () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-doc", ticket.id] });
      qc.invalidateQueries({ queryKey: ["ticket-stages", ticket.id] });
      qc.invalidateQueries({ queryKey: ["ticket-checklist", ticket.id] });
      es.close();
    });
    es.onerror = () => {
      // 자동 재시도는 EventSource 기본 동작
    };
    return () => {
      es.close();
    };
  }, [ticket.id, qc]);

  // 새 로그 chunk가 오면 바닥으로 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logText]);

  const openClaude = async () => {
    try {
      // 이미 티켓과 연결된 터미널 탭이 있으면 그걸로 이동
      const existing = tabs.find((t) => t.ticketId === ticket.id);
      if (existing) {
        setActiveTab(existing.id);
        router.push("/terminal");
        return;
      }
      // 새 탭 + claude --resume 자동 실행
      const res = await fetch(`/api/tickets/${ticket.id}/claude-info`);
      const info = await res.json();
      if (!res.ok) throw new Error(info.error ?? `${res.status}`);
      await createTab({
        cwd: info.cwd,
        initialInput: info.command,
        tabName: ticket.jiraKey ?? ticket.title.slice(0, 20),
        ticketId: ticket.id,
      });
      router.push("/terminal");
    } catch (err) {
      alert(`Claude 열기 실패: ${(err as Error).message}`);
    }
  };

  const stop = async () => {
    if (!isRunning || stopping) return;
    if (!confirm("진행 중인 작업을 중지하고 리뷰 상태로 전환할까요?")) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (err) {
      alert(`중지 실패: ${(err as Error).message}`);
    } finally {
      setStopping(false);
    }
  };

  const markDone = () => {
    updateMut.mutate({ id: ticket.id, status: "done" });
    onClose();
  };

  const autoDoneOnReport =
    ticket.commitMode === "commit" ||
    ticket.commitMode === "commit_push" ||
    ticket.commitMode === "commit_push_pr";

  const advanceStage = async () => {
    if (!stage || advancing) return;
    const confirmMsg = isLastStage
      ? autoDoneOnReport
        ? "사이클을 종료하고 티켓을 완료 처리할까요?"
        : "사이클을 종료할까요? (커밋/푸시는 수동으로 진행해주세요)"
      : `현재 ${PDCA_LABEL[stage]} 단계를 승인하고 다음 단계로 진행할까요?`;
    if (!confirm(confirmMsg)) return;

    setAdvancing(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/advance-stage`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `${res.status}`);
      }

      qc.invalidateQueries({ queryKey: ["tickets"] });

      if (data.stageCompleted) {
        onClose();
        return;
      }
      // runner가 이미 백그라운드로 다음 단계를 실행 중. SSE가 새 로그 흘림.
    } catch (err) {
      alert(`단계 전환 실패: ${(err as Error).message}`);
    } finally {
      setAdvancing(false);
    }
  };

  const copySession = () => {
    if (!ticket.sessionId) return;
    navigator.clipboard.writeText(ticket.sessionId);
  };

  return (
    <div
      style={{ width }}
      className="absolute right-0 top-0 bottom-0 z-20 border-l border-[var(--color-border)] flex flex-col bg-[var(--color-surface)] shadow-xl"
    >
      <div
        onMouseDown={onResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-accent)]/60 z-30"
        title="드래그로 크기 조절"
      />
      <div className="flex items-center justify-between h-9 px-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-1.5 min-w-0">
          {isRunning ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              실행 중
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] shrink-0">
              {ticket.status}
            </span>
          )}
          <span className="text-xs font-semibold text-[var(--color-foreground-muted)] truncate">
            티켓 상세
          </span>
          {stage && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/15 text-purple-400 font-medium">
              PDCA · {PDCA_LABEL[stage]}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
          title="닫기"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 p-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {ticket.jiraKey && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)] font-mono">
                {ticket.jiraKey}
              </span>
            )}
            {ticket.projectName && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400 font-mono truncate max-w-[120px]">
                {ticket.projectName}
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-[var(--color-foreground)]">
            {ticket.title}
          </div>
          {ticket.description && (
            <div className="mt-1 text-xs text-[var(--color-foreground-muted)] whitespace-pre-wrap">
              {ticket.description}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded border border-[var(--color-border)] p-2">
            <div className="text-[10px] text-[var(--color-foreground-dim)] mb-0.5">
              경과 시간
            </div>
            <div className="font-mono text-[var(--color-foreground)]">
              {elapsed}
            </div>
          </div>
          <div className="rounded border border-[var(--color-border)] p-2">
            <div className="text-[10px] text-[var(--color-foreground-dim)] mb-0.5">
              재작업
            </div>
            <div className="font-mono text-[var(--color-foreground)]">
              {ticket.reworkCount}회
            </div>
          </div>
        </div>

        {ticket.sessionId && (
          <div className="rounded border border-[var(--color-border)] p-2 text-[11px]">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-[var(--color-foreground-dim)]">
                세션 ID
              </span>
              <button
                onClick={copySession}
                className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
                title="복사"
              >
                <Copy size={10} />
              </button>
            </div>
            <div className="font-mono text-[10px] text-[var(--color-foreground-muted)] break-all">
              {ticket.sessionId}
            </div>
          </div>
        )}

        {stage && (
          <StagesCard
            ticketId={ticket.id}
            selected={selectedStage}
            onSelect={(s) => setSelectedStage(s as PdcaStage)}
          />
        )}

        {selectedStage === "do" ? (
          <ChecklistCard ticketId={ticket.id} />
        ) : selectedDoc ? (
          <div className="rounded border border-[var(--color-border)] p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText
                size={11}
                className="text-[var(--color-foreground-dim)]"
              />
              <span className="text-[10px] text-[var(--color-foreground-dim)]">
                {selectedDoc.file}
              </span>
              {docQuery.data?.content && (
                <span className="text-[10px] text-green-400">● 있음</span>
              )}
            </div>
            {docQuery.isLoading ? (
              <div className="text-[11px] text-[var(--color-foreground-dim)]">
                확인 중…
              </div>
            ) : docQuery.data?.content ? (
              <div
                className="markdown-body max-h-80 overflow-y-auto pr-1"
                style={{ fontSize: markdownFontSize }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {docQuery.data.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-[11px] text-[var(--color-foreground-dim)]">
                아직 작성되지 않았습니다.
              </div>
            )}
          </div>
        ) : null}

        <details
          open
          className="rounded border border-[var(--color-border)] group"
        >
          <summary className="flex items-center gap-1.5 cursor-pointer list-none px-2 py-1.5 hover:bg-[var(--color-surface-hover)]">
            <ChevronRight
              size={11}
              className="text-[var(--color-foreground-dim)] transition-transform group-open:rotate-90"
            />
            <Activity
              size={11}
              className="text-[var(--color-foreground-dim)]"
            />
            <span className="text-[10px] text-[var(--color-foreground-muted)] flex-1">
              액션 타임라인
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-foreground-dim)]">
              {isRunning && (
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                  live
                </span>
              )}
              <span>{actions.length}건</span>
            </span>
          </summary>
          <div className="p-2 border-t border-[var(--color-border)]">
            <ActionTimeline actions={actions} />
          </div>
        </details>

        <details className="rounded border border-[var(--color-border)] p-2">
          <summary className="flex items-center gap-1.5 cursor-pointer list-none">
            <span className="text-[10px] text-[var(--color-foreground-dim)]">
              원문 로그
            </span>
            {isRunning && (
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                stream
              </span>
            )}
            <span className="ml-auto text-[10px] text-[var(--color-foreground-dim)]">
              펼치기
            </span>
          </summary>
          <pre className="mt-2 min-h-[140px] max-h-96 overflow-y-auto text-[10px] leading-snug text-[var(--color-foreground-muted)] whitespace-pre-wrap font-mono bg-[var(--color-background)] rounded p-2">
            {logText || (
              <span className="text-[var(--color-foreground-dim)]">
                아직 로그가 없습니다.
              </span>
            )}
            <div ref={logEndRef} />
          </pre>
        </details>
      </div>

      <div className="border-t border-[var(--color-border)] p-2 flex flex-col gap-1.5">
        {!hasBeenStarted ? (
          // 아직 한 번도 실행 안 된 티켓 — "시작" 버튼만 노출.
          // 승인/중지/완료는 실행 흐름이 시작돼야 의미가 있으므로 감춤.
          <button
            onClick={runTicket}
            disabled={starting}
            className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={13} fill="currentColor" />
            {starting
              ? "시작 중…"
              : ticket.sessionId
                ? "이어서 실행"
                : "PDCA 실행 시작"}
          </button>
        ) : (
          <>
            {stage && (
              <button
                onClick={advanceStage}
                disabled={advancing || isRunning}
                title={
                  isRunning ? "실행이 끝난 뒤 승인할 수 있습니다" : undefined
                }
                className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={12} />
                {advancing
                  ? "전환 중…"
                  : isLastStage
                    ? autoDoneOnReport
                      ? "사이클 완료 → Done"
                      : "사이클 종료"
                    : `${PDCA_LABEL[stage]} 승인 → 다음 단계`}
              </button>
            )}
            {/* Claude 열기: sessionId가 있을 때만 (없으면 이어갈 세션이 없음) */}
            {ticket.sessionId && (
              <button
                onClick={openClaude}
                className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20"
                title="이 세션을 터미널에서 대화형으로 이어가기"
              >
                <TerminalIcon size={12} />
                Claude 열기
              </button>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={stop}
                disabled={!isRunning || stopping}
                className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-[var(--color-border)] text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Square size={11} /> {stopping ? "중지 중…" : "중지"}
              </button>
              <button
                onClick={markDone}
                className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded border border-[var(--color-border)] text-green-400 hover:bg-green-500/10"
              >
                <Check size={11} /> 완료
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


