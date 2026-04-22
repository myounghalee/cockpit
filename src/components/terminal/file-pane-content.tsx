"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  FileCode,
  ExternalLink,
  FolderOpen,
  Clock,
  X as XIcon,
} from "lucide-react";
import { useTerminalStore } from "@/store/terminal-store";
import { cn } from "@/lib/utils";

interface FileResponse {
  binary: boolean;
  oversize: boolean;
  size: number;
  content?: string;
  name: string;
  absolutePath: string;
}

interface Props {
  paneId: string;
  initialPath: string;
}

export function FilePaneContent({ paneId, initialPath }: Props) {
  const setFilePath = useTerminalStore((s) => s.setFilePath);
  const addRecentFile = useTerminalStore((s) => s.addRecentFile);
  const recentFiles = useTerminalStore((s) => s.recentFiles);
  const markdownFontSize = useTerminalStore((s) => s.markdownFontSize);
  const [input, setInput] = useState(initialPath);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [data, setData] = useState<FileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const isMarkdown = /\.(md|markdown|mdx)$/i.test(data?.name ?? "");
  const [renderMode, setRenderMode] = useState<"rendered" | "source">("source");
  const inputRef = useRef<HTMLInputElement>(null);
  const recentBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(initialPath);
    setCurrentPath(initialPath);
  }, [initialPath]);

  useEffect(() => {
    if (!currentPath) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    setData(null);
    setLoading(true);
    fetch(`/api/fs/file?path=${encodeURIComponent(currentPath)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as FileResponse;
      })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setLoading(false);
          setRenderMode(
            /\.(md|markdown|mdx)$/i.test(body.name) ? "rendered" : "source",
          );
          // 정상적으로 로드된 파일만 최근 목록에 추가 (절대 경로 우선)
          addRecentFile(body.absolutePath || currentPath);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  const go = (raw: string) => {
    const p = raw.trim();
    if (!p) return;
    setInput(p);
    setCurrentPath(p);
    setFilePath(paneId, p);
    setShowRecent(false);
  };

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!showRecent) return;
    const onDown = (e: MouseEvent) => {
      if (
        recentBoxRef.current &&
        !recentBoxRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowRecent(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showRecent]);

  const openInOS = async () => {
    if (!data?.absolutePath) return;
    await fetch("/api/system/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: data.absolutePath }),
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    go(input);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-background)]">
      {/* 경로 바 */}
      <div className="relative flex items-center gap-1 h-9 px-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <form onSubmit={onSubmit} className="flex-1 flex items-center gap-1">
          <div className="flex-1 flex items-center gap-1 px-2 h-7 rounded bg-[var(--color-background)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)]">
            <FolderOpen
              size={12}
              className="text-[var(--color-foreground-dim)]"
            />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => recentFiles.length > 0 && setShowRecent(true)}
              placeholder="파일 경로 (예: ~/Documents/note.md)"
              className="flex-1 bg-transparent text-xs text-[var(--color-foreground)] outline-none font-mono"
            />
            {recentFiles.length > 0 && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowRecent((v) => !v)}
                className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
                title="최근 파일"
                aria-label="최근 파일"
              >
                <Clock size={12} />
              </button>
            )}
          </div>
        </form>

        {showRecent && recentFiles.length > 0 && (
          <div
            ref={recentBoxRef}
            className="absolute left-2 right-2 top-9 z-30 mt-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden"
          >
            <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border)]">
              <span className="text-[10px] text-[var(--color-foreground-dim)]">
                최근 파일 ({recentFiles.length})
              </span>
              <button
                type="button"
                onClick={() => setShowRecent(false)}
                className="p-0.5 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
                aria-label="닫기"
              >
                <XIcon size={11} />
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {recentFiles.map((p) => {
                const name = p.split("/").pop() || p;
                const dir = p.slice(0, p.length - name.length - 1);
                return (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => go(p)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-hover)]"
                    >
                      <FileText
                        size={11}
                        className="text-[var(--color-foreground-dim)] shrink-0"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs text-[var(--color-foreground)] truncate">
                          {name}
                        </span>
                        {dir && (
                          <span className="block text-[10px] text-[var(--color-foreground-dim)] font-mono truncate">
                            {dir}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {isMarkdown && (
          <div className="flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => setRenderMode("rendered")}
              className={cn(
                "flex items-center gap-1 px-2 h-7 text-[10px]",
                renderMode === "rendered"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
              title="렌더링"
            >
              <FileText size={11} />
            </button>
            <button
              onClick={() => setRenderMode("source")}
              className={cn(
                "flex items-center gap-1 px-2 h-7 text-[10px] border-l border-[var(--color-border)]",
                renderMode === "source"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
              title="소스"
            >
              <FileCode size={11} />
            </button>
          </div>
        )}
        <button
          onClick={openInOS}
          disabled={!data?.absolutePath}
          className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30"
          title="OS 기본 앱으로 열기"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      {/* 본체 */}
      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
        {!currentPath ? (
          <div className="p-6 text-xs text-[var(--color-foreground-dim)] text-center">
            경로 바에 파일 경로를 입력하세요.
          </div>
        ) : loading ? (
          <div className="p-6 text-sm text-[var(--color-foreground-muted)]">
            불러오는 중…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-[var(--color-danger)]">{error}</div>
        ) : !data ? null : data.oversize ? (
          <div className="p-8 text-center text-sm text-[var(--color-foreground-muted)]">
            파일이 너무 큽니다 ({(data.size / 1024 / 1024).toFixed(1)} MB).
          </div>
        ) : data.binary ? (
          <div className="p-8 text-center text-sm text-[var(--color-foreground-muted)]">
            바이너리 파일은 표시할 수 없습니다.
          </div>
        ) : isMarkdown && renderMode === "rendered" ? (
          <div
            className="markdown-body p-6 text-[var(--color-foreground)]"
            style={{ fontSize: markdownFontSize }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {data.content ?? ""}
            </ReactMarkdown>
          </div>
        ) : (
          <TextContent content={data.content ?? ""} />
        )}
      </div>
    </div>
  );
}

function TextContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <pre className="p-0 m-0 text-xs font-mono bg-[var(--color-background)] w-max min-w-full">
      <table className="border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="align-top">
              <td className="select-none pr-3 pl-3 py-0 text-right text-[var(--color-foreground-dim)] border-r border-[var(--color-border)] whitespace-nowrap sticky left-0 bg-[var(--color-background)]">
                {i + 1}
              </td>
              <td className="pl-3 pr-3 py-0 whitespace-pre text-[var(--color-foreground)]">
                {line || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </pre>
  );
}
