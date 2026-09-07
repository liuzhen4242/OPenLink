interface Dated {
  data: { date?: string | Date | null };
}

/** 按文章/项目日期倒序（最新在前）。日期统一为 "YYYY-MM-DD" 字符串。 */
export function newestFirst(a: Dated, b: Dated): number {
  const da = String(a.data.date ?? '');
  const db = String(b.data.date ?? '');
  if (!da && !db) return 0;
  if (!da) return 1; // 没写日期的排到最后
  if (!db) return -1;
  return db.localeCompare(da);
}
