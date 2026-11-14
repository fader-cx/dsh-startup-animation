# 第三方来源与授权说明

本仓库是一个**移植项目**，不是原创动画。它把下列项目的成果接到 DeepSeek Harness 上。

## 直接上游

- **[yanami-sec/codex-startup-animation-windows](https://github.com/yanami-sec/codex-startup-animation-windows)**
  —— 本项目动画的**全部视觉与逻辑来源**：`animation.js`、`style.css`、`index.html`、
  `image-settings.js`、`assets/contours.js`、`assets/config.js` 以及示例图片素材。
  该仓库的 README 明确说明：它未取得将上游代码重新授权为 MIT 等许可证的依据，
  **因此不添加此类许可证**；公开仓库不代表对上游代码或第三方商标授予额外权利。

## 该项目的上游

按其 README 记录，`yanami-sec/codex-startup-animation-windows` 基于：

- [panding999/codex-startup-animation](https://github.com/panding999/codex-startup-animation)
- [paperfish-bot/codex-startup-animation](https://github.com/paperfish-bot/codex-startup-animation)（Windows 分支）

## 本仓库自己的部分

以下文件由本仓库编写，与上述上游无关：

- `lib/index.js`（宿主侧：index.html 的 preboot 注入）
- `tools/client.template.js`（覆盖层、常驻背景、动图/视频支持、前半段皮肤、设置页本地化）
- `tools/build-client.py`、`tools/check-bundle.py`
- `tools/install.ps1`、`tools/uninstall.ps1`、`tools/fetch-upstream.ps1`
- `README.md`、`MODDING.md`、本文档

## 授权结论

本仓库**不附加 MIT 等开源许可证**，理由与上游一致：仓库中包含来源未声明许可证的代码
（`lib/client.js` 是构建产物，内嵌了上游的 `animation.js` / `style.css` / `index.html` 等原文）。

- 你可以自由地**自用、修改、在本机安装**；
- 若要**再分发**（包括把本仓库作为依赖发布、或商用），请先联系上游作者取得许可；
- 本文档不构成任何授权，也不改变上游仓库的任何权利状态。

## 商标

“Codex”、“OpenAI” 等名称与标识归其各自所有者；“DeepSeek”、“DeepSeek Harness” 同理。
本项目的名称与描述仅用于说明兼容性，不表示任何官方关联或背书。
