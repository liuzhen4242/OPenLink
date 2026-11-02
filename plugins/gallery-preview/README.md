# Gallery Preview

桌面版 Obsidian 插件。使用网站相同的 `src/lib/gallery-core.cjs` 和
`src/styles/gallery.css`，支持 `gallery` 的五种模式、可选标题、轮播速度、
照片数量自适应、`+N` 和 PhotoSwipe 灯箱。

运行 `npm run build:gallery-preview`，生成文件位于
`src/content/.obsidian/plugins/gallery-preview/`。修改共用规则或样式后重新运行此命令。

在 Obsidian 设置 → 第三方插件中启用 **Gallery Preview**。已经打开仓库时，
需要刷新插件列表或重新启动 Obsidian，再启用插件。
阅读视图和实时预览会渲染相册；实时预览中编辑代码块时显示源码，离开后恢复预览。
源码模式始终显示 Markdown。插件无需 dev 服务。

本地图片通过 Obsidian 的附件解析接口读取。HEIC/HEIF/TIFF 的桌面回退使用仓库
项目中的 sharp，转换结果只保留在内存，不修改原图；正常 JPG/PNG/WebP 不依赖此步骤。
原图已损坏或 sharp 不支持的格式会显示读取失败的替代文字。

只注册 `gallery`，不再支持第二个代码块名称。
