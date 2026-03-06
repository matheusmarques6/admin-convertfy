import { NextRequest, NextResponse } from "next/server"

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "pt-BR": {
    title: "Rastreie seu pedido",
    subtitle: "Acompanhe o status da sua entrega em tempo real",
    search_by_order: "Buscar por pedido",
    search_by_tracking: "Buscar por c\u00f3digo",
    email_label: "E-mail",
    email_placeholder: "seu@email.com",
    order_label: "N\u00famero do pedido",
    order_placeholder: "Ex: 1001",
    tracking_label: "C\u00f3digo de rastreamento",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Rastrear",
    searching: "Buscando...",
    or_separator: "ou",
    status_pending: "Pendente",
    status_info_received: "Postado",
    status_in_transit: "Em Tr\u00e2nsito",
    status_delivered: "Entregue",
    status_pick_up: "Pronto para Retirada",
    status_out_for_delivery: "Saiu para Entrega",
    status_failed_attempt: "Tentativa Falha",
    status_exception: "Exce\u00e7\u00e3o",
    status_expired: "Expirado",
    not_found: "Nenhum resultado encontrado",
    not_found_desc: "Verifique os dados informados e tente novamente.",
    error: "Ocorreu um erro ao buscar. Tente novamente.",
    estimated: "Previs\u00e3o de entrega",
    carrier: "Transportadora",
    tracking_number: "C\u00f3digo de rastreio",
    order: "Pedido",
    last_update: "\u00daltima atualiza\u00e7\u00e3o",
    tracking_history: "Hist\u00f3rico de rastreamento",
    powered_by: "Powered by Convertfy",
    new_search: "Nova busca",
    order_details: "Detalhes do Pedido",
    quantity_short: "Qtd",
    per_unit: "/un",
    total: "Total",
    more_items: "+ {n} itens",
    see_all: "Ver todos",
    see_less: "Ver menos",
    image_unavailable: "Imagem indispon\u00edvel",
  },
  en: {
    title: "Track your order",
    subtitle: "Follow your delivery status in real time",
    search_by_order: "Search by order",
    search_by_tracking: "Search by tracking code",
    email_label: "E-mail",
    email_placeholder: "your@email.com",
    order_label: "Order number",
    order_placeholder: "Ex: 1001",
    tracking_label: "Tracking code",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Track",
    searching: "Searching...",
    or_separator: "or",
    status_pending: "Pending",
    status_info_received: "Posted",
    status_in_transit: "In Transit",
    status_delivered: "Delivered",
    status_pick_up: "Ready for Pickup",
    status_out_for_delivery: "Out for Delivery",
    status_failed_attempt: "Failed Attempt",
    status_exception: "Exception",
    status_expired: "Expired",
    not_found: "No results found",
    not_found_desc: "Check the information entered and try again.",
    error: "An error occurred while searching. Try again.",
    estimated: "Estimated delivery",
    carrier: "Carrier",
    tracking_number: "Tracking code",
    order: "Order",
    last_update: "Last update",
    tracking_history: "Tracking history",
    powered_by: "Powered by Convertfy",
    new_search: "New search",
    order_details: "Order Details",
    quantity_short: "Qty",
    per_unit: "/ea",
    total: "Total",
    more_items: "+ {n} items",
    see_all: "See all",
    see_less: "See less",
    image_unavailable: "Image unavailable",
  },
  es: {
    title: "Rastrea tu pedido",
    subtitle: "Sigue el estado de tu env\u00edo en tiempo real",
    search_by_order: "Buscar por pedido",
    search_by_tracking: "Buscar por c\u00f3digo",
    email_label: "E-mail",
    email_placeholder: "tu@email.com",
    order_label: "N\u00famero del pedido",
    order_placeholder: "Ex: 1001",
    tracking_label: "C\u00f3digo de seguimiento",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Rastrear",
    searching: "Buscando...",
    or_separator: "o",
    status_pending: "Pendiente",
    status_info_received: "Publicado",
    status_in_transit: "En Tr\u00e1nsito",
    status_delivered: "Entregado",
    status_pick_up: "Listo para Recoger",
    status_out_for_delivery: "En Reparto",
    status_failed_attempt: "Intento Fallido",
    status_exception: "Excepci\u00f3n",
    status_expired: "Expirado",
    not_found: "No se encontraron resultados",
    not_found_desc: "Verifica los datos ingresados e intenta nuevamente.",
    error: "Ocurri\u00f3 un error al buscar. Intenta nuevamente.",
    estimated: "Entrega estimada",
    carrier: "Transportista",
    tracking_number: "C\u00f3digo de seguimiento",
    order: "Pedido",
    last_update: "\u00daltima actualizaci\u00f3n",
    tracking_history: "Historial de seguimiento",
    powered_by: "Powered by Convertfy",
    new_search: "Nueva b\u00fasqueda",
    order_details: "Detalles del Pedido",
    quantity_short: "Cant",
    per_unit: "/ud",
    total: "Total",
    more_items: "+ {n} art\u00edculos",
    see_all: "Ver todos",
    see_less: "Ver menos",
    image_unavailable: "Imagen no disponible",
  },
  fr: {
    title: "Suivez votre commande",
    subtitle: "Suivez le statut de votre livraison en temps r\u00e9el",
    search_by_order: "Rechercher par commande",
    search_by_tracking: "Rechercher par code",
    email_label: "E-mail",
    email_placeholder: "votre@email.com",
    order_label: "Num\u00e9ro de commande",
    order_placeholder: "Ex: 1001",
    tracking_label: "Code de suivi",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Suivre",
    searching: "Recherche...",
    or_separator: "ou",
    status_pending: "En attente",
    status_info_received: "Exp\u00e9di\u00e9",
    status_in_transit: "En transit",
    status_delivered: "Livr\u00e9",
    status_pick_up: "Pr\u00eat pour le retrait",
    status_out_for_delivery: "En cours de livraison",
    status_failed_attempt: "Tentative \u00e9chou\u00e9e",
    status_exception: "Exception",
    status_expired: "Expir\u00e9",
    not_found: "Aucun r\u00e9sultat trouv\u00e9",
    not_found_desc: "V\u00e9rifiez les informations saisies et r\u00e9essayez.",
    error: "Une erreur est survenue. R\u00e9essayez.",
    estimated: "Livraison estim\u00e9e",
    carrier: "Transporteur",
    tracking_number: "Code de suivi",
    order: "Commande",
    last_update: "Derni\u00e8re mise \u00e0 jour",
    tracking_history: "Historique de suivi",
    powered_by: "Powered by Convertfy",
    new_search: "Nouvelle recherche",
    order_details: "D\u00e9tails de la Commande",
    quantity_short: "Qt\u00e9",
    per_unit: "/unit\u00e9",
    total: "Total",
    more_items: "+ {n} articles",
    see_all: "Voir tout",
    see_less: "Voir moins",
    image_unavailable: "Image indisponible",
  },
  de: {
    title: "Verfolgen Sie Ihre Bestellung",
    subtitle: "Verfolgen Sie den Status Ihrer Lieferung in Echtzeit",
    search_by_order: "Nach Bestellung suchen",
    search_by_tracking: "Nach Sendungsnummer suchen",
    email_label: "E-mail",
    email_placeholder: "ihre@email.com",
    order_label: "Bestellnummer",
    order_placeholder: "Ex: 1001",
    tracking_label: "Sendungsnummer",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Verfolgen",
    searching: "Suche...",
    or_separator: "oder",
    status_pending: "Ausstehend",
    status_info_received: "Aufgegeben",
    status_in_transit: "Unterwegs",
    status_delivered: "Zugestellt",
    status_pick_up: "Abholbereit",
    status_out_for_delivery: "In Zustellung",
    status_failed_attempt: "Fehlversuch",
    status_exception: "Ausnahme",
    status_expired: "Abgelaufen",
    not_found: "Keine Ergebnisse gefunden",
    not_found_desc: "\u00dcberpr\u00fcfen Sie die eingegebenen Daten und versuchen Sie es erneut.",
    error: "Fehler bei der Suche. Versuchen Sie es erneut.",
    estimated: "Voraussichtliche Lieferung",
    carrier: "Spediteur",
    tracking_number: "Sendungsnummer",
    order: "Bestellung",
    last_update: "Letztes Update",
    tracking_history: "Sendungsverlauf",
    powered_by: "Powered by Convertfy",
    new_search: "Neue Suche",
    order_details: "Bestelldetails",
    quantity_short: "Anz",
    per_unit: "/St",
    total: "Gesamt",
    more_items: "+ {n} Artikel",
    see_all: "Alle anzeigen",
    see_less: "Weniger anzeigen",
    image_unavailable: "Bild nicht verf\u00fcgbar",
  },
  it: {
    title: "Traccia il tuo ordine",
    subtitle: "Segui lo stato della tua consegna in tempo reale",
    search_by_order: "Cerca per ordine",
    search_by_tracking: "Cerca per codice",
    email_label: "E-mail",
    email_placeholder: "tuo@email.com",
    order_label: "Numero dell'ordine",
    order_placeholder: "Ex: 1001",
    tracking_label: "Codice di tracciamento",
    tracking_placeholder: "Ex: BR123456789BR",
    button: "Traccia",
    searching: "Ricerca...",
    or_separator: "o",
    status_pending: "In attesa",
    status_info_received: "Spedito",
    status_in_transit: "In Transito",
    status_delivered: "Consegnato",
    status_pick_up: "Pronto al Ritiro",
    status_out_for_delivery: "In Consegna",
    status_failed_attempt: "Tentativo fallito",
    status_exception: "Eccezione",
    status_expired: "Scaduto",
    not_found: "Nessun risultato trovato",
    not_found_desc: "Verifica i dati inseriti e riprova.",
    error: "Errore nella ricerca. Riprova.",
    estimated: "Consegna stimata",
    carrier: "Corriere",
    tracking_number: "Codice di tracciamento",
    order: "Ordine",
    last_update: "Ultimo aggiornamento",
    tracking_history: "Cronologia tracciamento",
    powered_by: "Powered by Convertfy",
    new_search: "Nuova ricerca",
    order_details: "Dettagli dell'Ordine",
    quantity_short: "Qt\u00e0",
    per_unit: "/pz",
    total: "Totale",
    more_items: "+ {n} articoli",
    see_all: "Vedi tutti",
    see_less: "Vedi meno",
    image_unavailable: "Immagine non disponibile",
  },
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin

  const script = `
(function() {
  'use strict';

  if (window.__convertfy_tracking_loaded) return;
  window.__convertfy_tracking_loaded = true;

  /* --- Resolve storeId from data attribute (always preferred) or query param --- */
  var scriptEl = (function() {
    try {
      if (document.currentScript) return document.currentScript;
      return document.querySelector('script[data-store-id]') || document.querySelector('script[src*="widget.js"]');
    } catch(e) { return null; }
  })();

  var storeId = '';
  if (scriptEl) {
    storeId = scriptEl.dataset.storeId || scriptEl.dataset.storeid || scriptEl.getAttribute('data-store-id') || '';
  }
  if (!storeId) {
    /* Fallback: extract from script src query param */
    try {
      if (scriptEl && scriptEl.src) {
        var u = new URL(scriptEl.src);
        storeId = u.searchParams.get('store') || '';
      }
    } catch(e) {}
  }

  var color = (scriptEl && scriptEl.dataset.color) || '#3b82f6';
  var lang = (scriptEl && scriptEl.dataset.lang) || 'pt-BR';
  var containerId = (scriptEl && scriptEl.dataset.container) || '';
  var apiBase = (function() {
    try {
      if (scriptEl && scriptEl.src) { var u = new URL(scriptEl.src); return u.origin; }
    } catch(e) {}
    return '${origin}';
  })();

  if (!storeId || storeId === 'default') {
    console.warn('[Convertfy Tracking] data-store-id is required');
    return;
  }

  var allTranslations = ${JSON.stringify(TRANSLATIONS)};
  var t = allTranslations[lang] || allTranslations['pt-BR'];

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    if (!result) return '59,130,246';
    return parseInt(result[1],16)+','+parseInt(result[2],16)+','+parseInt(result[3],16);
  }

  var colorRgb = hexToRgb(color);

  /* --- Find or create container --- */
  var host;
  if (containerId) {
    host = document.getElementById(containerId);
  }
  if (!host) {
    /* Try the default container id that snippets commonly include */
    host = document.getElementById('convertfy-tracking');
  }
  if (!host) {
    host = document.createElement('div');
    host.id = 'convertfy-tracking';
    /* Avoid inserting into <head> — always target <body> */
    document.body.appendChild(host);
  }

  var shadow = host.attachShadow({ mode: 'closed' });

  /* ========== STYLES ========== */
  var styles = document.createElement('style');
  styles.textContent = [
    '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }',
    ':host { display:block; width:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; line-height:1.5; -webkit-font-smoothing:antialiased; color:#0f172a; }',

    /* Wrapper */
    '.ct-wrap { max-width:800px; margin:0 auto; padding:32px 16px; }',

    /* Header */
    '.ct-header { text-align:center; margin-bottom:28px; }',
    '.ct-title { font-size:24px; font-weight:700; color:#0f172a; margin-bottom:4px; letter-spacing:-0.3px; }',
    '.ct-subtitle { font-size:14px; color:#64748b; }',

    /* Search grid: two columns with OR separator */
    '.ct-search-grid { display:grid; grid-template-columns:1fr auto 1fr; gap:0; align-items:stretch; margin-bottom:24px; }',

    /* Search card */
    '.ct-card { background:#fff; border-radius:16px; padding:28px 24px; box-shadow:0 1px 3px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.02); display:flex; flex-direction:column; }',
    '.ct-card-title { font-size:15px; font-weight:600; color:#0f172a; margin-bottom:18px; display:flex; align-items:center; gap:8px; }',
    '.ct-card-title svg { width:18px; height:18px; stroke:'+color+'; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-field { margin-bottom:14px; }',
    '.ct-field:last-of-type { margin-bottom:18px; }',
    '.ct-label { display:block; font-size:13px; font-weight:500; color:#475569; margin-bottom:5px; }',
    '.ct-input { width:100%; height:44px; border:1.5px solid #e2e8f0; border-radius:10px; padding:0 14px; font-size:14px; color:#0f172a; background:#fff; outline:none; transition:border-color .2s,box-shadow .2s; font-family:inherit; }',
    '.ct-input::placeholder { color:#94a3b8; }',
    '.ct-input:focus { border-color:'+color+'; box-shadow:0 0 0 3px rgba('+colorRgb+',0.10); }',
    '.ct-btn { height:44px; width:100%; padding:0 20px; background:'+color+'; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap; transition:opacity .15s,transform .15s; display:flex; align-items:center; justify-content:center; gap:8px; font-family:inherit; margin-top:auto; }',
    '.ct-btn:hover { opacity:0.92; }',
    '.ct-btn:active { transform:scale(0.98); }',
    '.ct-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }',
    '.ct-btn svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',

    /* OR separator */
    '.ct-or-sep { display:flex; align-items:center; justify-content:center; padding:0 16px; }',
    '.ct-or-circle { width:36px; height:36px; border-radius:50%; background:#f8fafc; border:1.5px solid #e2e8f0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:#94a3b8; text-transform:lowercase; flex-shrink:0; }',

    /* Spinner */
    '.ct-spinner-wrap { display:flex; flex-direction:column; align-items:center; padding:56px 0; }',
    '.ct-spinner { width:36px; height:36px; border:3px solid #e2e8f0; border-top-color:'+color+'; border-radius:50%; animation:ct-spin .7s linear infinite; margin-bottom:14px; }',
    '.ct-spinner-text { font-size:14px; color:#64748b; }',
    '@keyframes ct-spin { to { transform:rotate(360deg); } }',

    /* Result card */
    '.ct-result { background:#fff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.08),0 0 0 1px rgba(0,0,0,0.02); overflow:hidden; animation:ct-fadeIn .3s ease; margin-bottom:16px; }',
    '@keyframes ct-fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }',

    /* Status header */
    '.ct-status-header { padding:24px 28px; display:flex; align-items:center; gap:16px; }',
    '.ct-status-badge { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }',
    '.ct-status-badge svg { width:26px; height:26px; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-status-info { flex:1; }',
    '.ct-status-label { font-size:18px; font-weight:700; margin-bottom:2px; }',
    '.ct-status-detail { font-size:13px; color:#64748b; }',

    /* Info grid */
    '.ct-info-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:#f1f5f9; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9; }',
    '.ct-info-item { background:#fff; padding:14px 28px; }',
    '.ct-info-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; color:#94a3b8; margin-bottom:4px; }',
    '.ct-info-value { font-size:14px; font-weight:500; color:#1e293b; word-break:break-all; }',

    /* Progress stepper */
    '.ct-progress { padding:28px 28px 12px; }',
    '.ct-progress-bar { display:flex; align-items:flex-start; position:relative; }',
    '.ct-progress-step { flex:1; display:flex; flex-direction:column; align-items:center; position:relative; z-index:1; }',
    '.ct-progress-dot { width:14px; height:14px; border-radius:50%; background:#e2e8f0; border:2px solid #fff; box-shadow:0 0 0 2px #e2e8f0; transition:all .3s; margin-bottom:8px; }',
    '.ct-progress-dot.active { background:'+color+'; box-shadow:0 0 0 2px '+color+',0 0 0 5px rgba('+colorRgb+',0.15); }',
    '.ct-progress-dot.completed { background:'+color+'; box-shadow:0 0 0 2px '+color+'; }',
    '.ct-progress-label { font-size:10px; color:#94a3b8; text-align:center; line-height:1.3; max-width:72px; }',
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

    /* Date separator in timeline */
    '.ct-event-date-sep { font-size:13px; font-weight:600; color:#334155; padding:8px 0 12px; margin-left:-28px; }',

    /* Order details */
    '.ct-order-section { padding:0 28px 8px; }',
    '.ct-order-toggle { display:flex; align-items:center; justify-content:space-between; cursor:pointer; background:none; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; width:100%; font-family:inherit; transition:background .15s; }',
    '.ct-order-toggle:hover { background:#f8fafc; }',
    '.ct-order-toggle-left { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:#334155; }',
    '.ct-order-toggle-left svg { width:16px; height:16px; stroke:'+color+'; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }',
    '.ct-order-toggle-arrow { width:16px; height:16px; stroke:#94a3b8; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; transition:transform .2s; }',
    '.ct-order-toggle-arrow.open { transform:rotate(180deg); }',
    '.ct-order-body { overflow:hidden; max-height:0; transition:max-height .3s ease; }',
    '.ct-order-body.open { max-height:999px; }',
    '.ct-order-list { padding:12px 0 0; }',
    '.ct-product-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid #f1f5f9; }',
    '.ct-product-row:last-child { border-bottom:none; }',
    '.ct-product-thumb { width:56px; height:56px; border-radius:8px; object-fit:cover; background:#f1f5f9; flex-shrink:0; border:1px solid #e2e8f0; }',
    '.ct-product-thumb-placeholder { width:56px; height:56px; border-radius:8px; background:#f1f5f9; flex-shrink:0; display:flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; }',
    '.ct-product-thumb-placeholder svg { width:24px; height:24px; stroke:#cbd5e1; fill:none; stroke-width:1.5; }',
    '.ct-product-info { flex:1; min-width:0; }',
    '.ct-product-title { font-size:13px; font-weight:500; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
    '.ct-product-meta { font-size:12px; color:#64748b; margin-top:2px; }',
    '.ct-product-price { font-size:13px; font-weight:600; color:#334155; white-space:nowrap; flex-shrink:0; }',
    '.ct-order-total { display:flex; justify-content:space-between; align-items:center; padding:12px 0 4px; border-top:1px solid #e2e8f0; margin-top:4px; }',
    '.ct-order-total-label { font-size:13px; font-weight:600; color:#334155; }',
    '.ct-order-total-value { font-size:15px; font-weight:700; color:#0f172a; }',
    '.ct-order-more { text-align:center; padding:8px 0 0; }',
    '.ct-order-more button { background:none; border:none; font-size:12px; font-weight:500; color:'+color+'; cursor:pointer; font-family:inherit; padding:4px 8px; }',
    '.ct-order-more button:hover { text-decoration:underline; }',

    /* Empty / Error state */
    '.ct-empty { text-align:center; padding:48px 24px; }',
    '.ct-empty-icon { width:64px; height:64px; border-radius:50%; background:#f8fafc; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }',
    '.ct-empty-icon svg { width:32px; height:32px; stroke:#94a3b8; fill:none; stroke-width:1.5; }',
    '.ct-empty-title { font-size:16px; font-weight:600; color:#334155; margin-bottom:4px; }',
    '.ct-empty-desc { font-size:14px; color:#94a3b8; }',

    /* New search button */
    '.ct-new-search { display:flex; align-items:center; justify-content:center; gap:6px; padding:14px; border-top:1px solid #f1f5f9; cursor:pointer; background:none; border-left:0; border-right:0; border-bottom:0; width:100%; font-size:14px; font-weight:500; color:'+color+'; transition:background .15s; font-family:inherit; }',
    '.ct-new-search:hover { background:#f8fafc; }',
    '.ct-new-search svg { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; }',

    /* Footer */
    '.ct-footer { text-align:center; padding:16px 0 8px; }',
    '.ct-footer a { font-size:11px; color:#cbd5e1; text-decoration:none; transition:color .15s; }',
    '.ct-footer a:hover { color:#94a3b8; }',

    /* Responsive */
    '@media (max-width:680px) {',
    '  .ct-wrap { padding:20px 12px; }',
    '  .ct-title { font-size:20px; }',
    '  .ct-search-grid { grid-template-columns:1fr; gap:0; }',
    '  .ct-or-sep { padding:0; height:40px; }',
    '  .ct-card { border-radius:14px; padding:22px 20px; }',
    '  .ct-status-header { padding:20px; }',
    '  .ct-info-grid { grid-template-columns:1fr 1fr; }',
    '  .ct-info-item { padding:12px 20px; }',
    '  .ct-timeline-section { padding:16px 20px 24px; }',
    '  .ct-progress { padding:20px 20px 8px; }',
    '  .ct-progress-label { font-size:9px; max-width:56px; }',
    '  .ct-result { border-radius:14px; }',
    '  .ct-order-section { padding:0 20px 8px; }',
    '  .ct-product-thumb, .ct-product-thumb-placeholder { width:48px; height:48px; }',
    '}',
  ].join('\\n');
  shadow.appendChild(styles);

  var wrap = document.createElement('div');
  wrap.className = 'ct-wrap';
  shadow.appendChild(wrap);

  /* ========== ICONS ========== */
  var ICONS = {
    package: '<path d="M16.5 9.4l-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mapPin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    refresh: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  };

  function svgIcon(name, extraClass) {
    return '<svg viewBox="0 0 24 24"' + (extraClass ? ' class="' + extraClass + '"' : '') + '>' + ICONS[name] + '</svg>';
  }

  /* ========== SEARCH FORM ========== */
  function renderSearch() {
    wrap.innerHTML =
      '<div class="ct-header">' +
        '<h2 class="ct-title">' + escapeHtml(t.title) + '</h2>' +
        '<p class="ct-subtitle">' + escapeHtml(t.subtitle) + '</p>' +
      '</div>' +

      '<div class="ct-search-grid">' +

        /* LEFT card: search by order */
        '<div class="ct-card">' +
          '<div class="ct-card-title">' +
            svgIcon('package') +
            escapeHtml(t.search_by_order) +
          '</div>' +
          '<form id="ctFormOrder">' +
            '<div class="ct-field">' +
              '<label class="ct-label">' + escapeHtml(t.email_label) + '</label>' +
              '<input class="ct-input" id="ctEmail" type="email" placeholder="' + escapeHtml(t.email_placeholder) + '" autocomplete="email" />' +
            '</div>' +
            '<div class="ct-field">' +
              '<label class="ct-label">' + escapeHtml(t.order_label) + '</label>' +
              '<input class="ct-input" id="ctOrderNum" placeholder="' + escapeHtml(t.order_placeholder) + '" autocomplete="off" />' +
            '</div>' +
            '<button class="ct-btn" type="submit" id="ctBtnOrder">' +
              svgIcon('search') +
              '<span>' + escapeHtml(t.button) + '</span>' +
            '</button>' +
          '</form>' +
        '</div>' +

        /* OR separator */
        '<div class="ct-or-sep">' +
          '<div class="ct-or-circle">' + escapeHtml(t.or_separator) + '</div>' +
        '</div>' +

        /* RIGHT card: search by tracking code */
        '<div class="ct-card">' +
          '<div class="ct-card-title">' +
            svgIcon('hash') +
            escapeHtml(t.search_by_tracking) +
          '</div>' +
          '<form id="ctFormTracking">' +
            '<div class="ct-field">' +
              '<label class="ct-label">' + escapeHtml(t.tracking_label) + '</label>' +
              '<input class="ct-input" id="ctTrackingCode" placeholder="' + escapeHtml(t.tracking_placeholder) + '" autocomplete="off" />' +
            '</div>' +
            '<button class="ct-btn" type="submit" id="ctBtnTracking">' +
              svgIcon('search') +
              '<span>' + escapeHtml(t.button) + '</span>' +
            '</button>' +
          '</form>' +
        '</div>' +

      '</div>' +

      '<div id="ctResult"></div>' +
      '<div class="ct-footer"><a href="https://convertfy.com.br" target="_blank" rel="noopener">' + escapeHtml(t.powered_by) + '</a></div>';

    /* Bind order form */
    var formOrder = shadow.getElementById('ctFormOrder');
    var btnOrder = shadow.getElementById('ctBtnOrder');
    formOrder.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = shadow.getElementById('ctEmail').value.trim();
      var orderNum = shadow.getElementById('ctOrderNum').value.trim().replace(/^#/, '');
      if (!email && !orderNum) return;
      /* Prefer email, fallback to order number */
      var q = email || ('#' + orderNum);
      doSearch(q, btnOrder);
    });

    /* Bind tracking form */
    var formTracking = shadow.getElementById('ctFormTracking');
    var btnTracking = shadow.getElementById('ctBtnTracking');
    formTracking.addEventListener('submit', function(e) {
      e.preventDefault();
      var code = shadow.getElementById('ctTrackingCode').value.trim();
      if (!code) return;
      doSearch(code, btnTracking);
    });
  }

  /* ========== API CALL (GET-based lookup) ========== */
  function setButtonLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    var span = btn.querySelector('span');
    if (span) span.textContent = loading ? t.searching : t.button;
  }

  function doSearch(query, btn) {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;

    setButtonLoading(btn, true);

    resultDiv.innerHTML =
      '<div class="ct-spinner-wrap">' +
        '<div class="ct-spinner"></div>' +
        '<span class="ct-spinner-text">' + escapeHtml(t.searching) + '</span>' +
      '</div>';

    var url = apiBase + '/api/tracking/lookup?q=' + encodeURIComponent(query) + '&store=' + encodeURIComponent(storeId);

    fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      setButtonLoading(btn, false);
      if (data.found && data.results && data.results.length > 0) {
        renderResults(data.results);
      } else {
        renderEmpty();
      }
    })
    .catch(function() {
      setButtonLoading(btn, false);
      renderError();
    });
  }

  /* ========== EMPTY / ERROR ========== */
  function renderEmpty() {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;
    resultDiv.innerHTML =
      '<div class="ct-result"><div class="ct-empty">' +
        '<div class="ct-empty-icon">' + svgIcon('search') + '</div>' +
        '<p class="ct-empty-title">' + escapeHtml(t.not_found) + '</p>' +
        '<p class="ct-empty-desc">' + escapeHtml(t.not_found_desc) + '</p>' +
      '</div></div>';
  }

  function renderError() {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;
    resultDiv.innerHTML =
      '<div class="ct-result"><div class="ct-empty">' +
        '<div class="ct-empty-icon">' + svgIcon('alertCircle') + '</div>' +
        '<p class="ct-empty-title">' + escapeHtml(t.error) + '</p>' +
      '</div></div>';
  }

  /* ========== STATUS CONFIG ========== */
  var STATUS_CONFIG = {
    pending:          { bg:'#f1f5f9', fg:'#64748b', step:0 },
    info_received:    { bg:'#eff6ff', fg:'#2563eb', step:1 },
    in_transit:       { bg:'#fffbeb', fg:'#d97706', step:2 },
    out_for_delivery: { bg:'#fef3c7', fg:'#d97706', step:3 },
    pick_up:          { bg:'#eff6ff', fg:'#2563eb', step:3 },
    delivered:        { bg:'#ecfdf5', fg:'#059669', step:4 },
    failed_attempt:   { bg:'#fef2f2', fg:'#dc2626', step:2 },
    exception:        { bg:'#fef2f2', fg:'#dc2626', step:2 },
    expired:          { bg:'#fef2f2', fg:'#dc2626', step:2 }
  };

  var PROGRESS_STEPS = [
    { key:'pending',          icon:'alertCircle' },
    { key:'info_received',    icon:'mapPin' },
    { key:'in_transit',       icon:'truck' },
    { key:'out_for_delivery', icon:'package' },
    { key:'delivered',        icon:'check' }
  ];

  function getStatusIcon(status) {
    if (status === 'delivered') return ICONS.check;
    if (status === 'in_transit') return ICONS.truck;
    if (status === 'out_for_delivery') return ICONS.truck;
    if (status === 'pick_up' || status === 'info_received') return ICONS.package;
    if (status === 'failed_attempt' || status === 'exception' || status === 'expired') return ICONS.xCircle;
    return ICONS.alertCircle;
  }

  function formatDate(dateStr, mode) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      var localeMap = {'pt-BR':'pt-BR','en':'en-US','es':'es-ES','fr':'fr-FR','de':'de-DE','it':'it-IT'};
      var locale = localeMap[lang] || lang;
      if (mode === 'day') {
        return d.toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      }
      if (mode === 'short') {
        return d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit', year:'numeric' });
      }
      return d.toLocaleDateString(locale, { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch(e) { return dateStr; }
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString(lang, { hour:'2-digit', minute:'2-digit' });
    } catch(e) { return ''; }
  }

  /* ========== RENDER RESULTS ========== */
  function renderResults(results) {
    var resultDiv = shadow.getElementById('ctResult');
    if (!resultDiv) return;

    var html = '';

    for (var ri = 0; ri < results.length; ri++) {
      var r = results[ri];
      var order = r.order;
      var tracking = r.tracking && r.tracking.length > 0 ? r.tracking[0] : null;
      var status = tracking ? tracking.status : 'pending';
      var sc = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
      var statusLabel = t['status_' + status] || status;
      var stepIndex = sc.step;

      html += '<div class="ct-result">';

      /* Status header */
      html += '<div class="ct-status-header">';
      html += '<div class="ct-status-badge" style="background:' + sc.bg + '">';
      html += '<svg viewBox="0 0 24 24" stroke="' + sc.fg + '">' + getStatusIcon(status) + '</svg>';
      html += '</div>';
      html += '<div class="ct-status-info">';
      html += '<div class="ct-status-label" style="color:' + sc.fg + '">' + escapeHtml(statusLabel) + '</div>';
      if (tracking && tracking.status_detail) html += '<div class="ct-status-detail">' + escapeHtml(tracking.status_detail) + '</div>';
      html += '</div></div>';

      /* Info grid */
      html += '<div class="ct-info-grid">';
      if (tracking && tracking.tracking_number) {
        html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.tracking_number) + '</div><div class="ct-info-value">' + escapeHtml(tracking.tracking_number) + '</div></div>';
      }
      if (tracking && tracking.carrier_name) {
        html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.carrier) + '</div><div class="ct-info-value">' + escapeHtml(tracking.carrier_name) + '</div></div>';
      }
      if (order && order.order_name) {
        html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.order) + '</div><div class="ct-info-value">' + escapeHtml(order.order_name) + '</div></div>';
      }
      if (tracking && tracking.estimated_delivery) {
        html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.estimated) + '</div><div class="ct-info-value">' + formatDate(tracking.estimated_delivery, 'short') + '</div></div>';
      }
      if (tracking && tracking.last_event) {
        html += '<div class="ct-info-item"><div class="ct-info-label">' + escapeHtml(t.last_update) + '</div><div class="ct-info-value">' + escapeHtml(tracking.last_event) + '</div></div>';
      }
      html += '</div>';

      /* Progress stepper */
      html += '<div class="ct-progress">';
      html += '<div class="ct-progress-bar">';
      var pct = PROGRESS_STEPS.length > 1 ? (stepIndex / (PROGRESS_STEPS.length - 1) * 100) : 0;
      html += '<div class="ct-progress-line"><div class="ct-progress-line-fill" style="width:' + pct + '%"></div></div>';
      for (var pi = 0; pi < PROGRESS_STEPS.length; pi++) {
        var dotCls = pi < stepIndex ? 'completed' : (pi === stepIndex ? 'active' : '');
        var lblCls = pi === stepIndex ? 'active' : '';
        var stepLabel = t['status_' + PROGRESS_STEPS[pi].key] || '';
        html += '<div class="ct-progress-step">';
        html += '<div class="ct-progress-dot ' + dotCls + '"></div>';
        if (stepLabel) html += '<span class="ct-progress-label ' + lblCls + '">' + escapeHtml(stepLabel) + '</span>';
        html += '</div>';
      }
      html += '</div></div>';

      /* Order details (line_items) */
      var lineItems = order && Array.isArray(order.line_items) ? order.line_items : [];
      if (lineItems.length > 0) {
        var orderUid = 'ct-order-' + ri;
        var showMax = 3;
        var hasMore = lineItems.length > showMax;
        html += '<div class="ct-order-section">';
        html += '<button class="ct-order-toggle" data-ct-order-toggle="' + orderUid + '" aria-expanded="false" aria-controls="' + orderUid + '">';
        html += '<span class="ct-order-toggle-left">' + svgIcon('package') + ' ' + escapeHtml(t.order_details || 'Order Details') + ' (' + lineItems.length + ')</span>';
        html += '<svg class="ct-order-toggle-arrow" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
        html += '</button>';
        html += '<div class="ct-order-body" id="' + orderUid + '" role="region" aria-label="' + escapeHtml(t.order_details || 'Order Details') + '">';
        html += '<div class="ct-order-list">';
        for (var li = 0; li < lineItems.length; li++) {
          var item = lineItems[li];
          var hidden = hasMore && li >= showMax ? ' style="display:none" data-ct-extra="' + orderUid + '"' : '';
          var imgUrl = item.image_url || '';
          if (imgUrl && imgUrl.indexOf('cdn.shopify.com') !== -1 && imgUrl.indexOf('width=') === -1) {
            imgUrl += (imgUrl.indexOf('?') !== -1 ? '&' : '?') + 'width=128';
          }
          html += '<div class="ct-product-row"' + hidden + '>';
          if (imgUrl) {
            html += '<img class="ct-product-thumb" src="' + escapeHtml(imgUrl) + '" alt="' + escapeHtml(item.title || '') + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" />';
            html += '<div class="ct-product-thumb-placeholder" style="display:none"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
          } else {
            html += '<div class="ct-product-thumb-placeholder"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>';
          }
          html += '<div class="ct-product-info">';
          html += '<div class="ct-product-title">' + escapeHtml(item.title || '') + '</div>';
          html += '<div class="ct-product-meta">' + escapeHtml((t.quantity_short || 'Qty') + ': ' + (item.quantity || 1)) + '</div>';
          html += '</div>';
          var itemPrice = parseFloat(item.price || '0');
          if (itemPrice > 0) {
            html += '<div class="ct-product-price">' + escapeHtml(order.currency || '') + ' ' + itemPrice.toFixed(2) + '</div>';
          }
          html += '</div>';
        }
        if (hasMore) {
          var moreLabel = (t.more_items || '+ {n} items').replace('{n}', String(lineItems.length - showMax));
          html += '<div class="ct-order-more"><button data-ct-show-all="' + orderUid + '">' + escapeHtml(moreLabel) + '</button></div>';
        }
        html += '</div>';
        if (order.total_price && parseFloat(order.total_price) > 0) {
          html += '<div class="ct-order-total">';
          html += '<span class="ct-order-total-label">' + escapeHtml(t.total || 'Total') + '</span>';
          html += '<span class="ct-order-total-value">' + escapeHtml(order.currency || '') + ' ' + parseFloat(order.total_price).toFixed(2) + '</span>';
          html += '</div>';
        }
        html += '</div></div>';
      }

      /* Timeline events */
      var events = tracking && Array.isArray(tracking.tracking_events) ? tracking.tracking_events : [];
      if (events.length > 0) {
        html += '<div class="ct-timeline-section">';
        html += '<div class="ct-timeline-title">';
        html += svgIcon('clock');
        html += escapeHtml(t.tracking_history) + '  (' + events.length + ')';
        html += '</div>';
        html += '<div class="ct-timeline">';

        var lastDateStr = '';
        for (var ei = 0; ei < events.length; ei++) {
          var evt = events[ei];
          var evtDate = evt.date || evt.time || '';
          var dayStr = evtDate ? formatDate(evtDate, 'day') : '';

          /* Date separator */
          if (dayStr && dayStr !== lastDateStr) {
            html += '<div class="ct-event-date-sep">' + escapeHtml(dayStr.charAt(0).toUpperCase() + dayStr.slice(1)) + '</div>';
            lastDateStr = dayStr;
          }

          html += '<div class="ct-event">';
          html += '<div class="ct-event-dot"></div>';
          html += '<div class="ct-event-desc">' + escapeHtml(evt.description || '') + '</div>';
          html += '<div class="ct-event-meta">';
          if (evtDate) html += '<span class="ct-event-date">' + formatTime(evtDate) + '</span>';
          if (evtDate && evt.location) html += '<span class="ct-event-sep">&middot;</span>';
          if (evt.location) html += '<span class="ct-event-loc">' + svgIcon('mapPin') + ' ' + escapeHtml(evt.location) + '</span>';
          html += '</div>';
          html += '</div>';
        }
        html += '</div></div>';
      }

      /* New search button */
      html += '<button class="ct-new-search" data-ct-new-search>';
      html += svgIcon('refresh');
      html += escapeHtml(t.new_search);
      html += '</button>';

      html += '</div>';
    }

    resultDiv.innerHTML = html;

    /* Bind new search buttons */
    var btns = shadow.querySelectorAll('[data-ct-new-search]');
    for (var bi = 0; bi < btns.length; bi++) {
      btns[bi].addEventListener('click', function() { renderSearch(); });
    }

    /* Bind order detail toggles */
    var toggleBtns = shadow.querySelectorAll('[data-ct-order-toggle]');
    for (var ti = 0; ti < toggleBtns.length; ti++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var targetId = btn.getAttribute('data-ct-order-toggle');
          var body = shadow.getElementById(targetId);
          var arrow = btn.querySelector('.ct-order-toggle-arrow');
          if (body) { body.classList.toggle('open'); }
          if (arrow) { arrow.classList.toggle('open'); }
          var isOpen = body && body.classList.contains('open');
          btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
      })(toggleBtns[ti]);
    }

    /* Bind show-all buttons */
    var showAllBtns = shadow.querySelectorAll('[data-ct-show-all]');
    for (var si = 0; si < showAllBtns.length; si++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var targetId = btn.getAttribute('data-ct-show-all');
          var extras = shadow.querySelectorAll('[data-ct-extra="' + targetId + '"]');
          var showing = btn.getAttribute('data-showing') === '1';
          for (var xi = 0; xi < extras.length; xi++) {
            extras[xi].style.display = showing ? 'none' : '';
          }
          btn.setAttribute('data-showing', showing ? '0' : '1');
          btn.textContent = showing ? btn.getAttribute('data-ct-label-more') : (t.see_less || 'See less');
        });
        var moreLabel = btn.textContent;
        btn.setAttribute('data-ct-label-more', moreLabel);
      })(showAllBtns[si]);
    }
  }

  /* ========== INIT ========== */
  renderSearch();
})();
`

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
