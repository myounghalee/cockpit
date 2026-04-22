/**
 * 크로스 플랫폼으로 OS 기본 앱에 경로를 넘기는 헬퍼.
 * - macOS: `open`
 * - Linux: `xdg-open`
 * - Windows: `start`
 *
 * 서버 프로세스와 분리하기 위해 detached + unref 로 spawn.
 */
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export async function openInSystem(absolutePath: string): Promise<void> {
  // 존재하지 않는 경로에 대해 명확한 에러 (stat이 ENOENT 던짐)
  await stat(absolutePath);

  let cmd: string;
  let args: string[];

  switch (process.platform) {
    case "darwin":
      cmd = "open";
      args = [absolutePath];
      break;
    case "win32":
      // Windows `start` 는 cmd 빌트인이라 shell 경유.
      cmd = "cmd";
      args = ["/c", "start", "", absolutePath];
      break;
    default:
      cmd = "xdg-open";
      args = [absolutePath];
  }

  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
