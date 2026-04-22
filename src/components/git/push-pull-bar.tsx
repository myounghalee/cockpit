"use client";

import { useState } from "react";
import {
  useFetchAll,
  usePull,
  usePush,
  useGitStatus,
} from "@/hooks/use-git";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, RefreshCw, ChevronDown } from "lucide-react";

interface Props {
  projectId: string;
}

export function PushPullBar({ projectId }: Props) {
  const fetchMut = useFetchAll(projectId);
  const pullMut = usePull(projectId);
  const pushMut = usePush(projectId);
  const { data: status } = useGitStatus(projectId);
  const [err, setErr] = useState<string | null>(null);

  const pending = fetchMut.isPending || pullMut.isPending || pushMut.isPending;

  const wrap = async <T,>(fn: () => Promise<T>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => wrap(() => fetchMut.mutateAsync())}
        disabled={pending}
        title="git fetch --all --prune"
      >
        <RefreshCw size={12} /> Fetch
      </Button>

      <DropdownMenu>
        <Button asChild size="sm" variant="outline" disabled={pending}>
          <DropdownMenuTrigger>
            <ArrowDown size={12} /> Pull
            {(status?.behind ?? 0) > 0 && (
              <span className="text-[10px] px-1 rounded bg-[var(--color-warning)]/20 text-[var(--color-warning)]">
                {status?.behind}
              </span>
            )}
            <ChevronDown size={10} />
          </DropdownMenuTrigger>
        </Button>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => wrap(() => pullMut.mutateAsync({}))}>
            Pull (merge)
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => wrap(() => pullMut.mutateAsync({ rebase: true }))}
          >
            Pull --rebase
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Button asChild size="sm" variant="outline" disabled={pending}>
          <DropdownMenuTrigger>
            <ArrowUp size={12} /> Push
            {(status?.ahead ?? 0) > 0 && (
              <span className="text-[10px] px-1 rounded bg-[var(--color-accent)]/20 text-[var(--color-accent)]">
                {status?.ahead}
              </span>
            )}
            <ChevronDown size={10} />
          </DropdownMenuTrigger>
        </Button>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => wrap(() => pushMut.mutateAsync({}))}>
            Push
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              wrap(() => pushMut.mutateAsync({ setUpstream: true }))
            }
          >
            Push -u origin (set upstream)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-[var(--color-danger)]"
            onSelect={() => {
              if (
                confirm(
                  "--force-with-lease로 강제 푸시합니다. 계속하시겠어요?",
                )
              ) {
                void wrap(() => pushMut.mutateAsync({ force: true }));
              }
            }}
          >
            Push --force-with-lease
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {err && (
        <span
          className="text-[10px] text-[var(--color-danger)] truncate max-w-[200px]"
          title={err}
        >
          {err}
        </span>
      )}
    </div>
  );
}
