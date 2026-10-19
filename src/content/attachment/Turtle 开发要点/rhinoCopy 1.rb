require 'sketchup.rb'
require 'fileutils'

module RhinoBridge
  DIR  = File.join(Dir.home, "su_rhino_bridge")
  FILE = File.join(DIR, "clip.skp")
  META = File.join(DIR, "clip.txt")

  SHOW_POPUP   = false  # 想要复制成功后弹窗确认就改成 true
  SAVE_VERSION = nil    # Rhino 读不了时改成 Sketchup::Model::VERSION_2021 之类

  class PickBaseTool
    def initialize
      @ip = Sketchup::InputPoint.new
    end

    def activate
      Sketchup.status_text = "点击基点（Rhino 中将以此点粘贴），Esc 取消"
    end

    def onMouseMove(flags, x, y, view)
      @ip.pick(view, x, y)
      view.tooltip = @ip.tooltip
      view.invalidate
    end

    def onLButtonDown(flags, x, y, view)
      @ip.pick(view, x, y)
      return unless @ip.valid?
      base = @ip.position.clone
      Sketchup.active_model.select_tool(nil)
      RhinoBridge.export(base)
    end

    def draw(view)
      @ip.draw(view) if @ip.valid?
    end

    def onCancel(reason, view)
      Sketchup.active_model.select_tool(nil)
    end
  end

  def self.start
    if Sketchup.active_model.selection.empty?
      UI.messagebox("请先选中要复制的物件")
      return
    end
    Sketchup.active_model.select_tool(PickBaseTool.new)
  end

  def self.export(base_world)
    model = Sketchup.active_model
    sel   = model.selection.to_a
    FileUtils.mkdir_p(DIR)
    File.delete(FILE) if File.exist?(FILE)
    File.delete(META) if File.exist?(META)

    # 编辑组内部时，把世界坐标换算成局部坐标
    base  = base_world.transform(model.edit_transform.inverse)
    error = nil

    # 记录：选中物件包围盒最小角相对基点的偏移，以及包围盒对角线长度（单位：英寸）
    bb = Geom::BoundingBox.new
    sel.each { |e| bb.add(e.bounds) }
    off = bb.min - base
    File.write(META, "#{off.x.to_f} #{off.y.to_f} #{off.z.to_f} #{bb.diagonal.to_f}")

    model.start_operation("Copy to Rhino", true)
    begin
      grp  = model.active_entities.add_group(sel)
      move = Geom::Transformation.translation(
        Geom::Vector3d.new(-base.x, -base.y, -base.z))
      grp.entities.transform_entities(move, grp.entities.to_a)

      defn = grp.definition
      SAVE_VERSION ? defn.save_as(FILE, SAVE_VERSION) : defn.save_as(FILE)
    rescue => e
      error = e.message
    ensure
      model.abort_operation   # 撤销临时分组，模型保持原样
    end

    if File.exist?(FILE)
      msg = "已复制 #{sel.length} 个物件（#{File.size(FILE) / 1024} KB），请到 Rhino 运行 PS"
      Sketchup.status_text = msg
      UI.messagebox(msg) if SHOW_POPUP
    else
      UI.messagebox("复制失败：#{error || '文件没有生成'}\n路径：#{FILE}")
    end
  end

  unless file_loaded?(__FILE__)
    UI.menu("Extensions").add_item("复制到 Rhino") { start }
    file_loaded(__FILE__)
  end
end