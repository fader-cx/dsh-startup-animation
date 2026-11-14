# DSH Codex Startup Animation

给 **DeepSeek Harness** 加上一段 Codex 风格的开场动画，以及可自定义的常驻背景。

> **灵感与动画来源**：[yanami-sec/codex-startup-animation-windows](https://github.com/yanami-sec/codex-startup-animation-windows)
> —— 本项目的全部视觉与动画逻辑来自该仓库，本仓库只做「搬到 DSH 上」的移植与扩展。
> 授权状态见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 这是什么

上游项目是给 **Microsoft Store 版 OpenAI Codex** 写的：它依赖 Appx 包名、`ChatGPT.exe`、
Win32 窗口隐藏（`StartupGate.exe`）和 CDP 端口注入页面。这些在 DSH 上一个都不成立，
所以**不能直接套用**。本仓库按 DSH 自己的扩展机制重做：

- 用它官方的**客户端插件 + 组合包**机制注入页面，而不是 CDP；
- 用宿主侧的 **index 渲染管线**（`ctx.webServer.tapIndex`）在首帧前压下底色，而不是隐藏窗口。

## 效果

- **12 秒完整开场**：脉冲 → 头像雷达 → 白点碎裂 → 线稿绘制 → 上色 → 画面合拢
- 合拢完成后自动淡出，把界面交还给 Harness；`Esc` 或点击即时跳过；30 秒硬超时兜底
- **常驻背景**：启动结束后背景留在界面上，用滑杆调节深浅，0% 关闭
- 常驻背景**可单独选图**，与开场动画的背景解耦
- 支持 **GIF** 与 **MP4** 作为开场背景（MP4 会跟着动画的推进/缩放一起动）
- 标题栏的最小化/最大化/关闭按钮融进动画底色，不再白亮地压在画面上
- 首帧被压成动画底色，消除 DSH 原生白底闪烁
- `Ctrl+Alt+Shift+B` 随时打开图片与背景设置

## 环境要求

- Windows 10/11
- DeepSeek Harness 桌面版（0.2.0-rc 系列验证过）
- 构建时需要 Python 3（可用 DSH 自带运行时里的 python）与 Git

## 安装

### 方式 A：从插件页安装（推荐）

DSH 的插件页支持**从 git 地址安装组合包**（git 地址、tarball、本地绝对路径或注册表包名）。
本仓库根目录的 `cordis.patch.yml` 就是组合包补丁，安装后会自动插入下面这一行 Loader 条目：

```yaml
- insert:
    - id: codex-startup-animation
      name: "dsh-codex-startup-animation"
```

在 **设置 → 插件** 里填入本仓库的 git 地址（`https://github.com/<你>/<仓库>` 或 `github:<你>/<仓库>`）安装，
然后完全退出并重开 DeepSeek Harness。

### 方式 B：本地脚本安装

```powershell
# 把插件包复制进当前 profile，并在 cordis.patch.yml 里插入 Loader 行（会先备份）
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1
```

装完**完全退出 DeepSeek Harness 再打开**（Loader 行在启动时扫描，刷新页面不够）。

### 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\uninstall.ps1
```

删插件包 + 移除 Loader 行，配置有 `.bak-*` 备份；DSH 安装目录全程不被修改。

## 使用

设置入口是**设置对话框里的「图片设置」按钮**，或动画播放中按 `Ctrl+Alt+B`；
动画结束后用 **`Ctrl+Alt+Shift+B`** 重新打开（`Ctrl+Alt+B` 已被 DSH 的
`sidebar.right.toggle` 占用）。

可以换：

- 前半段头像、后半段背景、标题、小字、字幕
- **背景显现程度**：同时决定常驻背景的深浅，0% 即关闭背景
- **常驻背景图（可单独选择）**：不选则沿用后半段背景
- 背景支持 **GIF / MP4**（见下）

设置存在本机 IndexedDB `aemeath-startup-images` → 仓库 `settings`：
`images` 键存上游那套设置，`dsh-wallpaper` 键存单独选的常驻背景。**都不上传。**

### 动图与视频

「后半段背景」接受 GIF 与 MP4。上游只认静态图，插件在捕获阶段接管了这个输入：

| 类型 | 做法 |
|---|---|
| GIF | 直接作为 `.artwork` 的 `<img src>`，浏览器原生播放；线稿用首帧算轮廓 |
| MP4 | 首帧当 `.artwork`（负责轮廓与线稿），另叠一层同位置的 `<video>`，逐帧同步 `opacity` 与 `transform`，所以会跟着动画一起动 |

选完会自动重播一次——上游的「保存并预览」只处理静态图，动图/视频走插件自己的写入路径
（写入同一份 `images` 记录，多一个 `motion` 字段，上游会忽略它）。

限制：MP4 需 H.264；建议 ≤ 30 MB；常驻背景支持 GIF 动图，**视频背景暂不支持**。

## 自己改动画

代码地图见 **[MODDING.md](MODDING.md)**：哪个效果由哪个文件的哪一行决定、改完怎么生效、
以及 `check-bundle.py` 变红时怎么处理。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fetch-upstream.ps1   # 拉取上游动画源码
python tools\build-client.py                                                  # 生成 lib\client.js
python tools\check-bundle.py                                                  # 忠实度校验
powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1         # 装进 DSH
```

`preview.html` 可以用浏览器直接预览同一份产物（不需要启动 DSH）：

```powershell
Start-Process .\preview.html
```

## 目录结构

```
dsh-startup-animation/
├─ package.json            # dsh.client（浏览器半侧）+ dsh.bundle.patch（组合包）
├─ cordis.patch.yml        # 组合包补丁：插入 Loader 行
├─ lib/
│  ├─ index.js             # 宿主半侧：向 index.html 注入深色 preboot
│  └─ client.js            # 浏览器半侧（构建产物，内嵌上游动画资源）
├─ tools/
│  ├─ client.template.js   # 移植层源码：覆盖层、壁纸、动图/视频、前半段皮肤
│  ├─ build-client.py      # 生成 lib/client.js（含显式补丁表 PATCHES）
│  ├─ check-bundle.py      # 校验产物忠实度
│  ├─ fetch-upstream.ps1   # 拉取上游动画仓库
│  ├─ install.ps1 / uninstall.ps1
├─ preview.html            # 浏览器隔离预览
├─ MODDING.md              # 改动画的代码地图
└─ THIRD_PARTY_NOTICES.md  # 来源与授权
```

## 实现要点

### 为什么动画代码几乎没改

`tools/build-client.py` 沿用上游注入器（`extension/payload.mjs` + `renderer.mjs`）的做法：
把整页塞进同源 `about:blank` iframe，把浏览器全局绑成函数形参后执行原脚本。
因为 iframe 里有真正的 `body`，`style.css` 一个选择器都不用改。

**唯一被改动的上游文件是 `animation.js` 的两个常量**（转场碎屑密度），
它们写在 `build-client.py` 的 `PATCHES` 表里，`check-bundle.py` 会断言
「等于上游 + 且仅 + 这两处」，构建时找不到片段直接失败。

### 窗口按钮为什么能「消失」

Windows 上这三个按钮由 Electron 原生绘制（`titleBarOverlay`），网页层盖不住。
但 DSH 的 `lib/preload-app.cjs` 会把两个 CSS 变量算成「按钮底色」与「图标色」回传主进程：

```css
background-color: var(--dsw-specific-sidebar-fill);
color:            var(--dsw-alias-label-primary);
```

插件在动画期间把两者改成动画底色，preload 的 MutationObserver 立刻把新颜色发给主进程；
动画结束后原样还原。所以是「融进画面」而非真正移除——鼠标悬停时 Windows 仍会高亮，页面侧无法屏蔽。

### 首帧白闪

成因三层：①窗口首帧合成；②DSH 的启动占位页本身就是白底；③插件要等 Loader 物化才运行。

- ②③ 由宿主侧 `tapIndex` 注入的 preboot 样式 + 客户端同步挂载覆盖层解决；
- ① 属于主进程窗口底色与首帧合成，页面/宿主插件都无法提前——**这是唯一改不了的一层**。

## 与上游的差异

| 上游能力 | 本移植 | 原因 |
|---|---|---|
| 动画期间主窗口保持隐藏，就绪后再显示 | 页面加载即铺满覆盖层；标题栏按钮融进底色 | 网页无法控制自身窗口显隐 |
| 检测桌宠就绪后缓冲 3 秒再起播 | 固定从 0 秒起播 | DSH 没有「桌宠就绪」这个信号 |
| 启动脚本监听到窗口就绪才放行 | 无对应物，动画自带 30 秒兜底 | 同上 |
| 应用更新后可能要适配 | 不涉及 | 插件在 profile 侧，升级 DSH 不会覆盖 |

## 已知限制

- 首帧仍可能有 1–2 帧的窗口合成闪烁（主进程层面，见上）；
- MP4 背景要求 H.264 编码；
- 常驻背景对应用壳层的透明化依赖运行时采样，DSH 大版本改版后可能需要更新选择器；
- 后半段打碎时用的是上游 `prepareIdentityTexture()` 自己绘制的环（中性灰），不是前半段那层橙色 SVG。

## 来源与授权

**务必先读 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。**

简言之：本仓库不附加 MIT 等许可证，因为其中包含来源未声明许可证的上游代码
（`lib/client.js` 内嵌了上游的 `animation.js` / `style.css` / `index.html` 等原文）。
自用与修改没有问题；**再分发或商用请先联系上游作者**。
