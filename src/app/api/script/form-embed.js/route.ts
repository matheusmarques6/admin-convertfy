import { NextResponse } from "next/server"

/**
 * GET /api/script/form-embed.js
 *
 * Script embedável dos formulários públicos do CRM. O cliente cola na
 * página de vendas:
 *
 *   <div data-convertfy-form="https://app.convertfy.me/forms/{slug}"></div>
 *   <script src="https://app.convertfy.me/api/script/form-embed.js" defer></script>
 *
 * `data-convertfy-height="tela"` faz o iframe ocupar a janela inteira —
 * é o que um funil conversacional pede, e o que a página
 * `convertfy.me/aplicacao` usa.
 *
 * O script roda NA página host (mesmo domínio da landing), então enxerga a
 * query string dela — o que o iframe estático nunca enxerga. Ele:
 *   1. Captura utm_* / gclid / fbclid da URL da página e persiste o FIRST
 *      TOUCH em localStorage (90 dias) — sobrevive à navegação interna.
 *   2. Monta o iframe do form repassando esses parâmetros no src.
 *   3. Decora, no clique, qualquer <a> que aponte pra /forms/ com os
 *      mesmos parâmetros (caso botão/link em vez de embed).
 *
 * Sem isso a atribuição se perde: iframe cross-origin não herda a query da
 * página-mãe e o referrer chega cortado pelo navegador (só a origem).
 */

export const dynamic = "force-static"

