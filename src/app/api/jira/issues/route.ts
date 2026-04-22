import { NextResponse } from "next/server";
import { searchIssues } from "@/lib/jira";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  try {
    const issues = await searchIssues(query);
    return NextResponse.json({ issues });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
