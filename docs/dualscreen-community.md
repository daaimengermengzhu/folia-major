# 双屏社区版维护记录

日期：2026-11-16。版本：0.7.28-dualscreen.1（源码预览）。

## 基点与边界

- 上游基点：618cbfe6b4e89f6ecdf393fab4237212a3a57bd1。
- 双屏功能基点：f6aef8b4f93507dfb43e5ca7626f1c61dea6eaee，原 PR #1241。
- 仅维护 Windows 双屏壁纸避让、连续换屏与布局适配；不包含个人桌面、BitDock、账号及密钥。
- 本次没有替换用户当前安装版。当前预览也不宣称修复所有启动恢复或在线平台问题。

## 三条审查建议

1. 显示器/导出协调：`electron/wallpaper/displayCoordinator.cjs` 注入窗口、显示器及导出操作；
   主入口只负责接线，单测直接调用协调器，不再截取主入口源码执行状态机。
2. 未就绪时选屏：保存最新有效请求，在辅助进程报告挂载后重试；新选择和取消会淘汰旧请求。
3. 恢复与换屏竞态：`native_write.rs` 串行化原生恢复及移动；恢复几何使用同步、可核对结果的
   位置写入，避免已确认移动后仍被旧的异步尺寸请求覆盖。

## 验证

本次检查（2026-11-16）：

- 相关 12 个 Electron 单测文件共 182 项通过；Windows Rust 单测 18 项通过。
- Windows release helper 编译通过；typecheck、Dedicatus 与 ESLint 没有新增问题。
- 工作流 YAML 解析、社区构建标识及 `git diff --check` 通过。
- `node test/manual/dualscreenSmoke.mjs` 在隔离 profile、隐藏窗口中启动真实 Electron：
  名称 Folia DualScreen、UPDATE_CHANNEL=internal、全新配置壁纸模式关闭、设置及显示器 IPC 正常。
  这不是原生双屏移动或录制导出的视觉验收。
- app-builder-lib 生成的 productFilename 为 Folia DualScreen，packageName 为 folia-dualscreen，
  应用 ID 为 io.github.daaimengermengzhu.folia.dualscreen，与原版安装及卸载数据路径分离。
- 独立审查两轮；第一轮发现的构建名称冲突与恢复就绪状态问题已修复，第二轮未发现新的中高问题。
- 尚未完成本轮真实双屏/Explorer 恢复及录制导出验收，不把单测通过等同于这些场景通过。

## 已知限制

- 主屏被占用的判定针对最大化/全屏，不分析窗口内容；多副屏选择中心距离最近的一块。
- 当前实机来自 Windows 11 双屏环境；Windows 10、不同实际 DPI 组合和其他 GPU 尚无完整验收。
- 普通工作窗口不触发避让；开关关闭时保留手动选屏。
- 系统桌面宿主被销毁且连带销毁播放窗口时，仍可能需要原版的窗口重建恢复路径。
  连续播放保证针对窗口存活时的换屏，不是对所有系统故障的不断音承诺。

## 更新与发布

保留上游版本历史与来源。需要跟进上游时先评估差异，再单独合入并验证，不自动合并到发布版。
当前应用内更新被固定为 internal，发布地址指向本 fork；原版发布/容器/自动分类工作流在 fork
中被仓库条件隔离。不要通过修改上游 Realeco/Limo/Cielo 通道发布本社区版。

未来安装包发布前应验证：独立配置目录、主副屏往返、暂停/切歌、横竖屏、显示器断开重连、
辅助进程恢复、录制导出、卸载数据目录，以及二进制与源码版本一致。
