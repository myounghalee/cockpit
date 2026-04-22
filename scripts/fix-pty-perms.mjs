// pnpm은 prebuild 바이너리의 실행 권한을 제거하는 이슈가 있어 postinstall에서 복원한다.
// https://github.com/pnpm/pnpm/issues/4855 류의 이슈.
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const platforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
];

let fixed = 0;
for (const plat of platforms) {
  const helper = join(
    root,
    "node_modules",
    "node-pty",
    "prebuilds",
    plat,
    "spawn-helper",
  );
  if (existsSync(helper)) {
    try {
      chmodSync(helper, 0o755);
      fixed++;
    } catch (err) {
      console.warn(`[fix-pty-perms] failed: ${helper}: ${err.message}`);
    }
  }
}
if (fixed > 0) {
  console.log(`[fix-pty-perms] chmod +x applied to ${fixed} spawn-helper binar${fixed === 1 ? "y" : "ies"}`);
}
