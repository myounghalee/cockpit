import { useQuery } from "@tanstack/react-query";
import type { CalendarEvent } from "@/types/calendar";

export interface CalendarEventsParams {
  from: Date;
  to: Date;
  projectId: string | null;
}

const CALENDAR_KEY = (p: CalendarEventsParams) =>
  [
    "calendar-events",
    p.from.toISOString(),
    p.to.toISOString(),
    p.projectId ?? "__all__",
  ] as const;

async function fetchEvents(
  p: CalendarEventsParams,
): Promise<{ events: CalendarEvent[] }> {
  const params = new URLSearchParams({
    from: p.from.toISOString(),
    to: p.to.toISOString(),
  });
  if (p.projectId) params.set("projectId", p.projectId);
  const res = await fetch(`/api/calendar/events?${params}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status}`);
  }
  return res.json();
}

export function useCalendarEvents(p: CalendarEventsParams) {
  return useQuery({
    queryKey: CALENDAR_KEY(p),
    queryFn: () => fetchEvents(p),
    // 이벤트가 자주 바뀌지 않으므로 stale 관대하게
    staleTime: 30_000,
  });
}
