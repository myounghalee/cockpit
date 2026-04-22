/**
 * 외부 에디터로 디렉토리/파일 열기.
 *
 * macOS: `open -a "<App Name>" <path>` 를 우선 사용 (PATH 의존 없음)
 * Linux/Windows: 각 에디터의 CLI 명령 (code / cursor / webstorm / idea / subl)
 * 사용자가 커스텀 명령을 지정한 경우 해당 명령을 그대로 실행.
 */
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export type EditorKind =
  | "vscode"
  | "cursor"
  | "webstorm"
  | "idea"
  | "sublime"
  | "custom";

export const EDITOR_LABEL: Record<EditorKind, string> = {
  vscode: "Visual Studio Code",
  cursor: "Cursor",
  webstorm: "WebStorm",
  idea: "IntelliJ IDEA",
  sublime: "Sublime Text",
  custom: "사용자 정의",
};

/** macOS의 Application 이름 — `open -a`에 넘김 */
const MAC_APPS: Record<Exclude<EditorKind, "custom">, string> = {
  vscode: "Visual Studio Code",
  cursor: "Cursor",
  webstorm: "WebStorm",
  idea: "IntelliJ IDEA",
  sublime: "Sublime Text",
};

/** Linux/Windows CLI 명령 */
const COMMANDS: Record<Exclude<EditorKind, "custom">, string> = {
  vscode: "code",
  cursor: "cursor",
  webstorm: "webstorm",
  idea: "idea",
  sublime: "subl",
};

export async function openInEditor(
  absolutePath: string,
  editor: EditorKind,
  customCommand?: string,
): Promise<void> {
  await stat(absolutePath);

  // macOS: Finder가 해석하는 앱 이름으로 직접 실행
  if (editor !== "custom" && process.platform === "darwin") {
    const app = MAC_APPS[editor];
    await new Promise<void>((resolve, reject) => {
      const child = spawn("open", ["-a", app, absolutePath], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", reject);
      // open 명령은 즉시 종료되므로 close 이벤트를 기다림
      child.on("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `open -a "${app}" 실패 (exit ${code}). 해당 앱이 설치되어 있는지 확인해주세요.`,
            ),
          );
      });
      child.unref();
    });
    return;
  }

  // Linux/Windows/custom: CLI 명령 실행
  const cmd =
    editor === "custom"
      ? customCommand?.trim()
      : COMMANDS[editor];
  if (!cmd) throw new Error("커스텀 명령이 비어있습니다.");

  // shell: true 로 .cmd/.bat/.sh 스크립트 및 PATH 해석 허용
  const quoted = `"${absolutePath.replace(/"/g, '\\"')}"`;
  const child = spawn(`${cmd} ${quoted}`, {
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.on("error", (err) => {
    console.warn(`[open-editor] ${cmd} 실행 실패:`, err.message);
  });
  child.unref();
}
