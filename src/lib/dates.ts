import { articleTimestamp } from './articleMeta';

interface Dated {
  data: { date?: string | Date | null };
  filePath?: string;
}

/** 按文章/项目日期倒序（最新在前）。日期统一为 "YYYY-MM-DD" 字符串。 */
export function newestFirst(a: Dated, b: Dated): number {
  return articleTimestamp(b.data.date ?? undefined, b.filePath) - articleTimestamp(a.data.date ?? undefined, a.filePath);
}
