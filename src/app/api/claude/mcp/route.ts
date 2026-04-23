import { NextResponse } from "next/server";
import { listMcpServers } from "@/lib/claude-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const servers = await listMcpServers();
  return NextResponse.json({ servers });
}
