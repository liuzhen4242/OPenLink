const { Plugin, MarkdownRenderChild } = require('obsidian');
const PhotoSwipe = require('photoswipe').default;
const { parseGallery, extractImageUrls, LIMITS } = require('../../src/lib/gallery-core.cjs');

class GalleryView extends MarkdownRenderChild {
  constructor(el, plugin, source, sourcePath) {
    super(el);
    Object.assign(this, { plugin, source, sourcePath });
    this.urls = [];
    this.disposed = false;
  }
  async onload() {
    const { title, mode, intervalMs } = parseGallery(this.source);
    const paths = extractImageUrls(this.source);
    if (!paths.length) { this.containerEl.createEl('p', { text: '相册中还没有图片。' }); return; }
    this.containerEl.addClass('gallery-preview');
    const frame = this.containerEl.createDiv({ cls: `gallery-frame ${mode === 'play' ? 'gallery-slider' : `gallery-wall gallery-${mode}`} ${title ? 'has-title' : ''}` });
    frame.dataset.count = String(paths.length);
    if (title) frame.createDiv({ cls: 'gallery-title', text: title });
    const canvas = mode === 'play' ? frame : frame.createDiv({ cls: 'gallery-canvas' });
    const images = [];
    const limit = LIMITS[mode] || paths.length;
    this.slides = [];
    for (let i = 0; i < paths.length; i++) {
      const parent = mode === 'play' ? canvas : canvas.createEl('figure', { cls: `gallery-item${i >= limit ? ' gallery-overflow' : ''}` });
      const img = parent.createEl('img', { attr: { alt: `照片 ${i + 1}` } });
      images.push(img);
      if (mode === 'play' && i === 0) img.addClass('is-active');
      const slide = { src: '', width: 1600, height: 900, alt: `照片 ${i + 1}` };
      this.slides.push(slide);
      this.registerDomEvent(img, 'load', () => { slide.width = img.naturalWidth; slide.height = img.naturalHeight; });
      const open = () => {
        if (!slide.src) return;
        this.lightbox?.destroy();
        this.lightbox = new PhotoSwipe({ dataSource: this.slides, index: i, showHideAnimationType: 'none', mainClass: 'gallery-preview-lightbox' });
        this.lightbox.init();
      };
      const trigger = mode === 'play' ? img : parent;
      trigger.tabIndex = mode === 'play' && i > 0 ? -1 : 0;
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-label', `放大照片 ${i + 1}`);
      this.registerDomEvent(trigger, 'click', open);
      this.registerDomEvent(trigger, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      if (i === Math.min(paths.length, limit) - 1 && paths.length > limit) parent.createSpan({ cls: 'gallery-more', text: `+${paths.length - limit}` });
    }
    await Promise.all(paths.map(async (raw, i) => {
      try {
        const src = await this.resolve(raw);
        if (!this.disposed) { this.slides[i].src = src; images[i].src = src; }
      } catch (error) {
        if (!this.disposed) images[i].alt = `无法读取：${raw}`;
        console.warn('[Gallery Preview]', raw, error);
      }
    }));
    if (this.disposed) return;
    let index = 0;
    if (mode === 'play' && images.length > 1) this.registerInterval(window.setInterval(() => {
      if (!frame.isConnected || this.lightbox?.isOpen || !frame.getClientRects().length) return;
      const next = (index + 1) % images.length;
      if (!images[next].complete || !images[next].naturalWidth) return;
      images[index].removeClass('is-active'); images[index].tabIndex = -1;
      images[next].addClass('is-active'); images[next].tabIndex = 0;
      index = next;
    }, intervalMs));
  }
  async resolve(raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    let link = raw;
    try { link = decodeURIComponent(raw); } catch {}
    const { app } = this.plugin;
    const file = app.metadataCache.getFirstLinkpathDest(link, this.sourcePath);
    if (!file) throw new Error('找不到附件');
    if (/\.(heic|heif|tiff?)$/i.test(file.path)) {
      const path = require('node:path');
      const sharp = require(path.join(app.vault.adapter.getBasePath(), '..', '..', 'node_modules', 'sharp'));
      const bytes = await app.vault.readBinary(file);
      const jpeg = await sharp(Buffer.from(bytes)).rotate().resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      if (this.disposed) return '';
      const url = URL.createObjectURL(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }));
      this.urls.push(url);
      return url;
    }
    return app.vault.getResourcePath(file);
  }
  onunload() {
    this.disposed = true;
    this.lightbox?.destroy();
    this.urls.forEach(url => URL.revokeObjectURL(url));
  }
}
module.exports = class GalleryPreview extends Plugin {
  onload() {
    this.registerMarkdownCodeBlockProcessor('gallery', (source, el, ctx) => {
      ctx.addChild(new GalleryView(el, this, source, ctx.sourcePath));
    });
  }
};
