#!/usr/bin/env node
/**
 * Electron dev 모드에서 macOS 메뉴바/Dock 앱 이름을 "Cockpit"으로 변경.
 *
 * 아래 3가지를 모두 처리해야 Launch Services가 "Cockpit"으로 인식:
 * 1. Info.plist의 CFBundleName / CFBundleDisplayName 치환
 * 2. Contents/MacOS/Electron 바이너리를 Cockpit 으로 rename + Info.plist의 CFBundleExecutable 수정
 * 3. node_modules/electron/path.txt 업데이트 (Electron launcher가 이 경로로 실행)
 * 4. Launch Services 캐시 무효화 (touch)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const APP_NAME = "Cockpit";

function log(msg) {
  console.log(`[patch-electron-name] ${msg}`);
}

function patchMac() {
  const electronDir = path.resolve("node_modules/electron/dist");
  const appDir = path.join(electronDir, "Electron.app");
  const plistPath = path.join(appDir, "Contents/Info.plist");
  const pathTxt = path.resolve("node_modules/electron/path.txt");
  const macOSDir = path.join(appDir, "Contents/MacOS");
  const origBin = path.join(macOSDir, "Electron");
  const newBin = path.join(macOSDir, APP_NAME);

  if (!fs.existsSync(plistPath)) {
    log("Electron.app을 찾을 수 없음 — skip");
    return;
  }

  // 1. Info.plist 패치
  let content = fs.readFileSync(plistPath, "utf8");
  content = content.replace(
    /(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${APP_NAME}$2`,
  );
  // CFBundleDisplayName: 있으면 교체, 없으면 추가
  if (/<key>CFBundleDisplayName<\/key>/.test(content)) {
    content = content.replace(
      /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${APP_NAME}$2`,
    );
  } else {
    content = content.replace(
      /(<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>)/,
      `$1\n\t<key>CFBundleDisplayName</key>\n\t<string>${APP_NAME}</string>`,
    );
  }
  // CFBundleExecutable = Cockpit
  content = content.replace(
    /(<key>CFBundleExecutable<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${APP_NAME}$2`,
  );
  fs.writeFileSync(plistPath, content);
  log("Info.plist 패치 완료");

  // 2. 바이너리 rename
  if (fs.existsSync(origBin) && !fs.existsSync(newBin)) {
    fs.renameSync(origBin, newBin);
    log(`바이너리 rename: Electron → ${APP_NAME}`);
  }

  // 3. path.txt 업데이트
  if (fs.existsSync(pathTxt)) {
    const newPathTxt = `Electron.app/Contents/MacOS/${APP_NAME}`;
    fs.writeFileSync(pathTxt, newPathTxt);
    log(`path.txt → ${newPathTxt}`);
  }

  // 4. Launch Services 캐시 무효화
  try {
    execSync(`touch "${appDir}"`);
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f "${appDir}"`,
      { stdio: "ignore" },
    );
    log("Launch Services 캐시 무효화 완료");
  } catch {
    // lsregister 실패해도 무시
  }
}

if (process.platform === "darwin") {
  patchMac();
}
