/**
 * 마크다운 본문의 링크 처리 공용 로직.
 *
 * 뷰어가 두 곳(Projects 상세의 FileViewerPanel, 터미널의 파일 pane)에 있어서
 * 규칙이 갈라지지 않도록 여기로 모았다.
 */

/** 경로에서 파일명만 추출 */
export function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx < 0 ? p : p.slice(idx + 1);
}

/** 경로에서 디렉터리 부분만 추출 */
export function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx < 0) return "";
  return idx === 0 ? "/" : p.slice(0, idx);
}

/**
 * baseDir 기준으로 rel 을 해석해 정규화된 경로를 돌려준다.
 * `.`/`..` 처리. rel 이 "/"로 시작하면 baseDir 을 무시(루트 기준).
 */
export function resolveRelative(baseDir: string, rel: string): string {
  const stack = rel.startsWith("/")
    ? []
    : baseDir.split("/").filter((s) => s && s !== ".");
  for (const seg of rel.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

/**
 * 마크다운 링크 href 분류.
 *  - "external": http(s)/mailto 등 스킴이 있거나 프로토콜-상대(//) → 새 창
 *  - "anchor":   같은 문서 내 #앵커 → 기본 동작(새 창 X)
 *  - "internal": 그 외 상대/루트경로 → 뷰어 내부 이동
 */
export function classifyHref(href: string): "external" | "anchor" | "internal" {
  const h = href.trim();
  if (h.startsWith("#")) return "anchor";
  if (h.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(h)) return "external";
  return "internal";
}

/** href 에서 #앵커·?쿼리를 떼고 URL 디코드. 남는 게 없으면 null. */
export function cleanHref(href: string): string | null {
  const clean = href.replace(/[?#].*$/, "");
  if (!clean) return null;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/**
 * 절대 경로 기준 내부 링크 해석 — 터미널 파일 pane 처럼 프로젝트 루트 개념
 * 없이 절대 경로만 다루는 뷰어용.
 *
 * href 가 "/"로 시작하면 파일시스템 절대 경로로 취급한다 (프로젝트 루트가 아님).
 */
export function resolveAbsoluteHref(
  href: string,
  currentAbsPath: string,
): string | null {
  const decoded = cleanHref(href);
  if (!decoded) return null;
  if (decoded.startsWith("/")) return decoded;
  const resolved = resolveRelative(dirname(currentAbsPath), decoded);
  if (!resolved) return null;
  return resolved.startsWith("/") ? resolved : `/${resolved}`;
}
