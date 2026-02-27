import { NextResponse } from "next/server"

export const dynamic = "force-static"

export async function GET() {
  const js = getWidgetScript()

  return new NextResponse(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}

function getWidgetScript(): string {
  return `(function() {
  "use strict";

  // ==========================================
  // Convertfy Tracking Widget
  // ==========================================

  var SCRIPT = document.currentScript;
  var STORE_ID = SCRIPT && SCRIPT.getAttribute("data-store-id");
  var BASE_URL = SCRIPT ? SCRIPT.src.replace("/api/tracking/widget.js", "") : "";
  var CONTAINER_ID = "convertfy-tracking";

  if (!STORE_ID) {
    console.error("[Convertfy Tracking] data-store-id ausente no script tag.");
    return;
  }

  // ==========================================
  // Default Config
  // ==========================================

  var DEFAULT_CONFIG = {
    primary_color: "#000000",
    logo_url: null,
    custom_css: null,
    show_carrier_logo: true,
    language: "pt-BR",
    placeholder_tracking: "Digite seu código de rastreio",
    placeholder_email: "Digite seu email"
  };

  // ==========================================
  // Status Map
  // ==========================================

  var STATUS_MAP = {
    not_found:      { label: "Não encontrado",        icon: "🔍", color: "#6b7280" },
    info_received:  { label: "Informações recebidas",  icon: "📋", color: "#3b82f6" },
    in_transit:     { label: "Em trânsito",            icon: "🚚", color: "#eab308" },
    out_for_delivery: { label: "Saiu para entrega",    icon: "📦", color: "#f97316" },
    delivered:      { label: "Entregue",               icon: "✅", color: "#22c55e" },
    expired:        { label: "Expirado",               icon: "⏰", color: "#6b7280" },
    undelivered:    { label: "Não entregue",           icon: "❌", color: "#ef4444" },
    exception:      { label: "Exceção",                icon: "⚠️", color: "#ef4444" },
    pending:        { label: "Pendente",               icon: "⏳", color: "#6b7280" }
  };

  // ==========================================
  // CSS
  // ==========================================

  function buildCSS(cfg) {
    var pc = cfg.primary_color || "#000000";
    return \`
      :host { all: initial; display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .ct-root { max-width: 600px; margin: 0 auto; padding: 16px; }

      /* Logo */
      .ct-logo { text-align: center; margin-bottom: 16px; }
      .ct-logo img { max-height: 40px; }

      /* Tabs */
      .ct-tabs { display: flex; border-bottom: 2px solid #e5e7eb; margin-bottom: 16px; }
      .ct-tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; font-size: 14px; font-weight: 500; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
      .ct-tab:hover { color: \${pc}; }
      .ct-tab.active { color: \${pc}; border-bottom-color: \${pc}; }

      /* Form */
      .ct-form { display: flex; gap: 8px; margin-bottom: 16px; }
      .ct-input { flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.2s; }
      .ct-input:focus { border-color: \${pc}; }
      .ct-btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #fff; background: \${pc}; cursor: pointer; transition: opacity 0.2s; white-space: nowrap; }
      .ct-btn:hover { opacity: 0.9; }
      .ct-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* Loading */
      .ct-loading { text-align: center; padding: 32px 0; }
      .ct-spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: \${pc}; border-radius: 50%; animation: ct-spin 0.8s linear infinite; }
      @keyframes ct-spin { to { transform: rotate(360deg); } }

      /* Empty / Error */
      .ct-empty, .ct-error { text-align: center; padding: 32px 16px; color: #6b7280; font-size: 14px; }
      .ct-error { color: #ef4444; }
      .ct-retry { margin-top: 12px; padding: 8px 16px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }
      .ct-retry:hover { background: #f9fafb; }

      /* Tracking Result */
      .ct-result { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
      .ct-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
      .ct-tracking-code { font-size: 13px; color: #6b7280; margin-top: 8px; }

      /* Timeline */
      .ct-timeline { margin-top: 16px; padding-left: 20px; border-left: 2px solid #e5e7eb; }
      .ct-event { position: relative; padding: 0 0 16px 16px; }
      .ct-event:last-child { padding-bottom: 0; }
      .ct-event::before { content: ""; position: absolute; left: -7px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #d1d5db; border: 2px solid #fff; }
      .ct-event:first-child::before { background: \${pc}; }
      .ct-event-date { font-size: 12px; color: #9ca3af; }
      .ct-event-desc { font-size: 14px; margin-top: 2px; }
      .ct-event-location { font-size: 12px; color: #6b7280; }

      /* Order Card (email search) */
      .ct-order { border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
      .ct-order-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; cursor: pointer; background: #f9fafb; }
      .ct-order-header:hover { background: #f3f4f6; }
      .ct-order-number { font-weight: 600; font-size: 14px; }
      .ct-order-date { font-size: 12px; color: #6b7280; }
      .ct-order-arrow { transition: transform 0.2s; font-size: 12px; }
      .ct-order-arrow.open { transform: rotate(180deg); }
      .ct-order-body { padding: 0 16px 16px; display: none; }
      .ct-order-body.open { display: block; }
      .ct-order-items { margin: 12px 0; }
      .ct-item { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
      .ct-item:last-child { border-bottom: none; }
      .ct-order-total { display: flex; justify-content: space-between; font-weight: 600; font-size: 14px; padding-top: 8px; border-top: 1px solid #e5e7eb; }

      /* Responsive */
      @media (max-width: 480px) {
        .ct-form { flex-direction: column; }
        .ct-btn { width: 100%; }
      }
    \`;
  }

  // ==========================================
  // Render
  // ==========================================

  function init() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      SCRIPT.parentNode.insertBefore(container, SCRIPT);
    }

    var shadow = container.attachShadow({ mode: "open" });

    // Load config then render
    fetchConfig(function(cfg) {
      var config = Object.assign({}, DEFAULT_CONFIG, cfg || {});
      var style = document.createElement("style");
      style.textContent = buildCSS(config);
      shadow.appendChild(style);

      if (config.custom_css) {
        var customStyle = document.createElement("style");
        customStyle.textContent = config.custom_css;
        shadow.appendChild(customStyle);
      }

      var root = document.createElement("div");
      root.className = "ct-root";
      shadow.appendChild(root);

      renderWidget(root, config);
    });
  }

  function fetchConfig(cb) {
    fetch(BASE_URL + "/api/tracking/config?store_id=" + encodeURIComponent(STORE_ID))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { cb(d && d.widget_config ? d.widget_config : null); })
      .catch(function() { cb(null); });
  }

  // ==========================================
  // Widget Logic
  // ==========================================

  function renderWidget(root, config) {
    var currentTab = "code";

    // Logo
    if (config.logo_url) {
      var logo = document.createElement("div");
      logo.className = "ct-logo";
      logo.innerHTML = '<img src="' + escapeAttr(config.logo_url) + '" alt="Logo" />';
      root.appendChild(logo);
    }

    // Tabs
    var tabs = document.createElement("div");
    tabs.className = "ct-tabs";
    var tabCode = createTab("Código de Rastreio", true);
    var tabEmail = createTab("Email", false);
    tabs.appendChild(tabCode);
    tabs.appendChild(tabEmail);
    root.appendChild(tabs);

    // Form
    var form = document.createElement("div");
    form.className = "ct-form";
    var input = document.createElement("input");
    input.className = "ct-input";
    input.type = "text";
    input.placeholder = config.placeholder_tracking;
    var btn = document.createElement("button");
    btn.className = "ct-btn";
    btn.textContent = "Buscar";
    form.appendChild(input);
    form.appendChild(btn);
    root.appendChild(form);

    // Results area
    var results = document.createElement("div");
    results.className = "ct-results";
    root.appendChild(results);

    // Tab switching
    tabCode.addEventListener("click", function() {
      currentTab = "code";
      tabCode.classList.add("active");
      tabEmail.classList.remove("active");
      input.type = "text";
      input.placeholder = config.placeholder_tracking;
      input.value = "";
      results.innerHTML = "";
    });

    tabEmail.addEventListener("click", function() {
      currentTab = "email";
      tabEmail.classList.add("active");
      tabCode.classList.remove("active");
      input.type = "email";
      input.placeholder = config.placeholder_email;
      input.value = "";
      results.innerHTML = "";
    });

    // Search
    function doSearch() {
      var val = input.value.trim();
      if (!val) return;

      btn.disabled = true;
      results.innerHTML = '<div class="ct-loading"><div class="ct-spinner"></div></div>';

      if (currentTab === "code") {
        searchByCode(val, results, function() { btn.disabled = false; });
      } else {
        searchByEmail(val, results, function() { btn.disabled = false; });
      }
    }

    btn.addEventListener("click", doSearch);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") doSearch();
    });
  }

  function createTab(text, active) {
    var tab = document.createElement("div");
    tab.className = "ct-tab" + (active ? " active" : "");
    tab.textContent = text;
    return tab;
  }

  // ==========================================
  // API Calls
  // ==========================================

  function searchByCode(code, container, done) {
    fetch(BASE_URL + "/api/tracking/by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: STORE_ID, tracking_code: code })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      container.innerHTML = "";
      if (data.error) {
        renderError(container, data.error);
      } else {
        renderTrackingResult(container, data);
      }
      done();
    })
    .catch(function() {
      container.innerHTML = "";
      renderError(container, "Erro ao buscar rastreio. Tente novamente.");
      done();
    });
  }

  function searchByEmail(email, container, done) {
    fetch(BASE_URL + "/api/tracking/by-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_id: STORE_ID, email: email })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      container.innerHTML = "";
      if (data.error) {
        renderError(container, data.error);
      } else if (!data.orders || data.orders.length === 0) {
        renderEmpty(container);
      } else {
        renderOrderList(container, data.orders);
      }
      done();
    })
    .catch(function() {
      container.innerHTML = "";
      renderError(container, "Erro ao buscar pedidos. Tente novamente.");
      done();
    });
  }

  // ==========================================
  // Rendering Helpers
  // ==========================================

  function renderTrackingResult(container, data) {
    var div = document.createElement("div");
    div.className = "ct-result";

    // Status badge
    var statusInfo = STATUS_MAP[data.status] || STATUS_MAP.pending;
    var badge = document.createElement("div");
    badge.className = "ct-status-badge";
    badge.style.background = statusInfo.color + "1a";
    badge.style.color = statusInfo.color;
    badge.textContent = statusInfo.icon + " " + statusInfo.label;
    div.appendChild(badge);

    // Tracking code
    if (data.tracking_code) {
      var codeEl = document.createElement("div");
      codeEl.className = "ct-tracking-code";
      codeEl.textContent = "Código: " + data.tracking_code;
      div.appendChild(codeEl);
    }

    // Carrier
    if (data.carrier) {
      var carrierEl = document.createElement("div");
      carrierEl.className = "ct-tracking-code";
      carrierEl.textContent = "Transportadora: " + data.carrier;
      div.appendChild(carrierEl);
    }

    // Delivery date
    if (data.estimated_delivery) {
      var delivEl = document.createElement("div");
      delivEl.className = "ct-tracking-code";
      delivEl.textContent = "Previsão: " + formatDate(data.estimated_delivery);
      div.appendChild(delivEl);
    }

    // Timeline
    if (data.events && data.events.length > 0) {
      var timeline = document.createElement("div");
      timeline.className = "ct-timeline";
      data.events.forEach(function(evt) {
        var evDiv = document.createElement("div");
        evDiv.className = "ct-event";

        var dateEl = document.createElement("div");
        dateEl.className = "ct-event-date";
        dateEl.textContent = formatDateTime(evt.date);
        evDiv.appendChild(dateEl);

        var descEl = document.createElement("div");
        descEl.className = "ct-event-desc";
        descEl.textContent = evt.description;
        evDiv.appendChild(descEl);

        if (evt.location) {
          var locEl = document.createElement("div");
          locEl.className = "ct-event-location";
          locEl.textContent = evt.location;
          evDiv.appendChild(locEl);
        }

        timeline.appendChild(evDiv);
      });
      div.appendChild(timeline);
    }

    container.appendChild(div);
  }

  function renderOrderList(container, orders) {
    orders.forEach(function(item, idx) {
      var order = item.order;
      if (!order) return;

      var card = document.createElement("div");
      card.className = "ct-order";

      // Header
      var header = document.createElement("div");
      header.className = "ct-order-header";

      var left = document.createElement("div");
      var numEl = document.createElement("span");
      numEl.className = "ct-order-number";
      numEl.textContent = order.order_number;
      left.appendChild(numEl);

      var dateEl = document.createElement("span");
      dateEl.className = "ct-order-date";
      dateEl.textContent = " — " + formatDate(order.order_date);
      left.appendChild(dateEl);

      var arrow = document.createElement("span");
      arrow.className = "ct-order-arrow";
      arrow.textContent = "▼";

      header.appendChild(left);
      header.appendChild(arrow);
      card.appendChild(header);

      // Body
      var body = document.createElement("div");
      body.className = "ct-order-body" + (idx === 0 ? " open" : "");
      if (idx === 0) arrow.classList.add("open");

      // Items
      if (order.items && order.items.length > 0) {
        var itemsDiv = document.createElement("div");
        itemsDiv.className = "ct-order-items";
        order.items.forEach(function(it) {
          var row = document.createElement("div");
          row.className = "ct-item";
          row.innerHTML =
            "<span>" + escapeHtml(it.title) + " x" + it.quantity + "</span>" +
            "<span>" + formatCurrency(it.price, order.currency) + "</span>";
          itemsDiv.appendChild(row);
        });
        body.appendChild(itemsDiv);
      }

      // Total
      var total = document.createElement("div");
      total.className = "ct-order-total";
      total.innerHTML = "<span>Total</span><span>" + formatCurrency(order.total_price, order.currency) + "</span>";
      body.appendChild(total);

      // Tracking status
      if (item.tracking) {
        renderTrackingResult(body, item.tracking);
      } else if (order.tracking_code) {
        var pending = document.createElement("div");
        pending.className = "ct-tracking-code";
        pending.textContent = "Código de rastreio: " + order.tracking_code;
        body.appendChild(pending);
      } else {
        var noTrack = document.createElement("div");
        noTrack.className = "ct-empty";
        noTrack.style.padding = "12px 0";
        noTrack.textContent = "Rastreio ainda não disponível";
        body.appendChild(noTrack);
      }

      card.appendChild(body);
      container.appendChild(card);

      // Toggle accordion
      header.addEventListener("click", function() {
        var isOpen = body.classList.contains("open");
        body.classList.toggle("open");
        arrow.classList.toggle("open");
      });
    });
  }

  function renderEmpty(container) {
    var div = document.createElement("div");
    div.className = "ct-empty";
    div.textContent = "Nenhum pedido encontrado para este email.";
    container.appendChild(div);
  }

  function renderError(container, msg) {
    var div = document.createElement("div");
    div.className = "ct-error";
    div.textContent = msg || "Ocorreu um erro. Tente novamente.";

    var retryBtn = document.createElement("button");
    retryBtn.className = "ct-retry";
    retryBtn.textContent = "Tentar novamente";
    retryBtn.addEventListener("click", function() { container.innerHTML = ""; });
    div.appendChild(retryBtn);

    container.appendChild(div);
  }

  // ==========================================
  // Utilities
  // ==========================================

  function formatDate(str) {
    if (!str) return "";
    try {
      var d = new Date(str);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch(e) { return str; }
  }

  function formatDateTime(str) {
    if (!str) return "";
    try {
      var d = new Date(str);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
        " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch(e) { return str; }
  }

  function formatCurrency(val, currency) {
    var num = parseFloat(val);
    if (isNaN(num)) return val;
    try {
      return num.toLocaleString("pt-BR", { style: "currency", currency: currency || "BRL" });
    } catch(e) {
      return (currency || "R$") + " " + num.toFixed(2);
    }
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str || ""));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ==========================================
  // Boot
  // ==========================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();`
}
