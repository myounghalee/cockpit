"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useCreateTicket,
  useUpdateTicket,
} from "@/hooks/use-tickets";
import type { Ticket } from "@/types/ticket";
import { Sparkles } from "lucide-react";
import { JiraPickerDialog } from "./jira-picker-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 특정 프로젝트에 속할 티켓이면 string, 전체 보기에서 생성하면 null */
  projectId: string | null;
  /** 전체 보기에서 생성 시 프로젝트를 고르기 위한 목록 */
  projects?: Array<{ id: string; name: string }>;
  /** 편집 모드면 ticket 제공, 생성 모드면 null */
  ticket?: Ticket | null;
  /** 생성 모드에서 기본 상태(컬럼별 [+]용) */
  defaultStatus?: string;
  /** Jira 패널에서 임포트 시 사전 입력 */
  importIssue?: { key: string; summary: string; description: string } | null;
}

export function TicketDialog({
  open,
  onOpenChange,
  projectId,
  projects,
  ticket,
  defaultStatus,
  importIssue,
}: Props) {
  const isEdit = !!ticket;
  const needsProjectPick = !isEdit && !projectId; // 전체 보기에서 생성 시
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [jiraKey, setJiraKey] = useState("");
  const [resultSummary, setResultSummary] = useState("");
  const [autoMode, setAutoMode] = useState<string>("manual");
  const [commitMode, setCommitMode] = useState<string>("none");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [jiraOpen, setJiraOpen] = useState(false);

  // 편집 시엔 ticket.projectId를 쓰고, 생성 시엔 prop projectId 또는 사용자가 고른 값.
  const effectiveProjectId = isEdit
    ? (ticket?.projectId ?? null)
    : projectId ?? (selectedProjectId || null);

  const createMut = useCreateTicket(effectiveProjectId);
  const updateMut = useUpdateTicket(effectiveProjectId);

  useEffect(() => {
    if (!open) return;
    if (ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description ?? "");
      setJiraKey(ticket.jiraKey ?? "");
      setResultSummary(ticket.resultSummary ?? "");
      setAutoMode(ticket.autoMode || "manual");
      setCommitMode(ticket.commitMode || "none");
    } else if (importIssue) {
      setTitle(importIssue.summary);
      setDescription(importIssue.description);
      setJiraKey(importIssue.key);
      setResultSummary("");
      setAutoMode("manual");
      setCommitMode("none");
    } else {
      setTitle("");
      setDescription("");
      setJiraKey("");
      setResultSummary("");
      setAutoMode("manual");
      setCommitMode("none");
    }
    if (!isEdit) {
      setSelectedProjectId(projectId ?? "");
    }
    setError(null);
  }, [open, ticket, importIssue, isEdit, projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsProjectPick && !selectedProjectId) {
      setError("프로젝트를 선택해주세요.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      jiraKey: jiraKey.trim() || undefined,
      autoMode,
      commitMode,
      ...(isEdit
        ? { resultSummary: resultSummary.trim() || null }
        : {}),
    };
    try {
      if (isEdit && ticket) {
        await updateMut.mutateAsync({ id: ticket.id, ...payload });
      } else {
        await createMut.mutateAsync({
          ...payload,
          status: defaultStatus,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const handleJiraPick = (issue: {
    key: string;
    summary: string;
    description: string;
    type: string;
  }) => {
    setJiraKey(issue.key);
    if (!title.trim()) setTitle(issue.summary);
    if (!description.trim()) setDescription(issue.description);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{isEdit ? "티켓 편집" : "새 티켓"}</DialogTitle>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            {needsProjectPick && (
              <label className="text-xs text-[var(--color-foreground-muted)]">
                프로젝트 *
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  className="w-full mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">프로젝트 선택…</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-xs text-[var(--color-foreground-muted)]">
              제목 *
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>

            <div className="text-xs text-[var(--color-foreground-muted)]">
              Jira 키
              <div className="flex gap-1 mt-1">
                <Input
                  placeholder="PROJ-123"
                  value={jiraKey}
                  onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setJiraOpen(true)}
                  title="Jira에서 가져오기"
                >
                  <Sparkles size={13} /> Jira
                </Button>
              </div>
            </div>

            <label className="text-xs text-[var(--color-foreground-muted)]">
              설명
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </label>

            <fieldset className="flex flex-col gap-1 border border-[var(--color-border)] rounded-md p-2 mt-1">
              <legend className="text-[10px] text-[var(--color-foreground-dim)] px-1">
                PDCA 실행 모드
              </legend>
              {[
                {
                  v: "manual",
                  label: "단계별 승인 (기본)",
                  hint: "각 단계 끝에서 사용자 승인 후 다음 단계로",
                },
                {
                  v: "after_plan",
                  label: "Plan 승인 후 자동",
                  hint: "Plan만 승인받고 Design~Report는 자동 연쇄",
                },
                {
                  v: "full",
                  label: "완전 자동",
                  hint: "승인 없이 Report까지 자동 — 범위 넓어질 수 있으니 주의",
                },
              ].map((o) => (
                <label
                  key={o.v}
                  className="flex items-start gap-2 text-xs cursor-pointer hover:bg-[var(--color-surface-hover)] rounded px-1 py-1"
                >
                  <input
                    type="radio"
                    name="autoMode"
                    value={o.v}
                    checked={autoMode === o.v}
                    onChange={() => setAutoMode(o.v)}
                    className="mt-0.5 accent-[var(--color-accent)]"
                  />
                  <span className="flex-1">
                    <span className="text-[var(--color-foreground)]">
                      {o.label}
                    </span>
                    <span className="block text-[10px] text-[var(--color-foreground-dim)]">
                      {o.hint}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="text-xs text-[var(--color-foreground-muted)]">
              Report 완료 시 Git 동작
              <select
                value={commitMode}
                onChange={(e) => setCommitMode(e.target.value)}
                className="w-full mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                <option value="none">안 함 (리뷰 상태로 유지)</option>
                <option value="commit">자동 커밋</option>
                <option value="commit_push">커밋 + 푸시</option>
                <option value="commit_push_pr">커밋 + 푸시 + PR 생성</option>
              </select>
            </label>

            {isEdit && ticket && ticket.status !== "backlog" && (
              <label className="text-xs text-[var(--color-foreground-muted)]">
                결과 요약
                <textarea
                  value={resultSummary}
                  onChange={(e) => setResultSummary(e.target.value)}
                  rows={3}
                  placeholder="작업 결과를 간단히 기록하세요"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </label>
            )}

            {error && (
              <div className="text-xs text-[var(--color-danger)]">{error}</div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending || !title.trim()}
              >
                {isEdit ? "저장" : "생성"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <JiraPickerDialog
        open={jiraOpen}
        onOpenChange={setJiraOpen}
        onPick={handleJiraPick}
      />
    </>
  );
}
