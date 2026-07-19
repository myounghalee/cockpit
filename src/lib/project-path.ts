/**
 * 경로 문자열로부터 등록된 프로젝트를 역으로 찾는다.
 *
 * 터미널 pane은 cwd(문자열)만 알고 있어서, 그 터미널이 어느 프로젝트에서
 * 돌고 있는지 알려면 이 매핑이 필요하다. (DB에는 projectId → path 방향만 있다)
 */

interface PathOwner {
  id: string;
  path: string;
}

/** 후행 슬래시 제거 — "/a/b/" 와 "/a/b" 를 같게 취급 */
function normalize(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.replace(/\/+$/, "") : p;
}

/**
 * cwd를 포함하는 프로젝트 중 경로가 가장 긴 것을 반환한다.
 *
 * - 터미널이 하위 디렉터리로 `cd` 했을 수 있으므로 정확히 일치가 아닌 접두사 매칭.
 * - 중첩 프로젝트(모노레포 안의 패키지 등)에서는 더 깊은 쪽이 맞으므로 최장 일치.
 * - 경계를 `/`로 확인해 `/foo/ba`가 `/foo/bar`에 매칭되는 사고를 막는다.
 * - 상대 경로("~" 등)는 절대 경로로 해석할 수 없으므로 매칭하지 않는다.
 */
export function findProjectByPath<T extends PathOwner>(
  projects: T[],
  cwd: string | null | undefined,
): T | null {
  if (!cwd || !cwd.startsWith("/")) return null;
  const target = normalize(cwd);

  let best: T | null = null;
  for (const p of projects) {
    if (!p.path) continue;
    const base = normalize(p.path);
    if (target !== base && !target.startsWith(base + "/")) continue;
    if (!best || base.length > normalize(best.path).length) best = p;
  }
  return best;
}
