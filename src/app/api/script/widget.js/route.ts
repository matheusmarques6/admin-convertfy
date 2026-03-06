import { NextRequest, NextResponse } from "next/server"

const DOMAIN = process.env.NEXT_PUBLIC_TRACKING_DOMAIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function getWidgetScript(storeId: string): string {
  return `(function(){
  if(window.__convertfy_tracking_loaded)return;
  window.__convertfy_tracking_loaded=true;

  var STORE_ID=(function(){
    try{var s=document.querySelector('script[src*="widget.js"]');if(s){var d=s.dataset.storeId||s.dataset.storeid||s.getAttribute("data-store-id");if(d)return d}}catch(e){}
    if("${storeId}"&&"${storeId}"!=="default")return "${storeId}";
    return"default";
  })();
  var SCRIPT_EL=(function(){try{return document.querySelector('script[src*="widget.js"]')}catch(e){return null}})();
  var SCRIPT_ORIGIN=(function(){try{if(SCRIPT_EL&&SCRIPT_EL.src){var u=new URL(SCRIPT_EL.src);return u.origin}return"${DOMAIN}"}catch(e){return"${DOMAIN}"}})();
  var API_BASE=SCRIPT_ORIGIN+"/api/tracking";
  var LOOKUP=API_BASE+"/lookup";
  var CONFIG_URL=API_BASE+"/config?store="+STORE_ID;

  var cfg={
    primary_color:"#6366F1",accent_color:"#8B5CF6",icon_color:"#6366F1",
    language:"pt-BR",plugin_type:"complete",
    not_found_message:"Pedido não encontrado. Verifique o número informado e tente novamente.",
    hide_carrier:false,hide_redirect:false,show_estimated_delivery:true,show_carrier_logo:true,
    blocked_words:"",store_name:""
  };

  var i18n={
    "pt-BR":{title:"Rastrear Pedido",search:"RASTREAR",ph_tracking:"Insira seu código de rastreio",ph_email:"E-mail utilizado na compra",ph_order:"Insira o número do pedido",or_text:"ou",forgot:"Lembrar pedido?",searching:"Buscando...",no_results:"Nenhum resultado encontrado",check_again:"Verifique o código e tente novamente",error:"Erro ao buscar. Tente novamente.",order:"Pedido",powered:"Powered by Convertfy",tab_tracking:"Rastreio",tab_email:"Email",status_label:"Status do pedido",pkg_desc:"Descrição do pacote",pkg_order:"Pedido",pkg_tracking:"Rastreio",pkg_dest:"Destino",pkg_value:"Valor Total",pending:"Pendente",info_received:"Info Recebida",in_transit:"Em Trânsito",out_for_delivery:"Saiu p/ Entrega",delivered:"Entregue",failed_attempt:"Tentativa Falha",exception:"Exceção",expired:"Expirado",forecast:"Previsão",view_carrier:"Ver no site da transportadora",order_placed:"Pedido Realizado",confirmed:"Confirmado",preparing:"Preparando",shipped:"Despachado",customs:"Alfândega",local_transit:"Transporte Local",products_title:"Veja o que separamos para você!",qty:"Quantidade",price:"Preço",total:"Total"},
    "en":{title:"Track Order",search:"TRACK",ph_tracking:"Enter your tracking code",ph_email:"Email used in purchase",ph_order:"Enter order number",or_text:"or",forgot:"Remember order?",searching:"Searching...",no_results:"No results found",check_again:"Check the code and try again",error:"Search error. Try again.",order:"Order",powered:"Powered by Convertfy",tab_tracking:"Tracking",tab_email:"Email",status_label:"Order status",pkg_desc:"Package description",pkg_order:"Order",pkg_tracking:"Tracking",pkg_dest:"Destination",pkg_value:"Total Value",pending:"Pending",info_received:"Info Received",in_transit:"In Transit",out_for_delivery:"Out for Delivery",delivered:"Delivered",failed_attempt:"Failed Attempt",exception:"Exception",expired:"Expired",forecast:"Estimated",view_carrier:"View on carrier website",order_placed:"Order Placed",confirmed:"Confirmed",preparing:"Preparing",shipped:"Shipped",customs:"Customs",local_transit:"Local Transit",products_title:"Check out what we picked for you!",qty:"Quantity",price:"Price",total:"Total"},
    "es":{title:"Rastrear Pedido",search:"RASTREAR",ph_tracking:"Ingresa tu código de rastreo",ph_email:"Email utilizado en la compra",ph_order:"Ingresa el número del pedido",or_text:"o",forgot:"¿Recordar pedido?",searching:"Buscando...",no_results:"Sin resultados",check_again:"Verifica el código e intenta de nuevo",error:"Error al buscar.",order:"Pedido",powered:"Powered by Convertfy",tab_tracking:"Rastreo",tab_email:"Email",status_label:"Estado del pedido",pkg_desc:"Descripción del paquete",pkg_order:"Pedido",pkg_tracking:"Rastreo",pkg_dest:"Destino",pkg_value:"Valor Total",pending:"Pendiente",info_received:"Info Recibida",in_transit:"En Tránsito",out_for_delivery:"En Reparto",delivered:"Entregado",failed_attempt:"Intento Fallido",exception:"Excepción",expired:"Expirado",forecast:"Estimado",view_carrier:"Ver en sitio del transportista",order_placed:"Pedido Realizado",confirmed:"Confirmado",preparing:"Preparando",shipped:"Despachado",customs:"Aduana",local_transit:"Transporte Local",products_title:"¡Mira lo que separamos para ti!",qty:"Cantidad",price:"Precio",total:"Total"},
    "de":{title:"Bestellung verfolgen",search:"VERFOLGEN",ph_tracking:"Tracking-Nummer eingeben",ph_email:"E-Mail der Bestellung",ph_order:"Bestellnummer eingeben",or_text:"oder",forgot:"Bestellung merken?",searching:"Suche...",no_results:"Keine Ergebnisse",check_again:"Überprüfen Sie den Code",error:"Suchfehler.",order:"Bestellung",powered:"Powered by Convertfy",tab_tracking:"Tracking",tab_email:"E-Mail",status_label:"Bestellstatus",pkg_desc:"Paketbeschreibung",pkg_order:"Bestellung",pkg_tracking:"Tracking",pkg_dest:"Ziel",pkg_value:"Gesamtwert",pending:"Ausstehend",info_received:"Info erhalten",in_transit:"Unterwegs",out_for_delivery:"In Zustellung",delivered:"Zugestellt",failed_attempt:"Fehlversuch",exception:"Ausnahme",expired:"Abgelaufen",forecast:"Voraussichtlich",view_carrier:"Auf Spediteur-Website ansehen",order_placed:"Bestellt",confirmed:"Bestätigt",preparing:"In Vorbereitung",shipped:"Versandt",customs:"Zoll",local_transit:"Lokaler Transport",products_title:"Schauen Sie, was wir für Sie haben!",qty:"Menge",price:"Preis",total:"Gesamt"},
    "it":{title:"Traccia Ordine",search:"TRACCIA",ph_tracking:"Inserisci il codice di tracciamento",ph_email:"Email dell'ordine",ph_order:"Inserisci il numero dell'ordine",or_text:"o",forgot:"Ricordare ordine?",searching:"Ricerca...",no_results:"Nessun risultato",check_again:"Verifica il codice",error:"Errore di ricerca.",order:"Ordine",powered:"Powered by Convertfy",tab_tracking:"Tracciamento",tab_email:"Email",status_label:"Stato dell'ordine",pkg_desc:"Descrizione del pacco",pkg_order:"Ordine",pkg_tracking:"Tracciamento",pkg_dest:"Destinazione",pkg_value:"Valore Totale",pending:"In attesa",info_received:"Info ricevuta",in_transit:"In transito",out_for_delivery:"In consegna",delivered:"Consegnato",failed_attempt:"Tentativo fallito",exception:"Eccezione",expired:"Scaduto",forecast:"Previsto",view_carrier:"Vedi sul sito del corriere",order_placed:"Ordine Effettuato",confirmed:"Confermato",preparing:"In Preparazione",shipped:"Spedito",customs:"Dogana",local_transit:"Trasporto Locale",products_title:"Guarda cosa abbiamo per te!",qty:"Quantità",price:"Prezzo",total:"Totale"}
  };

  function t(key){var lang=i18n[cfg.language]||i18n["pt-BR"];return lang[key]||key}
  function esc(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}

  var localeMap={"pt-BR":"pt-BR","en":"en-US","es":"es-ES","de":"de-DE","it":"it-IT"};
  function formatDate(d){
    if(!d)return"";
    try{return new Date(d).toLocaleDateString(localeMap[cfg.language]||"pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
    catch(e){return d}
  }
  function formatCurrency(v,cur){
    if(!v&&v!==0)return"";
    try{return new Intl.NumberFormat(localeMap[cfg.language]||"pt-BR",{style:"currency",currency:cur||"BRL"}).format(v)}
    catch(e){return(cur||"R$")+" "+Number(v).toFixed(2)}
  }
  function filterBlocked(text){
    if(!cfg.blocked_words||!text)return text;
    var words=cfg.blocked_words.split(",").map(function(w){return w.trim().toLowerCase()}).filter(Boolean);
    var result=text;
    words.forEach(function(w){result=result.replace(new RegExp(w,"gi"),"***")});
    return result;
  }

  // Timeline steps
  var STEPS_COMPLETE=["order_placed","confirmed","preparing","shipped","in_transit","customs","local_transit","out_for_delivery","delivered"];
  var STEPS_BASIC=["order_placed","shipped","in_transit","out_for_delivery","delivered"];
  function getSteps(){return cfg.plugin_type==="basic"?STEPS_BASIC:STEPS_COMPLETE}
  function statusToStep(st){
    var map={pending:0,info_received:1,in_transit:4,out_for_delivery:7,delivered:8,failed_attempt:4,exception:4,expired:4};
    var mapBasic={pending:0,info_received:0,in_transit:2,out_for_delivery:3,delivered:4,failed_attempt:2,exception:2,expired:2};
    return cfg.plugin_type==="basic"?(mapBasic[st]||0):(map[st]||0);
  }

  var pc,ac,ic;
  function injectStyles(){
    pc=cfg.primary_color;ac=cfg.accent_color;ic=cfg.icon_color;
    var old=document.getElementById("cvfy-styles");if(old)old.remove();
    var s=document.createElement("style");s.id="cvfy-styles";
    s.textContent=
    '.cvfy-w{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:#374151;max-width:800px;margin:0 auto}'+
    '.cvfy-w *{box-sizing:border-box}'+
    // Search card
    '.cvfy-card{background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px}'+
    '.cvfy-card-header{padding:20px 24px;text-align:center}'+
    '.cvfy-card-header h2{font-size:18px;font-weight:700;color:#111;margin:0 0 16px}'+
    '.cvfy-search-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 24px 20px;align-items:end}'+
    '.cvfy-search-grid .cvfy-or{display:flex;align-items:center;justify-content:center;grid-column:1/-1;color:#9ca3af;font-size:13px;gap:12px}'+
    '.cvfy-search-grid .cvfy-or::before,.cvfy-search-grid .cvfy-or::after{content:"";flex:1;height:1px;background:#e5e7eb}'+
    '.cvfy-field{display:flex;align-items:center;gap:8px;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;font-size:13px;color:#111}'+
    '.cvfy-field input{border:none;outline:none;flex:1;font-size:13px;background:transparent;color:#111;font-family:inherit}'+
    '.cvfy-field input::placeholder{color:#9ca3af}'+
    '.cvfy-field svg{width:16px;height:16px;color:#9ca3af;flex-shrink:0}'+
    '.cvfy-search-actions{grid-column:1/-1;display:flex;align-items:center;gap:12px;justify-content:flex-end}'+
    '.cvfy-forgot{color:'+pc+';font-size:12px;text-decoration:underline;cursor:pointer;background:none;border:none;font-family:inherit}'+
    '.cvfy-btn{background:'+pc+';color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:opacity .2s;font-family:inherit}'+
    '.cvfy-btn:hover{opacity:0.9}'+
    '.cvfy-btn:disabled{opacity:0.5;cursor:not-allowed}'+
    // Loading & empty
    '.cvfy-loading{text-align:center;padding:40px;color:#6b7280}'+
    '.cvfy-spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top:3px solid '+pc+';border-radius:50%;animation:cvfySpin .8s linear infinite;margin:0 auto 12px}'+
    '@keyframes cvfySpin{to{transform:rotate(360deg)}}'+
    '.cvfy-empty{text-align:center;padding:40px;color:#6b7280}'+
    // Order result
    '.cvfy-order-card{background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:20px}'+
    '.cvfy-order-header{padding:16px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px}'+
    '.cvfy-order-header h3{font-size:16px;font-weight:700;color:#111;margin:0}'+
    '.cvfy-order-badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;margin-left:auto}'+
    '.cvfy-order-badge.pending{background:#f3f4f6;color:#6b7280}'+
    '.cvfy-order-badge.in_transit,.cvfy-order-badge.info_received{background:#fef3c7;color:#92400e}'+
    '.cvfy-order-badge.out_for_delivery{background:#ede9fe;color:#5b21b6}'+
    '.cvfy-order-badge.delivered{background:#d1fae5;color:#065f46}'+
    '.cvfy-order-badge.exception,.cvfy-order-badge.failed_attempt{background:#fee2e2;color:#991b1b}'+
    // Line items table
    '.cvfy-items{width:100%;border-collapse:collapse}'+
    '.cvfy-items th{text-align:left;padding:10px 16px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb;background:#f9fafb}'+
    '.cvfy-items td{padding:12px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;vertical-align:middle}'+
    '.cvfy-items .cvfy-item-img{width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #e5e7eb;background:#f9fafb}'+
    '.cvfy-items .cvfy-item-info{display:flex;align-items:center;gap:12px}'+
    '.cvfy-items .cvfy-item-name{font-weight:500;color:#111}'+
    // Progress timeline horizontal
    '.cvfy-progress{padding:24px;border-bottom:1px solid #e5e7eb}'+
    '.cvfy-progress-label{font-size:13px;color:#6b7280;margin-bottom:4px}'+
    '.cvfy-progress-status{font-size:18px;font-weight:700;color:#111;margin-bottom:20px}'+
    '.cvfy-steps{display:flex;align-items:center;position:relative}'+
    '.cvfy-step{display:flex;flex-direction:column;align-items:center;flex:1;position:relative;z-index:1}'+
    '.cvfy-step-dot{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#e5e7eb;color:#9ca3af;transition:all .3s;position:relative;z-index:2}'+
    '.cvfy-step-dot svg{width:16px;height:16px}'+
    '.cvfy-step.active .cvfy-step-dot{background:'+pc+';color:#fff;box-shadow:0 0 0 4px '+pc+'30}'+
    '.cvfy-step.done .cvfy-step-dot{background:'+pc+';color:#fff}'+
    '.cvfy-step-label{font-size:9px;color:#9ca3af;margin-top:6px;text-align:center;max-width:70px;line-height:1.2}'+
    '.cvfy-step.active .cvfy-step-label,.cvfy-step.done .cvfy-step-label{color:'+pc+';font-weight:600}'+
    '.cvfy-step-line{position:absolute;top:18px;left:0;right:0;height:3px;background:#e5e7eb;z-index:0}'+
    '.cvfy-step-line-fill{height:100%;background:'+pc+';transition:width .5s}'+
    // Tracking code info
    '.cvfy-tracking-info{padding:16px 24px;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb}'+
    '.cvfy-tracking-info strong{color:#111}'+
    // Event timeline vertical
    '.cvfy-events{padding:24px}'+
    '.cvfy-event{position:relative;padding-left:28px;padding-bottom:16px}'+
    '.cvfy-event:last-child{padding-bottom:0}'+
    '.cvfy-event::before{content:"";position:absolute;left:0;top:20px;bottom:0;width:2px;background:#e5e7eb}'+
    '.cvfy-event:last-child::before{display:none}'+
    '.cvfy-event-dot{position:absolute;left:-5px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid #fff}'+
    '.cvfy-event:first-child .cvfy-event-dot{background:'+ac+';box-shadow:0 0 0 3px '+ac+'30}'+
    '.cvfy-event:not(:first-child) .cvfy-event-dot{background:#d1d5db;box-shadow:0 0 0 3px #d1d5db30}'+
    '.cvfy-event-date{font-size:11px;color:#9ca3af;font-weight:600;margin-bottom:2px}'+
    '.cvfy-event-title{font-size:13px;font-weight:600;color:#111}'+
    '.cvfy-event-desc{font-size:12px;color:#6b7280;margin-top:2px}'+
    // Package description box
    '.cvfy-pkg{margin:0 24px 24px;border:1px solid #e5e7eb;border-radius:12px;padding:16px}'+
    '.cvfy-pkg h4{font-size:14px;font-weight:700;color:#111;margin:0 0 12px}'+
    '.cvfy-pkg-row{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:#6b7280}'+
    '.cvfy-pkg-row strong{color:#111}'+
    '.cvfy-pkg-row .cvfy-highlight{color:'+pc+';font-weight:700}'+
    // Carrier link
    '.cvfy-carrier-link{display:block;text-align:center;padding:12px;color:'+ac+';font-size:13px;font-weight:500;text-decoration:none;border-top:1px solid #e5e7eb}'+
    '.cvfy-carrier-link:hover{opacity:0.8}'+
    // Footer
    '.cvfy-footer{text-align:center;padding:12px;border-top:1px solid #e5e7eb}'+
    '.cvfy-footer span{font-size:11px;color:#9ca3af}'+
    // Estimated delivery
    '.cvfy-forecast{display:flex;align-items:center;gap:6px;padding:12px 24px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;font-size:13px;color:#065f46;font-weight:500}'+
    '.cvfy-forecast svg{width:16px;height:16px}'+
    '@media(max-width:640px){.cvfy-search-grid{grid-template-columns:1fr}.cvfy-step-label{font-size:8px;max-width:50px}.cvfy-step-dot{width:28px;height:28px}.cvfy-step-dot svg{width:12px;height:12px}.cvfy-items .cvfy-item-img{width:36px;height:36px}}';
    document.head.appendChild(s);
  }

  var trackingIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
  var stepIcons={
    order_placed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M16 8l-8 8M8 8l8 8"/></svg>',
    confirmed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    preparing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>',
    shipped:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    in_transit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    customs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z"/></svg>',
    local_transit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    out_for_delivery:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    delivered:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };

  function buildSearchHTML(){
    return '<div class="cvfy-card">'+
      '<div class="cvfy-card-header"><h2>'+esc(t("title"))+'</h2></div>'+
      '<div class="cvfy-search-grid">'+
        '<div class="cvfy-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><input data-cvfy-input data-type="email" placeholder="'+esc(t("ph_email"))+'" /></div>'+
        '<div class="cvfy-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input data-cvfy-input data-type="tracking" placeholder="'+esc(t("ph_tracking"))+'" /></div>'+
        '<div class="cvfy-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><input data-cvfy-input data-type="order" placeholder="'+esc(t("ph_order"))+'" /></div>'+
        '<div class="cvfy-search-actions">'+
          '<button class="cvfy-forgot">'+esc(t("forgot"))+'</button>'+
          '<button class="cvfy-btn" data-cvfy-search>'+esc(t("search"))+'</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div data-cvfy-results></div>';
  }

  function renderProgressBar(status){
    var steps=getSteps();
    var activeIdx=statusToStep(status);
    var html='<div class="cvfy-progress">';
    html+='<div class="cvfy-progress-label">'+esc(t("status_label"))+'</div>';
    html+='<div class="cvfy-progress-status">'+esc(t(status)||status)+'</div>';
    html+='<div class="cvfy-steps" style="position:relative">';
    // Background line
    html+='<div class="cvfy-step-line" style="position:absolute;top:18px;left:calc(50%/'+steps.length+');right:calc(50%/'+steps.length+');height:3px;background:#e5e7eb;z-index:0">';
    var pct=steps.length>1?Math.min(100,((activeIdx)/(steps.length-1))*100):0;
    html+='<div class="cvfy-step-line-fill" style="width:'+pct+'%"></div>';
    html+='</div>';
    steps.forEach(function(step,i){
      var cls=i<activeIdx?"done":i===activeIdx?"active":"";
      html+='<div class="cvfy-step '+cls+'">';
      html+='<div class="cvfy-step-dot">'+(stepIcons[step]||trackingIcon)+'</div>';
      html+='<div class="cvfy-step-label">'+esc(t(step)||step)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
    return html;
  }

  function renderResults(el,data){
    if(!data.results||data.results.length===0){
      el.innerHTML='<div class="cvfy-empty"><p style="font-size:15px;font-weight:600">'+esc(t("no_results"))+'</p><p style="font-size:13px;margin-top:8px;color:#9ca3af">'+esc(cfg.not_found_message||t("check_again"))+'</p></div>';
      return;
    }
    var html="";
    data.results.forEach(function(r){
      var o=r.order;
      var tk=r.tracking&&r.tracking[0];
      var status=tk?tk.status:"pending";

      html+='<div class="cvfy-order-card">';

      // Order header
      html+='<div class="cvfy-order-header">';
      html+='<h3>'+esc(t("order"))+" "+esc(o.order_name||"")+'</h3>';
      html+='<span class="cvfy-order-badge '+esc(status)+'">'+esc(t(status)||status)+'</span>';
      html+='</div>';

      // Line items
      if(o.line_items&&o.line_items.length>0){
        html+='<table class="cvfy-items"><thead><tr>';
        html+='<th>'+esc(t("order"))+'</th><th>'+esc(t("price"))+'</th><th>'+esc(t("qty"))+'</th><th>'+esc(t("total"))+'</th>';
        html+='</tr></thead><tbody>';
        o.line_items.forEach(function(item){
          html+='<tr><td><div class="cvfy-item-info">';
          if(item.image_url)html+='<img class="cvfy-item-img" src="'+esc(item.image_url)+'" alt="" />';
          html+='<span class="cvfy-item-name">'+esc(item.title)+'</span></div></td>';
          html+='<td>'+esc(formatCurrency(parseFloat(item.price),o.currency))+'</td>';
          html+='<td>'+esc(String(item.quantity))+'</td>';
          html+='<td><strong>'+esc(formatCurrency(parseFloat(item.price)*item.quantity,o.currency))+'</strong></td>';
          html+='</tr>';
        });
        html+='</tbody></table>';
      }

      // Tracking code
      if(tk){
        html+='<div class="cvfy-tracking-info">';
        html+='Código: <strong>'+esc(tk.tracking_number)+'</strong>';
        if(!cfg.hide_carrier&&tk.carrier_name)html+=' &mdash; '+esc(tk.carrier_name);
        html+='</div>';

        // Progress bar
        html+=renderProgressBar(status);

        // Estimated delivery
        if(cfg.show_estimated_delivery&&tk.estimated_delivery){
          html+='<div class="cvfy-forecast"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> '+esc(t("forecast"))+": "+esc(formatDate(tk.estimated_delivery))+'</div>';
        }

        // Event timeline
        if(tk.tracking_events&&tk.tracking_events.length>0){
          html+='<div class="cvfy-events">';
          tk.tracking_events.forEach(function(ev){
            var desc=filterBlocked(ev.description||"");
            html+='<div class="cvfy-event"><div class="cvfy-event-dot"></div>';
            html+='<div class="cvfy-event-date">'+esc(formatDate(ev.date))+'</div>';
            html+='<div class="cvfy-event-title">'+esc(desc)+'</div>';
            if(ev.location)html+='<div class="cvfy-event-desc">'+esc(ev.location)+'</div>';
            html+='</div>';
          });
          html+='</div>';
        }

        // Package description
        html+='<div class="cvfy-pkg"><h4>'+esc(t("pkg_desc"))+'</h4>';
        html+='<div class="cvfy-pkg-row"><span>'+esc(t("pkg_order"))+':</span> <strong>'+esc(o.order_name||"")+'</strong></div>';
        html+='<div class="cvfy-pkg-row"><span>'+esc(t("pkg_tracking"))+':</span> <strong class="cvfy-highlight">'+esc(tk.tracking_number)+'</strong></div>';
        if(o.shipping_address&&o.shipping_address.city){
          var addr=o.shipping_address;
          html+='<div class="cvfy-pkg-row"><span>'+esc(t("pkg_dest"))+':</span> <strong>'+esc(addr.city+(addr.province?"/"+addr.province:"")+(addr.zip?" — "+addr.zip:""))+'</strong></div>';
        }
        if(o.total_price)html+='<div class="cvfy-pkg-row"><span>'+esc(t("pkg_value"))+':</span> <strong class="cvfy-highlight">'+esc(formatCurrency(o.total_price,o.currency))+'</strong></div>';
        html+='</div>';

        // Carrier link
        if(!cfg.hide_redirect&&tk.carrier_name){
          html+='<a class="cvfy-carrier-link" href="#" onclick="return false">'+esc(t("view_carrier"))+' →</a>';
        }
      }

      html+='<div class="cvfy-footer"><a href="https://convertfy.me/?utm_source=track&utm_medium=referral&utm_campaign=powered_by&utm_content='+encodeURIComponent(window.location.hostname)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;opacity:0.7;transition:opacity .2s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">'+esc(t("powered"))+'</a></div>';
      html+='</div>';
    });
    el.innerHTML=html;
  }

  function doSearch(container,resultsEl){
    var inputs=container.querySelectorAll("[data-cvfy-input]");
    var q="";
    for(var i=0;i<inputs.length;i++){if(inputs[i].value.trim()){q=inputs[i].value.trim();break}}
    if(!q||q.length<3)return;
    resultsEl.innerHTML='<div class="cvfy-loading"><div class="cvfy-spinner"></div>'+esc(t("searching"))+'</div>';
    fetch(LOOKUP+"?q="+encodeURIComponent(q)+"&store="+encodeURIComponent(STORE_ID))
      .then(function(r){return r.json()})
      .then(function(data){renderResults(resultsEl,data)})
      .catch(function(){resultsEl.innerHTML='<div class="cvfy-empty"><p>'+esc(t("error"))+'</p></div>'});
  }

  function bindSearch(container){
    var btn=container.querySelector("[data-cvfy-search]");
    var results=container.querySelector("[data-cvfy-results]");
    var inputs=container.querySelectorAll("[data-cvfy-input]");
    if(btn)btn.addEventListener("click",function(){doSearch(container,results)});
    for(var i=0;i<inputs.length;i++){
      inputs[i].addEventListener("keypress",function(e){if(e.key==="Enter")doSearch(container,results)});
    }
  }

  function init(){
    var container=document.getElementById("convertfy-tracking");
    if(!container){
      container=document.createElement("div");
      container.id="convertfy-tracking";
      var main=document.querySelector("main")||document.querySelector(".main-content")||document.querySelector("#MainContent")||document.body;
      main.appendChild(container);
    }
    injectStyles();
    container.innerHTML='<div class="cvfy-w">'+buildSearchHTML()+'</div>';
    bindSearch(container);
  }

  // Read data-* attributes from script tag (snippet config)
  if(SCRIPT_EL){
    if(SCRIPT_EL.dataset.color)cfg.primary_color=SCRIPT_EL.dataset.color;
    if(SCRIPT_EL.dataset.lang)cfg.language=SCRIPT_EL.dataset.lang;
    if(SCRIPT_EL.dataset.container){
      var customContainer=document.getElementById(SCRIPT_EL.dataset.container);
      if(customContainer)customContainer.id=customContainer.id||"convertfy-tracking";
    }
  }

  // Backward-compat: read window.ConvertfyTracking if present (legacy snippet)
  var legacy=window.ConvertfyTracking;
  if(legacy){
    if(legacy.primaryColor)cfg.primary_color=legacy.primaryColor;
    if(legacy.accentColor)cfg.accent_color=legacy.accentColor;
    if(legacy.iconColor)cfg.icon_color=legacy.iconColor;
    if(legacy.lang)cfg.language=legacy.lang;
    if(legacy.hideCarrier!==undefined)cfg.hide_carrier=legacy.hideCarrier;
    if(legacy.hideRedirect!==undefined)cfg.hide_redirect=legacy.hideRedirect;
    if(legacy.type)cfg.plugin_type=legacy.type;
    if(legacy.storeId&&!STORE_ID)STORE_ID=legacy.storeId;
  }

  function applyConfig(c){
    if(c.primary_color)cfg.primary_color=c.primary_color;
    if(c.accent_color)cfg.accent_color=c.accent_color;
    if(c.icon_color)cfg.icon_color=c.icon_color;
    if(c.language)cfg.language=c.language;
    if(c.plugin_type)cfg.plugin_type=c.plugin_type;
    if(c.not_found_message)cfg.not_found_message=c.not_found_message;
    if(c.hide_carrier!==undefined)cfg.hide_carrier=c.hide_carrier;
    if(c.hide_redirect!==undefined)cfg.hide_redirect=c.hide_redirect;
    if(c.show_estimated_delivery!==undefined)cfg.show_estimated_delivery=c.show_estimated_delivery;
    if(c.show_carrier_logo!==undefined)cfg.show_carrier_logo=c.show_carrier_logo;
    if(c.blocked_words!==undefined)cfg.blocked_words=c.blocked_words;
  }

  // Allow live config updates from parent (portal preview via postMessage)
  window.__convertfy_rerender=function(newCfg){
    if(newCfg)applyConfig(newCfg);
    init();
  };
  window.addEventListener("message",function(e){
    if(e.data&&e.data.type==="convertfy:config"){
      applyConfig(e.data.config);
      init();
    }
  });

  // Load remote config, then init
  fetch(CONFIG_URL)
    .then(function(r){return r.json()})
    .then(function(data){
      if(data.config)applyConfig(data.config);
      if(data.store_name)cfg.store_name=data.store_name;
      init();
    })
    .catch(function(){init()});
})();`
}

export async function GET(request: NextRequest) {
  // Sanitize storeId to prevent template literal injection
  const rawStoreId = request.nextUrl.searchParams.get("store") || "default"
  const storeId = rawStoreId.replace(/[^a-zA-Z0-9\-_]/g, "")

  const script = getWidgetScript(storeId)

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
