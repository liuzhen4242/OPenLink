import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects collection — content authored in Obsidian.
 * The Obsidian vault root is src/content/projects/, so Obsidian
 * system files (Welcome.md, .obsidian/) live alongside project folders.
 *
 * Content structure (one project per subdirectory):
 *   src/content/projects/
 *     Xinjiang-museum/
 *       Xinjiang-museum.md      ← the entry file
 *       images/
 *         Pasted image ....png  ← referenced in frontmatter + body
 */
const projectsCollection = defineCollection({
  loader: glob({
    // Only match .md files inside project subdirectories
    pattern: ['*/*.md'],
    base: new URL('./content/projects/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['装配', '木构', '工厂', '展览', '室内']),
    coverImage: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
};