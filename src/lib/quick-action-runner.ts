/**
 * Quick Action step 순차 실행.
 * 화이트리스트의 type만 허용. 실패 시 즉시 중단 + 실패 지점과 에러 반환.
 */
import {
  abortOp,
  checkoutBranch,
  fetchAll,
  mergeBranch,
  pullRemote,
  pushRemote,
  rebaseOnto,
  stashPop,
  stashSave,
} from "./git";

export type Step =
  | { type: "fetch" }
  | { type: "pull"; rebase?: boolean }
  | { type: "push"; force?: boolean; setUpstream?: boolean }
  | { type: "checkout"; branch: string }
  | {
      type: "merge";
      branch: string;
      noFF?: boolean;
      ffOnly?: boolean;
      squash?: boolean;
    }
  | { type: "rebase"; onto: string }
  | { type: "abort"; op: "merge" | "rebase" }
  | { type: "stash-save"; message?: string }
  | { type: "stash-pop" };

export interface StepResult {
  step: Step;
  ok: boolean;
  output?: string;
  error?: string;
}

export async function runSteps(cwd: string, steps: Step[]): Promise<{
  ok: boolean;
  results: StepResult[];
  failedAt?: number;
}> {
  const results: StepResult[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      let output = "";
      switch (step.type) {
        case "fetch":
          output = await fetchAll(cwd);
          break;
        case "pull":
          output = await pullRemote(cwd, step.rebase);
          break;
        case "push":
          output = await pushRemote(cwd, {
            force: step.force,
            setUpstream: step.setUpstream,
          });
          break;
        case "checkout":
          await checkoutBranch(cwd, step.branch);
          break;
        case "merge":
          output = await mergeBranch(cwd, step.branch, step);
          break;
        case "rebase":
          output = await rebaseOnto(cwd, step.onto);
          break;
        case "abort":
          await abortOp(cwd, step.op);
          break;
        case "stash-save":
          await stashSave(cwd, step.message);
          break;
        case "stash-pop":
          await stashPop(cwd);
          break;
        default: {
          const _never: never = step;
          void _never;
          throw new Error("unknown step type");
        }
      }
      results.push({ step, ok: true, output });
    } catch (err) {
      results.push({ step, ok: false, error: (err as Error).message });
      return { ok: false, results, failedAt: i };
    }
  }
  return { ok: true, results };
}
