"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { useTerminalStore } from "@/store/terminal-store";
import {
  ExternalLink,
  Terminal as TerminalIcon,
  X,
  FileCode,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** POSIX dirname 최소 구현 */
function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return idx === 0 ? "/" : p;
  return p.slice(0, idx);
}

interface FileResponse {
  binary: boolean;
  oversize: boolean;
  size: number;
  content?: string;
  // 이미지 파일일 때 서버가 base64 dataUrl로 실어서 보내줌
  image?: boolean;
  dataUrl?: string;
  mimeType?: string;
  name: string;
  absolutePath: string;
}

interface Props {
  projectId: string;
  relPath: string;
  absolutePath: string;
  name: string;
  onClose?: () => void;
}

export function FileViewerPanel({
  projectId,
  relPath,
  absolutePath,
  name,
  onClose,
}: Props) {
  const [data, setData] = useState<FileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const isMarkdown = /\.(md|markdown|mdx)$/i.test(name);
  // 마크다운 파일은 기본적으로 렌더링 모드, 아니면 원문
  const [renderMode, setRenderMode] = useState<"rendered" | "source">(
    isMarkdown ? "rendered" : "source",
  );

  // 파일 바뀌면 모드 초기화
  useEffect(() => {
    setRenderMode(isMarkdown ? "rendered" : "source");
  }, [relPath, isMarkdown]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    setLoading(true);
    fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(relPath)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as FileResponse;
      })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setLoading(false);
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
  }, [projectId, relPath]);

  const openInOS = async () => {
    await fetch("/api/system/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: absolutePath }),
    });
  };

  const openTerminalAtDir = () => {
    const dir = dirname(absolutePath);
    router.push(`/terminal?newTabCwd=${encodeURIComponent(dir)}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/30 overflow-hidden">
      <div className="flex items-start gap-2 p-3 border-b border-[var(--color-border)]">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-[10px] text-[var(--color-foreground-dim)] font-mono truncate mt-0.5">
            {absolutePath}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--color-foreground-dim)] hover:bg-[var(--color-surface-hover)]"
            aria-label="닫기"
            title="닫기"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex gap-2 px-3 py-2 border-b border-[var(--color-border)]">
        <Button size="sm" variant="outline" onClick={openInOS}>
          <ExternalLink size={12} /> 열기
        </Button>
        <Button size="sm" variant="outline" onClick={openTerminalAtDir}>
          <TerminalIcon size={12} /> 터미널 열기
        </Button>
        {isMarkdown && (
          <div className="ml-auto flex items-center gap-0 rounded-md border border-[var(--color-border)] overflow-hidden">
            <button
              onClick={() => setRenderMode("rendered")}
              className={cn(
                "flex items-center gap-1 px-2 h-7 text-[10px]",
                renderMode === "rendered"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
              title="렌더링된 마크다운"
            >
              <FileText size={11} /> 렌더
            </button>
            <button
              onClick={() => setRenderMode("source")}
              className={cn(
                "flex items-center gap-1 px-2 h-7 text-[10px] border-l border-[var(--color-border)]",
                renderMode === "source"
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-hover)]",
              )}
              title="원본 텍스트"
            >
              <FileCode size={11} /> 소스
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-auto">
        {loading ? (
          <div className="p-6 text-sm text-[var(--color-foreground-muted)]">
            불러오는 중…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-[var(--color-danger)]">{error}</div>
        ) : !data ? null : data.oversize ? (
          <OversizePlaceholder size={data.size} onOpen={openInOS} />
        ) : data.image && data.dataUrl ? (
          <ImageContent
            dataUrl={data.dataUrl}
            name={data.name}
            size={data.size}
          />
        ) : data.binary ? (
          <BinaryPlaceholder onOpen={openInOS} />
        ) : isMarkdown && renderMode === "rendered" ? (
          <MarkdownContent content={data.content ?? ""} />
        ) : (
          <TextContent content={data.content ?? ""} />
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const fontSize = useTerminalStore((s) => s.markdownFontSize);
  return (
    <div
      className="markdown-body p-6 text-[var(--color-foreground)]"
      style={{ fontSize }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 외부 링크는 새 창으로 열기 (앱 자체가 이동하는 것 방지)
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
        {content}
      </ReactMarkdown>
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

function ImageContent({
  dataUrl,
  name,
  size,
}: {
  dataUrl: string;
  name: string;
  size: number;
}) {
  const kb = (size / 1024).toFixed(1);
  return (
    <div className="flex flex-col items-center justify-start p-6 gap-3 bg-[repeating-conic-gradient(var(--color-surface)_0%_25%,var(--color-background)_0%_50%)_50%/20px_20px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={name}
        className="max-w-full max-h-[75vh] object-contain rounded shadow-lg"
      />
      <div className="text-xs text-[var(--color-foreground-dim)] font-mono">
        {name} · {kb} KB
      </div>
    </div>
  );
}

function BinaryPlaceholder({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-[var(--color-foreground-muted)] mb-2">
        이 파일은 바이너리입니다. Cockpit 내에서 미리보기 할 수 없어요.
      </p>
      <p className="text-xs text-[var(--color-foreground-dim)] mb-4">
        이미지·영상·PDF 등은 OS 기본 앱으로 열어보세요.
      </p>
      <Button size="sm" onClick={onOpen}>
        <ExternalLink size={12} /> 열기
      </Button>
    </div>
  );
}

function OversizePlaceholder({
  size,
  onOpen,
}: {
  size: number;
  onOpen: () => void;
}) {
  const mb = (size / 1024 / 1024).toFixed(1);
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-[var(--color-foreground-muted)] mb-2">
        파일이 너무 큽니다 ({mb} MB). Cockpit 내장 뷰어는 1MB 이하만 표시합니다.
      </p>
      <Button size="sm" onClick={onOpen}>
        <ExternalLink size={12} /> 열기
      </Button>
    </div>
  );
}
