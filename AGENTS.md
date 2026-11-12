# OpenLink 仓库协作规则

## 给文章添加图片和媒体

- `src/content/` 同时是 Obsidian vault。文章位于 `blog/` 和 `projects/`，附件统一位于 `src/content/attachment/<Markdown 文件名，不含扩展名>/`。使用文件名，不使用 frontmatter 的 `title`。
- 下载、生成、截图和拼图先输出到临时目录，然后运行下面的入库命令。禁止直接写入 `attachment/` 根目录；禁止把源媒体写到 `public/project-images/`（它是构建产物）。

  ```sh
  npm run attachments:add -- --note "src/content/blog/public/文章名.md" --file "临时图片路径.png"
  ```

- 使用命令返回的 `markdown` 链接插入文章；命令只复制附件、返回链接，不选择正文插入位置，也不删除输入文件。可以用 `--name "说明性文件名.png"` 指定附件名，扩展名必须与源格式相符。重复内容复用已有文件，同名不同内容增加后缀，绝不覆盖。
- 完成文章编辑后必须运行 `npm run attachments:check -- --note "文章路径.md"`。修复本次新增的问题，交付时报告仍存在的历史问题。检查含正文、封面、相册和 Obsidian 嵌入；不要把代码示例中的路径当成真实附件。
- 整理已有根目录散图时，先运行 `npm run attachments:fix -- --note "文章路径.md"` 查看计划，再加 `--apply` 执行。已有用户整理请求即为执行授权，不重复询问。修复仅处理该文章独占引用的根目录附件，多文章共用的文件报告后保留。其他目录中的历史路径错误应单独确认真实文件位置后修正，不能猜测。
- 未引用素材保留、列出，未经明确要求不删除。不要随手批量整理其他文章或修改 Obsidian 插件配置。
- 文章文件改名时，同步核对附件目录与所有引用；同名文章不能共用一个附件目录，应先解决命名冲突。
- 全库检查使用 `npm run attachments:check`。附件脚本不修改图片像素、不替代现有 `images:prepare` 压缩归档流程；开发及构建过程不自动搬运源附件。
