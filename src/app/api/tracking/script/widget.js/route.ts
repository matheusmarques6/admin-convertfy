import { NextRequest, NextResponse } from "next/server"

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "pt-BR": {
    title: "Rastreie seu pedido",
    subtitle: "Insira o codigo de rastreamento para acompanhar sua entrega",
    placeholder: "Digite seu codigo de rastreamento",
    button: "Rastrear",
    searching: "Buscando...",
    status_pending: "Pendente",
    status_in_transit: "Em Transito",
    status_delivered: "Entregue",
    status_pick_up: "Pronto para Retirada",
    status_alert: "Alerta",
    status_expired: "Expirado",
    status_undelivered: "Nao Entregue",
    not_found: "Nenhum resultado encontrado para este codigo.",
    not_found_desc: "Verifique o codigo digitado e tente novamente.",
    error: "Ocorreu um erro ao buscar. Tente novamente.",
    estimated: "Previsao de entrega",
    carrier: "Transportadora",
    tracking_number: "Codigo de rastreio",
    order: "Pedido",
    last_update: "Ultima atualizacao",
    tracking_history: "Historico de rastreamento",
    powered_by: "Powered by Convertfy",
    new_search: "Nova busca",
  },
  en: {
    title: "Track your order",
    subtitle: "Enter the tracking code to follow your delivery",
    placeholder: "Enter your tracking code",
    button: "Track",
    searching: "Searching...",
    status_pending: "Pending",
    status_in_transit: "In Transit",
    status_delivered: "Delivered",
    status_pick_up: "Ready for Pickup",
    status_alert: "Alert",
    status_expired: "Expired",
    status_undelivered: "Undelivered",
    not_found: "No results found for this code.",
    not_found_desc: "Check the code entered and try again.",
    error: "An error occurred while searching. Try again.",
    estimated: "Estimated delivery",
    carrier: "Carrier",
    tracking_number: "Tracking code",
    order: "Order",
    last_update: "Last update",
    tracking_history: "Tracking history",
    powered_by: "Powered by Convertfy",
    new_search: "New search",
  },
  es: {
    title: "Rastrea tu pedido",
    subtitle: "Ingresa el codigo de seguimiento para rastrear tu envio",
    placeholder: "Ingresa tu codigo de seguimiento",
    button: "Rastrear",
    searching: "Buscando...",
    status_pending: "Pendiente",
    status_in_transit: "En Transito",
    status_delivered: "Entregado",
    status_pick_up: "Listo para Recoger",
    status_alert: "Alerta",
    status_expired: "Expirado",
    status_undelivered: "No Entregado",
    not_found: "No se encontraron resultados para este codigo.",
    not_found_desc: "Verifica el codigo ingresado e intenta nuevamente.",
    error: "Ocurrio un error al buscar. Intenta nuevamente.",
    estimated: "Entrega estimada",
    carrier: "Transportista",
    tracking_number: "Codigo de seguimiento",
    order: "Pedido",
    last_update: "Ultima actualizacion",
    tracking_history: "Historial de seguimiento",
    powered_by: "Powered by Convertfy",
    new_search: "Nueva busqueda",
  },
  fr: {
    title: "Suivez votre commande",
    subtitle: "Entrez le code de suivi pour suivre votre livraison",
    placeholder: "Entrez votre code de suivi",
    button: "Suivre",
    searching: "Recherche...",
    status_pending: "En attente",
    status_in_transit: "En transit",
    status_delivered: "Livre",
    status_pick_up: "Pret pour le retrait",
    status_alert: "Alerte",
    status_expired: "Expire",
    status_undelivered: "Non livre",
    not_found: "Aucun resultat trouve pour ce code.",
    not_found_desc: "Verifiez le code saisi et reessayez.",
    error: "Une erreur est survenue. Reessayez.",
    estimated: "Livraison estimee",
    carrier: "Transporteur",
    tracking_number: "Code de suivi",
    order: "Commande",
    last_update: "Derniere mise a jour",
    tracking_history: "Historique de suivi",
    powered_by: "Powered by Convertfy",
    new_search: "Nouvelle recherche",
  },
  de: {
    title: "Verfolgen Sie Ihre Bestellung",
    subtitle: "Geben Sie die Sendungsnummer ein um Ihre Lieferung zu verfolgen",
    placeholder: "Sendungsnummer eingeben",
    button: "Verfolgen",
    searching: "Suche...",
    status_pending: "Ausstehend",
    status_in_transit: "Unterwegs",
    status_delivered: "Zugestellt",
    status_pick_up: "Abholbereit",
    status_alert: "Warnung",
    status_expired: "Abgelaufen",
    status_undelivered: "Nicht zugestellt",
    not_found: "Keine Ergebnisse fuer diese Nummer gefunden.",
    not_found_desc: "Ueberpruefen Sie die eingegebene Nummer und versuchen Sie es erneut.",
    error: "Fehler bei der Suche. Versuchen Sie es erneut.",
    estimated: "Voraussichtliche Lieferung",
    carrier: "Spediteur",
    tracking_number: "Sendungsnummer",
    order: "Bestellung",
    last_update: "Letztes Update",
    tracking_history: "Sendungsverlauf",
    powered_by: "Powered by Convertfy",
    new_search: "Neue Suche",
  },
  it: {
    title: "Traccia il tuo ordine",
    subtitle: "Inserisci il codice di tracciamento per seguire la tua consegna",
    placeholder: "Inserisci il codice di tracciamento",
    button: "Traccia",
    searching: "Ricerca...",
    status_pending: "In attesa",
    status_in_transit: "In Transito",
    status_delivered: "Consegnato",
    status_pick_up: "Pronto al Ritiro",
    status_alert: "Avviso",
    status_expired: "Scaduto",
    status_undelivered: "Non consegnato",
    not_found: "Nessun risultato trovato per questo codice.",
    not_found_desc: "Verifica il codice inserito e riprova.",
    error: "Errore nella ricerca. Riprova.",
    estimated: "Consegna stimata",
    carrier: "Corriere",
    tracking_number: "Codice di tracciamento",
    order: "Ordine",
    last_update: "Ultimo aggiornamento",
    tracking_history: "Cronologia tracciamento",
    powered_by: "Powered by Convertfy",
    new_search: "Nuova ricerca",
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
  var containerId = scriptEl.dataset.container || '';
  var apiBase = '${origin}';

  if (!storeId) { console.warn('[Convertfy Tracking] data-store-id is required'); return; }

  var allTranslations = ${JSON.stringify(TRANSLATIONS)};
  var t = allTranslations[lang] || allTranslations['pt-BR'];

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return r+','+g+','+b;
  }

  var colorRgb = hexToRgb(color);

  // Find or create container
  var host;
  if (containerId) {
    host = document.getElementById(containerId);
  }
  if (!host) {
    host = document.createElement('div');
    host.id = 'convertfy-tracking';
    scriptEl.parentNode.insertBefore(host, scriptEl.nextSibling);
  }

  var shadow = host.attachShadow({ mode: 'closed' });

  var styles = document.createElement('style');
  styles.textContent = [
    '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }',
    ':host { display:block; width:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; line-height:1.5; -webkit-font-smoothing:antialiased; }',

    /* Wrapper */
    '.ct-wrap { max-width:680px; margin:0 auto; padding:24px 16px; }',

    /* Search section */
    '.ct-search { background:#fff; border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04); margin-bottom:24px; }',
    '.ct-search-icon { width:56px; height:56px; border-radius:14px; background:rgba('+colorRgb+',0.08); display:flex; align-items:center; justify-content:center; margin:0 auto 20px; }',
    '.ct-search-icon svg { width:28px; height:28px; stroke:'+color+'; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-title { font-size:22px; font-weight:700; color:#0f172a; text-align:center; margin-bottom:6px; letter-spacing:-0.3px; }',
    '.ct-subtitle { font-size:14px; color:#64748b; text-align:center; margin-bottom:24px; }',
    '.ct-form { display:flex; gap:10px; }',
    '.ct-input-wrap { flex:1; position:relative; }',
    '.ct-input { width:100%; height:48px; border:1.5px solid #e2e8f0; border-radius:12px; padding:0 16px; font-size:15px; color:#0f172a; background:#fff; outline:none; transition:border-color .2s,box-shadow .2s; }',
    '.ct-input::placeholder { color:#94a3b8; }',
    '.ct-input:focus { border-color:'+color+'; box-shadow:0 0 0 3px rgba('+colorRgb+',0.12); }',
    '.ct-btn { height:48px; padding:0 24px; background:'+color+'; color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; white-space:nowrap; transition:opacity .15s,transform .15s; display:flex; align-items:center; gap:8px; }',
    '.ct-btn:hover { opacity:0.9; }',
    '.ct-btn:active { transform:scale(0.98); }',
    '.ct-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }',
    '.ct-btn svg { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',

    /* Spinner */
    '.ct-spinner-wrap { display:flex; flex-direction:column; align-items:center; padding:48px 0; }',
    '.ct-spinner { width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:'+color+'; border-radius:50%; animation:ct-spin .7s linear infinite; margin-bottom:12px; }',
    '.ct-spinner-text { font-size:14px; color:#64748b; }',
    '@keyframes ct-spin { to { transform:rotate(360deg); } }',

    /* Result card */
    '.ct-result { background:#fff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.06),0 0 0 1px rgba(0,0,0,0.04); overflow:hidden; animation:ct-fadeIn .3s ease; }',
    '@keyframes ct-fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }',

    /* Status header */
    '.ct-status-header { padding:24px 28px; display:flex; align-items:center; gap:16px; }',
    '.ct-status-badge { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }',
    '.ct-status-badge svg { width:26px; height:26px; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-status-info { flex:1; }',
    '.ct-status-label { font-size:18px; font-weight:700; color:#0f172a; margin-bottom:2px; }',
    '.ct-status-detail { font-size:13px; color:#64748b; }',

    /* Info grid */
    '.ct-info-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:#f1f5f9; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; }',
    '.ct-info-item { background:#fff; padding:14px 28px; }',
    '.ct-info-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8; margin-bottom:4px; }',
    '.ct-info-value { font-size:14px; font-weight:500; color:#1e293b; word-break:break-all; }',

    /* Progress bar */
    '.ct-progress { padding:24px 28px 8px; }',
    '.ct-progress-bar { display:flex; align-items:center; gap:0; position:relative; }',
    '.ct-progress-step { flex:1; display:flex; flex-direction:column; align-items:center; position:relative; z-index:1; }',
    '.ct-progress-dot { width:14px; height:14px; border-radius:50%; background:#e2e8f0; border:2px solid #fff; box-shadow:0 0 0 2px #e2e8f0; transition:all .3s; margin-bottom:8px; }',
    '.ct-progress-dot.active { background:'+color+'; box-shadow:0 0 0 2px '+color+'; }',
    '.ct-progress-dot.completed { background:'+color+'; box-shadow:0 0 0 2px '+color+'; }',
    '.ct-progress-label { font-size:10px; color:#94a3b8; text-align:center; white-space:nowrap; }',
    '.ct-progress-label.active { color:'+color+'; font-weight:600; }',
    '.ct-progress-line { position:absolute; top:7px; left:0; right:0; height:2px; background:#e2e8f0; z-index:0; }',
    '.ct-progress-line-fill { height:100%; background:'+color+'; transition:width .5s ease; }',

    /* Timeline */
    '.ct-timeline-section { padding:20px 28px 28px; }',
    '.ct-timeline-title { font-size:14px; font-weight:600; color:#334155; margin-bottom:16px; display:flex; align-items:center; gap:8px; }',
    '.ct-timeline-title svg { width:16px; height:16px; stroke:'+color+'; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-timeline { position:relative; padding-left:28px; }',
    '.ct-timeline::before { content:""; position:absolute; left:8px; top:6px; bottom:6px; width:2px; background:#e2e8f0; border-radius:1px; }',
    '.ct-event { position:relative; padding-bottom:20px; }',
    '.ct-event:last-child { padding-bottom:0; }',
    '.ct-event-dot { position:absolute; left:-24px; top:5px; width:10px; height:10px; border-radius:50%; background:#cbd5e1; border:2px solid #fff; }',
    '.ct-event:first-child .ct-event-dot { width:12px; height:12px; left:-25px; top:4px; background:'+color+'; box-shadow:0 0 0 3px rgba('+colorRgb+',0.15); }',
    '.ct-event-desc { font-size:14px; color:#1e293b; line-height:1.5; font-weight:500; }',
    '.ct-event:not(:first-child) .ct-event-desc { color:#475569; font-weight:400; }',
    '.ct-event-meta { display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap; }',
    '.ct-event-date { font-size:12px; color:#94a3b8; }',
    '.ct-event-loc { font-size:12px; color:#94a3b8; display:flex; align-items:center; gap:3px; }',
    '.ct-event-loc svg { width:12px; height:12px; stroke:#94a3b8; fill:none; stroke-width:2; }',
    '.ct-event-sep { font-size:12px; color:#cbd5e1; }',

    /* Empty / Error state */
    '.ct-empty { text-align:center; padding:48px 24px; }',
    '.ct-empty-icon { width:64px; height:64px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }',
    '.ct-empty-icon svg { width:32px; height:32px; stroke:#94a3b8; fill:none; stroke-width:1.5; }',
    '.ct-empty-title { font-size:16px; font-weight:600; color:#334155; margin-bottom:4px; }',
    '.ct-empty-desc { font-size:14px; color:#94a3b8; }',

    /* New search button */
    '.ct-new-search { display:flex; align-items:center; justify-content:center; gap:6px; padding:14px; border-top:1px solid #f1f5f9; cursor:pointer; background:none; border-left:0; border-right:0; border-bottom:0; width:100%; font-size:14px; font-weight:500; color:'+color+'; transition:background .15s; }',
    '.ct-new-search:hover { background:#f8fafc; }',
    '.ct-new-search svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; }',

    /* Footer */
    '.ct-footer { text-align:center; padding:16px 0 8px; }',
    '.ct-footer a { font-size:11px; color:#cbd5e1; text-decoration:none; transition:color .15s; }',
    '.ct-footer a:hover { color:#94a3b8; }',

    /* Responsive */
    '@media (max-width:600px) {',
    '  .ct-wrap { padding:16px 12px; }',
    '  .ct-search { padding:24px 20px; border-radius:14px; }',
    '  .ct-title { font-size:19px; }',
    '  .ct-form { flex-direction:column; }',
    '  .ct-btn { width:100%; justify-content:center; }',
    '  .ct-status-header { padding:20px; }',
    '  .ct-info-grid { grid-template-columns:1fr 1fr; }',
    '  .ct-info-item { padding:12px 20px; }',
    '  .ct-timeline-section { padding:16px 20px 24px; }',
    '  .ct-progress { padding:20px 20px 4px; }',
    '  .ct-progress-label { font-size:9px; }',
    '  .ct-result { border-radius:14px; }',
    '}',
  ].join('\\n');
  shadow.appendChild(styles);

  var wrap = document.createElement('div');
  wrap.className = 'ct-wrap';
  shadow.appendChild(wrap);

  // Render search form
  function renderSearch() {
    wrap.innerHTML =
      '<div class="ct-search">' +
        '<div class="ct-search-icon">' +
          '<svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        '</div>' +
        '<h2 class="ct-title">' + escapeHtml(t.title) + '</h2>' +
        '<p class="ct-subtitle">' + escapeHtml(t.subtitle) + '</p>' +
        '<form class="ct-form" id="ctForm">' +
          '<div class="ct-input-wrap">' +
            '<input class="ct-input" id="ctInput" placeholder="' + escapeHtml(t.placeholder) + '" autocomplete="off" required />' +
          '</div>' +
          '<button class="ct-btn" type="submit" id="ctBtn">' +
            '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            '<span>' + escapeHtml(t.button) + '</span>' +
          '</button>' +
        '</form>' +
      '</div>' +
      '<div id="ctResult"></div>' +
      '<div class="ct-footer"><a href="https://convertfy.com.br" target="_blank" rel="noopener">' + escapeHtml(t.powered_by) + '</a></div>';

    var form = shadow.getElementById('ctForm');
    var input = shadow.getElementById('ctInput');
    var btn = shadow.getElementById('ctBtn');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var q = input.value.trim();
      if (!q) return;
      doSearch(q, btn);
    });
  }

  function doSearch(query, btn) {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;

    // Show loading
    if (btn) {
      btn.disabled = true;
      btn.querySelector('span').textContent = t.searching;
    }
    resultDiv.innerHTML =
      '<div class="ct-spinner-wrap">' +
        '<div class="ct-spinner"></div>' +
        '<span class="ct-spinner-text">' + escapeHtml(t.searching) + '</span>' +
      '</div>';

    var isOrder = /^#?\\d+$/.test(query) || query.startsWith('#');
    var body = { store_id: storeId };
    if (isOrder) { body.order_number = query.replace(/^#/, ''); }
    else { body.tracking_number = query; }

    fetch(apiBase + '/api/tracking/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('span').textContent = t.button;
      }
      if (data.found && data.tracking) {
        renderResult(data.tracking);
      } else if (data.found && data.orders && data.orders.length > 0) {
        var order = data.orders[0];
        if (order.tracking_codes && order.tracking_codes.length > 0) {
          renderResult(Object.assign({}, order.tracking_codes[0], { order_name: order.order_name }));
        } else {
          renderEmpty();
        }
      } else {
        renderEmpty();
      }
    })
    .catch(function() {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('span').textContent = t.button;
      }
      renderError();
    });
  }

  function renderEmpty() {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;
    resultDiv.innerHTML =
      '<div class="ct-result"><div class="ct-empty">' +
        '<div class="ct-empty-icon">' +
          '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '</div>' +
        '<p class="ct-empty-title">' + escapeHtml(t.not_found) + '</p>' +
        '<p class="ct-empty-desc">' + escapeHtml(t.not_found_desc) + '</p>' +
      '</div></div>';
  }

  function renderError() {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;
    resultDiv.innerHTML =
      '<div class="ct-result"><div class="ct-empty">' +
        '<div class="ct-empty-icon">' +
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '</div>' +
        '<p class="ct-empty-title">' + escapeHtml(t.error) + '</p>' +
      '</div></div>';
  }

  var STATUS_CONFIG = {
    pending:     { bg:'#f1f5f9', fg:'#64748b', step:0 },
    in_transit:  { bg:'#fffbeb', fg:'#d97706', step:2 },
    pick_up:     { bg:'#eff6ff', fg:'#2563eb', step:3 },
    delivered:   { bg:'#ecfdf5', fg:'#059669', step:4 },
    alert:       { bg:'#fef2f2', fg:'#dc2626', step:2 },
    expired:     { bg:'#fef2f2', fg:'#dc2626', step:2 },
    undelivered: { bg:'#fef2f2', fg:'#dc2626', step:2 }
  };

  var PROGRESS_STEPS = [
    { key:'pending',    icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
    { key:'posted',     icon:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>' },
    { key:'in_transit', icon:'<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
    { key:'pick_up',    icon:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
    { key:'delivered',  icon:'<polyline points="20 6 9 17 4 12"/>' }
  ];

  function getStatusIcon(status) {
    if (status === 'delivered') return '<polyline points="20 6 9 17 4 12"/>';
    if (status === 'in_transit') return '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';
    if (status === 'pick_up') return '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>';
    if (status === 'alert' || status === 'expired' || status === 'undelivered') return '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
    return '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
  }

  function formatDate(dateStr, mode) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      var opts = mode === 'short'
        ? { day:'2-digit', month:'2-digit', year:'numeric' }
        : { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' };
      return d.toLocaleDateString(lang, opts);
    } catch(e) { return dateStr; }
  }

  function renderResult(data) {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;

    var sc = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending;
    var statusLabel = t['status_' + data.status] || data.status || t.status_pending;
    var stepIndex = sc.step;

    var html = '<div class="ct-result">';

    // Status header
    html += '<div class="ct-status-header">';
    html += '<div class="ct-status-badge" style="background:' + sc.bg + '">';
    html += '<svg viewBox="0 0 24 24" stroke="' + sc.fg + '">' + getStatusIcon(data.status) + '</svg>';
    html += '</div>';
    html += '<div class="ct-status-info">';
    html += '<div class="ct-status-label" style="color:' + sc.fg + '">' + escapeHtml(statusLabel) + '</div>';
    if (data.status_detail) html += '<div class="ct-status-detail">' + escapeHtml(data.status_detail) + '</div>';
    html += '</div></div>';

    // Progress bar
    html += '<div class="ct-progress">';
    html += '<div class="ct-progress-bar">';
    html += '<div class="ct-progress-line"><div class="ct-progress-line-fill" style="width:' + (stepIndex / (PROGRESS_STEPS.length - 1) * 100) + '%"></div></div>';
    for (var pi = 0; pi < PROGRESS_STEPS.length; pi++) {
      var cls = pi < stepIndex ? 'completed' : (pi === stepIndex ? 'active' : '');
      var lblCls = pi === stepIndex ? 'active' : '';
      var stepLabel = t['status_' + PROGRESS_STEPS[pi].key] || '';
      html += '<div class="ct-progress-step">';
      html += '<div class="ct-progress-dot ' + cls + '"></div>';
      if (stepLabel) html += '<span class="ct-progress-label ' + lblCls + '">' + escapeHtml(stepLabel) + '</span>';
      html += '</div>';
    }
    html += '</div></div>';

    // Info grid
    html += '<div class="ct-info-grid">';
    if (data.tracking_number) {
      html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.tracking_number) + '</div><div class="ct-info-value">' + escapeHtml(data.tracking_number) + '</div></div>';
    }
    if (data.carrier_name) {
      html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.carrier) + '</div><div class="ct-info-value">' + escapeHtml(data.carrier_name) + '</div></div>';
    }
    if (data.order_name) {
      html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.order) + '</div><div class="ct-info-value">' + escapeHtml(data.order_name) + '</div></div>';
    }
    if (data.estimated_delivery) {
      html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.estimated) + '</div><div class="ct-info-value">' + formatDate(data.estimated_delivery, 'short') + '</div></div>';
    }
    if (data.last_event_at) {
      html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.last_update) + '</div><div class="ct-info-value">' + formatDate(data.last_event_at) + '</div></div>';
    }
    html += '</div>';

    // Timeline
    if (data.events && data.events.length > 0) {
      html += '<div class="ct-timeline-section">';
      html += '<div class="ct-timeline-title">';
      html += '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      html += escapeHtml(t.tracking_history);
      html += '</div>';
      html += '<div class="ct-timeline">';
      for (var ei = 0; ei < data.events.length; ei++) {
        var evt = data.events[ei];
        html += '<div class="ct-event">';
        html += '<div class="ct-event-dot"></div>';
        html += '<div class="ct-event-desc">' + escapeHtml(evt.description) + '</div>';
        html += '<div class="ct-event-meta">';
        if (evt.date) html += '<span class="ct-event-date">' + formatDate(evt.date) + '</span>';
        if (evt.date && evt.location) html += '<span class="ct-event-sep">&middot;</span>';
        if (evt.location) html += '<span class="ct-event-loc"><svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + escapeHtml(evt.location) + '</span>';
        html += '</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // New search button
    html += '<button class="ct-new-search" id="ctNewSearch">';
    html += '<svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    html += escapeHtml(t.new_search);
    html += '</button>';

    html += '</div>';

    resultDiv.innerHTML = html;

    var newSearchBtn = shadow.getElementById('ctNewSearch');
    if (newSearchBtn) {
      newSearchBtn.addEventListener('click', function() {
        resultDiv.innerHTML = '';
        var input = shadow.getElementById('ctInput');
        if (input) { input.value = ''; input.focus(); }
      });
    }
  }

  // Initialize
  renderSearch();
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
