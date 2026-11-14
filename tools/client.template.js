window.__ModuleLoader__.load({
	id: "dsh-codex-startup-animation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// 上游资源，见 tools/build-client.py（逐字节搬运，不做改写）。
		const HTML = __HTML__;
		const CSS = __CSS__;
		const CONTOURS = __CONTOURS__;
		const CONFIG = __CONFIG__;
		const IMAGE_SETTINGS = __IMAGE_SETTINGS__;
		const ANIMATION = __ANIMATION__;
		const ARTWORK = __ARTWORK__;
		const AVATAR = __AVATAR__;

		const FRAME_ID = "dsh-startup-frame";
		const SPLASH_BG = "#090b0d";
		const WATCHDOG_MS = 30000;
		const DB_NAME = "aemeath-startup-images";
		const DB_STORE = "settings";
		// 上游把「常驻背景」交给 windows-wallpaper.mjs；这里由我们自己落盘。
		const WALLPAPER_KEY = "dsh-wallpaper";

		// DSH 的表面色 token 覆盖：把应用皮肤变透明，让底图透出来。
		// token 名取自 dsh-web-frontend 的构建产物与 preload-app.cjs。
		const SKIN_CSS = `
html[data-dsh-wallpaper]{--dsh-wallpaper-base:8 6 13}
@media (prefers-color-scheme:light){html[data-dsh-wallpaper]{--dsh-wallpaper-base:244 242 246}}
html[data-dsh-wallpaper]{
  background-image:linear-gradient(rgb(var(--dsh-wallpaper-base)/var(--dsh-wallpaper-wash,.58)),rgb(var(--dsh-wallpaper-base)/var(--dsh-wallpaper-wash,.58))),var(--dsh-wallpaper-image)!important;
  background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important;
}
html[data-dsh-wallpaper] body{background-color:transparent!important}
html[data-dsh-wallpaper] #root{background:transparent!important}
html[data-dsh-wallpaper]{
  --dsw-alias-bg-base:transparent!important;
  --dsw-alias-bg-layer-1:rgb(var(--dsh-wallpaper-base)/.55)!important;
  --dsw-alias-bg-layer-2:rgb(var(--dsh-wallpaper-base)/.70)!important;
  --dsw-alias-bg-layer-3:rgb(var(--dsh-wallpaper-base)/.80)!important;
  --dsw-alias-bg-layer-4:rgb(var(--dsh-wallpaper-base)/.88)!important;
  --dsw-specific-sidebar-fill:rgb(var(--dsh-wallpaper-base)/.30)!important;
  --dsw-alias-bg-module-platform:rgb(var(--dsh-wallpaper-base)/.45)!important;
}
/* 被放行的壳层：连伪元素画的渐变一起关掉（侧栏底部那条白雾就是伪元素）。 */
.dsh-splash-cleared::before,.dsh-splash-cleared::after{
  background:none!important;background-image:none!important;box-shadow:none!important;backdrop-filter:none!important;
}
`;

		// ── 常驻背景 ────────────────────────────────────────────────
		let wallpaperURL = null;
		let wallpaperSource = null;
		let independentWallpaper = null;
		let lastStrength = 42;
		let lastArtwork = null;

		function ensureSkinStyle() {
			if (document.getElementById("dsh-startup-skin")) return;
			const style = document.createElement("style");
			style.id = "dsh-startup-skin";
			style.textContent = SKIN_CSS;
			document.head.appendChild(style);
		}

		function toBlobURL(dataURL) {
			const comma = dataURL.indexOf(",");
			const mime = dataURL.slice(5, dataURL.indexOf(";"));
			const binary = atob(dataURL.slice(comma + 1));
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
			return URL.createObjectURL(new Blob([bytes], { type: mime }));
		}

		function clearWallpaper() {
			const root = document.documentElement;
			root.removeAttribute("data-dsh-wallpaper");
			root.style.removeProperty("--dsh-wallpaper-image");
			root.style.removeProperty("--dsh-wallpaper-wash");
			if (wallpaperURL) URL.revokeObjectURL(wallpaperURL);
			wallpaperURL = null;
			wallpaperSource = null;
			restoreOpaqueLayers();
			syncTitlebarVar();
		}

		/** 把选定的图铺到应用底色上；strength 为 0 表示关闭背景。 */
		function applyWallpaper(image, strength) {
			const value = Number.isFinite(strength) ? Math.max(0, Math.min(75, strength)) : 42;
			lastStrength = value;
			if (value <= 0 || typeof image !== "string" || !image) {
				clearWallpaper();
				return;
			}
			ensureSkinStyle();
			const root = document.documentElement;
			if (image !== wallpaperSource) {
				const previous = wallpaperURL;
				try {
					wallpaperURL = toBlobURL(image);
				} catch (error) {
					console.warn("[dsh-codex-startup-animation] 背景图无法解码，已跳过。", error);
					return;
				}
				// 大 data URL 会超出 CSS 变量长度限制，改用短 blob URL。
				root.style.setProperty("--dsh-wallpaper-image", 'url("' + wallpaperURL + '")');
				wallpaperSource = image;
				if (previous) URL.revokeObjectURL(previous);
			}
			root.style.setProperty("--dsh-wallpaper-wash", String(1 - value / 100));
			root.setAttribute("data-dsh-wallpaper", "");
			syncTitlebarVar();
			scheduleClearPasses();
		}

		function openDatabase() {
			return new Promise((resolve, reject) => {
				const request = indexedDB.open(DB_NAME, 1);
				request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result);
			});
		}

		function readSetting(key) {
			return openDatabase().then((database) => new Promise((resolve, reject) => {
				const transaction = database.transaction(DB_STORE, "readonly");
				const request = transaction.objectStore(DB_STORE).get(key);
				transaction.oncomplete = () => { database.close(); resolve(request.result); };
				transaction.onerror = () => { database.close(); reject(transaction.error); };
			}));
		}

		function writeSetting(key, value) {
			return openDatabase().then((database) => new Promise((resolve, reject) => {
				const transaction = database.transaction(DB_STORE, "readwrite");
				const store = transaction.objectStore(DB_STORE);
				if (value === undefined) store.delete(key); else store.put(value, key);
				transaction.oncomplete = () => { database.close(); resolve(); };
				transaction.onerror = () => { database.close(); reject(transaction.error); };
			}));
		}

		// ── 标题栏按钮 ──────────────────────────────────────────────
		/**
		 * Windows 上的下载器按钮（最小化/最大化/关闭）由 Electron 原生绘制
		 * （titleBarOverlay），网页层盖不住。但 preload 会把这两个 CSS 变量算成
		 * 「按钮底色」与「图标色」回传主进程，于是把它们改成动画底色，
		 * 按钮就消失在同一片深色里；动画结束再原样还原。
		 */
		function skinTitlebar() {
			const root = document.documentElement;
			if (!root || !("windowsTitlebar" in root.dataset)) return () => {};
			const body = document.body;
			if (!body) return () => {};
			const keys = ["--dsw-specific-sidebar-fill", "--dsw-alias-label-primary"];
			const saved = keys.map((key) => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)]);
			for (const key of keys) body.style.setProperty(key, SPLASH_BG);
			return () => {
				for (const [key, value, priority] of saved) {
					if (value) body.style.setProperty(key, value, priority);
					else body.style.removeProperty(key);
				}
			};
		}

		// 背景铺上后仍可能被某个不透明的壳层挡住。这里按采样点找出那一层，
		// 内联设为透明并记账；关闭背景时逐条还原，不留副作用。
		let cleared = [];
		let composerNode = null;
		let composerSeat = null;
		let composerPrevious = null;
		let composerRadius = null;

		function collectOpaqueNodes() {
			const found = [];
			const previous = frame ? frame.style.pointerEvents : null;
			if (frame) frame.style.pointerEvents = "none";
			try {
				const width = window.innerWidth;
				const height = window.innerHeight;
				// 顶栏、主区、底部输入框都要采到：白带往往在 y≈20 的那一排。
				const points = [
					[140, 18], [width / 2, 18], [width - 90, 18],
					[70, height / 2], [width / 2, height / 2], [width - 70, height / 2],
					[70, height - 60], [width / 2, height - 70], [width - 90, height - 60],
				];
				for (const [x, y] of points) {
					let node = document.elementFromPoint(x, y);
					let depth = 0;
					while (node && node !== document.documentElement && depth < 16) {
						const style = getComputedStyle(node);
						const color = style.backgroundColor;
						const image = style.backgroundImage;
						const painted = (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent")
							|| (image && image !== "none");
						if (painted) {
							if (!found.includes(node)) found.push(node);
							break;
						}
						node = node.parentElement;
						depth++;
					}
				}
			} catch (error) {
				console.warn("[dsh-codex-startup-animation] 图层探测失败", error);
			} finally {
				if (frame && previous !== null) frame.style.pointerEvents = previous;
			}
			return found;
		}

		/** 这一层是否真的在画东西（自身底色/渐变，或伪元素上的底色/渐变/模糊）。 */
		function paintedKind(node) {
			const style = getComputedStyle(node);
			if (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent") return "bg";
			if (style.backgroundImage && style.backgroundImage !== "none") return "img";
			for (const pseudo of ["::before", "::after"]) {
				const part = getComputedStyle(node, pseudo);
				if (!part || part.content === "none") continue;
				if (part.backgroundImage && part.backgroundImage !== "none") return pseudo;
				if (part.backgroundColor && part.backgroundColor !== "rgba(0, 0, 0, 0)" && part.backgroundColor !== "transparent") return pseudo;
			}
			return null;
		}

		/**
		 * 只按采样点找不够：侧栏底部的白渐变、顶栏那一排，往往是壳层自己或它的
		 * 伪元素在画。这里按几何特征把「整条顶栏 / 大块壳层 / 整列侧栏」也找出来。
		 */
		function collectShells() {
			const width = window.innerWidth;
			const height = window.innerHeight;
			const found = [];
			let budget = 4000;
			try {
				for (const node of document.querySelectorAll("#root *")) {
					if (--budget <= 0) break;
					const rect = node.getBoundingClientRect();
					if (rect.width < 8 || rect.height < 8) continue;
					const fullWidthBar = rect.width >= width * 0.9 && rect.height >= 16 && rect.height <= 180;
					const bigArea = rect.width * rect.height >= width * height * 0.3;
					const tallColumn = rect.height >= height * 0.6 && rect.width <= width * 0.5;
					if (!fullWidthBar && !bigArea && !tallColumn) continue;
					if (paintedKind(node)) found.push(node);
				}
			} catch (error) {
				console.warn("[dsh-codex-startup-animation] 壳层扫描失败", error);
			}
			return found;
		}

		/**
		 * 输入区自内向外是：编辑器 → 输入行（含 + / 模型选择 / 发送按钮）→
		 * 卡片 `RlGAzG_root`（128px，连消息文字一起包住）→ 座位 `.composerSeat`。
		 *
		 * 按高度猜不可靠（猜大就会把卡片刷白、猜小就只有文字那一窄条）。
		 * 改用语义：从编辑器往上，第一个「同时含有按钮」的一层就是输入行；
		 * 再往上的有底色层一律视为座位/卡片，交给放行逻辑清成透明。
		 */
		function detectComposer() {
			if (composerNode) return composerNode;
			try {
				const editor = document.querySelector("textarea, [contenteditable='true']");
				if (!editor) return null;
				const width = window.innerWidth;
				let node = editor;
				let depth = 0;
				let fallback = null;
				while (node && node !== document.documentElement && depth < 16) {
					const rect = node.getBoundingClientRect();
					const style = getComputedStyle(node);
					const painted = (style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent")
						|| (style.backgroundImage && style.backgroundImage !== "none");
					const slim = rect.height >= 24 && rect.height <= 220 && rect.width >= width * 0.2;
					// 输入行 = 含按钮的那一层（发送/附件/模型选择都在里面）。
					if (slim && node.querySelector("button, [role='button'], svg")) {
						composerNode = node;
						return node;
					}
					if (slim && !fallback) fallback = node;
					if (painted) {
						// 撞到卡片或座位：它们是要放行的，不是输入行。
						composerSeat = node;
						break;
					}
					node = node.parentElement;
					depth++;
				}
				// 兜底：没有任何一层含按钮，就退回「编辑器外包一层」。
				if (fallback) composerNode = fallback;
			} catch (error) { /* 探测不到就不保留 */ }
			return composerNode;
		}

		function releaseComposer() {
			const index = cleared.findIndex((entry) => entry.node === composerNode);
			if (index < 0) return;
			const entry = cleared[index];
			if (entry.previous) entry.node.style.setProperty("background", entry.previous);
			else entry.node.style.removeProperty("background");
			cleared.splice(index, 1);
		}

		function clearOpaqueLayers() {
			if (!document.documentElement.hasAttribute("data-dsh-wallpaper")) return;
			const composer = detectComposer();
			releaseComposer();
			const candidates = new Set(collectOpaqueNodes());
			for (const node of collectShells()) candidates.add(node);
			// 座位横带本身必须放行，否则底部整天会把整条带子留白。
			if (composerSeat) candidates.add(composerSeat);
			for (const node of candidates) {
				if (!node || node === composer) continue;
				// 输入条内部（按钮、附件条）也不动，否则输入区会花掉。
				if (composer && composer.contains(node)) continue;
				if (cleared.some((entry) => entry.node === node)) continue;
				// 用 background 简写：顶栏和侧边栏往往是渐变（background-image），
				// 只清 background-color 会留下那条白色渐变。
				cleared.push({
					node,
					previous: node.style.getPropertyValue("background"),
					hadClass: node.classList.contains("dsh-splash-cleared"),
				});
				node.style.setProperty("background", "transparent", "important");
				// 伪元素画的渐变（侧栏底部那条白雾）清不掉元素的 background，要单独关。
				node.classList.add("dsh-splash-cleared");
			}
			// 只有输入行本身做成白底，座位与卡片已经放行成透明。
			if (composer) {
				if (composerPrevious === null) composerPrevious = composer.style.getPropertyValue("background");
				composer.style.setProperty("background", "#ffffff", "important");
				composer.classList.add("dsh-splash-cleared");
				// 输入行自身若没有圆角，白底会是一条硬边矩形，补一个与卡片相近的圆角。
				const radius = parseFloat(getComputedStyle(composer).borderTopLeftRadius) || 0;
				if (radius < 6) {
					if (composerRadius === null) composerRadius = composer.style.getPropertyValue("border-radius");
					composer.style.setProperty("border-radius", "14px", "important");
				}
			}
		}

		/**
		 * 应用界面是分几次挂载的：只采样一次必然漏掉后到的顶栏与侧栏
		 * （这也解释了为什么按一次 Ctrl+Alt+Shift+B 后再退出就正常了）。
		 * 所以在布局稳定前复核几轮。
		 */
		function scheduleClearPasses() {
			clearOpaqueLayers();
			for (const delay of [200, 600, 1500, 3000, 5000]) {
				setTimeout(() => {
					clearOpaqueLayers();
				}, delay);
			}
		}

		function restoreOpaqueLayers() {
			for (const entry of cleared) {
				if (entry.previous) entry.node.style.setProperty("background", entry.previous);
				else entry.node.style.removeProperty("background");
				if (!entry.hadClass) entry.node.classList.remove("dsh-splash-cleared");
			}
			cleared = [];
			if (composerNode) {
				if (composerPrevious) composerNode.style.setProperty("background", composerPrevious);
				else composerNode.style.removeProperty("background");
				if (composerRadius) composerNode.style.setProperty("border-radius", composerRadius);
				else composerNode.style.removeProperty("border-radius");
				composerNode.classList.remove("dsh-splash-cleared");
			}
			composerPrevious = null;
			composerRadius = null;
			composerNode = null;
			composerSeat = null;
		}

		/**
		 * 前半段的视觉升级：白色线条 HUD 基调 + 橙色强调中心头像。
		 *
		 * 全部用注入样式与少量装饰节点完成，animation.js 的绘制逻辑一眼不动；
		 * 显隐挂在它自己维护的 `.window[data-stage]` 上——pulse / identity / dispersing
		 * 三个阶段的装饰会在开始画线稿（drawing）时自动淡出，不会干扰后半段。
		 */
		const INTRO_CSS = `
.scene{background:#04050a}
.window:is([data-stage="pulse"],[data-stage="identity"],[data-stage="dispersing"],[data-stage="scattered"]) .scene{background:#090b0d}
.boot-grid,.boot-corners,.reticle,.boot-caption,.wave,.boot-logs,.hud .coordinates{display:none}
.intro{z-index:2}
.pulse{top:40%}
.pulse i{border:1px solid #ee844a80;box-shadow:none}
.pulse b{width:5px;height:5px;background:#ff985c;box-shadow:0 0 10px #ff985c66}

.identity{top:40%;width:min(35vw,64vh)}
.radar{width:100%}
.avatar-frame{inset:26.5%;border:1px solid #ded9c8;padding:3px;box-shadow:none;background:#090b0d}
.avatar-frame:before,.avatar-frame:after{content:none}
.dial{visibility:hidden}
.dsh-ring-layer{position:absolute;inset:0;width:100%;height:100%;overflow:visible;fill:none;pointer-events:none}

.dsh-intro-title-row{
  width:100%;margin-top:min(1.3vw,2.3vh);display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,auto) minmax(0,1fr);
  align-items:center;justify-items:center;column-gap:clamp(8px,1.7vw,30px);
  padding-inline:7%;
}
.boot-title{
  font-family:"Songti SC","STSong","SimSun","Noto Serif CJK SC",serif;
  font-size:clamp(18px,min(2.9vw,5.1vh),50px);font-weight:700;
  letter-spacing:.42em;padding-left:.42em;line-height:1.2;
  color:#f0e9d8;text-shadow:none;
}
.boot-title.long-title{font-size:clamp(14px,min(1.65vw,3.2vh),28px);letter-spacing:.1em;padding-left:.1em}
.dsh-intro-title-row::before,.dsh-intro-title-row::after{
  content:"";width:min(100%,4.8vw);height:6px;
  border-block:1px solid #ded9c8;opacity:0;transition:opacity .3s ease;
}
.window[data-stage="identity"] .dsh-intro-title-row:not(:has(.boot-title:empty))::before,
.window[data-stage="identity"] .dsh-intro-title-row:not(:has(.boot-title:empty))::after{opacity:.85}
.dsh-intro-title-row::before{justify-self:end}
.dsh-intro-title-row::after{justify-self:start}

/* 外框与网格独立淡出，让线稿接管画面。 */
.dsh-intro-decor{
  position:absolute;inset:0;pointer-events:none;z-index:1;opacity:0;
  background-image:linear-gradient(#d5e7ed0a 1px,transparent 1px),linear-gradient(90deg,#d5e7ed0a 1px,transparent 1px);
  background-size:clamp(24px,2.15vw,38px) clamp(24px,2.15vw,38px);
  background-position:center;
  transition:opacity .44s ease;
}
.window:is([data-stage="pulse"],[data-stage="identity"]) .dsh-intro-decor{opacity:1}
.dsh-intro-frame{display:block;width:100%;height:100%}
.dsh-resonance-strip{
  position:absolute;left:50%;bottom:3.2%;transform:translateX(-50%);
  display:block;width:min(48vw,78vh,720px);height:auto;overflow:visible;
}
.dsh-resonance-wave{
  transform-box:fill-box;transform-origin:center;
  animation:dsh-resonance-beat 1.5s ease-in-out infinite alternate;
}
@keyframes dsh-resonance-beat{from{transform:scaleY(.76);opacity:.66}to{transform:scaleY(1);opacity:1}}
@media(max-aspect-ratio:4/3){
  .identity{width:min(66vw,63vh)}
  .boot-title{font-size:clamp(18px,min(4.6vw,4.5vh),46px)}
  .dsh-resonance-strip{width:min(75vw,49vh);bottom:5.5%}
}
@media(prefers-reduced-motion:reduce){
  .dsh-intro-decor,.dsh-intro-title-row::before,.dsh-intro-title-row::after{transition:none}
  .dsh-resonance-wave{animation:none}
}
`;

		/** 冷白外框，三层斜轨在侧边分开，并在底部向中间收束。 */
		const FRAME_SVG =
			'<svg class="dsh-intro-frame" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">'
			+ '<g fill="none" stroke="#e2eff5" stroke-linejoin="round">'
			+ '<path d="M0 28 H49 L448 784 H1152 L1551 28 H1600 M466 771 H1134" opacity=".29" vector-effect="non-scaling-stroke"/>'
			+ '<path d="M680 70 H66 L420 752 H1180 L1534 70 H920 M0 85 H680 M920 85 H1600" opacity=".48" vector-effect="non-scaling-stroke"/>'
			+ '<path d="M0 114 L336 744 H1264 L1600 114 M0 228 H60 M1540 228 H1600 M0 480 H195 M1405 480 H1600 M800 744 v12" opacity=".72" vector-effect="non-scaling-stroke"/>'
			// 粗线沿各自的底轨排列：外轨在上，内轨在下，中间隔一小段。
			+ '<path d="M60.8 228 L136.5 370 M1539.2 228 L1463.5 370" stroke-width="3.2" opacity=".88" vector-effect="non-scaling-stroke"/>'
			+ '<path d="M232.1 390 L307.4 535 M1367.9 390 L1292.6 535" stroke-width="2.6" opacity=".76" vector-effect="non-scaling-stroke"/>'
			+ '</g></svg>';

		// 按参考图的峰位横向重绘：六个凹边四芒在同一条基线上，共享一个主峰。
		const TACET_PEAKS = [
			[254, 9, 5], [278, 13, 9], [304, 20, 15],
			[340, 36, 26], [381, 21, 15], [411, 12, 9],
		];
		const TACET_SHAPE = "M-1 0 C-.17 -.07 -.07 -.17 0 -1 C.07 -.17 .17 -.07 1 0 C.17 .07 .07 .17 0 1 C-.07 .17 -.17 .07 -1 0Z";

		// 每根竖线向同一基线的两侧等距伸展，再将整组水平镜像。
		const RESONANCE_AMPLITUDES = [1, 2, 1.5, 3, 5, 3, 7, 10, 6, 4, 8, 13, 10, 16, 9, 5, 9, 12, 8, 5, 3, 6, 4, 2, 3, 1.5];
		const RESONANCE_WAVE = RESONANCE_AMPLITUDES.map((peak, i) => {
			const x = 38 + i * 6.6;
			const mirror = 680 - x;
			return 'M' + x + ' ' + (36 - peak) + 'V' + (36 + peak)
				+ ' M' + mirror + ' ' + (36 - peak) + 'V' + (36 + peak);
		}).join(' ');

		const RESONANCE_SVG =
			'<svg class="dsh-resonance-strip" viewBox="0 0 680 72" aria-hidden="true">'
			+ '<path d="M14 36 H219 M461 36 H666" fill="none" stroke="#d8e7ef" opacity=".28"/>'
			+ '<path class="dsh-resonance-wave" d="' + RESONANCE_WAVE + '" fill="none" stroke="#e2eff5" stroke-width="1.35" stroke-linecap="round"/>'
			+ '<g class="dsh-tacet-mark" fill="#f4f6f7">'
			+ TACET_PEAKS.map(([x, width, height]) => '<path d="' + TACET_SHAPE + '" transform="translate(' + x + ' 36) scale(' + width + ' ' + height + ')"/>').join('')
			+ '</g></svg>';

		const RING_COLOR = "#ff884c";
		// 一组 400 × 400 路径同时用于静态 SVG 和飞散前的 Canvas 纹理。
		const RING_PATHS = [
			{ d: "M9 166 A194 194 0 0 1 107 30 M293 30 A194 194 0 0 1 391 166 M391 234 A194 194 0 0 1 293 370 M107 370 A194 194 0 0 1 9 234", width: 1, opacity: .66 },
			{ d: "M71 104 A160 160 0 0 1 329 104 M329 296 A160 160 0 0 1 71 296", width: 1.15 },
			{ d: "M58 115 A165 165 0 0 0 58 285 M342 115 A165 165 0 0 1 342 285", width: .9, opacity: .75 },
			{ d: "M63 122 A157 157 0 0 0 63 278 M337 122 A157 157 0 0 1 337 278", width: 2.2, dash: [0.1, 7] },
			{ d: "M87 148 A125 125 0 0 0 87 252 M313 148 A125 125 0 0 1 313 252 M-16 200 H15 M385 200 H416", width: 1.6 },
			{ d: "M100 319 H186 M214 319 H300", width: 1, opacity: .8 },
			{ d: "M200 80 l3 4 h-6 z M200 323 l-4 -5 h8 z M72 104 a1.5 1.5 0 1 0 -3 0 a1.5 1.5 0 1 0 3 0 M331 104 a1.5 1.5 0 1 0 -3 0 a1.5 1.5 0 1 0 3 0 M72 296 a1.5 1.5 0 1 0 -3 0 a1.5 1.5 0 1 0 3 0 M331 296 a1.5 1.5 0 1 0 -3 0 a1.5 1.5 0 1 0 3 0", fill: true },
		];
		const RING_SVG = '<svg class="dsh-ring-layer" viewBox="0 0 400 400" aria-hidden="true">'
			+ RING_PATHS.map(({ d, width, opacity = 1, dash, fill }) => '<path d="' + d + '" opacity="' + opacity + '" '
				+ (fill ? 'fill="' + RING_COLOR + '"' : 'stroke="' + RING_COLOR + '" stroke-width="' + width + '" stroke-linecap="round"'
					+ (dash ? ' stroke-dasharray="' + dash.join(' ') + '"' : '')) + '/>').join('')
			+ '</svg>';

		function paintIntroRing(win, ink, cx, cy, size) {
			ink.save();
			ink.translate(cx - size / 2, cy - size / 2);
			ink.scale(size / 400, size / 400);
			ink.strokeStyle = ink.fillStyle = RING_COLOR;
			ink.lineCap = "round";
			for (const { d, width, opacity = 1, dash, fill } of RING_PATHS) {
				ink.globalAlpha = opacity;
				const path = new win.Path2D(d);
				if (fill) ink.fill(path);
				else {
					ink.lineWidth = width;
					ink.setLineDash(dash || []);
					ink.stroke(path);
				}
			}
			ink.restore();
		}

		function applyIntroSkin(win) {
			const doc = win.document;
			if (!doc.getElementById("dsh-intro-skin")) {
				const style = doc.createElement("style");
				style.id = "dsh-intro-skin";
				style.textContent = INTRO_CSS;
				doc.head.appendChild(style);
			}

			const radar = doc.querySelector(".radar");
			if (radar && !radar.querySelector(".dsh-ring-layer")) {
				const holder = doc.createElement("div");
				holder.innerHTML = RING_SVG;
				const ring = holder.firstElementChild;
				if (ring) radar.insertBefore(ring, radar.firstChild);
			}
			const title = doc.querySelector(".boot-title");
			if (title && !title.closest(".dsh-intro-title-row")) {
				const row = doc.createElement("div");
				row.className = "dsh-intro-title-row";
				title.before(row);
				row.appendChild(title);
			}

			const scene = doc.querySelector(".scene");
			if (!scene || scene.querySelector(".dsh-intro-decor")) return;
			const decor = doc.createElement("div");
			decor.className = "dsh-intro-decor";
			decor.setAttribute("aria-hidden", "true");
			decor.innerHTML = FRAME_SVG + RESONANCE_SVG;
			const anchor = doc.querySelector(".boot-corners");
			if (anchor && anchor.parentElement === scene) anchor.after(decor);
			else scene.appendChild(decor);
		}

		/**
		 * 设置页的本地化：把上游写给 Codex 的字样换成 DSH，并微调后半段字幕的字号。
		 * 都在运行时做，上游 index.html / style.css 保持原样。
		 */
		function localizeSettings(win) {
			const doc = win.document;
			// 字幕：上游最终生效的是 15px，这里提到 17px 并略微上移，避免贴边。
			const style = doc.createElement("style");
			style.id = "dsh-startup-tweaks";
			style.textContent = ".subtitle{font-size:17px!important;line-height:1.55!important;bottom:11%!important}";
			doc.head.appendChild(style);

			const dialog = doc.getElementById("settings-dialog");
			if (!dialog) return;
			const walker = doc.createTreeWalker(dialog, 4 /* NodeFilter.SHOW_TEXT */);
			const targets = [];
			while (walker.nextNode()) targets.push(walker.currentNode);
			for (const node of targets) {
				if (node.nodeValue && node.nodeValue.includes("Codex")) {
					node.nodeValue = node.nodeValue.split("Codex").join("DSH");
				}
			}
			// 属性里也要换（例如 aria-label / placeholder）。
			for (const node of dialog.querySelectorAll("[aria-label],[title],[placeholder]")) {
				for (const name of ["aria-label", "title", "placeholder"]) {
					const value = node.getAttribute(name);
					if (value && value.includes("Codex")) node.setAttribute(name, value.split("Codex").join("DSH"));
				}
			}
		}

		/**
		 * 标题栏那一条是 Electron 的 titleBarOverlay 画的，颜色取自这个变量。
		 * 30% 半透明色叠在窗口白底上就是一条浅灰带——所以背景开启期间改成全透明，
		 * 让页面背景透上去；关闭背景时再交还给应用。
		 */
		function syncTitlebarVar() {
			const body = document.body;
			if (!body) return;
			if (document.documentElement.hasAttribute("data-dsh-wallpaper")) {
				body.style.setProperty("--dsw-specific-sidebar-fill", "rgba(0, 0, 0, 0)");
			} else {
				body.style.removeProperty("--dsw-specific-sidebar-fill");
			}
		}

		// ── 覆盖层 ──────────────────────────────────────────────────
		let frame = null;
		let watchdog = 0;
		let restoreTitlebar = null;

		function removeFrame() {
			if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
			if (frame) {
				const current = frame;
				frame = null;
				current.remove();
			}
			if (restoreTitlebar) { restoreTitlebar(); restoreTitlebar = null; }
			restoreFallback();
			syncTitlebarVar();
			// 动画结束时界面已稳定，再补一次采样收口。
			clearOpaqueLayers();
		}

		function runScripts(win) {
			// 与上游 payload.mjs 相同：把浏览器全局绑成函数形参，
			// 让四个脚本在 iframe 的 realm 里原样执行。
			const bind = "const document=window.document,location=window.location,performance=window.performance,"
				+ "indexedDB=window.indexedDB,Image=window.Image,Path2D=window.Path2D,URL=window.URL,navigator=window.navigator,module=undefined;"
				+ "const requestAnimationFrame=window.requestAnimationFrame.bind(window),"
				+ "cancelAnimationFrame=window.cancelAnimationFrame.bind(window);";
			const body = [IMAGE_SETTINGS, CONTOURS, CONFIG, 'window.STARTUP_TEXT.introTitle = "欢迎回来";', ANIMATION].join("\n");
			new Function("window", bind + "\n" + body)(win);
		}

		function onAnimationEvent(data) {
			if (!data || data.type !== "aemeath-boot") return;
			if (data.action === "background") {
				lastArtwork = data.image;
				applyWallpaper(independentWallpaper || data.image, data.strength);
				// 用户选了动图/视频时，把动态层挂上去（上游的 .artwork 只认静态图）。
				if (motionSource) mirrorMotion();
			}
			if (data.action === "complete" || data.action === "assetError") removeFrame();
		}

		// ── 动图与视频 ──────────────────────────────────────────────
		// 上游的 .artwork 是一个 <img>：GIF 能自己动，MP4 不能。
		// 所以 GIF 直接当 artwork 用；MP4 取首帧当 artwork（负责轮廓与线稿），
		// 再叠一层同位置的 <video>，逐帧同步它的 opacity/transform。
		let motionSource = null;
		let motionURL = null;

		function readAsDataURL(win, file) {
			return new Promise((resolve, reject) => {
				const reader = new (win.FileReader)();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
				reader.readAsDataURL(file);
			});
		}

		/** 把 GIF/视频的首帧画到与上游一致的 2304×1296 画布上。 */
		async function firstFrameCanvas(win, source, isVideo) {
			const canvas = win.document.createElement("canvas");
			canvas.width = 2304;
			canvas.height = 1296;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("无法创建画布");
			context.fillStyle = "#08060d";
			context.fillRect(0, 0, canvas.width, canvas.height);
			let width;
			let height;
			let drawable;
			if (isVideo) {
				const video = win.document.createElement("video");
				video.muted = true;
				video.playsInline = true;
				video.preload = "auto";
				video.src = source;
				await new Promise((resolve, reject) => {
					video.addEventListener("loadeddata", resolve, { once: true });
					video.addEventListener("error", () => reject(new Error("视频无法解码，请换 MP4（H.264）")), { once: true });
					setTimeout(() => reject(new Error("视频加载超时")), 20000);
				});
				width = video.videoWidth;
				height = video.videoHeight;
				drawable = video;
			} else {
				const image = new (win.Image)();
				image.src = source;
				await image.decode();
				width = image.naturalWidth;
				height = image.naturalHeight;
				drawable = image;
			}
			if (!width || !height) throw new Error("拿不到画面尺寸");
			const scale = Math.max(canvas.width / width, canvas.height / height);
			const drawWidth = width * scale;
			const drawHeight = height * scale;
			context.drawImage(drawable, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
			return canvas;
		}

		/** 把画布转成上游 importImage 能吃的 File，借它算轮廓。 */
		function canvasToFile(win, canvas) {
			return new Promise((resolve, reject) => {
				canvas.toBlob((blob) => {
					if (!blob) { reject(new Error("无法导出首帧")); return; }
					try { resolve(new (win.File)([blob], "frame.png", { type: "image/png" })); }
					catch (error) { reject(error); }
				}, "image/png");
			});
		}

		async function adoptAnimated(win, file, isVideo) {
			const source = await readAsDataURL(win, file);
			const canvas = await firstFrameCanvas(win, source, isVideo);
			const frameFile = await canvasToFile(win, canvas);
			const imported = await win.imageSettings.importImage(frameFile, "artwork");
			const existing = (await readSetting("images").catch(() => null)) || {};
			const record = Object.assign({}, existing, {
				// GIF 直接交给 <img> 自动播放；MP4 用首帧占位，动态由视频层负责。
				artwork: isVideo ? imported.artwork : source,
				contours: imported.contours,
			});
			if (isVideo) record.motion = source;
			else delete record.motion;
			await writeSetting("images", record);
			motionSource = isVideo ? source : null;
		}

		/** 让视频层跟着上游 .artwork 的 opacity/transform 走。 */
		function mirrorMotion() {
			const win = frame && frame.contentWindow;
			if (!win || !motionSource) return;
			const doc = win.document;
			if (doc.getElementById("dsh-motion-artwork")) return;
			const art = doc.querySelector(".artwork");
			if (!art || !art.parentElement) return;
			if (!motionURL) motionURL = toBlobURL(motionSource);
			const video = doc.createElement("video");
			video.id = "dsh-motion-artwork";
			video.src = motionURL;
			video.muted = true;
			video.loop = true;
			video.autoplay = true;
			video.playsInline = true;
			video.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"
				+ "object-position:50% 50%;pointer-events:none;";
			art.parentElement.insertBefore(video, art.nextSibling);
			const sync = () => {
				if (!video.isConnected) return;
				video.style.opacity = art.style.opacity || "1";
				video.style.transform = art.style.transform || "none";
				win.requestAnimationFrame(sync);
			};
			video.addEventListener("loadeddata", () => { video.play().catch(() => {}); }, { once: true });
			sync();
		}

		/**
		 * 接管 #artwork-file 的 change：GIF/MP4 上游会直接拒绝，所以在这里拦下来自己处理。
		 * 用捕获阶段挂到 document 上，才能在输入框自身的监听器之前拿到事件。
		 */
		function installAnimatedMedia(win) {
			const doc = win.document;
			const input = doc.getElementById("artwork-file");
			if (input) input.setAttribute("accept", "image/png,image/jpeg,image/webp,image/gif,video/mp4");
			doc.addEventListener("change", (event) => {
				const target = event.target;
				if (!target || target.id !== "artwork-file") return;
				const file = target.files && target.files[0];
				if (!file) return;
				const isVideo = file.type === "video/mp4" || /\.mp4$/i.test(file.name);
				const isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
				if (!isVideo && !isGif) return; // 静态图继续交给上游
				event.stopPropagation();
				event.preventDefault();
				const status = doc.getElementById("settings-status");
				if (status) status.textContent = isVideo ? "正在读取视频首帧并生成线稿…" : "正在读取动图并生成线稿…";
				target.value = "";
				adoptAnimated(win, file, isVideo).then(() => {
					const dialog = doc.getElementById("settings-dialog");
					if (dialog && dialog.open) dialog.close("done");
					// 重新起一次动画，让上游按新的 IndexedDB 记录重新加载素材。
					removeFrame();
					markPlayed();
					show(false);
				}).catch((error) => {
					if (status) status.textContent = "导入失败：" + (error && error.message ? error.message : error);
				});
			}, true);
		}

		function wireWallpaperPicker(win) {
			const doc = win.document;
			const anchor = doc.querySelector("#settings-dialog .wallpaper-setting");
			if (!anchor) return;
			const row = doc.createElement("label");
			row.className = "wallpaper-setting";
			row.innerHTML = "<span>常驻背景图（可单独选择）</span>"
				+ "<small>不选则沿用后半段背景；选好后立刻生效并保存在本机。</small>";
			const input = doc.createElement("input");
			input.type = "file";
			input.accept = "image/png,image/jpeg,image/webp,image/gif";
			input.id = "dsh-wallpaper-file";
			const reset = doc.createElement("button");
			reset.type = "button";
			reset.textContent = "恢复沿用启动背景";
			row.append(input, reset);
			anchor.after(row);

			input.addEventListener("change", () => {
				const file = input.files && input.files[0];
				if (!file) return;
				const reader = new (win.FileReader)();
				reader.onload = () => {
					independentWallpaper = String(reader.result);
					writeSetting(WALLPAPER_KEY, independentWallpaper).catch(() => {});
					applyWallpaper(independentWallpaper, lastStrength);
				};
				reader.readAsDataURL(file);
				input.value = "";
			});
			reset.addEventListener("click", () => {
				independentWallpaper = null;
				writeSetting(WALLPAPER_KEY, undefined).catch(() => {});
				applyWallpaper(lastArtwork || ARTWORK, lastStrength);
			});
		}

		function show(settings) {
			if (frame || !document.body) return;
			restoreTitlebar = skinTitlebar();

			const element = document.createElement("iframe");
			element.id = FRAME_ID;
			element.title = "启动动画";
			element.setAttribute("aria-hidden", settings ? "false" : "true");
			element.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;"
				+ "z-index:2147483646;background:" + SPLASH_BG + ";color-scheme:dark;";
			frame = element;

			element.addEventListener("load", () => {
				if (frame !== element) return;
				try {
					const win = element.contentWindow;
					const doc = win.document;
					doc.documentElement.innerHTML = HTML;
					const style = doc.createElement("style");
					// 上游「恢复 Codex 外观」按钮在 DSH 里没有意义：滑杆拖到 0% 即关闭背景。
					style.textContent = CSS + "\n#restore-appearance{display:none!important}\n";
					doc.head.appendChild(style);
					win.AEMEATH_EXTERNAL = true;
					win.AEMEATH_ASSETS = { artwork: ARTWORK, avatar: AVATAR };
					win.AEMEATH_OPEN_SETTINGS = Boolean(settings);
					win.AEMEATH_SEND = (data) => onAnimationEvent(data);
					win.AEMEATH_IDENTITY_RING = (ink, cx, cy, size) => paintIntroRing(win, ink, cx, cy, size);
					applyIntroSkin(win);
					runScripts(win);
					wireWallpaperPicker(win);
					installAnimatedMedia(win);
					localizeSettings(win);
					element.focus();
				} catch (error) {
					console.error("[dsh-codex-startup-animation] 开场动画未能启动，已直接进入界面。", error);
					removeFrame();
				}
			}, { once: true });

			element.src = "about:blank";
			document.body.appendChild(element);
			// 覆盖层已经盖满窗口，宿主注入的深色 preboot 可以撤了。
			dropPreboot();
			watchdog = setTimeout(removeFrame, WATCHDOG_MS);
		}

		function markPlayed() {
			try { sessionStorage.setItem("dsh-codex-startup-animation.played", "1"); } catch (error) { /* 忽略 */ }
		}

		function hasPlayed() {
			try { return sessionStorage.getItem("dsh-codex-startup-animation.played") === "1"; } catch (error) { return false; }
		}

		function restart(settingsOnly) {
			if (!settingsOnly && hasPlayed()) return;
			if (!settingsOnly) markPlayed();
			show(settingsOnly);
		}

		// ── 首帧白闪 ────────────────────────────────────────────────
		// 闪白的成因：应用先把自己的界面画出来，插件要等 Loader 物化后才运行，
		// 而这里原来还要再等 IndexedDB 读完才挂覆盖层——中间那段就是白底。
		// 修法：同步压底色 + 同步挂覆盖层，IndexedDB 放到后台并行。
		let htmlBackground = null;

		function paintFallback() {
			const root = document.documentElement;
			if (!root) return;
			htmlBackground = {
				value: root.style.getPropertyValue("background-color"),
				priority: root.style.getPropertyPriority("background-color"),
			};
			root.style.setProperty("background-color", SPLASH_BG, "important");
		}

		function restoreFallback() {
			if (!htmlBackground) return;
			const root = document.documentElement;
			if (htmlBackground.value) root.style.setProperty("background-color", htmlBackground.value, htmlBackground.priority);
			else root.style.removeProperty("background-color");
			htmlBackground = null;
		}

		/**
		 * 宿主半侧会往 index.html 里塞一段深色 preboot（`#dsh-startup-preboot`），
		 * 保证首帧就是动画底色。覆盖层一挂上就该把它摘掉，免得它压住真实界面。
		 */
		function dropPreboot() {
			for (const id of ["dsh-startup-preboot", "dsh-startup-preboot-early", "dsh-startup-preboot-guard"]) {
				const node = document.getElementById(id);
				if (node) node.remove();
			}
		}

		function loadStoredAppearance() {
			// 按本机已保存的设置把背景铺好——即使动画被跳过、或 background 事件没到达。
			Promise.all([
				readSetting(WALLPAPER_KEY).catch(() => null),
				readSetting("images").catch(() => null),
			]).then(([wallpaper, images]) => {
				if (typeof wallpaper === "string" && wallpaper) independentWallpaper = wallpaper;
				const record = images && typeof images === "object" ? images : {};
				if (typeof record.artwork === "string" && record.artwork) lastArtwork = record.artwork;
				if (typeof record.wallpaperStrength === "number") lastStrength = record.wallpaperStrength;
				if (typeof record.motion === "string" && record.motion) motionSource = record.motion;
				applyWallpaper(independentWallpaper || lastArtwork || ARTWORK, lastStrength);
			}).catch(() => {});
		}

		exports.apply = function apply() {
			if (hasPlayed()) {
				// 本次会话不播动画：preboot 留着只会让界面发暗，立刻撤掉。
				dropPreboot();
			} else {
				paintFallback();
				if (document.body) {
					markPlayed();
					show(false);
				} else {
					document.addEventListener("DOMContentLoaded", () => { markPlayed(); show(false); }, { once: true });
				}
			}
			if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadStoredAppearance, { once: true });
			else loadStoredAppearance();

			// 动画结束后仍保留入口。注意不能用 Ctrl+Alt+B：那是 DSH 自己的
			// sidebar.right.toggle（desktop:windows 默认键位），且它在捕获阶段先消费掉事件。
			// DSH 桌面端已占用 Ctrl+Alt+B/O/P/T，一律是两个修饰键，故这里用三修饰键避开。
			window.addEventListener("keydown", (event) => {
				if (event.ctrlKey && event.altKey && event.shiftKey && event.code === "KeyB") {
					event.preventDefault();
					event.stopImmediatePropagation();
					restart(true);
				}
			}, true);

			// 窗口尺寸变化会重排布局、换一批壳层，重新采样一次。
			let resizeTimer = 0;
			window.addEventListener("resize", () => {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => { clearOpaqueLayers(); }, 250);
			});
		};
		exports.inject = [];
		return module.exports;
	},
});

// 兜底保险：这段代码在 bundle 被求值时立刻执行，比 apply()（要等 Loader 物化这一行）
// 更早，也比 React 挂载启动占位页更早。宿主侧的 preboot 若因某种原因没生效，这里仍是深色。
(function prebootEarly() {
	try {
		if (document.getElementById("dsh-startup-preboot-early")) return;
		const style = document.createElement("style");
		style.id = "dsh-startup-preboot-early";
		style.textContent = "html,html body,#root,#root *{background-color:#08060d!important}"
			+ "html{color-scheme:dark}";
		(document.head || document.documentElement).appendChild(style);
		setTimeout(() => {
			const node = document.getElementById("dsh-startup-preboot-early");
			if (node) node.remove();
		}, 8000);
	} catch (error) { /* 忽略 */ }
})();
