export function inWindow(timestamp: number, startAt: number, endAt: number): boolean {
  return timestamp >= startAt && timestamp <= endAt;
}
