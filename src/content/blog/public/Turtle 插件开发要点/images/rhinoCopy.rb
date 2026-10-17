require 'sketchup.rb'
require 'tmpdir'

module RhinoBridge
  TMP_DIR = File.join(Dir.tmpdir, "su_rhino_bridge")

  def self.copy_to_rhino
    model = Sketchup.active_model
    sel = model.selection
    if sel.empty?
      UI.messagebox("请先选中物件")
      return
    end

    Dir.mkdir(TMP_DIR) unless Dir.exist?(TMP_DIR)
    # 清掉旧文件
    Dir.glob(File.join(TMP_DIR, "clip.*")).each { |f| File.delete(f) }

    single = sel.length == 1 ? sel.first : nil
    if single && single.respond_to?(:definition)
      # 单个组件/块：保存为 skp，Rhino 导入后保留为块
      path = File.join(TMP_DIR, "clip.skp")
      single.definition.save_as(path)
    else
      # 多个物件：导出为 dae
      path = File.join(TMP_DIR, "clip.dae")
      model.export(path, :selectionset_only => true)
    end
    Sketchup.status_text = "已复制到 Rhino 桥接缓存"
  end

  unless file_loaded?(__FILE__)
    UI.menu("Extensions").add_item("复制到 Rhino") { copy_to_rhino }
    file_loaded(__FILE__)
  end
end