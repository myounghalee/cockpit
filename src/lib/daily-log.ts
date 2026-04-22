import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DAILY_DIR = path.join(os.homedir(), ".cockpit-userdata", "daily");

export type DailyEvent =
  | {
      kind: "ticket.created";
      title: string;
      projectName?: string | null;
      jiraKey?: string | null;
      type?: string;
    }
  | {
      kind: "ticket.done";
      title: string;
      projectName?: string | null;
      jiraKey?: string | null;
      resultSummary?: string | null;
    }
  | {
      kind: "ticket.status";
      title: string;
      projectName?: string | null;
      jiraKey?: string | null;
      from?: string | null;
      to: string;
    }
  | {
      kind: "ticket.rework";
      title: string;
      projectName?: string | null;
      jiraKey?: string | null;
      reason?: string | null;
      count: number;
    }
  | {
      kind: "memo.created";
      title: string;
      projectName?: string | null;
      tags?: string;
    }
  | {
      kind: "memo.archived";
      title: string;
      projectName?: string | null;
    }
  | {
      kind: "memo.converted";
      title: string;
      projectName?: string | null;
      ticketId: string;
    };

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeLabel(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ensureDir(): void {
  try {
    fs.mkdirSync(DAILY_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function filePathFor(date: string): string {
  return path.join(DAILY_DIR, `${date}.md`);
}

function header(date: string): string {
  return `# ${date}\n\n`;
}

function projectBadge(projectName?: string | null): string {
  return projectName ? ` \`${projectName}\`` : "";
}

function jiraBadge(jiraKey?: string | null): string {
  return jiraKey ? ` [${jiraKey}]` : "";
}

function formatLine(event: DailyEvent, time: string): string {
  switch (event.kind) {
    case "ticket.created": {
      const typeLabel = event.type ? ` (${event.type})` : "";
      return `- \`${time}\` 🎫 **생성**${typeLabel}:${projectBadge(event.projectName)}${jiraBadge(event.jiraKey)} ${event.title}`;
    }
    case "ticket.done": {
      const summary = event.resultSummary?.trim()
        ? `\n    - ${event.resultSummary.trim().replace(/\n+/g, " ")}`
        : "";
      return `- \`${time}\` ✅ **완료**:${projectBadge(event.projectName)}${jiraBadge(event.jiraKey)} ${event.title}${summary}`;
    }
    case "ticket.status": {
      const from = event.from ? `${event.from} → ` : "";
      return `- \`${time}\` 🔄 ${from}${event.to}:${projectBadge(event.projectName)}${jiraBadge(event.jiraKey)} ${event.title}`;
    }
    case "ticket.rework": {
      const reason = event.reason?.trim()
        ? ` — ${event.reason.trim().replace(/\n+/g, " ")}`
        : "";
      return `- \`${time}\` 🔁 **Rework** #${event.count}:${projectBadge(event.projectName)}${jiraBadge(event.jiraKey)} ${event.title}${reason}`;
    }
    case "memo.created": {
      const tags = event.tags?.trim()
        ? ` _(${event.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .join(", ")})_`
        : "";
      return `- \`${time}\` 📝 **메모**:${projectBadge(event.projectName)} ${event.title}${tags}`;
    }
    case "memo.archived":
      return `- \`${time}\` 🗄️ 메모 아카이브:${projectBadge(event.projectName)} ${event.title}`;
    case "memo.converted":
      return `- \`${time}\` ➡️ 메모 → 티켓:${projectBadge(event.projectName)} ${event.title}`;
  }
}

/**
 * 오늘자 daily.md에 한 줄 append.
 * 파일이 없으면 헤더 + 빈 줄부터 생성.
 */
export function appendDailyEntry(event: DailyEvent, now = new Date()): void {
  try {
    ensureDir();
    const date = dateKey(now);
    const filePath = filePathFor(date);
    const line = formatLine(event, timeLabel(now));

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, header(date) + line + "\n", "utf8");
    } else {
      fs.appendFileSync(filePath, line + "\n", "utf8");
    }
  } catch (err) {
    console.warn("[daily-log] append 실패:", (err as Error).message);
  }
}

/** 지정 날짜 daily.md 본문 반환 (없으면 null) */
export function readDailyFile(date: string): string | null {
  try {
    return fs.readFileSync(filePathFor(date), "utf8");
  } catch {
    return null;
  }
}

/** 최근 N일 중 파일이 존재하는 날짜 목록 (최신 우선) */
export function listDailyDates(limit = 60): string[] {
  try {
    ensureDir();
    return fs
      .readdirSync(DAILY_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ""))
      .sort((a, b) => (a > b ? -1 : 1))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function todayKey(): string {
  return dateKey();
}
