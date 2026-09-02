import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({
    // 匹配 blog 目录下所有 .md 文件（不含子目录嵌套，保持扁平）
    pattern: ['*.md'],
    base: new URL('./content/blog/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(),
    // blog 分类：任意字符串数组（不限制枚举，方便自由打标签）
    category: z.array(z.string()),
    description: z.string().optional(),
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
    title: z.string(),

    // 改为数组，支持多个分类
    category: z.array(
      z.enum(['装配', '木构', '工厂', '展览', '室内', '文旅', '旧改', '居住', '商办', '学校', '规划'])
    ),

    // ✨ 把原本的 z.string() 改成 image()
    // 这样打包时，Astro 才会把它当成真实的图片文件去打包迁移，并自动修复空格路径问题
    coverImage: image().optional(),

    description: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
  blog: blogCollection,
};
