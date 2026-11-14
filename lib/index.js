/**
 * Codex 开场动画插件，宿主半侧（node）。
 *
 * 浏览器半侧只负责动画与背景；这里的职责只有一个：在 **index.html 被返回之前**
 * 塞入一段深色 preboot 样式，让窗口的首帧就是动画底色，而不是 DSH 的白底。
 *
 * 依据 @deepseek-ai/dsh-host-webserver 的 index 渲染管线：
 *   renderIndex(html) = applyIndexTaps(renderIndexInjections(html, ...))
 * `tapIndex(transform)` 注册的原始转换会在结构化注入行之后依次执行，
 * 所以这是最早能改到 HTML 的位置——比任何页面 JS 都早。
 */

/** 稳定插件名，便于 Loader 显示与排错。 */
export const name = "codex-startup-animation";

// 不导出 `inject`:那会让整行等待服务就绪,而没有 webServer 的树里动画也会跟着不加载。
// 这里改成「尽力注册」:服务在就直接挂,不在就等它出现,都没有也无所谓。

/** 首帧底色，与开场动画底色一致。 */
const SPLASH_BG = "#090b0d";

/**
 * 深色 preboot：把 html / body / #root 以及 #root 下**所有**后代都压成动画底色。
 *
 * 为什么是 `#root *` 而不是 `#root > *`：DSH 的启动占位页是一个组件，它自带
 * `background: var(--dsw-alias-bg-base)`，而组件根节点并不是 #root 的直接子层；
 * 只盖一层的话白底会被它自己重新画出来（实测正是这个原因）。
 *
 * `!important` 是必要的：应用主题样式在脚本执行后才生效，让它赢白底就会回来。
 * 这段样式是临时的——客户端一挂上覆盖层就整段移除，另有 8 秒自毁守卫兜底。
 */
const PREBOOT =
  '<style id="dsh-startup-preboot">'
  + "html:root,html:root body,html:root #root,html:root #root *{background-color:" + SPLASH_BG + "!important}"
  + "html:root{color-scheme:dark}"
  + "</style>"
  + '<script id="dsh-startup-preboot-guard">'
  + "setTimeout(function(){"
  + 'var a=document.getElementById("dsh-startup-preboot");if(a)a.remove();'
  + 'var b=document.getElementById("dsh-startup-preboot-guard");if(b)b.remove();'
  + "},8000);"
  + "</script>";

/**
 * 只在第一个 `<head>` 上插入一次；重复渲染或多次 tap 都不会叠加。
 * @param html - webserver 即将返回的 index.html。
 * @returns 注入 preboot 之后的 HTML。
 */
function injectPreboot(html) {
  if (typeof html !== "string" || html.includes("dsh-startup-preboot")) return html;
  return html.replace(/<head\b[^>]*>/i, (tag) => tag + PREBOOT);
}

/**
 * 宿主入口：注册 index 转换。没有 webServer（例如 CLI 表层）时什么都不做，
 * 浏览器半侧的动画与背景不受影响。
 * @param ctx - Cordis 宿主上下文。
 */
export function apply(ctx) {
  /** @param server - 可能存在的 webserver 服务。 */
  const install = (server) => {
    if (!server || typeof server.tapIndex !== "function") return;
    try {
      const dispose = server.tapIndex(injectPreboot);
      if (typeof ctx.on === "function") ctx.on("dispose", dispose);
    } catch (error) {
      console.warn("[codex-startup-animation] 无法挂载 index preboot：", error && error.message);
    }
  };

  if (ctx.webServer) {
    install(ctx.webServer);
    return;
  }
  if (typeof ctx.inject === "function") {
    try {
      ctx.inject(["webServer"], (scoped) => install(scoped && scoped.webServer));
    } catch (error) { /* 这个表层没有 webServer：静默跳过 */ }
  }
}
