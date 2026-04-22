"use client";

import { useState } from "react";
import { useTerminalStore } from "@/store/terminal-store";

/**
 * pane 헤더를 drag 핸들로 쓰고 pane 전체를 drop target으로 사용.
 * 같은 부모 split 내에서만 순서 변경.
 *
 * 사용법:
 *   const dnd = usePaneDnd(pane.id);
 *   <div {...dnd.rootProps}>
 *     <div {...dnd.handleProps}>header</div>
 *   </div>
 */
export function usePaneDnd(paneId: string) {
  const reorderPanes = useTerminalStore((s) => s.reorderPanes);
  const [isDragOver, setIsDragOver] = useState(false);

  return {
    /** pane 루트에 적용 — drop 영역 */
    rootProps: {
      onDragOver: (e: React.DragEvent) => {
        const sourceId = e.dataTransfer.types.includes("application/x-cockpit-pane")
          ? e.dataTransfer.getData("application/x-cockpit-pane")
          : null;
        // types는 dragstart에서 getData가 빈 문자열이라 getData 결과로 판단 어려움.
        // 단순히 pane-drag 컨텍스트에서만 drop 허용하도록 dataTransfer에 마커를 둠.
        if (!e.dataTransfer.types.includes("application/x-cockpit-pane")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isDragOver && sourceId !== paneId) setIsDragOver(true);
      },
      onDragLeave: () => {
        if (isDragOver) setIsDragOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("application/x-cockpit-pane")) return;
        e.preventDefault();
        const sourceId = e.dataTransfer.getData("application/x-cockpit-pane");
        if (sourceId && sourceId !== paneId) {
          reorderPanes(sourceId, paneId);
        }
        setIsDragOver(false);
      },
    },
    /** pane 헤더에 적용 — drag 시작 */
    handleProps: {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-cockpit-pane", paneId);
      },
    },
    isDragOver,
  };
}
