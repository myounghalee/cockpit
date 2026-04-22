import { NextResponse } from "next/server";
import path from "node:path";
import { openInEditor, type EditorKind } from "@/lib/open-editor";

const VALID: EditorKind[] = [
  "vscode",
  "cursor",
  "webstorm",
  "idea",
  "sublime",
  "custom",
];

interface Body {
  path?: string;
  editor?: EditorKind;
  customCommand?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const p = body.path?.trim();
  if (!p) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (!path.isAbsolute(p)) {
    return NextResponse.json(
      { error: "absolute path required" },
      { status: 400 },
    );
  }

  const editor = body.editor ?? "vscode";
  if (!VALID.includes(editor)) {
    return NextResponse.json({ error: "invalid editor" }, { status: 400 });
  }

  try {
    await openInEditor(p, editor, body.customCommand);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
