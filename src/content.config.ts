import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({
    // 匹配 blog 目录下所有 .md 文件（不含子目录嵌套，保持扁平）
    pattern: ['*.md'],
    base: new URL('./content/blog/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(), // 中文标题（主标题），用于 H1 下方元数据、SEO；与 Herschel 一致
    titleEn: z.string().optional(), // 英文标题（可选，借鉴 Herschel）：目录顶部优先显示、SEO 用
    name: z.string(), // 中文短标题，页面 H1 大标题显示用（OpenLink 特有，兼容旧文章）
    // blog 分类：任意字符串数组（不限制枚举，方便自由打标签）
    category: z.array(z.string()).optional().default([]),
    description: z.string().optional(),
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
    date: z.union([z.date(), z.string()]).optional().transform((d) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : d
    ),
  }),
});

const projectsCollection = defineCollection({
  loader: glob({
    // 匹配所有项目子目录下的 .md 文件
    pattern: ['*/*.md'],
    base: new URL('./content/projects/', import.meta.url),
  }),
  // ✨ 关键点：这里改成函数形式，引入 image 处理器
  schema: ({ image }) => z.object({
    title: z.string(), // 英文标题，用于 SEO、副标题显示
    name: z.string(), // 中文标题，页面上大标题显示用

    // 改为数组，支持多个分类，和博客一致，不限制枚举
    category: z.array(z.string()),

    // ✨ 把原本的 z.string() 改成 image()
    // 这样打包时，Astro 才会把它当成真实的图片文件去打包迁移，并自动修复空格路径问题
    coverImage: image().optional(),

    // 封面媒体（视频/gif 等非图片格式），字符串相对路径如 "./images/cover.mp4"
    // 与 coverImage 二选一：优先使用 coverMedia；写了它就用 video/img 渲染，不写则退回 coverImage
    coverMedia: z.string().optional(),

    description: z.string().optional(),
    // 和博客一致：兼容 Date 对象和字符串日期
    date: z.union([z.date(), z.string()]).optional().transform((d) =>
      d instanceof Date ? d.toISOString().slice(0, 10) : d
    ),
    // 右侧引注列表：项目页右栏按序号（1: 2: 3:...）逐条显示（可选，借鉴 Herschel）
    notes: z.array(z.string()).optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
  blog: blogCollection,
};
