"use client";

import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  Pencil,
  TicketIcon,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/memo";
import {
  useUpdateMemo,
  useDeleteMemo,
} from "@/hooks/use-memos";

interface MemoEditorProps {
  memo: Memo;
  onRequestConvert: () => void;
  onDeleted: () => void;
}

export function MemoEditor({
  memo,
  onRequestConvert,
  onDeleted,
}: MemoEditorProps) {
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [tags, setTags] = useState(memo.tags);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const update = useUpdateMemo();
  const del = useDeleteMemo();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 메모가 바뀌면(다른 메모 선택) 로컬 상태도 리셋
  useEffect(() => {
    setTitle(memo.title);
    setContent(memo.content);
    setTags(memo.tags);
    setPreview(false);
    setSaveState("idle");
  }, [memo.id, memo.title, memo.content, memo.tags]);

  // 변경 시 1초 debounce 후 자동 저장
  useEffect(() => {
    if (
      title === memo.title &&
      content === memo.content &&
      tags === memo.tags
    ) {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveState("saving");
    debounceRef.current = setTimeout(() => {
      update.mutate(
        { id: memo.id, title, content, tags },
        {
          onSuccess: () => {
            setSaveState("saved");
            setTimeout(
              () =>
                setSaveState((s) => (s === "saved" ? "idle" : s)),
              1500,
            );
          },
          onError: () => setSaveState("idle"),
        },
      );
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, content, tags, memo.id, memo.title, memo.content, memo.tags, update]);

  const handleTogglePin = () =>
    update.mutate({ id: memo.id, pinned: !memo.pinnedAt });

  const handleToggleArchive = () =>
    update.mutate({ id: memo.id, archived: !memo.archivedAt });

  const handleDelete = () => {
    if (!confirm("이 메모를 영구적으로 삭제하시겠습니까?")) return;
    del.mutate(memo.id, { onSuccess: onDeleted });
  };

  const isConverted = !!memo.convertedTicketId;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)]">
        <div className="flex-1 flex items-center gap-2 text-xs text-[var(--color-foreground-dim)]">
          {saveState === "saving" && <span>저장 중...</span>}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-[var(--color-accent)]">
              <Check size={12} /> 저장됨
            </span>
          )}
          {isConverted && (
            <span className="flex items-center gap-1 text-emerald-500">
              <TicketIcon size={12} /> 티켓으로 변환됨
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreview((p) => !p)}
          title={preview ? "편집" : "미리보기"}
        >
          {preview ? <Pencil size={14} /> : <Eye size={14} />}
          <span className="text-xs">{preview ? "편집" : "미리보기"}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleTogglePin}
          title={memo.pinnedAt ? "고정 해제" : "고정"}
        >
          {memo.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleArchive}
          title={memo.archivedAt ? "복원" : "보관"}
        >
          {memo.archivedAt ? (
            <ArchiveRestore size={14} />
          ) : (
            <Archive size={14} />
          )}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onRequestConvert}
          disabled={isConverted}
          title={
            isConverted
              ? "이미 티켓으로 변환됨"
              : "이 메모를 칸반 티켓으로 변환"
          }
        >
          <TicketIcon size={14} />
          <span className="text-xs">
            {isConverted ? "변환 완료" : "티켓으로 변환"}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          title="삭제"
        >
          <Trash2 size={14} className="text-[var(--color-danger)]" />
        </Button>
      </div>

      {/* Title */}
      <div className="px-6 pt-5 pb-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="h-auto border-0 bg-transparent px-0 text-xl font-semibold focus:ring-0"
        />
      </div>

      {/* Tags */}
      <div className="px-6 pb-3">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="태그 (콤마 구분, 예: 아이디어, 버그)"
          className="h-7 border-0 bg-transparent px-0 text-xs text-[var(--color-foreground-muted)] focus:ring-0"
        />
      </div>

      <div className="h-px bg-[var(--color-border)] mx-6" />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {preview ? (
          <article
            className={cn(
              "prose prose-sm max-w-none",
              "prose-headings:text-[var(--color-foreground)] prose-headings:font-semibold",
              "prose-p:text-[var(--color-foreground)]",
              "prose-strong:text-[var(--color-foreground)]",
              "prose-code:text-[var(--color-accent)] prose-code:bg-[var(--color-surface-hover)] prose-code:px-1 prose-code:rounded",
              "prose-a:text-[var(--color-accent)]",
              "prose-li:text-[var(--color-foreground)]",
              "prose-blockquote:text-[var(--color-foreground-muted)] prose-blockquote:border-[var(--color-border)]",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "*내용 없음*"}
            </ReactMarkdown>
          </article>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="마크다운으로 작성하세요. 체크리스트는 - [ ] / - [x]"
            className={cn(
              "w-full h-full min-h-[300px] resize-none bg-transparent text-sm leading-relaxed",
              "text-[var(--color-foreground)] placeholder:text-[var(--color-foreground-dim)]",
              "focus:outline-none font-mono",
            )}
          />
        )}
      </div>
    </div>
  );
}
