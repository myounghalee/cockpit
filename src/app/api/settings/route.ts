import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SETTING_KEYS = [
  "jira.host",
  "jira.email",
  "jira.apiToken",
  "jira.autoTransitionDone",
  "terminal.shellPath",
];

async function loadSettings() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: SETTING_KEYS } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    jira: {
      host: map.get("jira.host") ?? "",
      email: map.get("jira.email") ?? "",
      hasToken: !!map.get("jira.apiToken"),
      autoTransitionDone: map.get("jira.autoTransitionDone") === "true",
    },
    terminal: {
      shellPath: map.get("terminal.shellPath") ?? "",
    },
  };
}

export async function GET() {
  return NextResponse.json(await loadSettings());
}

interface PutBody {
  jira?: {
    host?: string;
    email?: string;
    apiToken?: string | null; // null이면 제거
    autoTransitionDone?: boolean;
  };
  terminal?: {
    shellPath?: string; // 빈 문자열이면 제거 (자동 감지)
  };
}

async function upsert(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
async function remove(key: string) {
  await prisma.setting.deleteMany({ where: { key } });
}

export async function PUT(request: Request) {
  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const jira = body.jira;
  if (jira) {
    if (jira.host !== undefined) {
      if (jira.host.trim()) await upsert("jira.host", jira.host.trim());
      else await remove("jira.host");
    }
    if (jira.email !== undefined) {
      if (jira.email.trim()) await upsert("jira.email", jira.email.trim());
      else await remove("jira.email");
    }
    if (jira.apiToken !== undefined) {
      if (jira.apiToken === null || jira.apiToken === "") {
        await remove("jira.apiToken");
      } else {
        await upsert("jira.apiToken", jira.apiToken);
      }
    }
    if (jira.autoTransitionDone !== undefined) {
      await upsert(
        "jira.autoTransitionDone",
        jira.autoTransitionDone ? "true" : "false",
      );
    }
  }

  if (body.terminal) {
    if (body.terminal.shellPath !== undefined) {
      const v = body.terminal.shellPath.trim();
      if (v) await upsert("terminal.shellPath", v);
      else await remove("terminal.shellPath");
    }
  }

  return NextResponse.json(await loadSettings());
}