const SCRIPT = `
(function () {
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
  var STORAGE_KEY = "convertfy_utm_first";
  var MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

  function readUrlParams() {
    var out = {};
    var found = false;
    try {
      var sp = new URLSearchParams(window.location.search);
      for (var i = 0; i < PARAMS.length; i++) {
        var v = sp.get(PARAMS[i]);
        if (v) { out[PARAMS[i]] = v; found = true; }
      }
    } catch (e) { /* URLSearchParams indisponível — segue sem captura */ }
    return found ? out : null;
  }

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.params || !data.ts) return null;
      if (Date.now() - data.ts > MAX_AGE_MS) return null;
      return data.params;
    } catch (e) { return null; }
  }

  function storeFirstTouch(params) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ params: params, ts: Date.now() }));
    } catch (e) { /* localStorage bloqueado — segue só com a URL atual */ }
  }

  var urlParams = readUrlParams();
  var stored = readStored();
  // First touch vence no armazenamento; só grava se não há registro válido.
  if (urlParams && !stored) storeFirstTouch(urlParams);
  // Pro uso imediato, a URL atual (clique mais recente) vence o armazenado.
  var effective = urlParams || stored || {};

  function decorateUrl(rawUrl, extra) {
    try {
      var u = new URL(rawUrl, window.location.href);
      if (extra) {
        for (var ek in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, ek)) u.searchParams.set(ek, extra[ek]);
        }
      }
      for (var k in effective) {
        if (Object.prototype.hasOwnProperty.call(effective, k) && !u.searchParams.get(k)) {
          u.searchParams.set(k, effective[k]);
        }
      }
      return u.toString();
    } catch (e) { return rawUrl; }
  }

  function mountAll() {
    var nodes = document.querySelectorAll("[data-convertfy-form]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-convertfy-mounted")) continue;
      var formUrl = el.getAttribute("data-convertfy-form");
      if (!formUrl) continue;
      el.setAttribute("data-convertfy-mounted", "1");

      var iframe = document.createElement("iframe");
      iframe.src = decorateUrl(formUrl, { embed: "1" });
      iframe.title = el.getAttribute("data-convertfy-title") || "Formul\\u00e1rio";
      iframe.style.border = "0";
      iframe.style.background = "transparent";
      iframe.style.width = "100%";
      // "tela" = o formulário OCUPA a janela. É o que um funil
      // conversacional pede: ele já centraliza a pergunta na própria
      // viewport, e uma altura fixa o deixaria com barra de rolagem
      // dentro de outra barra de rolagem. \`100dvh\` porque no iOS o
      // \`100vh\` conta a barra do navegador que some ao rolar, e a
      // pergunta fica cortada.
      var altura = el.getAttribute("data-convertfy-height");
      if (altura === "tela" || altura === "fullscreen") {
        iframe.style.height = "100vh";
        iframe.style.height = "100dvh";
        iframe.style.display = "block";
      } else {
        iframe.style.minHeight = (parseInt(altura, 10) || 600) + "px";
      }
      iframe.setAttribute("allowtransparency", "true");
      el.appendChild(iframe);
    }
  }

  // ── Pop-up e painel lateral (handoff Compartilhar, set/2026) ──
  //
  //   <button data-convertfy-popup="https://app…/forms/slug">Abrir</button>
  //   <script src="…/form-embed.js" data-convertfy-slider="https://app…/forms/slug" data-convertfy-side="right" data-convertfy-label="Fale com a gente" defer></script>
  //
  // O iframe só nasce no clique — a página host não paga o formulário
  // antes de alguém pedir. O véu fecha por Esc, pelo ✕ e pelo clique
  // fora; o painel lateral tem uma aba fixa que abre/fecha.
  var CSS = ".cfy-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(9,10,14,.72);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .18s}" +
    ".cfy-ov.on{opacity:1}.cfy-box{position:relative;width:min(760px,100%);height:min(720px,100%);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 28px 70px rgba(0,0,0,.35)}" +
    ".cfy-box iframe{border:0;width:100%;height:100%;display:block}" +
    ".cfy-x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font-size:18px;line-height:32px;cursor:pointer;z-index:2}" +
    ".cfy-sl{position:fixed;top:0;bottom:0;width:min(480px,100%);z-index:2147483000;background:#fff;box-shadow:0 0 60px rgba(0,0,0,.3);transform:translateX(100%);transition:transform .22s}" +
    ".cfy-sl.left{left:0;transform:translateX(-100%)}.cfy-sl.right{right:0}.cfy-sl.on{transform:none}.cfy-sl iframe{border:0;width:100%;height:100%;display:block}" +
    ".cfy-tab{position:fixed;top:50%;z-index:2147483001;transform:rotate(-90deg);transform-origin:bottom right;right:0;background:#4E62D8;color:#fff;border:0;border-radius:8px 8px 0 0;padding:8px 16px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 -4px 16px rgba(0,0,0,.18)}" +
    ".cfy-tab.left{right:auto;left:0;transform:rotate(90deg);transform-origin:bottom left}";
  function injectCss() {
    if (document.getElementById("cfy-embed-css")) return;
    var st = document.createElement("style");
    st.id = "cfy-embed-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function makeIframe(url) {
    var f = document.createElement("iframe");
    f.src = decorateUrl(url, { embed: "1" });
    f.title = "Formul\u00e1rio";
    f.setAttribute("allowtransparency", "true");
    return f;
  }
  function openPopup(url) {
    injectCss();
    var ov = document.createElement("div");
    ov.className = "cfy-ov";
    var box = document.createElement("div");
    box.className = "cfy-box";
    var x = document.createElement("button");
    x.className = "cfy-x";
    x.setAttribute("aria-label", "Fechar");
    x.innerHTML = "&times;";
    box.appendChild(x);
    box.appendChild(makeIframe(url));
    ov.appendChild(box);
    document.body.appendChild(ov);
    var close = function () { ov.classList.remove("on"); setTimeout(function () { ov.remove(); }, 200); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    x.addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(function () { ov.classList.add("on"); });
  }
  document.addEventListener("click", function (ev) {
    var el = ev.target;
    while (el && !(el.getAttribute && el.getAttribute("data-convertfy-popup"))) el = el.parentElement;
    if (!el) return;
    ev.preventDefault();
    openPopup(el.getAttribute("data-convertfy-popup"));
  }, true);
  function mountSlider() {
    var me = document.currentScript || document.querySelector("script[data-convertfy-slider]");
    if (!me) return;
    var url = me.getAttribute("data-convertfy-slider");
    if (!url || me.getAttribute("data-convertfy-mounted")) return;
    me.setAttribute("data-convertfy-mounted", "1");
    injectCss();
    var side = me.getAttribute("data-convertfy-side") === "left" ? "left" : "right";
    var panel = document.createElement("div");
    panel.className = "cfy-sl " + side;
    var tab = document.createElement("button");
    tab.className = "cfy-tab " + side;
    tab.textContent = me.getAttribute("data-convertfy-label") || "Fale com a gente";
    var aberto = false, carregado = false;
    tab.addEventListener("click", function () {
      if (!carregado) { panel.appendChild(makeIframe(url)); carregado = true; }
      aberto = !aberto;
      panel.classList.toggle("on", aberto);
      tab.textContent = aberto ? "Fechar" : (me.getAttribute("data-convertfy-label") || "Fale com a gente");
    });
    document.body.appendChild(panel);
    document.body.appendChild(tab);
  }

  // Botões/links pra /forms/ ganham os parâmetros no momento do clique.
  document.addEventListener("click", function (ev) {
    var el = ev.target;
    while (el && el.tagName !== "A") el = el.parentElement;
    if (!el || !el.href) return;
    if (el.href.indexOf("/forms/") === -1) return;
    el.href = decorateUrl(el.href);
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mountAll(); mountSlider(); });
  } else {
    mountAll();
    mountSlider();
  }
})();
`

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
