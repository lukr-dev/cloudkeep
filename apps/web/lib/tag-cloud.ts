export function tagFontSize(count: number, maxCount: number): number {
  if (maxCount <= 1) return 0.8;
  return 0.8 + 1.2 * (Math.log(Math.min(maxCount, Math.max(1, count))) / Math.log(maxCount));
}
