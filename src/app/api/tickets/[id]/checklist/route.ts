import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";

/**
 * design.md 파일의 체크리스트 섹션을 파싱하여 반환.
 *
 * 지원 포맷:
 *   - [ ] 할 일
 *   - [x] 완료된 일
 *   * [ ] 항목 (bullet 대체 문법)
 *
 * "## 구현 체크리스트" 같은 섹션 헤더가 있으면 그 섹션의 항목만 추출.
 * 섹션이 없으면 파일 전체에서 체크리스트 항목을 긁어옴.
 */
const CHECKLIST_SECTION_RE = /^#+\s+.*(체크리스트|checklist|할 ?일|to-?do|구현|tasks?)/i;
const CHECKLIST_HEADING_RE = /^#+\s+/;
const CHECKBOX_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { project: { select: { path: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const filePath = path.join(
    ticket.project.path,
    "docs",
    "pdca",
    ticket.jiraKey ?? id,
    "design.md",
  );

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return NextResponse.json({
      exists: false,
      path: filePath,
      items: [],
    });
  }

  const lines = content.split("\n");
  const items: Array<{
    checked: boolean;
    text: string;
    line: number;
  }> = [];

  // 섹션 탐색 — "체크리스트" 계열 헤더를 찾으면 거기부터 다음 헤더까지만 파싱
  let inSection = false;
  let sawSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CHECKLIST_SECTION_RE.test(line)) {
      inSection = true;
      sawSection = true;
      continue;
    }
    if (inSection && CHECKLIST_HEADING_RE.test(line)) {
      // 다음 헤더 만나면 섹션 종료
      inSection = false;
    }
    if (inSection) {
      const m = line.match(CHECKBOX_RE);
      if (m) {
        items.push({
          checked: m[1].toLowerCase() === "x",
          text: m[2],
          line: i + 1,
        });
      }
    }
  }

  // 섹션을 못 찾으면 파일 전체에서 모든 체크박스 수집 (폴백)
  if (!sawSection) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CHECKBOX_RE);
      if (m) {
        items.push({
          checked: m[1].toLowerCase() === "x",
          text: m[2],
          line: i + 1,
        });
      }
    }
  }

  return NextResponse.json({
    exists: true,
    path: filePath,
    items,
  });
}
