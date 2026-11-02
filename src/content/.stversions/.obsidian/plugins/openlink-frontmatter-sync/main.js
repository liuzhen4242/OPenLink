const { Notice, Plugin, TFile } = require("obsidian");

const ARTICLE_FOLDERS = ["blog/", "projects/"];
function isArticle(file) {
  return (
    file instanceof TFile &&
    file.extension === "md" &&
    ARTICLE_FOLDERS.some((folder) => file.path.startsWith(folder))
  );
}

function isEnglishName(name) {
  return /^[\p{Script=Latin}\p{N}\s._&+\-]+$/u.test(name);
}

function dateOnly(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function relativeVaultPath(fromDirectory, targetPath) {
  const from = fromDirectory ? fromDirectory.split("/").filter(Boolean) : [];
  const target = targetPath.split("/").filter(Boolean);
  while (from.length && target.length && from[0] === target[0]) {
    from.shift();
    target.shift();
  }
  return [...from.map(() => ".."), ...target].join("/");
}

class OpenLinkFrontmatterSync extends Plugin {
  async onload() {
    this.pending = new Map();
    this.ownWrites = new Set();

    this.registerEvent(
      this.app.vault.on("create", (file) => this.schedule(file, { created: true }, 700))
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => this.schedule(file, {}, 900))
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.schedule(file, { oldPath }, 300))
    );

    this.addCommand({
      id: "sync-current-article-frontmatter",
      name: "Sync current article frontmatter",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isArticle(file)) return false;
        if (!checking) this.sync(file, { force: true });
        return true;
      },
    });

    this.addCommand({
      id: "sync-all-article-frontmatter",
      name: "Sync all article frontmatter",
      callback: async () => {
        const articles = this.app.vault.getMarkdownFiles().filter(isArticle);
        for (const file of articles) await this.sync(file, { force: true });
        new Notice(`OpenLink: synced ${articles.length} article frontmatters.`);
      },
    });
  }

  schedule(file, options, delay) {
    if (!isArticle(file)) return;
    if (this.ownWrites.delete(file.path)) return;

    const existing = this.pending.get(file.path);
    if (existing) window.clearTimeout(existing.timer);

    const timer = window.setTimeout(() => {
      this.pending.delete(file.path);
      this.sync(file, options);
    }, delay);
    this.pending.set(file.path, { timer });
  }

  async sync(file, options = {}) {
    if (!isArticle(file)) return;

    const title = file.basename;
    const english = isEnglishName(title);
    const today = dateOnly(Date.now());
    const creationDate = dateOnly(file.stat.ctime);
    const oldTitle = options.oldPath ? options.oldPath.split("/").pop().replace(/\.md$/i, "") : undefined;
    let changed = false;

    this.ownWrites.add(file.path);
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const field of ["coverImage", "coverMedia"]) {
          const value = frontmatter[field];
          if (typeof value !== "string") continue;
          const match = value.trim().match(/^!?\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
          const markdownImage = value.trim().match(/^!\[[^\]]*\]\((.*)\)$/);
          const rawPath = markdownImage?.[1]?.trim() || match?.[1]?.trim();
          if (!rawPath) continue;
          let converted = rawPath;
          const target = this.app.metadataCache.getFirstLinkpathDest(rawPath, file.path);
          if (target) converted = relativeVaultPath(file.parent?.path || "", target.path);
          try {
            converted = decodeURIComponent(converted);
          } catch {
            // Keep the original path when a filename contains an invalid escape.
          }
          if (converted !== value) {
            frontmatter[field] = converted;
            changed = true;
          }
        }

        if (!frontmatter.date) {
          frontmatter.date = creationDate;
          changed = true;
        }

        if (!frontmatter.author) {
          frontmatter.author = "zhenliu";
          changed = true;
        }

        if (!Array.isArray(frontmatter.category) || frontmatter.category.length === 0) {
          frontmatter.category = ["未分类"];
          changed = true;
        }

        if (!frontmatter.status) {
          frontmatter.status = "public";
          changed = true;
        }

        if (english) {
          if (!frontmatter.titleEn || frontmatter.titleEn === oldTitle) {
            frontmatter.titleEn = title;
            changed = true;
          }
          if (frontmatter.title === oldTitle) {
            delete frontmatter.title;
            changed = true;
          }
        } else {
          if (!frontmatter.title || frontmatter.title === oldTitle) {
            frontmatter.title = title;
            changed = true;
          }
          if (frontmatter.titleEn === oldTitle) {
            delete frontmatter.titleEn;
            changed = true;
          }
        }

        if (options.created || options.force || frontmatter.update !== today) {
          frontmatter.update = today;
          changed = true;
        }
      });
    } finally {
      window.setTimeout(() => this.ownWrites.delete(file.path), 1500);
    }

    return changed;
  }
}

module.exports = OpenLinkFrontmatterSync;
