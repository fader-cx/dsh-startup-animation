# 第三方来源与授权说明

本仓库是一个**移植与二次创作项目**：视觉与动画的灵感来自下列项目，本项目在把它搬到
DeepSeek Harness 的同时，做了移植、扩展与动画演出效果的升级。

为让授权信息保持准确可查，下文同时说明两件事：哪些素材是上游原文（用于判断再分发条件），
以及哪些部分是本仓库新增或改造的。

## 直接上游

- **[yanami-sec/codex-startup-animation-windows](https://github.com/yanami-sec/codex-startup-animation-windows)**
  —— 本项目动画的**灵感与基础实现来源**。其中 `animation.js`、`style.css`、`index.html`、
  `image-settings.js`、`assets/contours.js`、`assets/config.js` 以及示例图片素材，
  是**以上游原文形式**被本项目内嵌、并在构建时打包进 `lib/client.js`。
  该仓库的 README 明确说明：它未取得将上游代码重新授权为 MIT 等许可证的依据，
  **因此不添加此类许可证**；公开仓库不代表对上游代码或第三方商标授予额外权利。

## 该项目的上游

按其 README 记录，`yanami-sec/codex-startup-animation-windows` 基于：

- [panding999/codex-startup-animation](https://github.com/panding999/codex-startup-animation)
- [paperfish-bot/codex-startup-animation](https://github.com/paperfish-bot/codex-startup-animation)（Windows 分支）

## 本仓库新增与改造的部分

以下内容由本仓库编写，上游没有：

- `lib/index.js` —— 宿主侧：通过 `ctx.webServer.tapIndex` 向 index.html 注入深色 preboot
- `tools/client.template.js` —— 移植层：
  - iframe 覆盖层与事件桥（替代上游的 CDP 注入）
  - **常驻背景**、独立选图、应用壳层放行
  - **GIF / MP4 开场背景**（含视频层与动画同步）
  - **前半段 HUD 皮肤**：整幅角框、橙色环层、标题排式
  - 标题栏按钮配色、设置页 Codex→DSH 本地化、字幕字号
- `tools/build-client.py`、`tools/check-bundle.py` —— 构建与忠实度校验（含显式补丁表）
- `tools/install.ps1`、`tools/uninstall.ps1`、`tools/fetch-upstream.ps1`
- `preview.html`、`README.md`、`MODDING.md`、本文档

对上游 `animation.js` 的改动**仅有转场碎屑密度的两个常量**，记录在
`tools/build-client.py` 的 `PATCHES` 中，并可被 `tools/check-bundle.py` 核对。

## 授权结论

本仓库**不附加 MIT 等开源许可证**，理由与上游一致：仓库中包含来源未声明许可证的代码
（`lib/client.js` 是构建产物，内嵌了上游的 `animation.js` / `style.css` / `index.html` 等原文）。

- 你可以自由地**自用、修改、在本机安装**；
- 若要**再分发**（包括把本仓库作为依赖发布、或商用），请先联系上游作者取得许可；
- 本文档不构成任何授权，也不改变上游仓库的任何权利状态。

## 商标

“Codex”、“OpenAI” 等名称与标识归其各自所有者；“DeepSeek”、“DeepSeek Harness” 同理。
本项目的名称与描述仅用于说明兼容性，不表示任何官方关联或背书。
