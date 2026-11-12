const { Modal, Notice, Plugin, Setting, TFile, normalizePath } = require("obsidian");

const ARTICLE_FOLDERS = ["blog/", "projects/"];
const NEW_ARTICLE_TARGETS = [
  { id: "public-blog", name: "New public blog article", folder: "blog/public", status: "public" },
  { id: "private-blog", name: "New private blog article", folder: "blog/private", status: "private" },
  { id: "software-blog", name: "New software blog article", folder: "blog/softDevelop", status: "public" },
  { id: "project", name: "New project article", folder: "projects" },
];

function isArticle(file) {
  return (
    file instanceof TFile &&
    file.extension === "md" &&
    ARTICLE_FOLDERS.some((folder) => file.path.startsWith(folder))
  );
}

function isBlogArticle(file) {
  return file.path.startsWith("blog/");
}

function defaultStatusForPath(path) {
  if (path.startsWith("blog/private/")) return "private";
  if (path.startsWith("blog/draft/")) return "draft";
  return "public";
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

class NewArticleModal extends Modal {
  constructor(app, target, onSubmit) {
    super(app);
    this.target = target;
    this.onSubmit = onSubmit;
    this.value = "";
  }

  onOpen() {
    this.titleEl.setText(this.target.name);
    this.contentEl.createEl("p", {
      text: `The note will be created in ${this.target.folder}/.`,
      cls: "setting-item-description",
    });

    let textComponent;
    new Setting(this.contentEl)
      .setName("Article file name")
      .setDesc("The file name is also used as the automatic Chinese or English title.")
      .addText((text) => {
        textComponent = text;
        text.setPlaceholder("Article title").onChange((value) => {
          this.value = value;
        });
      });

    new Setting(this.contentEl)
      .addButton((button) =>
        button.setButtonText("Create").setCta().onClick(() => this.submit())
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));

    this.scope.register([], "Enter", (event) => {
      event.preventDefault();
      this.submit();
    });
    window.setTimeout(() => textComponent?.inputEl.focus(), 0);
  }

  async submit() {
    const value = this.value.trim().replace(/\.md$/i, "");
    if (!value) {
      new Notice("OpenLink: enter an article file name.");
      return;
    }
    if (value === "." || value === ".." || /[\\/:*?"<>|]/u.test(value)) {
      new Notice("OpenLink: the file name contains an invalid character.");
      return;
    }

    this.close();
    await this.onSubmit(value);
  }

  onClose() {
    this.contentEl.empty();
  }
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

    for (const target of NEW_ARTICLE_TARGETS) {
      this.addCommand({
        id: `new-${target.id}-article`,
        name: target.name,
        callback: () => {
          new NewArticleModal(this.app, target, (fileName) =>
            this.createArticle(target, fileName)
          ).open();
        },
      });
    }
  }

  async createArticle(target, fileName) {
    const path = normalizePath(`${target.folder}/${fileName}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`OpenLink: ${path} already exists.`);
      return;
    }

    if (!this.app.vault.getAbstractFileByPath(target.folder)) {
      await this.app.vault.createFolder(target.folder);
    }

    const file = await this.app.vault.create(path, "");
    await this.sync(file, {
      created: true,
      force: true,
      defaultStatus: target.status,
    });
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`OpenLink: created ${path}.`);
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
          if (options.created && !("titleEn" in frontmatter)) {
            frontmatter.titleEn = "";
            changed = true;
          }
          if (frontmatter.titleEn === oldTitle) {
            delete frontmatter.titleEn;
            changed = true;
          }
        }

        if (!frontmatter.date) {
          frontmatter.date = creationDate;
          changed = true;
        }

        if (options.created && !("description" in frontmatter)) {
          frontmatter.description = "";
          changed = true;
        }

        if (isBlogArticle(file) && !frontmatter.author) {
          frontmatter.author = ["zhenliu"];
          changed = true;
        }

        if (!Array.isArray(frontmatter.category) || frontmatter.category.length === 0) {
          frontmatter.category = ["未分类"];
          changed = true;
        }

        if (isBlogArticle(file) && !frontmatter.status) {
          frontmatter.status = options.defaultStatus || defaultStatusForPath(file.path);
          changed = true;
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
