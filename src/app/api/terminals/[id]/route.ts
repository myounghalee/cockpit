import { NextResponse } from "next/server";
import { getPtyManager } from "@/server/pty-manager";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const manager = getPtyManager();
  const ok = manager.dispose(id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
