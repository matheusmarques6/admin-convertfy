import { NextRequest, NextResponse } from "next/server"

const DOMAIN = process.env.NEXT_PUBLIC_TRACKING_DOMAIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function getWidgetScript(storeId: string): string {
  return `(function(){
  if(window.__convertfy_tracking_loaded)return;
  window.__convertfy_tracking_loaded=true;

  var STORE_ID="${storeId}";
  var API_BASE="${DOMAIN}/api/tracking";
  var LOOKUP=API_BASE+"/lookup";
  var CONFIG_URL=API_BASE+"/config?store="+STORE_ID;
  var TRACK_PAGE="${DOMAIN}/track/";

  // Default config (overridden by /api/tracking/config)
  var cfg={
    primary_color:"#6366F1",
    accent_color:"#8B5CF6",
    language:"pt-BR",
    not_found_message:"Pedido não encontrado. Verifique o número informado e tente novamente.",
    hide_carrier:false,
    show_estimated_delivery:true,
    show_carrier_logo:true,
    store_name:""
  };

  // i18n
  var i18n={
    "pt-BR":{title:"Rastrear Pedido",search:"Buscar",placeholder:"Código de rastreio, nº pedido ou email",searching:"Buscando...",no_results:"Nenhum resultado encontrado",check_again:"Verifique o código e tente novamente",error:"Erro ao buscar. Tente novamente.",full_history:"Ver histórico completo",order:"Pedido",powered:"Powered by Convertfy",tab_tracking:"Rastreio",tab_email:"Email",pending:"Pendente",info_received:"Info Recebida",in_transit:"Em Trânsito",out_for_delivery:"Saiu p/ Entrega",delivered:"Entregue",failed_attempt:"Tentativa Falha",exception:"Exceção",expired:"Expirado"},
    "en":{title:"Track Order",search:"Search",placeholder:"Tracking code, order number or email",searching:"Searching...",no_results:"No results found",check_again:"Check the code and try again",error:"Search error. Try again.",full_history:"View full history",order:"Order",powered:"Powered by Convertfy",tab_tracking:"Tracking",tab_email:"Email",pending:"Pending",info_received:"Info Received",in_transit:"In Transit",out_for_delivery:"Out for Delivery",delivered:"Delivered",failed_attempt:"Failed Attempt",exception:"Exception",expired:"Expired"},
    "es":{title:"Rastrear Pedido",search:"Buscar",placeholder:"Código de rastreo, nº pedido o email",searching:"Buscando...",no_results:"Sin resultados",check_again:"Verifique el código e intente nuevamente",error:"Error al buscar. Intente nuevamente.",full_history:"Ver historial completo",order:"Pedido",powered:"Powered by Convertfy",tab_tracking:"Rastreo",tab_email:"Email",pending:"Pendiente",info_received:"Info Recibida",in_transit:"En Tránsito",out_for_delivery:"En Camino",delivered:"Entregado",failed_attempt:"Intento Fallido",exception:"Excepción",expired:"Expirado"}
  };

  function t(key){var lang=i18n[cfg.language]||i18n["pt-BR"];return lang[key]||key}

  // HTML escape to prevent XSS
  function esc(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}

  // Detect mode: inline if #convertfy-tracking exists, else floating
  var inlineContainer=document.getElementById("convertfy-tracking");
  var isInline=!!inlineContainer;

  // CSS
  var pc=cfg.primary_color;
  function injectStyles(){
    pc=cfg.primary_color;
    var style=document.createElement("style");
    style.id="cvfy-styles";
    style.textContent=
      '.cvfy-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:#374151}'+
      '.cvfy-widget *{box-sizing:border-box;margin:0;padding:0}'+
      '.cvfy-header{padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px}'+
      '.cvfy-header-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:'+pc+'15;color:'+pc+'}'+
      '.cvfy-header-icon svg{width:20px;height:20px}'+
      '.cvfy-header h2{font-size:18px;font-weight:700;color:#111;flex:1}'+
      '.cvfy-close{background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:20px;line-height:1}'+
      '.cvfy-body{padding:24px}'+
      '.cvfy-tabs{display:flex;gap:4px;margin-bottom:16px;background:#f3f4f6;border-radius:10px;padding:4px}'+
      '.cvfy-tab{flex:1;padding:8px 12px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:#6b7280;transition:all .2s}'+
      '.cvfy-tab.active{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,0.1)}'+
      '.cvfy-search{display:flex;gap:8px;margin-bottom:20px}'+
      '.cvfy-search input{flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;transition:border .2s;background:#fff;color:#111}'+
      '.cvfy-search input:focus{border-color:'+pc+'}'+
      '.cvfy-search button{background:'+pc+';color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s;white-space:nowrap}'+
      '.cvfy-search button:hover{opacity:0.9}'+
      '.cvfy-loading{text-align:center;padding:32px;color:#6b7280}'+
      '.cvfy-spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top:3px solid '+pc+';border-radius:50%;animation:cvfySpin .8s linear infinite;margin:0 auto 12px}'+
      '@keyframes cvfySpin{to{transform:rotate(360deg)}}'+
      '.cvfy-empty{text-align:center;padding:32px;color:#6b7280}'+
      '.cvfy-result{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px}'+
      '.cvfy-result-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}'+
      '.cvfy-result-header strong{font-size:15px;color:#111}'+
      '.cvfy-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase}'+
      '.cvfy-badge.pending{background:#f3f4f6;color:#6b7280}'+
      '.cvfy-badge.in_transit{background:#fef3c7;color:#92400e}'+
      '.cvfy-badge.out_for_delivery{background:#ede9fe;color:#5b21b6}'+
      '.cvfy-badge.delivered{background:#d1fae5;color:#065f46}'+
      '.cvfy-badge.exception,.cvfy-badge.failed_attempt{background:#fee2e2;color:#991b1b}'+
      '.cvfy-timeline{position:relative;padding-left:20px}'+
      '.cvfy-timeline::before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:#e5e7eb}'+
      '.cvfy-event{position:relative;padding-bottom:14px}'+
      '.cvfy-event:last-child{padding-bottom:0}'+
      '.cvfy-event::before{content:"";position:absolute;left:-17px;top:5px;width:10px;height:10px;border-radius:50%;background:'+pc+';border:2px solid #fff;box-shadow:0 0 0 2px '+pc+'}'+
      '.cvfy-event:not(:first-child)::before{background:#d1d5db;box-shadow:0 0 0 2px #d1d5db}'+
      '.cvfy-event-desc{font-size:13px;color:#111;font-weight:500}'+
      '.cvfy-event-meta{font-size:11px;color:#6b7280;margin-top:2px}'+
      '.cvfy-footer{padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center}'+
      '.cvfy-footer a{font-size:11px;color:#9ca3af;text-decoration:none}'+
      '.cvfy-link{color:'+pc+';text-decoration:none;font-size:12px;font-weight:500}'+
      // Inline-specific
      '.cvfy-inline{background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)}'+
      // Floating-specific
      '#cvfy-track-btn{position:fixed;bottom:20px;right:20px;z-index:99999;background:'+pc+';color:#fff;border:none;border-radius:50px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.2);transition:all .2s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;gap:8px}'+
      '#cvfy-track-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.3)}'+
      '#cvfy-track-btn svg{width:18px;height:18px}'+
      '#cvfy-track-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:none;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'+
      '#cvfy-track-overlay.open{display:flex}'+
      '#cvfy-track-modal{background:#fff;border-radius:16px;width:90%;max-width:480px;max-height:85vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:cvfySlideUp .3s ease}'+
      '@keyframes cvfySlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}'+
      '@media(max-width:480px){#cvfy-track-modal{width:95%;max-height:90vh}}';
    document.head.appendChild(style);
  }

  var trackingIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

  function formatDate(d){
    if(!d)return"";
    try{return new Date(d).toLocaleDateString(cfg.language==="en"?"en-US":cfg.language==="es"?"es-ES":"pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
    catch(e){return d}
  }

  function renderResults(el,data){
    if(!data.results||data.results.length===0){
      el.innerHTML='<div class="cvfy-empty"><p>'+t("no_results")+'</p><p style="font-size:12px;margin-top:8px">'+esc(cfg.not_found_message||t("check_again"))+'</p></div>';
      return;
    }
    var html="";
    data.results.forEach(function(r){
      html+='<div class="cvfy-result">';
      html+='<div class="cvfy-result-header"><strong>'+esc(r.order.order_name||t("order"))+'</strong>';
      if(r.tracking&&r.tracking.length>0){
        var st=esc(r.tracking[0].status||"pending");
        html+='<span class="cvfy-badge '+st+'">'+(t(st)||st)+'</span>';
      }
      html+='</div>';
      if(r.order.customer_name)html+='<p style="margin:0 0 8px;font-size:13px;color:#6b7280">'+esc(r.order.customer_name)+'</p>';
      r.tracking.forEach(function(tk){
        html+='<p style="font-size:12px;color:#374151;margin:0 0 8px"><strong>'+esc(tk.tracking_number)+'</strong>';
        if(!cfg.hide_carrier&&tk.carrier_name)html+=' <span style="color:#9ca3af">'+esc(tk.carrier_name)+'</span>';
        html+='</p>';
        if(tk.tracking_events&&tk.tracking_events.length>0){
          html+='<div class="cvfy-timeline">';
          tk.tracking_events.slice(0,5).forEach(function(ev){
            html+='<div class="cvfy-event"><div class="cvfy-event-desc">'+esc(ev.description)+'</div><div class="cvfy-event-meta">'+esc(formatDate(ev.date))+(ev.location?" • "+esc(ev.location):"")+'</div></div>';
          });
          html+='</div>';
          if(tk.tracking_events.length>5){
            html+='<a class="cvfy-link" href="'+TRACK_PAGE+encodeURIComponent(tk.tracking_number)+'" target="_blank" style="display:block;margin-top:8px">'+t("full_history")+' →</a>';
          }
        }
      });
      html+='</div>';
    });
    el.innerHTML=html;
  }

  function doSearch(inputEl,resultsEl){
    var q=inputEl.value.trim();
    if(!q||q.length<3)return;
    resultsEl.innerHTML='<div class="cvfy-loading"><div class="cvfy-spinner"></div>'+t("searching")+'</div>';
    fetch(LOOKUP+"?q="+encodeURIComponent(q)+"&store="+encodeURIComponent(STORE_ID))
      .then(function(r){return r.json()})
      .then(function(data){renderResults(resultsEl,data)})
      .catch(function(){resultsEl.innerHTML='<div class="cvfy-empty"><p>'+t("error")+'</p></div>'});
  }

  function buildWidgetHTML(showClose){
    return '<div class="cvfy-header">'+
      '<div class="cvfy-header-icon">'+trackingIcon+'</div>'+
      '<h2>'+t("title")+(cfg.store_name?' <span style="font-size:13px;font-weight:400;color:#9ca3af">'+esc(cfg.store_name)+'</span>':'')+'</h2>'+
      (showClose?'<button class="cvfy-close" data-cvfy-close>&times;</button>':'')+
    '</div>'+
    '<div class="cvfy-body">'+
      '<div class="cvfy-search">'+
        '<input data-cvfy-input placeholder="'+t("placeholder")+'" />'+
        '<button data-cvfy-search>'+t("search")+'</button>'+
      '</div>'+
      '<div data-cvfy-results></div>'+
    '</div>'+
    '<div class="cvfy-footer"><a href="${DOMAIN}" target="_blank">'+t("powered")+'</a></div>';
  }

  function bindSearch(container){
    var input=container.querySelector("[data-cvfy-input]");
    var btn=container.querySelector("[data-cvfy-search]");
    var results=container.querySelector("[data-cvfy-results]");
    if(btn)btn.addEventListener("click",function(){doSearch(input,results)});
    if(input)input.addEventListener("keypress",function(e){if(e.key==="Enter")doSearch(input,results)});
  }

  function initInline(){
    inlineContainer.innerHTML='<div class="cvfy-widget cvfy-inline">'+buildWidgetHTML(false)+'</div>';
    bindSearch(inlineContainer);
  }

  function initFloating(){
    var btn=document.createElement("button");
    btn.id="cvfy-track-btn";
    btn.innerHTML=trackingIcon+t("title");
    document.body.appendChild(btn);

    var overlay=document.createElement("div");
    overlay.id="cvfy-track-overlay";
    overlay.innerHTML='<div id="cvfy-track-modal" class="cvfy-widget">'+buildWidgetHTML(true)+'</div>';
    document.body.appendChild(overlay);

    function open(){overlay.classList.add("open")}
    function close(){overlay.classList.remove("open")}

    btn.addEventListener("click",open);
    overlay.querySelector("[data-cvfy-close]").addEventListener("click",close);
    overlay.addEventListener("click",function(e){if(e.target===overlay)close()});
    bindSearch(overlay);
  }

  // Fetch config then initialize
  function init(){
    injectStyles();
    if(isInline)initInline();
    else initFloating();
  }

  // Load remote config, then init
  fetch(CONFIG_URL)
    .then(function(r){return r.json()})
    .then(function(data){
      if(data.config){
        var c=data.config;
        if(c.primary_color)cfg.primary_color=c.primary_color;
        if(c.accent_color)cfg.accent_color=c.accent_color;
        if(c.language)cfg.language=c.language;
        if(c.not_found_message)cfg.not_found_message=c.not_found_message;
        if(c.hide_carrier!==undefined)cfg.hide_carrier=c.hide_carrier;
        if(c.show_estimated_delivery!==undefined)cfg.show_estimated_delivery=c.show_estimated_delivery;
        if(c.show_carrier_logo!==undefined)cfg.show_carrier_logo=c.show_carrier_logo;
      }
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
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
