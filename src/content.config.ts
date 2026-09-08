import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({
    // 匹配 blog 目录下所有 .md 文件（不含子目录嵌套，保持扁平）
    pattern: ['*.md'],
    base: new URL('./content/blog/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(), // 英文标题，用于 slug、SEO、副标题显示
    name: z.string(), // 中文标题，页面上大标题显示用
    // blog 分类：任意字符串数组（不限制枚举，方便自由打标签）
    category: z.array(z.string()),
    description: z.string().optional(),
    // 可见状态：public=公开；private=私密（线上列表隐藏，独立页走 /blog/private/ 密码路径）；
    // hidden=彻底隐藏（线上不生成页面、网上不可见，仅本地 dev 可见）
    status: z.enum(['public', 'private', 'hidden', 'draft']).optional().default('public'),
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
  }),
});

export const collections = {
  projects: projectsCollection,
  blog: blogCollection,
};
