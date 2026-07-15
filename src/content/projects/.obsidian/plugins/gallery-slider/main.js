const { Plugin } = require("obsidian");

module.exports = class GallerySliderPlugin extends Plugin {

  onload() {
    console.log("Gallery Slider loaded");

    this.registerMarkdownCodeBlockProcessor(
      "gallery",
      (source, el, ctx) => {
        const plugin = this;

        console.log("SOURCE:");
        console.log(source);

        const imgs = [...source.matchAll(/!\[\]\((.*?)\)/g)].map(
          (m) => decodeURIComponent(m[1])
        );

        console.log("Gallery images:", imgs);

        if (imgs.length === 0) {
          el.createEl("p", { text: "No gallery images" });
          return;
        }

        const wrapper = el.createDiv({ cls: "gallery-slider" });
        const img = wrapper.createEl("img");

        let index = 0;
        let playing = true;

        function resolveSrc(linkpath) {
          // 远程图片：直接使用
          if (/^https?:\/\//i.test(linkpath)) {
            return linkpath;
          }

          // 本地图片：按当前笔记所在路径解析相对路径
          const file = plugin.app.metadataCache.getFirstLinkpathDest(
            linkpath,
            ctx.sourcePath
          );

          if (file) {
            return plugin.app.vault.getResourcePath(file);
          }

          console.log(
            "File not found:",
            linkpath,
            "sourcePath:",
            ctx.sourcePath
          );
          return null;
        }

        function update() {
          console.log("Loading:", imgs[index]);
          const src = resolveSrc(imgs[index]);
          if (src) {
            img.src = src;
          }
        }

        update();

        const timer = window.setInterval(() => {
          if (!playing) return;
          index++;
          if (index >= imgs.length) index = 0;
          update();
        }, 1000);//单位是毫秒（2000 = 2 秒）

        // 代码块销毁时清理定时器，避免多个实例互相干扰
        this.register(() => window.clearInterval(timer));

        img.addEventListener("mouseenter", () => {
          playing = false;
        });

        img.addEventListener("mouseleave", () => {
          playing = true;
        });

        img.addEventListener("click", () => {
          playing = !playing;
        });
      }
    );
  }
};