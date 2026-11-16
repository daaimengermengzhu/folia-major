# Folia DualScreen · 双屏社区版

基于 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的非官方 Windows 双屏衍生版。
为“主屏工作，副屏看歌词”的使用场景维护；上游作者及贡献者拥有原项目的全部署名。

简体中文 · [English](README.en.md) · [原版功能介绍](README.upstream.md)

## 它解决什么

- 主屏出现最大化或全屏窗口时，歌词壁纸自动移到最近的副屏；主屏空闲后返回。
- 普通大小的窗口不会触发换屏；目标稳定约 2–3 秒才移动，减少来回跳动。
- Windows 换屏移动同一个播放窗口，不为换屏重新加载页面或音频。
- 支持横屏与竖屏之间的尺寸适配，保留手动选屏。
- 自动避让默认关闭，由用户在桌面设置、托盘菜单或命令面板中开启。

这里只根据窗口几何判断遮挡，不读取工作窗口的标题或内容，不截屏。

## 当前状态与下载

**当前是源码预览版 `0.7.28-dualscreen.1`，尚未发布可供普通用户安装的社区安装包。**
原 PR [#1241](https://github.com/chthollyphile/folia-major/pull/1241) 因功能不在上游规划内关闭，
不代表上游官方提供或支持此版本。请将双屏衍生版的问题反馈到本仓库，不要要求上游维护者处理。

本分支在原 PR 的基础上处理了三条审查建议：

1. 将显示器切换、请求排队及导出等待逻辑移到独立协调模块。
2. 辅助进程尚未就绪时保留最新选屏请求，完成挂载后重新应用。
3. 原生恢复挂载与换屏共用串行保护；恢复尺寸同步完成后才允许后续换屏。

验证记录、已知限制及维护方式见 [社区版说明](docs/dualscreen-community.md)。

## 从源码运行（Windows）

需要 Node.js 24+、npm，以及带 MSVC 工具链的 Rust/Cargo。

```powershell
git clone --branch community/windows-dual-display https://github.com/daaimengermengzhu/folia-major.git
cd folia-major
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run build:wallpaper-helper
npm run dev:electron
```

社区版使用独立应用标识和名称 **Folia DualScreen**。默认不复用原版的账号、密钥、歌单或设置；
不要把原版个人配置提交到仓库，也不要将整个旧配置目录直接覆盖过来。

当前预览版关闭应用内自动更新，避免被上游安装包覆盖。更新源码时请先保留自己的改动，
再检查本社区分支的变更；未来社区安装包和更新渠道会单独说明。

## 给类似需求的朋友

适合 Windows 双屏或多屏，尤其是主屏横向、副屏竖向的歌词壁纸使用者。
单屏可以正常使用播放器，自动避让功能需要至少两块显示器。

仍保留原版的音乐平台和歌词功能；音乐账号及内容权限由相应平台决定，
本项目不提供歌曲、会员或第三方账号。

## 来源与许可

原项目：[Folia](https://github.com/chthollyphile/folia-major)，作者 chthollyphile 及其贡献者。
保留 [贡献者名单](CONTRIBUTORS.md)、[AGPL-3.0 许可证](LICENSE) 及源码内的第三方来源声明。
衍生改动同样按 AGPL-3.0 提供，分享构建时应同时提供匹配版本的完整源码和构建说明。
音乐、歌词、封面等内容的权利仍属于各自权利人，保留原版的相关声明。

这是个人与社区维护的衍生项目，没有代表原作者发布，也未承诺固定更新频率。
