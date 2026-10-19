import { statSync } from 'node:fs';
import path from 'node:path';

export function articleFileName(id: string): string {
  return path.basename(id.replace(/\.md$/i, ''));
}

function isLatinName(value: string): boolean {
  return /^[\p{Script=Latin}\p{N}\s._&+\-]+$/u.test(value);
}

export function articleTitle(id: string, value?: string): string {
  return value?.trim() || articleFileName(id);
}

export function articleTitleEn(id: string, value?: string): string | undefined {
  if (value?.trim()) return value;
  const name = articleFileName(id);
  return isLatinName(name) ? name : undefined;
}

export function articleDate(value: string | Date | undefined, filePath?: string): string | undefined {
  if (value) return value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!filePath) return undefined;
  try {
    return statSync(filePath).birthtime.toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}

export function articleTimestamp(value: string | Date | undefined, filePath?: string): number {
  const date = articleDate(value, filePath);
  return date ? new Date(date).getTime() : 0;
}

export function articleUpdateDate(value: string | Date | undefined, filePath?: string): string | undefined {
  if (value) return value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!filePath) return undefined;
  try {
    return statSync(filePath).mtime.toISOString().slice(0, 10);
  } catch {
    return undefined;
  }
}
