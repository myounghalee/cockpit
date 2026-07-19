/**
 * 런처(.app) 버전 비교 유틸.
 *
 * 자동 업데이트는 `~/.cockpit-app`(서버 소스)만 git pull 하고
 * `/Applications/Cockpit.app` 런처는 절대 갱신하지 않는다. 그래서 런처가
 * 몇 개 릴리즈 뒤처져도 사용자가 알 방법이 없었다 (실제로 v1.0.6 이 v1.0.9
 * 시점까지 방치됐다). 이 모듈이 그 판단을 담당한다.
 */

/** "v1.2.3" / "1.2.3" → [1,2,3]. 형식이 아니면 null */
export function parseVersion(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** a > b 면 양수, 같으면 0, a < b 면 음수. 비교 불가면 null */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** latest 가 current 보다 새로운가. 판단 불가면 false (모르면 조용히 있는다) */
export function isNewerVersion(latest: string, current: string): boolean {
  const cmp = compareVersions(latest, current);
  return cmp !== null && cmp > 0;
}

/**
 * Electron User-Agent 에서 런처 버전 추출 — preload 가 버전을 노출하지 않는
 * 구버전 런처(v1.0.9 이하)를 위한 폴백.
 *
 * Electron 기본 UA 는 `… Cockpit/1.0.6 Chrome/… Electron/… …` 형태다.
 * 못 찾으면 null 을 돌려주고, 호출부는 아무것도 표시하지 않는다 —
 * 확실하지 않을 때 잘못된 안내를 띄우는 것보다 침묵이 낫다.
 */
export function parseVersionFromUserAgent(ua: string): string | null {
  const m = /\bCockpit\/(\d+\.\d+\.\d+)/i.exec(ua);
  return m ? m[1] : null;
}
