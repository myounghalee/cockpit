"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useSettings,
  useUpdateSettings,
  useTestSlack,
} from "@/hooks/use-settings";
import { Check, X } from "lucide-react";

export function SlackSettings() {
  const { data, isLoading } = useSettings();
  const updateMut = useUpdateSettings();
  const testMut = useTestSlack();

  const [userToken, setUserToken] = useState("");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    user?: string;
    team?: string;
    error?: string;
  } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userToken.trim()) return;
    await updateMut.mutateAsync({
      slack: { userToken: userToken.trim() },
    });
    setUserToken("");
  }

  async function testConnection() {
    setTestResult(null);
    const r = await testMut.mutateAsync();
    setTestResult(r);
  }

  async function removeToken() {
    if (!confirm("Slack User Token을 삭제할까요?")) return;
    await updateMut.mutateAsync({ slack: { userToken: null } });
    setUserToken("");
    setTestResult(null);
  }

  if (isLoading) return <div className="text-xs">…</div>;

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4"
    >
      <h2 className="text-sm font-semibold">Slack 연동</h2>

      <div className="text-xs text-[var(--color-foreground-muted)]">
        User Token (xoxp-…)
        <div className="flex gap-1 mt-1">
          <Input
            type="password"
            value={userToken}
            onChange={(e) => setUserToken(e.target.value)}
            placeholder={
              data?.slack.hasUserToken
                ? "••••••• (저장됨. 새 값 입력 시 덮어씁니다)"
                : "xoxp-..."
            }
          />
          {data?.slack.hasUserToken && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={removeToken}
            >
              제거
            </Button>
          )}
        </div>
        <div className="mt-1 text-[10px] text-[var(--color-foreground-dim)]">
          api.slack.com → Your Apps → OAuth &amp; Permissions → User OAuth Token.
          권장 scope: <code>search:read</code>, <code>channels:history</code>,{" "}
          <code>groups:history</code>, <code>im:history</code>,{" "}
          <code>mpim:history</code>, <code>users:read</code>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
        <Button type="submit" disabled={updateMut.isPending || !userToken.trim()}>
          {updateMut.isPending ? "저장 중…" : "저장"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={!data?.slack.hasUserToken || testMut.isPending}
        >
          {testMut.isPending ? "테스트 중…" : "연결 테스트"}
        </Button>
        {testResult && (
          <div
            className={`text-xs ${
              testResult.ok
                ? "text-[var(--color-success)]"
                : "text-[var(--color-danger)]"
            } flex items-center gap-1`}
          >
            {testResult.ok ? <Check size={12} /> : <X size={12} />}
            {testResult.ok
              ? `연결 성공 · ${testResult.user}${testResult.team ? ` @ ${testResult.team}` : ""}`
              : testResult.error}
          </div>
        )}
      </div>
    </form>
  );
}
