"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useSettings,
  useUpdateSettings,
  useTestJira,
} from "@/hooks/use-settings";
import { Check, X } from "lucide-react";

export function JiraSettings() {
  const { data, isLoading } = useSettings();
  const updateMut = useUpdateSettings();
  const testMut = useTestJira();

  const [host, setHost] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [autoTransition, setAutoTransition] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    user?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (data) {
      setHost(data.jira.host);
      setEmail(data.jira.email);
      setAutoTransition(data.jira.autoTransitionDone);
    }
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await updateMut.mutateAsync({
      jira: {
        host: host.trim(),
        email: email.trim(),
        // apiToken이 빈 문자열이면 변경 안함(undefined), 값 있으면 덮어씀
        ...(apiToken ? { apiToken } : {}),
        autoTransitionDone: autoTransition,
      },
    });
    setApiToken("");
  }

  async function testConnection() {
    setTestResult(null);
    const r = await testMut.mutateAsync();
    setTestResult(r);
  }

  async function removeToken() {
    if (!confirm("Jira API Token을 삭제할까요?")) return;
    await updateMut.mutateAsync({ jira: { apiToken: null } });
    setApiToken("");
    setTestResult(null);
  }

  if (isLoading) return <div className="text-xs">…</div>;

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4"
    >
      <h2 className="text-sm font-semibold">Jira 연동</h2>

      <label className="text-xs text-[var(--color-foreground-muted)]">
        Host (예: https://your.atlassian.net)
        <Input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="https://your-domain.atlassian.net"
        />
      </label>

      <label className="text-xs text-[var(--color-foreground-muted)]">
        Email
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <div className="text-xs text-[var(--color-foreground-muted)]">
        API Token
        <div className="flex gap-1 mt-1">
          <Input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={
              data?.jira.hasToken
                ? "••••••• (저장됨. 새 값 입력 시 덮어씁니다)"
                : "아직 저장되지 않음"
            }
          />
          {data?.jira.hasToken && (
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
          Atlassian 계정 설정 → Security → API tokens에서 생성
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoTransition}
          onChange={(e) => setAutoTransition(e.target.checked)}
        />
        티켓 완료 시 Jira 이슈도 Done으로 전환
      </label>

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
        <Button type="submit" disabled={updateMut.isPending}>
          {updateMut.isPending ? "저장 중…" : "저장"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={!data?.jira.hasToken || testMut.isPending}
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
              ? `연결 성공 · ${testResult.user}`
              : testResult.error}
          </div>
        )}
      </div>
    </form>
  );
}
