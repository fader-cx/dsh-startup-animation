# 改动画：代码地图

三层结构，改之前先确认你要动的是哪一层——动错层会被构建覆盖。

| 层 | 位置 | 作用 |
|---|---|---|
| **上游原项目** | `..\codex-startup-animation-windows\` | 动画本体：时间轴、绘制、版式、设置页 |
| **移植层** | `tools\client.template.js`、`lib\index.js` | iframe 覆盖层、注入样式、常驻背景、首帧 preboot |
| **产物** | `lib\client.js`（由脚本生成）→ 安装到 `~\.dsh\profiles\desktop\node_modules\dsh-codex-startup-animation\` | 实际被加载的 bundle |

`lib\client.js` 是**生成物，别手改**（下次构建会覆盖）。例外见文末「快速试验」。

## 一、动画本体：`codex-startup-animation-windows\animation.js`

| 想改什么 | 位置 | 说明 |
|---|---|---|
| 总时长 | L4 `const duration = 12000` | 毫秒 |
| 整体节奏（哪段快哪段慢） | L35 `const milestones = [...]` | `[进度0-1, 映射值]` 的折线，改这里比改时长安全 |
| 阶段切换时刻 | L284 `root.dataset.stage=...` | `pulse` / `identity` / `dispersing` / `scattered` / `drawing` / `colorize` / `portrait`，阈值就是秒数 |
| 背景闪烁白点数量 | L29 `Array.from({length: reduced?0:6})` | 6 → 调大更闪 |
| 碎屑密度（移动线段） | L100 `Math.ceil(fragments.length/160)` | 本项目已打补丁为 **420** |
| 碎屑密度（身份碎片） | L153 `Math.ceil(identityPieces.length/24)` | 本项目已打补丁为 **72** |
| 线稿颜色/粗细 | L97 `strokeStyle='#b9dff3'; lineWidth=1.55` | 白线纹理本体 |
| 线稿生成 | L94 `prepareLineTexture()` | 把轮廓描成静态纹理 |
| 打碎用的纹理（头像+环+文字） | `prepareIdentityTexture()` + `tools\build-client.py` 的 `PATCHES` | DSH 构建让 Canvas 复用皮肤的 `RING_PATHS`，默认上游环仍可作为回退 |
| 碎片飞散/聚合 | L163 `drawIdentityPieces()`、L178 `trace()` | `spread` 控制扩散，`p` 控制描线进度 |
| 整体图层透明度/位移 | L221 `render(t)` | 每个元素每帧的属性都在这 |
| 收尾合拢 | `render` 内 `closing` 段 + L289 `finish()` | 白线合拢、`.finished` 类 |
| 默认标题/字幕文字 | `assets\config.js` 的 `STARTUP_TEXT` | 移植层的 `runScripts()` 将默认标题设为「欢迎回来」；设置页里已保存的文字优先（存在 IndexedDB） |

## 二、前半段视觉（我做的皮肤）：`tools\client.template.js`

| 想改什么 | 位置 |
|---|---|
| 前半段全部配色/排版 | `const INTRO_CSS`（网格、橙色环、标题排式、隐藏项） |
| 最外层整幅角框 | `const FRAME_SVG`（`viewBox 0 0 1600 900`，`preserveAspectRatio=none` 所以随窗口拉伸） |
| 底部声痕与共鸣条 | `TACET_PEAKS`、`RESONANCE_AMPLITUDES` 和 `RESONANCE_SVG`（独立等比缩放；左右波形镜像，每根竖线沿基线上下对称） |
| 环绕头像的橙色环 | `RING_COLOR` 和 `RING_PATHS`（坐标系 `0 0 400 400`，SVG 覆盖 `.radar`，Canvas 飞散纹理共享这些路径） |
| 装饰只在前半段显示 | `INTRO_CSS` 里的 `.window[data-stage=...]` 选择器 |
| 常驻背景的透明层与底色 | `const SKIN_CSS` + `applyWallpaper()` |
| 字幕字号 | `localizeSettings()` 里那段 `.subtitle{font-size:17px...}` |
| 设置页 Codex→DSH | `localizeSettings()` 的 TreeWalker 段 |
| 动图/视频支持 | `installAnimatedMedia()` / `adoptAnimated()` / `mirrorMotion()` |

## 三、首帧与宿主：`lib\index.js`

`PREBOOT` 那段 `<style>` 决定页面首帧底色（`#090b0d`），`tapIndex` 把它注入 index.html。
想换首帧颜色改 `SPLASH_BG`，两处要一起（`lib\index.js` 与 `tools\client.template.js`）。

## 四、改完怎么生效

**快路径（只调视觉，不用开 DSH）**

```powershell
python tools\build-client.py
```

然后在浏览器里刷新 `preview.html`——它加载的是同一份 `lib\client.js`，`__ModuleLoader__` 用桩模拟。
桌面特性（标题栏按钮配色、preboot 注入）在预览里不生效，其余一致。

**真机路径**

```powershell
python tools\build-client.py
python tools\check-bundle.py
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1
```

然后**完全退出 DeepSeek Harness 再打开**（Loader 行在启动时扫描，页面刷新不够）。

## 五、`check-bundle.py` 变红是正常的

它断言「`animation.js` 等于上游 **+ 且仅 +** 构建脚本 `PATCHES` 声明的替换」。你直接改上游文件后会失败，
这是**故意的漂移告警**，不是坏了。两种处理：

1. 把新改动补进 `tools\build-client.py` 的 `PATCHES` 表（推荐，改动继续可审计）；
2. 或不要在 `animation.js` 里改，把效果改到移植层（CSS/SVG）。

## 六、快速试验：直接改已安装的产物

想验证一行改动而不走构建：

```
%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-codex-startup-animation\lib\client.js
```

它是可读的纯 JS（内嵌了上游脚本与 CSS），改完重启 DSH 即生效。
但**下次 `install.ps1` 会覆盖它**，验证完记得把改动搬回源文件。

## 七、回滚

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\uninstall.ps1
```

删插件包 + 从 `cordis.patch.yml` 移除条目，都有 `.bak-*` 备份。
