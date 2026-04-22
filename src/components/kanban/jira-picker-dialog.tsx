"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  type: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (issue: JiraIssue) => void;
}

export function JiraPickerDialog({ open, onOpenChange, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<JiraIssue[]>([]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setIssues([]);
    try {
      const res = await fetch(
        `/api/jira/issues?query=${encodeURIComponent(query.trim())}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setIssues(body.issues ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const select = (issue: JiraIssue) => {
    onPick(issue);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setQuery("");
          setIssues([]);
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogTitle>Jira 이슈 가져오기</DialogTitle>
        <form onSubmit={search} className="mt-4 flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2">
            <Search size={12} className="text-[var(--color-foreground-dim)]" />
            <input
              autoFocus
              placeholder="이슈 키 (PROJ-123) 또는 키워드"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 h-9 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? "…" : "검색"}
          </Button>
        </form>

        <div className="mt-3 min-h-[240px] max-h-[400px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)]">
          {error ? (
            <div className="p-4 text-xs text-[var(--color-danger)]">
              {error}
              <div className="mt-2 text-[var(--color-foreground-dim)]">
                Settings에서 Jira 자격증명을 먼저 설정하세요.
              </div>
            </div>
          ) : loading ? (
            <div className="p-4 text-xs text-[var(--color-foreground-muted)]">
              검색 중…
            </div>
          ) : issues.length === 0 ? (
            <div className="p-4 text-xs text-[var(--color-foreground-dim)]">
              검색어를 입력하세요.
            </div>
          ) : (
            <div className="flex flex-col">
              {issues.map((i) => (
                <button
                  key={i.key}
                  onClick={() => select(i)}
                  className="flex flex-col items-start gap-0.5 border-b border-[var(--color-border)] p-2.5 text-left hover:bg-[var(--color-surface-hover)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--color-foreground-muted)]">
                      {i.key}
                    </span>
                    <span className="text-[10px] px-1.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-foreground-muted)]">
                      {i.type}
                    </span>
                    <span className="text-[10px] text-[var(--color-foreground-dim)]">
                      {i.status}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--color-foreground)] truncate w-full">
                    {i.summary}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
