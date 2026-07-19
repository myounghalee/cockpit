#!/usr/bin/env node
/**
 * package.json 버전을 랜딩 페이지(docs/index.html)에 반영.
 *
 * 버전이 하드코딩돼 있어 릴리즈마다 뒤처지던 문제 (실제로 v1.0.6 에 멈춰
 * 1.0.9 까지 3번 어긋났다). dist:mac 앞에 걸어 빌드할 때마다 동기화한다.
 *
 * 치환 대상 두 곳:
 *   1. 히어로 배지    — "v1.0.6 릴리스 · macOS arm64/x64"
 *   2. 터미널 목업 출력 — "&gt; cockpit@1.0.6 dev /Users/me/my-project"
 *
 * 치환은 버전 문자열이 붙은 고정 문맥에만 적용한다. 페이지 안의 다른
 * 버전(예: Pretendard CDN @v1.3.9)을 건드리지 않기 위해서다.
 */
import fs from "node:fs";
import path from "node:path";

const DOCS = path.resolve("docs/index.html");

function log(msg) {
  console.log(`[sync-docs-version] ${msg}`);
}

/** 각 규칙은 버전 자리를 캡처 그룹 하나로 감싼 정규식 + 설명 */
const RULES = [
  {
    what: "히어로 배지",
    re: /(v)\d+\.\d+\.\d+( 릴리스)/g,
    replace: (v) => `$1${v}$2`,
  },
  {
    what: "터미널 목업",
    re: /(cockpit@)\d+\.\d+\.\d+( dev)/g,
    replace: (v) => `$1${v}$2`,
  },
];

function main() {
  const pkgRaw = fs.readFileSync(path.resolve("package.json"), "utf8");
  const version = JSON.parse(pkgRaw).version;
  if (!version) {
    console.error("[sync-docs-version] package.json 에 version 이 없습니다.");
    process.exit(1);
  }

  if (!fs.existsSync(DOCS)) {
    log(`${DOCS} 없음 — skip`);
    return;
  }

  const before = fs.readFileSync(DOCS, "utf8");
  let after = before;
  let total = 0;
  const missed = [];

  for (const rule of RULES) {
    const hits = after.match(rule.re);
    if (!hits) {
      missed.push(rule.what);
      continue;
    }
    after = after.replace(rule.re, rule.replace(version));
    total += hits.length;
  }

  // 규칙이 안 맞으면 마크업이 바뀐 것 — 조용히 넘어가면 또 뒤처지므로 알린다.
  if (missed.length > 0) {
    console.warn(
      `[sync-docs-version] 경고: ${missed.join(", ")} 패턴을 찾지 못했습니다. ` +
        `docs/index.html 마크업이 바뀌었다면 이 스크립트의 RULES 를 갱신하세요.`,
    );
  }

  if (after === before) {
    log(`${version} — 이미 최신 (변경 없음)`);
    return;
  }

  fs.writeFileSync(DOCS, after);
  log(`${version} 로 갱신 — docs/index.html ${total}곳 치환`);
}

main();
