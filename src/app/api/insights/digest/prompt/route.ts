import { NextResponse } from "next/server";
import {
  DEFAULT_PROMPT_TEMPLATE,
  loadPromptTemplate,
  resetPromptTemplate,
  savePromptTemplate,
} from "@/lib/digest-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const tpl = loadPromptTemplate();
  return NextResponse.json({
    content: tpl.content,
    isCustom: tpl.isCustom,
    path: tpl.path,
    default: DEFAULT_PROMPT_TEMPLATE,
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { content?: string };
    const content = (body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "content 비어있음" },
        { status: 400 },
      );
    }
    savePromptTemplate(content);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  resetPromptTemplate();
  return NextResponse.json({ ok: true });
}
