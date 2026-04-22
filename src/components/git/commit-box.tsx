"use client";

import { useState } from "react";
import { useCommit, useGitStatus } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface Props {
  projectId: string;
}

export function CommitBox({ projectId }: Props) {
  const { data: status } = useGitStatus(projectId);
  const commit = useCommit(projectId);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stagedCount = status?.staged.length ?? 0;
  const canCommit = stagedCount > 0 && (message.trim().length > 0 || amend);

  async function doCommit() {
    setError(null);
    try {
      await commit.mutateAsync({ message: message.trim(), amend });
      setMessage("");
      setAmend(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] p-2 flex flex-col gap-2 bg-[var(--color-surface)]/30">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder={
          stagedCount === 0
            ? "스테이징된 파일이 없습니다"
            : `${stagedCount}개 파일에 대한 커밋 메시지…`
        }
        className="w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1.5 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
      />
      <div className="flex items-center gap-2 text-[10px]">
        <label className="flex items-center gap-1 text-[var(--color-foreground-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
          />
          amend
        </label>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={doCommit}
          disabled={!canCommit || commit.isPending}
        >
          <Check size={12} /> {commit.isPending ? "…" : "커밋"}
        </Button>
      </div>
      {error && (
        <div className="text-[10px] text-[var(--color-danger)]">{error}</div>
      )}
    </div>
  );
}
