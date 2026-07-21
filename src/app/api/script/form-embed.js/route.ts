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
      iframe.style.minHeight = (parseInt(el.getAttribute("data-convertfy-height"), 10) || 600) + "px";
      iframe.setAttribute("allowtransparency", "true");
      el.appendChild(iframe);
    }
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
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
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
