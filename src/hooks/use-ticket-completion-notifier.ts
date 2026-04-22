"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTickets } from "./use-tickets";
import type { Ticket } from "@/types/ticket";

/**
 * 전역 티켓 완료 알림 훅.
 *
 * - 전체 티켓 목록을 주기적으로 폴링(또는 ticket-updated 이벤트로 갱신)
 * - 이전 스냅샷과 비교해 in_progress → review/done 으로 바뀐 티켓에 대해
 *   시스템 Notification 발송
 * - 알림 클릭 시 /kanban?ticket=<id> 로 이동해 해당 티켓 상세 패널이 자동으로 열리도록 함
 *
 * AppShell에 한 번 마운트하면 앱 전역에서 동작.
 */
export function useTicketCompletionNotifier() {
  const router = useRouter();
  const { data } = useTickets(null); // 전체
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    if (!data?.tickets) return;
    const tickets = data.tickets;

    // 최초 로드는 비교 기준으로만 사용 — 알림 안 함
    if (!initialized.current) {
      prevStatusRef.current = new Map(
        tickets.map((t) => [t.id, String(t.status)]),
      );
      initialized.current = true;
      return;
    }

    const prev = prevStatusRef.current;
    const transitioned: Ticket[] = [];
    for (const t of tickets) {
      const before = prev.get(t.id);
      if (
        before === "in_progress" &&
        (t.status === "review" || t.status === "done")
      ) {
        transitioned.push(t);
      }
    }

    // 스냅샷 갱신
    prev.clear();
    for (const t of tickets) prev.set(t.id, String(t.status));

    if (transitioned.length === 0) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    for (const t of transitioned) {
      try {
        const label = t.status === "done" ? "완료 → Done" : "실행 종료 → 리뷰";
        const body = [
          t.jiraKey ? `[${t.jiraKey}] ` : "",
          t.title,
          t.projectName ? ` · ${t.projectName}` : "",
        ].join("");
        const n = new Notification(`Cockpit · ${label}`, {
          body,
          tag: `ticket-${t.id}`, // 같은 티켓의 중복 알림 자동 통합
          icon: "/favicon.svg",
        });
        n.onclick = () => {
          try {
            window.focus();
          } catch {
            // noop
          }
          router.push(`/kanban?ticket=${t.id}`);
          n.close();
        };
      } catch {
        // 알림 생성 실패는 조용히 무시
      }
    }
  }, [data?.tickets, router]);
}
