import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const optionalText = z.preprocess(
  (value) => (value === null || value === '' ? undefined : value),
  z.string().optional()
);

const optionalDate = z
  .preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.union([z.date(), z.string()]).optional()
  )
  .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value));

const blogCollection = defineCollection({
  loader: glob({
    // public 文章直接放在 blog/public/；private、草稿等仍可保留子目录。
    pattern: ['*.md', '*/*.md', '*/*/*.md'],
    base: new URL('./content/blog/', import.meta.url),
  }),
  schema: z.object({
    title: optionalText, // 缺省时使用 Markdown 文件名
    titleEn: optionalText, // 缺省时，英文文件名自动作为英文标题
    // 文件扁平化后仍可保留既有公开链接；未填写时使用 Markdown 文件名。
    slug: z.string().optional(),
    // blog 分类：任意字符串数组（不限制枚举，方便自由打标签）
    category: z.array(z.string()).optional().default([]),
    description: optionalText,
    // 可见状态：public=公开；private=私密（线上列表隐藏，独立页走 /blog/private/ 密码路径）；
    // hidden=彻底隐藏（线上不生成页面、网上不可见，仅本地 dev 可见）；draft=草稿（线上列表隐藏）
    // 大小写归一化：兼容 Obsidian 里写成 Public/Private 等首字母大写的情况
    status: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.toLowerCase() : v),
        z.enum(['public', 'private', 'hidden', 'draft']).optional().default('public')
      ),
    // 右侧引注列表：文章页右栏按序号（1: 2: 3:...）逐条显示（可选，借鉴 Herschel）
    notes: z.array(z.string()).optional(),
    // 作者：字符串（单作者）或数组（多作者）；不写默认回退 "zhenliu"（借鉴 Herschel）
    author: z.union([z.string(), z.array(z.string())]).optional(),
    // 更新日期（可选）：不写则由构建自动识别文件最后修改日期，显示为（upd YYMMDD）（借鉴 Herschel）
    update: z
      .union([z.date(), z.string()])
      .optional()
      .transform((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d)),
    // 兼容带引号字符串（"2025-02-16"）与无引号 YAML 日期（2025-02-16 → Date 对象），
    // 统一转换为 "YYYY-MM-DD" 字符串输出
    date: optionalDate,
  }),
});

const projectsCollection = defineCollection({
  loader: glob({
    // 项目文章直接放在 projects/ 根目录。
    pattern: ['*.md', '*/*.md', '*/*/*.md'],
    base: new URL('./content/projects/', import.meta.url),
  }),
  // ✨ 关键点：这里改成函数形式，引入 image 处理器
  schema: ({ image }) => z.object({
    title: optionalText, // 缺省时使用 Markdown 文件名
    titleEn: optionalText, // 缺省时，英文文件名自动作为英文标题
    slug: z.string().optional(),
    // 改为数组，支持多个分类，和博客一致，不限制枚举
    category: z.array(z.string()),

    // ✨ 把原本的 z.string() 改成 image()
    // 这样打包时，Astro 才会把它当成真实的图片文件去打包迁移，并自动修复空格路径问题
    coverImage: image().optional(),

    // 封面媒体（视频/gif 等非图片格式），字符串相对路径如 "./images/cover.mp4"
    // 与 coverImage 二选一：优先使用 coverMedia；写了它就用 video/img 渲染，不写则退回 coverImage
    coverMedia: z.string().optional(),

    description: optionalText,
    // 和博客一致：兼容 Date 对象和字符串日期
    date: optionalDate,
    update: optionalDate,
    // 右侧引注列表：项目页右栏按序号（1: 2: 3:...）逐条显示（可选，借鉴 Herschel）
    notes: z.array(z.string()).optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
  blog: blogCollection,
};
