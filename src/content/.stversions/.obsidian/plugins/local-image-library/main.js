const { Plugin, PluginSettingTab, Setting, Notice, TFile } = require('obsidian');
const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const IMAGE = /\.(jpe?g|png|webp|avif|heic|heif|tiff?|gif|svg)$/i;

module.exports = class LocalImageLibrary extends Plugin {
  async onload() {
    this.settings = { automatic: true, nodePath: '', ...await this.loadData() };
    this.timers = new Map();
    this.localImports = new Map();
    this.queue = Promise.resolve();
    this.stopped = false;
    this.addSettingTab(new ImageSettings(this.app, this));
    this.addCommand({
      id: 'process-attachments',
      name: '归档原图并整理全部附件',
      callback: () => this.enqueue(),
    });
    // Register after initial vault discovery; opening Obsidian must not trigger
    // a destructive bulk migration of old attachments.
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      // Watch the local editor gesture as well as file events. NAS arriving
      // images are not new local imports: their receipt can arrive later than
      // the image, and recompressing in that interval would lose quality.
      for (const event of ['editor-paste', 'editor-drop']) {
        this.registerEvent(this.app.workspace.on(event, (event) => this.captureImport(event)));
      }
      for (const event of ['create', 'modify', 'rename']) {
        this.registerEvent(this.app.vault.on(event, (file) => this.schedule(file)));
      }
    });
  }

  async captureImport(event) {
    if (!this.settings.automatic) return;
    try {
      const files = event.clipboardData?.files || event.dataTransfer?.files || [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') && !IMAGE.test(file.name)) continue;
        const hash = createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
        this.localImports.set(hash, Date.now());
      }
      for (const [hash, timestamp] of this.localImports) {
        if (Date.now() - timestamp > 120000) this.localImports.delete(hash);
      }
    } catch (error) {
      console.error('[Local Image Library] Unable to inspect imported file:', error);
      new Notice('本次图片未自动整理，可使用“归档原图并整理全部附件”命令补处理。');
    }
  }

  onunload() {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.child?.kill();
  }

  schedule(file) {
    if (!this.settings.automatic || !(file instanceof TFile) || !file.path.startsWith('attachment/') || !IMAGE.test(file.path)) return;
    const relative = file.path;
    clearTimeout(this.timers.get(relative));
    // Give Obsidian's attachment-location plugin and NAS transfers time to finish.
    this.timers.set(relative, setTimeout(() => {
      this.timers.delete(relative);
      this.enqueue(relative, true);
    }, 5000));
  }

  enqueue(relative, automatic = false) {
    this.queue = this.queue.then(async () => {
      if (this.stopped) return;
      if (relative && !this.app.vault.getAbstractFileByPath(relative)) return;
      if (automatic) {
        if (!this.localImports.size) return;
        const bytes = await this.app.vault.readBinary(this.app.vault.getAbstractFileByPath(relative));
        const hash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
        const timestamp = this.localImports.get(hash);
        if (!timestamp || Date.now() - timestamp > 120000) return;
      }
      if (!relative) new Notice('开始整理图片。原图核对保存后才会替换附件。');
      const results = await this.execute(relative);
      const errors = results.filter((item) => item.status === 'error');
      const changed = results.filter((item) => item.status === 'compressed');
      if (errors.length) {
        console.error('[Local Image Library]', errors);
        new Notice(`图片整理有 ${errors.length} 项未完成；原图保留。${errors[0].error}`, 12000);
      } else if (changed.length || !relative) {
        const saved = changed.reduce((sum, item) => sum + item.before - item.after, 0);
        new Notice(`图片整理完成：压缩 ${changed.length} 张，节省 ${(saved / 1048576).toFixed(1)} MB。原图在 _originals/。`, 6000);
      }
    }).catch((error) => {
      console.error('[Local Image Library]', error);
      new Notice(`图片未处理，附件保持可用：${error.message}`, 12000);
    });
  }

  async execute(relative) {
    const vaultRoot = this.app.vault.adapter.getBasePath?.();
    if (!vaultRoot) throw new Error('只支持本机桌面文件库。');
    const root = path.resolve(vaultRoot, '../..');
    const script = path.join(root, 'scripts/image-library.cjs');
    if (!fs.existsSync(script)) throw new Error('请把插件用于网站的 src/content 文件库，并通过 Git 同步 scripts/image-library.cjs。');
    const args = [script, '--apply', '--json'];
    if (relative) args.push('--file', relative);
    const candidates = this.settings.nodePath ? [this.settings.nodePath] : [
      'node', '/usr/local/bin/node', '/opt/homebrew/bin/node',
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
    ];
    for (const executable of [...new Set(candidates)]) {
      try {
        return await new Promise((resolve, reject) => {
          this.child = execFile(executable, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
            this.child = null;
            // Exit 1 can still contain a per-file report; retain the details.
            try { if (stdout.trim()) { resolve(JSON.parse(stdout)); return; } } catch {}
            if (error) { error.message = stderr.trim() || error.message; reject(error); }
            else reject(new Error('图片处理程序没有返回结果。'));
          });
        });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    throw new Error('找不到 Node.js。请安装项目要求的 Node，在插件设置填写 node/node.exe 的完整路径，并在网站目录运行 npm ci。');
  }
};

class ImageSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('自动整理新图片').setDesc('本机编辑器粘贴/拖入图片后等待 5 秒处理；NAS 同步到达的文件不触发压缩。直接复制到附件目录的图片可用命令补整理。').addToggle((toggle) => toggle.setValue(this.plugin.settings.automatic).onChange(async (value) => {
      this.plugin.settings.automatic = value;
      await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(containerEl).setName('Node.js 路径').setDesc('通常留空即可。Mac 可填 /usr/local/bin/node；Windows 可填 C:\\Program Files\\nodejs\\node.exe。此设置按电脑分别保存。').addText((input) => input.setValue(this.plugin.settings.nodePath).onChange(async (value) => {
      this.plugin.settings.nodePath = value.trim();
      await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(containerEl).setName('图片质量').setDesc('长边最多 2560 像素；JPEG/WebP 质量 85，PNG 无损编码并保留透明度。GIF/SVG 和动画保持原样。原图存放于 _originals/，不进入 Git。');
  }
}
