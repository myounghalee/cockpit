import { NextResponse } from "next/server";
import { getMyUnresolvedIssues } from "@/lib/jira";

export async function GET() {
  try {
    const issues = await getMyUnresolvedIssues();
    return NextResponse.json({ issues });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
