import { NextRequest, NextResponse } from "next/server"

const DOMAIN = process.env.NEXT_PUBLIC_TRACKING_DOMAIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

function getWidgetScript(storeId: string): string {
  return `(function(){
  if(window.__convertfy_tracking_loaded)return;
  window.__convertfy_tracking_loaded=true;

  var STORE_ID="${storeId}";
  var API="${DOMAIN}/api/tracking/lookup";
  var TRACK_PAGE="${DOMAIN}/track/";

  var style=document.createElement("style");
  style.textContent=\`
    #cvfy-track-btn{position:fixed;bottom:20px;right:20px;z-index:99999;background:#05AFF2;color:#fff;border:none;border-radius:50px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(5,175,242,0.4);transition:all .2s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;gap:8px}
    #cvfy-track-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(5,175,242,0.5)}
    #cvfy-track-btn svg{width:18px;height:18px}
    #cvfy-track-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:none;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    #cvfy-track-overlay.open{display:flex}
    #cvfy-track-modal{background:#fff;border-radius:16px;width:90%;max-width:480px;max-height:85vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:cvfySlideUp .3s ease}
    @keyframes cvfySlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    #cvfy-track-modal *{box-sizing:border-box}
    .cvfy-header{padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:between}
    .cvfy-header h2{margin:0;font-size:18px;font-weight:700;color:#111;flex:1}
    .cvfy-close{background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:20px;line-height:1}
    .cvfy-body{padding:24px;overflow-y:auto;max-height:calc(85vh - 140px)}
    .cvfy-search{display:flex;gap:8px;margin-bottom:20px}
    .cvfy-search input{flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;transition:border .2s}
    .cvfy-search input:focus{border-color:#05AFF2}
    .cvfy-search button{background:#05AFF2;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
    .cvfy-loading{text-align:center;padding:32px;color:#6b7280}
    .cvfy-spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top:3px solid #05AFF2;border-radius:50%;animation:cvfySpin .8s linear infinite;margin:0 auto 12px}
    @keyframes cvfySpin{to{transform:rotate(360deg)}}
    .cvfy-empty{text-align:center;padding:32px;color:#6b7280}
    .cvfy-result{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px}
    .cvfy-result-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .cvfy-result-header strong{font-size:15px;color:#111}
    .cvfy-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase}
    .cvfy-badge.pending{background:#f3f4f6;color:#6b7280}
    .cvfy-badge.in_transit{background:#fef3c7;color:#92400e}
    .cvfy-badge.out_for_delivery{background:#ede9fe;color:#5b21b6}
    .cvfy-badge.delivered{background:#d1fae5;color:#065f46}
    .cvfy-badge.exception,.cvfy-badge.failed_attempt{background:#fee2e2;color:#991b1b}
    .cvfy-timeline{position:relative;padding-left:20px}
    .cvfy-timeline::before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:#e5e7eb}
    .cvfy-event{position:relative;padding-bottom:14px}
    .cvfy-event:last-child{padding-bottom:0}
    .cvfy-event::before{content:"";position:absolute;left:-17px;top:5px;width:10px;height:10px;border-radius:50%;background:#05AFF2;border:2px solid #fff;box-shadow:0 0 0 2px #05AFF2}
    .cvfy-event:not(:first-child)::before{background:#d1d5db;box-shadow:0 0 0 2px #d1d5db}
    .cvfy-event-desc{font-size:13px;color:#111;font-weight:500}
    .cvfy-event-meta{font-size:11px;color:#6b7280;margin-top:2px}
    .cvfy-footer{padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center}
    .cvfy-footer a{font-size:11px;color:#9ca3af;text-decoration:none}
    .cvfy-link{color:#05AFF2;text-decoration:none;font-size:12px;font-weight:500}
    @media(max-width:480px){#cvfy-track-modal{width:95%;max-height:90vh}.cvfy-body{max-height:calc(90vh - 140px)}}
  \`;
  document.head.appendChild(style);

  var btn=document.createElement("button");
  btn.id="cvfy-track-btn";
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>Rastrear Pedido';
  document.body.appendChild(btn);

  var overlay=document.createElement("div");
  overlay.id="cvfy-track-overlay";
  overlay.innerHTML=\`
    <div id="cvfy-track-modal">
      <div class="cvfy-header"><h2>Rastrear Pedido</h2><button class="cvfy-close" id="cvfy-close">&times;</button></div>
      <div class="cvfy-body" id="cvfy-body">
        <div class="cvfy-search"><input id="cvfy-input" placeholder="Código de rastreio, nº pedido ou email" /><button id="cvfy-search-btn">Buscar</button></div>
        <div id="cvfy-results"></div>
      </div>
      <div class="cvfy-footer"><a href="${DOMAIN}" target="_blank">Powered by Convertfy</a></div>
    </div>\`;
  document.body.appendChild(overlay);

  function open(){overlay.classList.add("open")}
  function close(){overlay.classList.remove("open")}

  btn.addEventListener("click",open);
  document.getElementById("cvfy-close").addEventListener("click",close);
  overlay.addEventListener("click",function(e){if(e.target===overlay)close()});

  var statusLabels={pending:"Pendente",info_received:"Info Recebida",in_transit:"Em Trânsito",out_for_delivery:"Saiu p/ Entrega",delivered:"Entregue",failed_attempt:"Tentativa Falha",exception:"Exceção",expired:"Expirado"};

  function formatDate(d){if(!d)return"";try{var dt=new Date(d);return dt.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch(e){return d}}

  function search(){
    var q=document.getElementById("cvfy-input").value.trim();
    if(!q||q.length<3)return;
    var el=document.getElementById("cvfy-results");
    el.innerHTML='<div class="cvfy-loading"><div class="cvfy-spinner"></div>Buscando...</div>';

    fetch(API+"?q="+encodeURIComponent(q))
      .then(function(r){return r.json()})
      .then(function(data){
        if(!data.results||data.results.length===0){
          el.innerHTML='<div class="cvfy-empty"><p>Nenhum resultado encontrado</p><p style="font-size:12px;margin-top:8px">Verifique o código e tente novamente</p></div>';
          return;
        }
        var html="";
        data.results.forEach(function(r){
          html+='<div class="cvfy-result">';
          html+='<div class="cvfy-result-header"><strong>'+(r.order.order_name||"Pedido")+'</strong>';
          if(r.tracking.length>0){
            var st=r.tracking[0].current_status||"pending";
            html+='<span class="cvfy-badge '+st+'">'+(statusLabels[st]||st)+'</span>';
          }
          html+='</div>';
          if(r.order.customer_name)html+='<p style="margin:0 0 4px;font-size:13px;color:#6b7280">'+r.order.customer_name+'</p>';
          if(r.order.shipping_city)html+='<p style="margin:0 0 12px;font-size:12px;color:#9ca3af">'+r.order.shipping_city+(r.order.shipping_state?", "+r.order.shipping_state:"")+'</p>';
          r.tracking.forEach(function(t){
            html+='<p style="font-size:12px;color:#374151;margin:0 0 8px"><strong>'+t.tracking_number+'</strong>'+(t.carrier_name?' <span style="color:#9ca3af">'+t.carrier_name+'</span>':"")+'</p>';
            if(t.tracking_events&&t.tracking_events.length>0){
              html+='<div class="cvfy-timeline">';
              t.tracking_events.slice(0,5).forEach(function(ev){
                html+='<div class="cvfy-event"><div class="cvfy-event-desc">'+ev.description+'</div><div class="cvfy-event-meta">'+formatDate(ev.date)+(ev.location?" • "+ev.location:"")+'</div></div>';
              });
              html+='</div>';
              if(t.tracking_events.length>5){
                html+='<a class="cvfy-link" href="'+TRACK_PAGE+t.tracking_number+'" target="_blank" style="display:block;margin-top:8px">Ver histórico completo →</a>';
              }
            }
          });
          html+='</div>';
        });
        el.innerHTML=html;
      })
      .catch(function(){
        el.innerHTML='<div class="cvfy-empty"><p>Erro ao buscar. Tente novamente.</p></div>';
      });
  }

  document.getElementById("cvfy-search-btn").addEventListener("click",search);
  document.getElementById("cvfy-input").addEventListener("keypress",function(e){if(e.key==="Enter")search()});
})();`
}

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("store") || "default"

  const script = getWidgetScript(storeId)

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
