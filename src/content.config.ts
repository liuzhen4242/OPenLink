import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projectsCollection = defineCollection({
  loader: glob({
    // 匹配所有项目子目录下的 .md 文件
    pattern: ['*/*.md'],
    base: new URL('./content/projects/', import.meta.url),
  }),
  // ✨ 关键点：这里改成函数形式，引入 image 处理器
  schema: ({ image }) => z.object({
    title: z.string(),
    category: z.enum(['装配', '木构', '工厂', '展览', '室内','文旅','旧改','居住','商办','学校','规划']),
    
    // ✨ 把原本的 z.string() 改成 image()
    // 这样打包时，Astro 才会把它当成真实的图片文件去打包迁移，并自动修复空格路径问题
    coverImage: image().optional(),
    
    description: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
};