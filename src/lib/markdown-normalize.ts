/**
 * 메모 본문 마크다운 렌더 전 전처리.
 *   1) 줄 앞 `[ ]` / `[x]` → `- [ ]` / `- [x]` (GFM 체크박스 인식)
 *   2) 연속된 빈 줄 보존 — GFM 은 `\n{3+}` 을 문단 구분 1회로 접어버리므로,
 *      사용자가 엔터를 여러 번 치면 그만큼 공간이 보이도록 빈 paragraph(`\u00A0`) 삽입.
 *   펜스드 코드 블록(```…```) 안쪽은 절대 건드리지 않음.
 */
export function normalizeMarkdown(src: string): string {
  const parts = src.split(/(```[^\n]*\n[\s\S]*?\n```)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
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
