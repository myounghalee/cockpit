"use client";

import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
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
  Square,
  CheckSquare,
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
  // 기본은 미리보기 모드 — 편집하려면 프리뷰 영역 더블클릭 or 툴바 버튼
  const [preview, setPreview] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const update = useUpdateMemo();
  const del = useDeleteMemo();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 메모 전환 시 상태 리셋은 부모의 `key={selectedMemo.id}` 가 컴포넌트를
  // 언마운트/재마운트하면서 useState 초기값으로 자연히 처리됨. useEffect 로
  // 다시 동기화하면 자동저장 후 memo prop 갱신 때 preview 로 튕기는 등
  // 예기치 않은 setState 경로가 생김 → 별도 동기화 effect 를 두지 않는다.

  // 편집 모드로 진입하면 textarea에 포커스
  useEffect(() => {
    if (!preview && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [preview]);

  // 프리뷰 영역에서 체크박스 클릭 시 N번째 [ ] ↔ [x] 토글.
  // 두 형식 모두 수용: "- [ ]" (GFM 표준) / "[ ]" (bullet 없는 짧은 형식)
  function toggleTaskCheckbox(index: number) {
    let i = 0;
    let changed = false;
    const next = content.replace(
      /^(\s*(?:[-*+]\s+)?)\[( |x|X)\]/gm,
      (match, prefix, state) => {
        if (i++ !== index) return match;
        changed = true;
        return `${prefix}[${state.trim() === "" ? "x" : " "}]`;
      },
    );
    if (changed) setContent(next);
  }

  // 렌더 직전 전처리:
  //   1) 줄 앞 `[ ]` / `[x]` → `- [ ]` / `- [x]` (GFM 체크박스 인식용)
  //   2) 연속된 빈 줄 보존 — GFM 은 `\n{3+}` 을 문단 구분 1회로 접어버리므로,
  //      사용자가 엔터를 여러 번 치면 그만큼의 세로 공간이 보이도록
  //      빈 paragraph(`\u00A0`) 를 끼워 넣는다.
  //   펜스드 코드(```…```) 안쪽은 건드리지 않음.
  function normalizeForRender(src: string): string {
    const parts = src.split(/(```[^\n]*\n[\s\S]*?\n```)/g);
    return parts
      .map((part, i) => {
        if (i % 2 === 1) return part; // fenced block 보존
        let out = part.replace(
          /^(\s*)(\[[ xX]\])/gm,
          (_m, indent, bracket) => `${indent}- ${bracket}`,
        );
        out = out.replace(/\n{3,}/g, (m) => {
          return "\n\n" + "\u00A0\n\n".repeat(m.length - 2);
        });
        return out;
      })
      .join("");
  }

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

  const handleToggleComplete = () =>
    update.mutate({ id: memo.id, completed: !memo.completedAt });

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
          onClick={handleToggleComplete}
          title={memo.completedAt ? "완료 취소" : "완료로 표시"}
        >
          {memo.completedAt ? (
            <CheckSquare size={14} className="text-[var(--color-accent)]" />
          ) : (
            <Square size={14} />
          )}
          <span className="text-xs">
            {memo.completedAt ? "완료됨" : "완료"}
          </span>
        </Button>

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
          className={cn(
            "h-auto border-0 bg-transparent px-0 text-xl font-semibold focus:ring-0",
            memo.completedAt &&
              "line-through text-[var(--color-foreground-muted)]",
          )}
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
          (() => {
            // ReactMarkdown은 소스 순서대로 input 컴포넌트를 호출하므로
            // 렌더마다 새 closure 카운터로 Nth checkbox 를 추적
            let checkboxIdx = 0;
            return (
              <article
                className="markdown-body text-sm text-[var(--color-foreground)] cursor-text"
                onDoubleClick={() => setPreview(false)}
                title="더블클릭하면 편집 모드로 전환돼요"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    input: ({ node: _node, ...props }) => {
                      if (props.type !== "checkbox") {
                        return <input {...props} />;
                      }
                      const idx = checkboxIdx++;
                      // remark-gfm이 disabled를 기본 true로 주는데, 클릭 가능하게
                      return (
                        <input
                          {...props}
                          disabled={false}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleTaskCheckbox(idx)}
                        />
                      );
                    },
                  }}
                >
                  {normalizeForRender(
                    content || "*내용 없음 — 더블클릭해서 편집*",
                  )}
                </ReactMarkdown>
              </article>
            );
          })()
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              // Esc 로 미리보기 복귀 (저장은 기존 debounce 가 처리)
              if (e.key === "Escape") {
                e.preventDefault();
                setPreview(true);
              }
            }}
            placeholder="마크다운으로 작성하세요. 체크리스트는 - [ ] / - [x]. Esc 로 미리보기"
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
