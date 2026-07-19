import { NextResponse } from "next/server";

/**
 * GitHub 최신 릴리즈 조회 — 런처(.app) 버전이 뒤처졌는지 판단하는 데 쓴다.
 *
 * 렌더러가 api.github.com 을 직접 부르지 않고 여기를 거치는 이유:
 *  - 비인증 GitHub API 는 IP당 시간당 60회 제한 → 서버에서 캐시해 한 번만 호출
 *  - 렌더러 여러 창/탭이 각자 호출하는 것을 방지
 */

const REPO = "myounghalee/cockpit";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

interface LatestRelease {
  version: string | null;
  htmlUrl: string | null;
  publishedAt: string | null;
}

// dev hot-reload 를 견디도록 globalThis 캐시 (프로젝트 관례)
const g = globalThis as typeof globalThis & {
  __cockpitLatestRelease?: { at: number; data: LatestRelease };
};

async function fetchLatest(): Promise<LatestRelease> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "cockpit-app",
    },
    // Next 의 fetch 캐시는 쓰지 않는다 — 위의 자체 TTL 캐시로 통제
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const body = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
    published_at?: string;
  };
  return {
    version: body.tag_name?.replace(/^v/, "") ?? null,
    htmlUrl: body.html_url ?? null,
    publishedAt: body.published_at ?? null,
  };
}

export async function GET() {
  const cached = g.__cockpitLatestRelease;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const data = await fetchLatest();
    g.__cockpitLatestRelease = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    // 오프라인·레이트리밋 등 — 마지막 성공값이 있으면 그것으로 응답.
    // 없으면 version:null 을 주고, 클라이언트는 아무것도 표시하지 않는다.
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { version: null, htmlUrl: null, publishedAt: null, error: String(err) },
      { status: 200 },
    );
  }
}
