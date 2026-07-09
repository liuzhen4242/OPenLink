import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects collection — content authored in Obsidian and symlinked into
 * src/content/projects/Projects/. The glob loader with an absolute base URL
 * handles symlink resolution reliably across platforms.
 *
 * Content structure (one project per subdirectory):
 *   src/content/projects/Projects/
 *     Xinjiang-museum/
 *       Xinjiang-museum.md      ← the entry file
 *       images/
 *         Pasted image ....png  ← referenced in frontmatter + body
 *
 * We use z.string() for coverImage (rather than the image() helper) because
 * Astro's static image optimisation pipeline cannot follow symlinks into
 * external vaults at build time. Image resolution is handled at runtime via
 * the /@fs/ Vite file-server path.
 */
const projectsCollection = defineCollection({
  loader: glob({
    // Match any .md file inside the symlinked Projects directory.
    // import.meta.url points to this file (src/content.config.ts),
    // so the relative path to the projects directory is ./content/projects/.
    pattern: ['**/*.md', '**/**/*.md'],
    base: new URL('./content/projects/', import.meta.url),
  }),
  schema: z.object({
    title: z.string(),
    // Five canonical categories — Obsidian frontmatter must match exactly
    category: z.enum(['装配', '木构', '工厂', '展览', '室内']),
    // Relative path to cover image, e.g. "./images/cover.jpg"
    coverImage: z.string().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
  }),
});

export const collections = {
  projects: projectsCollection,
};
