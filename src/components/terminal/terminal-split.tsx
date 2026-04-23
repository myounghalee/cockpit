"use client";

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle,
} from "react-resizable-panels";
import type { SplitNode } from "@/types/terminal";
import { TerminalPane } from "./terminal-pane";
import { BrowserSplitPane } from "./browser-split-pane";
import { FileSplitPane } from "./file-split-pane";
import { MemoSplitPane } from "./memo-split-pane";
import { useRef, useState } from "react";

interface TerminalSplitProps {
  node: SplitNode;
  tabId: string;
}

export function TerminalSplit({ node, tabId }: TerminalSplitProps) {
  const [activePaneId, setActivePaneId] = useState<string | null>(null);

  return (
    <SplitNodeRenderer
      node={node}
      active={activePaneId}
      onFocus={setActivePaneId}
      tabId={tabId}
    />
  );
}

function SplitNodeRenderer({
  node,
  active,
  onFocus,
  tabId,
}: {
  node: SplitNode;
  active: string | null;
  onFocus: (id: string) => void;
  tabId: string;
}) {
  if (node.type === "leaf") {
    if (node.pane.type === "browser") {
      return (
        <BrowserSplitPane
          pane={node.pane}
          isActive={active === node.pane.id}
          onFocus={() => onFocus(node.pane.id)}
        />
      );
    }
    if (node.pane.type === "file") {
      return (
        <FileSplitPane
          pane={node.pane}
          isActive={active === node.pane.id}
          onFocus={() => onFocus(node.pane.id)}
        />
      );
    }
    if (node.pane.type === "memo") {
      return (
        <MemoSplitPane
          pane={node.pane}
          isActive={active === node.pane.id}
          onFocus={() => onFocus(node.pane.id)}
        />
      );
    }
    return (
      <TerminalPane
        pane={node.pane}
        isActive={active === node.pane.id}
        onFocus={() => onFocus(node.pane.id)}
      />
    );
  }

  const isHorizontal = node.direction === "horizontal";
  const childCount = node.children.length;
  // 고유 ID — 하위 pane id 조합으로 충돌 방지
  const groupId = `split-${tabId}-${node.children
    .map((c) => (c.type === "leaf" ? c.pane.id : "g"))
    .join("-")}`;

  return (
    <SplitGroup
      direction={isHorizontal ? "horizontal" : "vertical"}
      groupId={groupId}
      childCount={childCount}
    >
      {node.children.map((child, i) => (
        <PanelItem
          key={getNodeKey(child)}
          index={i}
          childCount={childCount}
        >
          <SplitNodeRenderer
            node={child}
            active={active}
            onFocus={onFocus}
            tabId={tabId}
          />
        </PanelItem>
      ))}
    </SplitGroup>
  );
}

/** PanelGroup — childCount를 key에 반영하여 패널 추가 시 균등 리셋 */
function SplitGroup({
  direction,
  groupId,
  childCount,
  children,
}: {
  direction: "horizontal" | "vertical";
  groupId: string;
  childCount: number;
  children: React.ReactNode;
}) {
  const groupRef = useRef<ImperativePanelGroupHandle>(null);

  const resetLayout = () => {
    if (!groupRef.current) return;
    const equalSize = 100 / childCount;
    groupRef.current.setLayout(Array(childCount).fill(equalSize));
  };

  return (
    <PanelGroup
      // key에 childCount 포함 → 패널 수 변경 시 PanelGroup 재생성 → defaultSize 적용
      key={`${groupId}-${childCount}`}
      ref={groupRef}
      direction={direction}
      className="h-full w-full"
    >
      {injectHandles(children, direction, resetLayout)}
    </PanelGroup>
  );
}

/** children 사이에 PanelResizeHandle 삽입 */
function injectHandles(
  children: React.ReactNode,
  direction: "horizontal" | "vertical",
  onDoubleClick: () => void,
): React.ReactNode[] {
  const items = Array.isArray(children) ? children : [children];
  const result: React.ReactNode[] = [];
  const isHorizontal = direction === "horizontal";

  items.forEach((child, i) => {
    if (i > 0) {
      result.push(
        <PanelResizeHandle
          key={`handle-${i}`}
          className={
            isHorizontal
              ? "group/handle relative w-[5px] bg-[var(--color-border)] hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)] transition-colors cursor-col-resize"
              : "group/handle relative h-[5px] bg-[var(--color-border)] hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)] transition-colors cursor-row-resize"
          }
        >
          {/* 균등 분할 버튼 — 핸들 호버 시 표시 */}
          <button
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick();
            }}
            className={
              isHorizontal
                ? "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-6 rounded-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[8px] text-[var(--color-foreground-dim)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] opacity-0 group-hover/handle:opacity-100 transition-opacity z-10 flex items-center justify-center"
                : "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-6 rounded-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[8px] text-[var(--color-foreground-dim)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] opacity-0 group-hover/handle:opacity-100 transition-opacity z-10 flex items-center justify-center"
            }
            title="균등 분할"
          >
            ⫶
          </button>
        </PanelResizeHandle>,
      );
    }
    result.push(child);
  });

  return result;
}

function PanelItem({
  children,
  index,
  childCount,
}: {
  children: React.ReactNode;
  index: number;
  childCount: number;
}) {
  return (
    <Panel defaultSize={100 / childCount} minSize={10} order={index}>
      {children}
    </Panel>
  );
}

function getNodeKey(node: SplitNode): string {
  if (node.type === "leaf") return `leaf-${node.pane.id}`;
  return `split-${node.direction}-${node.children
    .map(getNodeKey)
    .join("_")}`;
}
