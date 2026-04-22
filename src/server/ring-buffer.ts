/**
 * 바이트 상한을 가진 청크 기반 링 버퍼.
 * - 입력을 청크 단위로 쌓고, 총 바이트가 상한을 넘으면 가장 오래된 청크부터 제거한다.
 * - 청크를 자르지 않기 때문에 UTF-8 멀티바이트 문자가 쪼개지지 않는다.
 * - snapshot()은 현재 버퍼를 하나의 문자열로 반환 (history replay용).
 */
export class RingBuffer {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly max: number) {
    if (max <= 0) throw new Error("RingBuffer max must be > 0");
  }

  write(data: string): void {
    if (!data) return;
    this.chunks.push(data);
    this.size += Buffer.byteLength(data, "utf8");
    // 상한 초과 시 앞에서부터 제거. 단, 마지막 청크 하나는 남긴다
    // (최신 한 청크가 상한보다 크면 남겨두되, 그 이전 청크는 모두 제거).
    while (this.size > this.max && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.size -= Buffer.byteLength(removed, "utf8");
    }
  }

  snapshot(): string {
    return this.chunks.join("");
  }

  clear(): void {
    this.chunks.length = 0;
    this.size = 0;
  }

  get byteSize(): number {
    return this.size;
  }

  get capacity(): number {
    return this.max;
  }
}
