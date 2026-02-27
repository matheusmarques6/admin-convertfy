import { NextRequest, NextResponse } from "next/server"

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "pt-BR": {
    title: "Rastrear Pedido",
    placeholder: "Código de rastreio ou nº do pedido",
    button: "Buscar",
    status_pending: "Pendente",
    status_in_transit: "Em Trânsito",
    status_delivered: "Entregue",
    status_pick_up: "Pronto p/ Retirada",
    status_alert: "Alerta",
    status_expired: "Expirado",
    not_found: "Nenhum resultado encontrado",
    error: "Erro ao buscar. Tente novamente.",
    estimated: "Previsão de entrega",
    carrier: "Transportadora",
    close: "Fechar",
    powered_by: "Powered by Convertfy",
  },
  en: {
    title: "Track Order",
    placeholder: "Tracking number or order number",
    button: "Search",
    status_pending: "Pending",
    status_in_transit: "In Transit",
    status_delivered: "Delivered",
    status_pick_up: "Ready for Pickup",
    status_alert: "Alert",
    status_expired: "Expired",
    not_found: "No results found",
    error: "Error searching. Try again.",
    estimated: "Estimated delivery",
    carrier: "Carrier",
    close: "Close",
    powered_by: "Powered by Convertfy",
  },
  es: {
    title: "Rastrear Pedido",
    placeholder: "Código de rastreo o nº de pedido",
    button: "Buscar",
    status_pending: "Pendiente",
    status_in_transit: "En Tránsito",
    status_delivered: "Entregado",
    status_pick_up: "Listo para Recoger",
    status_alert: "Alerta",
    status_expired: "Expirado",
    not_found: "No se encontraron resultados",
    error: "Error al buscar. Inténtelo de nuevo.",
    estimated: "Entrega estimada",
    carrier: "Transportista",
    close: "Cerrar",
    powered_by: "Powered by Convertfy",
  },
  de: {
    title: "Bestellung verfolgen",
    placeholder: "Sendungsnummer oder Bestellnummer",
    button: "Suchen",
    status_pending: "Ausstehend",
    status_in_transit: "Unterwegs",
    status_delivered: "Zugestellt",
    status_pick_up: "Abholbereit",
    status_alert: "Warnung",
    status_expired: "Abgelaufen",
    not_found: "Keine Ergebnisse gefunden",
    error: "Fehler bei der Suche. Versuchen Sie es erneut.",
    estimated: "Voraussichtliche Lieferung",
    carrier: "Spediteur",
    close: "Schließen",
    powered_by: "Powered by Convertfy",
  },
  it: {
    title: "Traccia Ordine",
    placeholder: "Numero di tracciamento o ordine",
    button: "Cerca",
    status_pending: "In attesa",
    status_in_transit: "In Transito",
    status_delivered: "Consegnato",
    status_pick_up: "Pronto al Ritiro",
    status_alert: "Avviso",
    status_expired: "Scaduto",
    not_found: "Nessun risultato trovato",
    error: "Errore nella ricerca. Riprova.",
    estimated: "Consegna stimata",
    carrier: "Corriere",
    close: "Chiudi",
    powered_by: "Powered by Convertfy",
  },
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin

  const script = `
(function() {
  'use strict';

  var scriptEl = document.currentScript || document.querySelector('script[data-store-id]');
  if (!scriptEl) return;

  var storeId = scriptEl.dataset.storeId || '';
  var color = scriptEl.dataset.color || '#3b82f6';
  var lang = scriptEl.dataset.lang || 'pt-BR';
  var apiBase = '${origin}';

  if (!storeId) { console.warn('[Convertfy] Missing data-store-id'); return; }

  var t = ${JSON.stringify(TRANSLATIONS)}[lang] || ${JSON.stringify(TRANSLATIONS["pt-BR"])};

  // Create Shadow DOM container
  var host = document.createElement('div');
  host.id = 'convertfy-tracking-widget';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
  document.body.appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  var styles = document.createElement('style');
  styles.textContent = \`
    * { margin:0; padding:0; box-sizing:border-box; }
    .ct-btn { width:56px; height:56px; border-radius:50%; background:\${color}; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:transform .2s,box-shadow .2s; }
    .ct-btn:hover { transform:scale(1.05); box-shadow:0 6px 20px rgba(0,0,0,0.2); }
    .ct-btn svg { width:24px; height:24px; fill:none; stroke:#fff; stroke-width:2; }
    .ct-panel { display:none; position:absolute; bottom:70px; right:0; width:360px; max-height:500px; background:#fff; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,0.12); overflow:hidden; }
    .ct-panel.open { display:block; }
    .ct-header { padding:16px 20px; background:\${color}; color:#fff; display:flex; align-items:center; justify-content:space-between; }
    .ct-header h3 { font-size:15px; font-weight:600; }
    .ct-close { background:none; border:none; color:rgba(255,255,255,0.8); cursor:pointer; font-size:20px; line-height:1; padding:4px; }
    .ct-close:hover { color:#fff; }
    .ct-body { padding:16px 20px; max-height:380px; overflow-y:auto; }
    .ct-form { display:flex; gap:8px; margin-bottom:12px; }
    .ct-input { flex:1; height:40px; border:1px solid #e2e8f0; border-radius:8px; padding:0 12px; font-size:14px; outline:none; color:#1e293b; }
    .ct-input:focus { border-color:\${color}; box-shadow:0 0 0 2px \${color}22; }
    .ct-submit { height:40px; padding:0 16px; background:\${color}; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; }
    .ct-submit:hover { opacity:0.9; }
    .ct-submit:disabled { opacity:0.5; cursor:not-allowed; }
    .ct-status { display:flex; align-items:center; gap:10px; padding:12px; background:#f8fafc; border-radius:10px; margin-bottom:12px; }
    .ct-status-icon { width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .ct-status-icon svg { width:20px; height:20px; }
    .ct-status-text h4 { font-size:13px; font-weight:600; color:#1e293b; }
    .ct-status-text p { font-size:11px; color:#64748b; margin-top:2px; }
    .ct-timeline { position:relative; padding-left:24px; }
    .ct-timeline::before { content:''; position:absolute; left:7px; top:8px; bottom:8px; width:2px; background:#e2e8f0; }
    .ct-event { position:relative; padding-bottom:16px; }
    .ct-event:last-child { padding-bottom:0; }
    .ct-event .dot { position:absolute; left:-20px; top:4px; width:10px; height:10px; border-radius:50%; background:#cbd5e1; }
    .ct-event:first-child .dot { background:\${color}; width:12px; height:12px; left:-21px; top:3px; }
    .ct-event .desc { font-size:13px; color:#334155; line-height:1.4; }
    .ct-event .meta { font-size:11px; color:#94a3b8; margin-top:2px; }
    .ct-empty { text-align:center; padding:24px 0; color:#94a3b8; font-size:13px; }
    .ct-footer { padding:8px 20px; text-align:center; border-top:1px solid #f1f5f9; }
    .ct-footer span { font-size:10px; color:#cbd5e1; }
    .ct-loading { display:flex; justify-content:center; padding:24px 0; }
    .ct-spinner { width:24px; height:24px; border:3px solid #e2e8f0; border-top-color:\${color}; border-radius:50%; animation:ct-spin 0.8s linear infinite; }
    @keyframes ct-spin { to { transform:rotate(360deg); } }
    @media (max-width: 400px) { .ct-panel { width:calc(100vw - 32px); right:-4px; } }
  \`;
  shadow.appendChild(styles);

  var container = document.createElement('div');
  shadow.appendChild(container);

  container.innerHTML = \`
    <div class="ct-panel" id="ctPanel">
      <div class="ct-header">
        <h3>\${t.title}</h3>
        <button class="ct-close" id="ctClose">&times;</button>
      </div>
      <div class="ct-body" id="ctBody">
        <form class="ct-form" id="ctForm">
          <input class="ct-input" id="ctInput" placeholder="\${t.placeholder}" autocomplete="off" />
          <button class="ct-submit" type="submit">\${t.button}</button>
        </form>
        <div id="ctResult"></div>
      </div>
      <div class="ct-footer"><span>\${t.powered_by}</span></div>
    </div>
    <button class="ct-btn" id="ctToggle">
      <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    </button>
  \`;

  var panel = shadow.getElementById('ctPanel');
  var toggle = shadow.getElementById('ctToggle');
  var closeBtn = shadow.getElementById('ctClose');
  var form = shadow.getElementById('ctForm');
  var input = shadow.getElementById('ctInput');
  var resultDiv = shadow.getElementById('ctResult');

  toggle.addEventListener('click', function() {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) input.focus();
  });

  closeBtn.addEventListener('click', function() {
    panel.classList.remove('open');
  });

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;

    resultDiv.innerHTML = '<div class="ct-loading"><div class="ct-spinner"></div></div>';

    var isOrder = /^#?\\\\d+$/.test(q) || q.startsWith('#');
    var body = {};
    if (isOrder) { body.order_number = q.replace(/^#/, ''); }
    else { body.tracking_number = q; }
    body.store_id = storeId;

    fetch(apiBase + '/api/tracking/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.found && data.tracking) {
        renderTracking(data.tracking);
      } else if (data.found && data.orders && data.orders.length > 0) {
        var order = data.orders[0];
        if (order.tracking_codes && order.tracking_codes.length > 0) {
          renderTracking(Object.assign({}, order.tracking_codes[0], { order_name: order.order_name }));
        } else {
          resultDiv.innerHTML = '<div class="ct-empty">' + t.not_found + '</div>';
        }
      } else {
        resultDiv.innerHTML = '<div class="ct-empty">' + t.not_found + '</div>';
      }
    })
    .catch(function() {
      resultDiv.innerHTML = '<div class="ct-empty">' + t.error + '</div>';
    });
  });

  function renderTracking(data) {
    var statusColors = {
      pending: { bg: '#f1f5f9', fg: '#64748b' },
      in_transit: { bg: '#fffbeb', fg: '#d97706' },
      delivered: { bg: '#ecfdf5', fg: '#059669' },
      pick_up: { bg: '#eff6ff', fg: '#2563eb' },
      alert: { bg: '#fef2f2', fg: '#dc2626' },
      expired: { bg: '#fef2f2', fg: '#dc2626' },
      undelivered: { bg: '#fef2f2', fg: '#dc2626' }
    };
    var sc = statusColors[data.status] || statusColors.pending;
    var statusLabel = t['status_' + data.status] || data.status;

    var html = '<div class="ct-status">';
    html += '<div class="ct-status-icon" style="background:' + sc.bg + '">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="' + sc.fg + '" stroke-width="2">';
    if (data.status === 'delivered') {
      html += '<polyline points="20 6 9 17 4 12"/>';
    } else if (data.status === 'in_transit') {
      html += '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';
    } else {
      html += '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    }
    html += '</svg></div>';
    html += '<div class="ct-status-text">';
    html += '<h4>' + statusLabel + '</h4>';
    if (data.status_detail) html += '<p>' + data.status_detail + '</p>';
    if (data.carrier_name) html += '<p>' + t.carrier + ': ' + data.carrier_name + '</p>';
    html += '</div></div>';

    if (data.events && data.events.length > 0) {
      html += '<div class="ct-timeline">';
      data.events.forEach(function(evt) {
        html += '<div class="ct-event"><div class="dot"></div>';
        html += '<div class="desc">' + evt.description + '</div>';
        var meta = [];
        if (evt.date) {
          try { meta.push(new Date(evt.date).toLocaleString()); } catch(e) { meta.push(evt.date); }
        }
        if (evt.location) meta.push(evt.location);
        if (meta.length) html += '<div class="meta">' + meta.join(' • ') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    resultDiv.innerHTML = html;
  }
})();
`

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
