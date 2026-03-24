import { useState, Fragment } from "react";

const DS = {
  colors: {
    brand: {
      blue: "#2137B6", blueLight: "#4E62D8", blueDark: "#041366",
      blue50: "#EEF0FB", blue100: "#C7CDEF", blue200: "#A8B2EE", blue300: "#7B8DE5",
      blue400: "#4E62D8", blue500: "#2137B6", blue600: "#1A2D96", blue700: "#0E1F73",
      blue800: "#041366", blue900: "#020B3D",
      gradient: "linear-gradient(90deg, #4E62D8, #2137B6, #041366)",
    },
    gray: {
      white: "#FFFFFF", 25: "#FCFCFD", 50: "#F8FAFC", 100: "#F3F4F6", 200: "#E5E7EB",
      300: "#D1D5DB", 400: "#9CA3AF", 500: "#6B7280", 600: "#4B5563", 700: "#374151",
      800: "#1F2937", 900: "#111827",
    },
    sem: {
      posBg: "#ECFDF5", posText: "#065F46", posBorder: "#A7F3D0",
      negBg: "#FEF2F2", negText: "#991B1B", negBorder: "#FECACA",
      warnBg: "#FFFBEB", warnText: "#92400E", warnBorder: "#FDE68A",
      neutBg: "#F3F4F6", neutText: "#374151", neutBorder: "#E5E7EB",
      infoBg: "#EEF0FB", infoText: "#2137B6", infoBorder: "#C7CDEF",
    },
    border: "rgba(0,0,0,0.08)", borderHover: "rgba(0,0,0,0.12)",
    // Channel colors (campaigns)
    ch: { email: "#4E62D8", sms: "#065F46", push: "#7C3AED", pushBg: "#F3E8FF", whatsapp: "#146B3A", whatsappBg: "#E6F9EC", whatsappBorder: "#A8E6C2" },
    // Accent (CTA solids for banners)
    accent: { amber: "#D97706", red: "#DC2626" },
  },
  r: { sm: 6, md: 8, lg: 12, pill: 9999 },
  s: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.05)",
    md: "0 2px 4px rgba(0,0,0,0.03), 0 4px 6px rgba(0,0,0,0.05)",
    lg: "0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.06)",
  },
  focus: "0 0 0 2px #4E62D8",  // brand blue focus ring — 2px solid
  focusDark: "0 0 0 2px #7B8CEA", // dark mode focus ring
  f: { sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", mono: "'Geist Mono', 'SF Mono', monospace" },
  // ── Breakpoints (Shopify Polaris pattern — mobile-first) ───
  bp: {
    xs: 0,       // 0px+     — mobile portrait (default)
    sm: 490,     // 490px+   — mobile landscape / large phone
    md: 768,     // 768px+   — tablet portrait / sidebar collapses
    lg: 1040,    // 1040px+  — desktop (sidebar expanded)
    xl: 1440,    // 1440px+  — large desktop
  },
  // Touch target minimums
  touch: { min: 44, comfortable: 48 },
  t: "150ms cubic-bezier(0.16, 1, 0.3, 1)",
  // ── Dark Mode Tokens ──────────────────────────────────────
  // NOT color inversion. Redesigned surfaces + desaturated accents.
  // Material: elevated surfaces get LIGHTER. Shadows → borders.
  // Text: off-white (not #FFF). Brand: desaturated 8-12%.
  dark: {
    // Surfaces — 3-layer elevation (base → card → elevated)
    bg:       "#0F1117",   // base layer — near-black with blue tint
    surface:  "#1A1D27",   // cards, sidebars, containers (dp 1-3)
    surfaceEl:"#242836",   // modals, dropdowns, tooltips (dp 4-8)
    surfaceHv:"#2A2F3D",   // hover state on surfaces
    // Text — 3 levels (NOT pure white)
    text:       "#EAEDF3", // primary text — off-white
    textSec:    "#8B92A5", // secondary labels, descriptions
    textMuted:  "#5C6378", // placeholders, disabled
    // Borders — white alpha
    border:     "rgba(255,255,255,0.08)",
    borderHv:   "rgba(255,255,255,0.14)",
    borderFocus:"rgba(90,110,224,0.4)", // brand focus ring
    // Brand — desaturated for dark bg
    brand:      "#7B8CEA", // blueLight shifted lighter + desaturated
    brandHover: "#6A7CE0",
    brandMuted: "rgba(123,140,234,0.12)", // active states bg
    gradient:   "linear-gradient(90deg, #7B8CEA, #5A6EE0, #3B50C8)",
    // Semantic — lighter tones (200-range), dark bg (900-range)
    posBg: "#052E1C",  posText: "#6EE7B7", posBorder: "rgba(110,231,183,0.15)",
    negBg: "#3B1111",  negText: "#FCA5A5", negBorder: "rgba(252,165,165,0.15)",
    warnBg:"#3B2506",  warnText:"#FCD34D", warnBorder:"rgba(252,211,77,0.15)",
    infoBg:"#141C3D",  infoText:"#A8B8F0", infoBorder:"rgba(168,184,240,0.15)",
    // Charts
    chartLine:  "#7B8CEA",
    chartArea:  "rgba(123,140,234,0.08)",
    chartGrid:  "rgba(255,255,255,0.04)",
    chartDot:   "#EAEDF3",
  },
};

// ═══════════════════════════════════════════════════════════════
// ICON SYSTEM — Outlined, 24×24, 2px stroke, rounded caps/joins
// Same style as Klaviyo/Yampi/Shopify Admin sidebar icons
// ═══════════════════════════════════════════════════════════════
const OI = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const Icons = {
  dollar: (s) => <OI size={s}><circle cx="12" cy="12" r="10"/><path d="M15 9.354a3.25 3.25 0 00-3-1.854h-1a2.5 2.5 0 000 5h2a2.5 2.5 0 010 5h-1a3.25 3.25 0 01-3-1.854"/><line x1="12" y1="5.5" x2="12" y2="7.5"/><line x1="12" y1="16.5" x2="12" y2="18.5"/></OI>,
  arrowUp: (s) => <OI size={s}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></OI>,
  arrowDown: (s) => <OI size={s}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></OI>,
  mail: (s) => <OI size={s}><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></OI>,
  users: (s) => <OI size={s}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></OI>,
  bar: (s) => <OI size={s}><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></OI>,
  pulse: (s) => <OI size={s}><rect x="2" y="3" width="20" height="18" rx="2"/><polyline points="17 9 13 9 11 15 9 7 7 12 5 12"/></OI>,
  search: (s) => <OI size={s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></OI>,
  gear: (s) => <OI size={s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></OI>,
  bell: (s) => <OI size={s}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></OI>,
  home: (s) => <OI size={s}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></OI>,
  zap: (s) => <OI size={s}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></OI>,
  send: (s) => <OI size={s}><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></OI>,
  layers: (s) => <OI size={s}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></OI>,
  dots: (s) => <OI size={s}><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></OI>,
  extLink: (s) => <OI size={s}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></OI>,
  filter: (s) => <OI size={s}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></OI>,
  dl: (s) => <OI size={s}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></OI>,
  target: (s) => <OI size={s}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></OI>,
  heart: (s) => <OI size={s}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></OI>,
  chevRight: (s) => <OI size={s}><polyline points="9 18 15 12 9 6"/></OI>,
  store: (s) => <OI size={s}><path d="M3 9l1.5-5.5A1 1 0 015.46 3h13.08a1 1 0 01.96.7L21 9"/><path d="M21 9H3v2a3 3 0 003 3 3 3 0 003-3 3 3 0 003 3 3 3 0 003-3 3 3 0 003 3 3 3 0 003-3V9z"/><path d="M5 14v5a2 2 0 002 2h10a2 2 0 002-2v-5"/></OI>,
  package: (s) => <OI size={s}><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></OI>,
  close: (s) => <OI size={s}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></OI>,
};

function Spark({ data, color = DS.colors.brand.blueLight, w = 72, h = 28, fill = true }) {
  const mx = Math.max(...data), mn = Math.min(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h-2-((v-mn)/rng)*(h-4)}`);
  const last = pts[pts.length-1].split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0 }}>
      {fill && <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={color} opacity="0.1" />}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}

function AreaChart({ data, prev, labels, color = DS.colors.brand.blueLight, height = 220, title, sub, hoverData }) {
  const [hIdx,setHIdx]=useState(null);
  const W = 580, H = height, PL = 44, PR = 12, PT = 8, PB = 28;
  const cw = W-PL-PR, ch = H-PT-PB;
  const all = [...data, ...(prev||[])];
  const mx = Math.max(...all)*1.12;
  const toX = (i) => PL+(i/(data.length-1))*cw;
  const toY = (v) => PT+ch-(v/mx)*ch;
  const smooth = (pts) => {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C${p1[0]+(p2[0]-p0[0])*.35},${p1[1]+(p2[1]-p0[1])*.35} ${p2[0]-(p3[0]-p1[0])*.35},${p2[1]-(p3[1]-p1[1])*.35} ${p2[0]},${p2[1]}`;
    }
    return d;
  };
  const pts = data.map((v,i) => [toX(i), toY(v)]);
  const prevPts = prev ? prev.map((v,i) => [toX(i), toY(v)]) : null;
  const line = smooth(pts);
  const area = `${line} L${pts[pts.length-1][0]},${PT+ch} L${pts[0][0]},${PT+ch} Z`;
  const prevLine = prevPts ? smooth(prevPts) : null;
  const grids = Array.from({length:5},(_,i)=>(mx/4)*i);
  const slotW=cw/(data.length-1);
  return (
    <div style={{ background: DS.colors.gray.white, borderRadius: DS.r.md, border: `1px solid ${DS.colors.border}`, padding: DS.s[6] }}>
      {title && <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: DS.s[4] }}>
        <div>
          <div style={{ fontSize:14, fontWeight:500, color:DS.colors.gray[700], fontFamily:DS.f.sans }}>{title}</div>
          {sub && <div style={{ fontSize:12, color:DS.colors.gray[400], fontFamily:DS.f.sans, marginTop:2 }}>{sub}</div>}
        </div>
        {prev && <div style={{ display:"flex", gap:DS.s[4], fontSize:12, fontFamily:DS.f.sans }}>
          <span style={{ display:"flex", alignItems:"center", gap:6, color:DS.colors.gray[600] }}><span style={{ width:12, height:2, background:color, borderRadius:1 }}/>Atual</span>
          <span style={{ display:"flex", alignItems:"center", gap:6, color:DS.colors.gray[400] }}><span style={{ width:12, height:2, background:DS.colors.gray[300], borderRadius:1, opacity:.6 }}/>Anterior</span>
        </div>}
      </div>}
      <div style={{position:"relative"}}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }} onMouseLeave={()=>setHIdx(null)}>
          <defs><linearGradient id="af" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="60%" stopColor={color} stopOpacity=".06"/><stop offset="100%" stopColor={color} stopOpacity=".01"/></linearGradient></defs>
          {grids.map((v,i) => { const y=toY(v); return <g key={i}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={DS.colors.gray[200]} strokeWidth="1"/><text x={PL-6} y={y+4} textAnchor="end" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.mono}>{v>=1000?`${(v/1000).toFixed(0)}K`:v.toFixed(0)}</text></g>; })}
          {labels && labels.map((l,i) => <text key={i} x={toX(i)} y={H-6} textAnchor="middle" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.sans}>{l}</text>)}
          {prevLine && <path d={prevLine} fill="none" stroke={DS.colors.gray[300]} strokeWidth="2" strokeDasharray="6,4" opacity=".45"/>}
          <path d={area} fill="url(#af)"/><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          {/* Hover elements */}
          {hIdx!==null&&<>
            <line x1={toX(hIdx)} y1={PT} x2={toX(hIdx)} y2={PT+ch} stroke={DS.colors.gray[300]} strokeWidth="1" strokeDasharray="3,3"/>
            <circle cx={toX(hIdx)} cy={toY(data[hIdx])} r="4" fill={color} stroke={DS.colors.gray.white} strokeWidth="2"/>
            {prev&&<circle cx={toX(hIdx)} cy={toY(prev[hIdx])} r="3" fill={DS.colors.gray[400]} stroke={DS.colors.gray.white} strokeWidth="2"/>}
          </>}
          {/* Invisible hover zones */}
          {data.map((_,i)=><rect key={i} x={toX(i)-slotW/2} y={PT} width={slotW} height={ch} fill="transparent" onMouseEnter={()=>setHIdx(i)} style={{cursor:"crosshair"}}/>)}
        </svg>
        {/* Tooltip */}
        {hIdx!==null&&<div style={{position:"absolute",top:0,left:toX(hIdx)>W/2?"auto":(toX(hIdx)/W*100)+"%",right:toX(hIdx)>W/2?((1-toX(hIdx)/W)*100)+"%":"auto",background:DS.colors.gray.white,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`,boxShadow:DS.shadow.md,padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:12,fontFamily:DS.f.sans,zIndex:10,pointerEvents:"none",minWidth:160}}>
          <div style={{fontSize:11,color:DS.colors.gray[400],marginBottom:6,fontWeight:500}}>{labels[hIdx]}</div>
          <div style={{display:"flex",justifyContent:"space-between",gap:DS.s[4],marginBottom:4}}>
            <span style={{display:"flex",alignItems:"center",gap:4,color:DS.colors.gray[600]}}><span style={{width:8,height:2,background:color,borderRadius:1}}/>Atual</span>
            <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:600,color:DS.colors.gray[900]}}>{data[hIdx]>=1000?`R$ ${(data[hIdx]/1000).toFixed(0)}K`:`R$ ${data[hIdx]}`}</span>
          </div>
          {prev&&<div style={{display:"flex",justifyContent:"space-between",gap:DS.s[4],marginBottom:hoverData?6:0}}>
            <span style={{display:"flex",alignItems:"center",gap:4,color:DS.colors.gray[400]}}><span style={{width:8,height:2,background:DS.colors.gray[300],borderRadius:1,opacity:.6}}/>Anterior</span>
            <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[500]}}>{prev[hIdx]>=1000?`R$ ${(prev[hIdx]/1000).toFixed(0)}K`:`R$ ${prev[hIdx]}`}</span>
          </div>}
          {hoverData&&hoverData[hIdx]&&<div style={{borderTop:`1px solid ${DS.colors.border}`,paddingTop:6,display:"grid",gridTemplateColumns:"1fr auto",gap:"3px 12px"}}>
            {hoverData[hIdx].map((row,ri)=><Fragment key={ri}>
              <span style={{color:DS.colors.gray[500]}}>{row.l}</span>
              <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:row.bold?600:400,color:row.color||DS.colors.gray[700],textAlign:"right"}}>{row.v}</span>
            </Fragment>)}
          </div>}
        </div>}
      </div>
    </div>
  );
}

function BarChart({ groups, series, colors, height = 200, title }) {
  const W=580, H=height, PL=44, PR=12, PT=8, PB=28;
  const cw=W-PL-PR, ch=H-PT-PB;
  const mx = Math.max(...groups.flatMap(g=>g.values))*1.15;
  const toY = v => PT+ch-(v/mx)*ch;
  const bw = Math.min(20, (cw/groups.length-12)/series.length);
  const gw = bw*series.length+3*(series.length-1);
  const grids = Array.from({length:5},(_,i)=>(mx/4)*i);
  return (
    <div style={{ background: DS.colors.gray.white, borderRadius: DS.r.md, border: `1px solid ${DS.colors.border}`, padding: DS.s[6] }}>
      {title && <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:DS.s[4] }}>
        <div style={{ fontSize:14, fontWeight:500, color:DS.colors.gray[700], fontFamily:DS.f.sans }}>{title}</div>
        <div style={{ display:"flex", gap:DS.s[4] }}>{series.map((s,i)=><span key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:DS.colors.gray[500], fontFamily:DS.f.sans }}><span style={{ width:8, height:8, borderRadius:2, background:colors[i] }}/>{s}</span>)}</div>
      </div>}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
        {grids.map((v,i)=>{const y=toY(v);return <g key={i}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={DS.colors.gray[200]} strokeWidth="1"/><text x={PL-6} y={y+4} textAnchor="end" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.mono}>{v.toFixed(0)}</text></g>;})}
        {groups.map((g,gi)=>{const cx=PL+(gi+.5)*(cw/groups.length);const sx=cx-gw/2;return <g key={gi}>{g.values.map((v,vi)=>{const x=sx+vi*(bw+3);return <rect key={vi} x={x} y={toY(v)} width={bw} height={(v/mx)*ch} rx={3} fill={colors[vi]} opacity=".85"/>})}<text x={cx} y={H-6} textAnchor="middle" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.sans}>{g.label}</text></g>;})}
      </svg>
    </div>
  );
}

const secs = [
  { g: "Fundações", items: ["Cores","Dark Mode","Tipografia","Espaçamento","Ícones"] },
  { g: "Componentes", items: ["Botões","Cards","Badges","Inputs","Tabela","Sidebar"] },
  { g: "Padrões", items: ["Dashboard","Página","Portal","Extras","Orientações"] },
];

function SecCores() {
  const [cp,setCp]=useState(null);
  const copy=h=>{navigator.clipboard?.writeText(h);setCp(h);setTimeout(()=>setCp(null),1200)};
  const Sw=({c,n,light})=><div onClick={()=>copy(c)} style={{cursor:"pointer",display:"flex",flexDirection:"column",gap:3}}>
    <div style={{width:64,height:40,borderRadius:DS.r.sm,background:c,border:light?`1px solid ${DS.colors.border}`:"none",display:"flex",alignItems:"center",justifyContent:"center",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.06)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>{cp===c&&<span style={{fontSize:9,fontWeight:600,color:light?DS.colors.gray[700]:"#fff",background:"rgba(0,0,0,.15)",padding:"1px 5px",borderRadius:3}}>✓</span>}</div>
    <span style={{fontSize:10,fontWeight:500,color:DS.colors.gray[600],fontFamily:DS.f.sans}}>{n}</span>
    <span style={{fontSize:9,color:DS.colors.gray[400],fontFamily:DS.f.mono}}>{c}</span>
  </div>;
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Gradiente — uso restrito</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Apenas CTA principal e sidebar logo. Nunca em card backgrounds.</div>
      <div style={{height:56,borderRadius:DS.r.md,background:DS.colors.brand.gradient,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"rgba(255,255,255,.85)",fontSize:13,fontWeight:500,fontFamily:DS.f.mono}}>90° → #4E62D8 · #2137B6 · #041366</span>
      </div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Cores-Chave</div>
      <div style={{display:"flex",gap:DS.s[4]}}>{[
        {h:"#4E62D8",n:"Blue Light",r:"Links, ícones ativos, charts"},
        {h:"#2137B6",n:"Blue",r:"Botão primary hover, active states"},
        {h:"#041366",n:"Blue Dark",r:"Pressed states, fim do gradiente"},
      ].map((c,i)=><div key={i} onClick={()=>copy(c.h)} style={{flex:1,cursor:"pointer",borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{height:48,background:c.h}}/>
        <div style={{padding:`${DS.s[3]}px ${DS.s[4]}px`}}>
          <div style={{fontSize:13,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>{c.n}</div>
          <div style={{fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.mono,marginTop:1}}>{c.h}</div>
          <div style={{fontSize:11,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginTop:3}}>{c.r}</div>
        </div>
      </div>)}</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Escala Blue</div>
      <div style={{display:"flex",gap:DS.s[2],flexWrap:"wrap"}}>{[50,100,200,300,400,500,600,700,800,900].map(n=><Sw key={n} c={DS.colors.brand[`blue${n}`]} n={`${n}`} light={n<=100}/>)}</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Escala Gray</div>
      <div style={{display:"flex",gap:DS.s[2],flexWrap:"wrap"}}>{["white",25,50,100,200,300,400,500,600,700,800,900].map(n=><Sw key={n} c={DS.colors.gray[n]} n={n==="white"?"W":`${n}`} light={["white",25,50,100,200].includes(n)}/>)}</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Semânticas</div>
      <div style={{display:"flex",gap:DS.s[3],flexWrap:"wrap"}}>{[
        {l:"Positive",bg:DS.colors.sem.posBg,t:DS.colors.sem.posText,b:DS.colors.sem.posBorder},
        {l:"Negative",bg:DS.colors.sem.negBg,t:DS.colors.sem.negText,b:DS.colors.sem.negBorder},
        {l:"Warning",bg:DS.colors.sem.warnBg,t:DS.colors.sem.warnText,b:DS.colors.sem.warnBorder},
        {l:"Neutral",bg:DS.colors.sem.neutBg,t:DS.colors.sem.neutText,b:DS.colors.sem.neutBorder},
        {l:"Info",bg:DS.colors.sem.infoBg,t:DS.colors.sem.infoText,b:DS.colors.sem.infoBorder},
      ].map(s=><span key={s.l} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:DS.r.sm,background:s.bg,border:`1px solid ${s.b}`,fontSize:11,fontWeight:600,color:s.t,fontFamily:DS.f.sans,letterSpacing:"0.02em"}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:s.t}}/>{s.l}
      </span>)}</div>
    </div>
  </div>;
}

function SecDarkMode() {
  const d = DS.dark;
  const Spark=({data,color,w=48,h=20})=>{const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1;const pts=data.map((v,i)=>[i/(data.length-1)*w,h-(v-mn)/rng*h]);let path=`M${pts[0][0]},${pts[0][1]}`;for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];path+=` C${p1[0]+(p2[0]-p0[0])*.35},${p1[1]+(p2[1]-p0[1])*.35} ${p2[0]-(p3[0]-p1[0])*.35},${p2[1]-(p3[1]-p1[1])*.35} ${p2[0]},${p2[1]}`}const area=`${path} L${w},${h} L0,${h} Z`;return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={area} fill={color} opacity="0.12"/><path d={path} fill="none" stroke={color} strokeWidth="1.5"/><circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color}/></svg>};

  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div style={{fontSize:12,color:DS.colors.sem.infoText,fontFamily:DS.f.sans,padding:DS.s[3],background:DS.colors.sem.infoBg,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.sem.infoBorder}`}}>
      Implementação: CSS variables via next-themes. Componentes consomem tokens semânticos (--bg, --surface, --text), nunca hex direto. Superfícies elevadas = mais claras.
    </div>

    {/* ─── TOKENS: Surfaces ─── */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Superfícies — 3 camadas de elevação</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Material Design: elevado = mais claro. Shadows invisíveis no dark — hierarquia via surface layers + border.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:DS.s[4]}}>
        {[
          {label:"bg (base)",color:d.bg,desc:"Página, sidebar bg"},
          {label:"surface (dp 1-3)",color:d.surface,desc:"Cards, containers"},
          {label:"surfaceEl (dp 4-8)",color:d.surfaceEl,desc:"Modais, dropdowns"},
          {label:"surfaceHv (hover)",color:d.surfaceHv,desc:"Hover em rows/cards"},
        ].map((s,i)=><div key={i} style={{background:s.color,borderRadius:DS.r.md,padding:DS.s[4],border:`1px solid ${d.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:d.textSec,fontFamily:DS.f.sans,letterSpacing:"0.02em",marginBottom:DS.s[1]}}>{s.label}</div>
          <div style={{fontSize:10,color:d.textMuted,fontFamily:DS.f.mono,marginBottom:DS.s[2]}}>{s.color}</div>
          <div style={{fontSize:11,color:d.textSec,fontFamily:DS.f.sans}}>{s.desc}</div>
        </div>)}
      </div>
    </div>

    {/* ─── TOKENS: Text + Brand + Semantic ─── */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4]}}>
      {/* Text */}
      <div>
        <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Texto — 3 níveis</div>
        <div style={{background:d.bg,borderRadius:DS.r.md,padding:DS.s[4],border:`1px solid ${d.border}`,display:"flex",flexDirection:"column",gap:DS.s[2]}}>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:14,fontWeight:600,color:d.text,fontFamily:DS.f.sans}}>Primário</span><span style={{fontSize:10,color:d.textMuted,fontFamily:DS.f.mono}}>{d.text}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:d.textSec,fontFamily:DS.f.sans}}>Secundário</span><span style={{fontSize:10,color:d.textMuted,fontFamily:DS.f.mono}}>{d.textSec}</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:d.textMuted,fontFamily:DS.f.sans}}>Muted / disabled</span><span style={{fontSize:10,color:d.textMuted,fontFamily:DS.f.mono}}>{d.textMuted}</span></div>
        </div>
      </div>
      {/* Semantic */}
      <div>
        <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Brand + Semânticas</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:DS.s[2]}}>
          {[
            {label:"Brand",bg:d.brandMuted,text:d.brand,border:d.brand},
            {label:"Pos",bg:d.posBg,text:d.posText,border:d.posBorder},
            {label:"Neg",bg:d.negBg,text:d.negText,border:d.negBorder},
            {label:"Warn",bg:d.warnBg,text:d.warnText,border:d.warnBorder},
            {label:"Info",bg:d.infoBg,text:d.infoText,border:d.infoBorder},
          ].map((s,i)=><div key={i} style={{background:s.bg,borderRadius:DS.r.md,padding:`${DS.s[2]}px ${DS.s[3]}px`,border:`1px solid ${s.border}`,textAlign:"center"}}>
            <span style={{fontSize:10,fontWeight:600,color:s.text,fontFamily:DS.f.sans,letterSpacing:"0.02em"}}>{s.label}</span>
          </div>)}
        </div>
      </div>
    </div>

    {/* ═══ PREVIEW: Sidebar + Dashboard Layout ═══ */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Preview — Sidebar + Dashboard</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Layout completo. Sidebar usa bg base. Cards usam surface. Gradiente adaptado.</div>
      <div style={{display:"flex",borderRadius:DS.r.md,overflow:"hidden",border:`1px solid ${d.border}`,height:520}}>
        {/* Sidebar */}
        <div style={{width:200,background:d.bg,borderRight:`1px solid ${d.border}`,padding:DS.s[4],display:"flex",flexDirection:"column",flexShrink:0}}>
          {/* Logo */}
          <div style={{background:d.gradient,borderRadius:DS.r.sm,padding:"8px 12px",marginBottom:DS.s[6]}}>
            <span style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:DS.f.sans,letterSpacing:"-0.02em"}}>Convertfy</span>
          </div>
          {/* Nav items */}
          {[
            {l:"Dashboard",icon:Icons.home,active:true},
            {l:"Clientes",icon:Icons.users,active:false},
            {l:"Campanhas",icon:Icons.send,active:false},
            {l:"Flows",icon:Icons.zap,active:false},
            {l:"Financeiro",icon:Icons.dollar,active:false},
            {l:"Relatórios",icon:Icons.bar,active:false},
          ].map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:DS.s[2],padding:"8px 10px",borderRadius:DS.r.sm,marginBottom:2,cursor:"pointer",
            background:item.active?d.brandMuted:"transparent",
            color:item.active?d.brand:d.textSec,
            fontSize:13,fontWeight:item.active?500:400,fontFamily:DS.f.sans,transition:DS.t
          }}>{item.icon(16)} {item.l}</div>)}
          <div style={{flex:1}}/>
          {/* User */}
          <div style={{display:"flex",alignItems:"center",gap:DS.s[2],padding:"8px 10px",borderTop:`1px solid ${d.border}`,marginTop:DS.s[2]}}>
            <div style={{width:28,height:28,borderRadius:DS.r.pill,background:d.brandMuted,display:"flex",alignItems:"center",justifyContent:"center",color:d.brand,fontSize:11,fontWeight:600,fontFamily:DS.f.sans}}>VC</div>
            <div>
              <div style={{fontSize:12,fontWeight:500,color:d.text,fontFamily:DS.f.sans}}>Victor</div>
              <div style={{fontSize:10,color:d.textMuted,fontFamily:DS.f.sans}}>Admin</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{flex:1,background:d.bg,overflow:"auto"}}>
          {/* Top bar */}
          <div style={{background:d.surface,borderBottom:`1px solid ${d.border}`,padding:`${DS.s[3]}px ${DS.s[4]}px`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:18,fontWeight:600,color:d.text,fontFamily:DS.f.sans}}>Dashboard</span>
            <div style={{display:"flex",gap:2,background:d.bg,padding:2,borderRadius:DS.r.sm,border:`1px solid ${d.border}`}}>
              {["7D","30D","90D"].map((p,i)=><button key={p} style={{padding:"4px 12px",borderRadius:DS.r.sm-1,fontSize:11,fontWeight:500,fontFamily:DS.f.sans,border:"none",cursor:"pointer",
                background:i===1?d.brand:"transparent",color:i===1?"#fff":d.textMuted
              }}>{p}</button>)}
            </div>
          </div>

          <div style={{padding:DS.s[4],display:"flex",flexDirection:"column",gap:DS.s[4]}}>
            {/* KPI Row */}
            <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr 1fr",gap:DS.s[3]}}>
              {/* Gradient highlight card */}
              <div style={{background:d.gradient,borderRadius:DS.r.md,padding:DS.s[4],position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>
                <div style={{fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.7)",fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Receita recuperada</div>
                <div style={{fontSize:26,fontWeight:600,color:"#fff",fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums",lineHeight:1}}>R$ 1.24M</div>
                <div style={{marginTop:DS.s[3],display:"flex",alignItems:"center",gap:4}}>
                  <span style={{background:"rgba(255,255,255,0.15)",padding:"1px 6px",borderRadius:DS.r.pill,fontSize:10,fontWeight:600,color:"#fff"}}>+34.2%</span>
                </div>
              </div>
              {/* 3 KPI Cards */}
              {[
                {l:"Receita atribuída",v:"R$ 2.4M",delta:"+22.1%",up:true,sp:[1.1,1.3,1.5,1.8,2.0,2.2,2.4]},
                {l:"Emails enviados",v:"1.82M",delta:"+18.3%",up:true,sp:[1.0,1.2,1.3,1.5,1.6,1.7,1.82]},
                {l:"Taxa conversão",v:"4.7%",delta:"+0.3%",up:true,sp:[3.8,4.0,4.2,4.3,4.4,4.6,4.7]},
              ].map((s,i)=><div key={i} style={{background:d.surface,borderRadius:DS.r.md,padding:DS.s[3],border:`1px solid ${d.border}`}}>
                <div style={{fontSize:11,fontWeight:500,color:d.textMuted,fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>{s.l}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                  <div style={{fontSize:22,fontWeight:600,color:d.text,fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums",lineHeight:1}}>{s.v}</div>
                  <Spark data={s.sp} color={s.up?d.posText:d.negText} w={40} h={16}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:3,marginTop:DS.s[2]}}>
                  <span style={{color:s.up?d.posText:d.negText}}>{s.up?Icons.arrowUp(10):Icons.arrowDown(10)}</span>
                  <span style={{fontSize:11,fontWeight:500,fontFamily:DS.f.mono,color:s.up?d.posText:d.negText}}>{s.delta}</span>
                </div>
              </div>)}
            </div>

            {/* Chart area */}
            <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:DS.s[3]}}>
              {/* Area chart placeholder */}
              <div style={{background:d.surface,borderRadius:DS.r.md,border:`1px solid ${d.border}`,padding:DS.s[4]}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:DS.s[3]}}>
                  <span style={{fontSize:13,fontWeight:500,color:d.text,fontFamily:DS.f.sans}}>Receita por período</span>
                  <div style={{display:"flex",gap:DS.s[3],fontSize:11,fontFamily:DS.f.sans}}>
                    <span style={{display:"flex",alignItems:"center",gap:4,color:d.textSec}}><span style={{width:8,height:2,background:d.brand,borderRadius:1}}/>Atual</span>
                    <span style={{display:"flex",alignItems:"center",gap:4,color:d.textMuted}}><span style={{width:8,height:2,background:d.textMuted,borderRadius:1,opacity:0.4}}/>Anterior</span>
                  </div>
                </div>
                <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none">
                  {[0,1,2,3].map(i=><line key={i} x1="0" y1={i*30+15} x2="400" y2={i*30+15} stroke={d.chartGrid} strokeWidth="1"/>)}
                  <path d="M0,90 C40,85 80,70 120,65 C160,60 200,40 240,35 C280,30 320,20 360,25 L400,18" fill="none" stroke={d.textMuted} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"/>
                  <path d="M0,80 C40,75 80,55 120,50 C160,45 200,30 240,22 C280,18 320,15 360,12 L400,8 L400,120 L0,120 Z" fill={d.chartArea}/>
                  <path d="M0,80 C40,75 80,55 120,50 C160,45 200,30 240,22 C280,18 320,15 360,12 L400,8" fill="none" stroke={d.chartLine} strokeWidth="2"/>
                  <circle cx="400" cy="8" r="3" fill={d.chartLine}/>
                </svg>
              </div>
              {/* Donut + Stats */}
              <div style={{background:d.surface,borderRadius:DS.r.md,border:`1px solid ${d.border}`,padding:DS.s[4],display:"flex",flexDirection:"column"}}>
                <span style={{fontSize:13,fontWeight:500,color:d.text,fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Saúde da Lista</span>
                <div style={{display:"flex",alignItems:"center",gap:DS.s[4],flex:1}}>
                  <div style={{position:"relative",width:80,height:80,flexShrink:0}}>
                    <svg width="80" height="80" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="32" fill="none" stroke={d.surfaceHv} strokeWidth="10"/>
                      <circle cx="40" cy="40" r="32" fill="none" stroke={d.posText} strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={2*Math.PI*32} strokeDashoffset={2*Math.PI*32*0.2} transform="rotate(-90 40 40)"/>
                    </svg>
                    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:18,fontWeight:600,color:d.posText,fontFamily:DS.f.sans}}>80%</span>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,flex:1}}>
                    {[{l:"Open Rate",v:"45.5%"},{l:"Click Rate",v:"0.6%"},{l:"Bounce",v:"1.4%"},{l:"Unsub",v:"0.23%"}].map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,fontFamily:DS.f.sans}}>
                      <span style={{color:d.textMuted}}>{m.l}</span>
                      <span style={{color:d.text,fontWeight:500,fontFamily:DS.f.mono}}>{m.v}</span>
                    </div>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Table preview */}
            <div style={{background:d.surface,borderRadius:DS.r.md,border:`1px solid ${d.border}`,overflow:"hidden"}}>
              <div style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${d.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:500,color:d.text,fontFamily:DS.f.sans}}>Top Clientes</span>
                <span style={{fontSize:11,color:d.textMuted,fontFamily:DS.f.sans}}>5 de 248</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 80px",padding:`${DS.s[2]}px ${DS.s[4]}px`,borderBottom:`1px solid ${d.border}`}}>
                {["LOJA","RECEITA","OPEN RATE",""].map(h=><span key={h} style={{fontSize:10,fontWeight:600,color:d.textMuted,fontFamily:DS.f.sans,letterSpacing:"0.04em",textAlign:h==="LOJA"||h===""?"left":"right"}}>{h}</span>)}
              </div>
              {[
                {n:"Donaris Joias",r:"R$ 156.2K",o:"36.1%",sp:[100,120,135,150,156]},
                {n:"AchaTudo Store",r:"R$ 124.5K",o:"34.2%",sp:[80,90,100,115,124]},
                {n:"EPORTH Energia",r:"R$ 89.3K",o:"28.7%",sp:[50,60,72,80,89]},
              ].map((row,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 80px",padding:`${DS.s[2]}px ${DS.s[4]}px`,borderBottom:`1px solid ${d.border}`,transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background=d.surfaceHv} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:12,fontWeight:500,color:d.text,fontFamily:DS.f.sans}}>{row.n}</span>
                <span style={{fontSize:12,fontWeight:600,color:d.text,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{row.r}</span>
                <span style={{fontSize:12,color:d.textSec,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{row.o}</span>
                <span style={{textAlign:"right"}}><Spark data={row.sp} color={d.posText} w={48} h={14}/></span>
              </div>)}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ═══ PREVIEW: Components ═══ */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Preview — Componentes</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Alert, badges, buttons, inputs, tabs, toggle — todos com tokens dark.</div>
      <div style={{background:d.bg,borderRadius:DS.r.md,padding:DS.s[6],border:`1px solid ${d.border}`,display:"flex",flexDirection:"column",gap:DS.s[4]}}>
        {/* Alert */}
        <div style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[3]}px ${DS.s[4]}px`,borderRadius:DS.r.md,background:d.warnBg,border:`1px solid ${d.warnBorder}`}}>
          <span style={{color:d.warnText,opacity:0.8}}>{Icons.bell(16)}</span>
          <span style={{flex:1,fontSize:13,color:d.warnText,fontFamily:DS.f.sans,fontWeight:500}}>8 assinaturas vencidas totalizando R$ 29.909</span>
          <button style={{padding:"5px 12px",borderRadius:DS.r.sm,fontSize:12,fontWeight:600,fontFamily:DS.f.sans,background:d.warnText,color:d.warnBg,border:"none",cursor:"pointer"}}>Ver</button>
        </div>

        <div style={{display:"flex",gap:DS.s[6],alignItems:"flex-start"}}>
          {/* Left: Badges + Buttons */}
          <div style={{display:"flex",flexDirection:"column",gap:DS.s[4],flex:1}}>
            {/* Badges */}
            <div>
              <div style={{fontSize:11,fontWeight:500,color:d.textMuted,fontFamily:DS.f.sans,marginBottom:DS.s[2],letterSpacing:"0.04em"}}>BADGES</div>
              <div style={{display:"flex",gap:DS.s[2],flexWrap:"wrap"}}>
                {[
                  {l:"Ativo",bg:d.posBg,t:d.posText,b:d.posBorder},
                  {l:"Pausado",bg:d.warnBg,t:d.warnText,b:d.warnBorder},
                  {l:"Falhou",bg:d.negBg,t:d.negText,b:d.negBorder},
                  {l:"Live",bg:d.infoBg,t:d.infoText,b:d.infoBorder},
                  {l:"Rascunho",bg:d.surfaceEl,t:d.textSec,b:d.border},
                ].map(s=><span key={s.l} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:DS.r.sm,background:s.bg,border:`1px solid ${s.b}`,fontSize:11,fontWeight:600,color:s.t,fontFamily:DS.f.sans,letterSpacing:"0.02em"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:s.t}}/>{s.l}
                </span>)}
              </div>
            </div>
            {/* Buttons */}
            <div>
              <div style={{fontSize:11,fontWeight:500,color:d.textMuted,fontFamily:DS.f.sans,marginBottom:DS.s[2],letterSpacing:"0.04em"}}>BUTTONS</div>
              <div style={{display:"flex",gap:DS.s[2]}}>
                <button style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,background:d.brand,color:"#fff",border:"none",cursor:"pointer"}}>Primary</button>
                <button style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,background:"transparent",color:d.textSec,border:`1px solid ${d.border}`,cursor:"pointer"}}>Secondary</button>
                <button style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,background:d.negBg,color:d.negText,border:`1px solid ${d.negBorder}`,cursor:"pointer"}}>Destructive</button>
                <button style={{padding:DS.s[2],borderRadius:DS.r.sm,background:"transparent",color:d.textMuted,border:"none",cursor:"pointer"}}>{Icons.dots(16)}</button>
              </div>
            </div>
            {/* Tabs */}
            <div>
              <div style={{fontSize:11,fontWeight:500,color:d.textMuted,fontFamily:DS.f.sans,marginBottom:DS.s[2],letterSpacing:"0.04em"}}>TABS</div>
              <div style={{display:"flex",gap:0,borderBottom:`1px solid ${d.border}`}}>
                {["Análise","Faturas","Assinaturas"].map((t,i)=><button key={t} style={{padding:"6px 14px",fontSize:12,fontWeight:i===0?500:400,fontFamily:DS.f.sans,border:"none",cursor:"pointer",
                  background:"transparent",color:i===0?d.brand:d.textMuted,
                  borderBottom:i===0?`2px solid ${d.brand}`:"2px solid transparent",marginBottom:-1
                }}>{t}</button>)}
              </div>
            </div>
          </div>

          {/* Right: Inputs + Toggle */}
          <div style={{display:"flex",flexDirection:"column",gap:DS.s[3],width:260}}>
            <div>
              <div style={{fontSize:11,fontWeight:500,color:d.textMuted,fontFamily:DS.f.sans,marginBottom:DS.s[2],letterSpacing:"0.04em"}}>INPUTS</div>
              <div style={{fontSize:12,fontWeight:500,color:d.textSec,fontFamily:DS.f.sans,marginBottom:4}}>Nome do cliente</div>
              <div style={{padding:"9px 12px",borderRadius:DS.r.sm,border:`1px solid ${d.border}`,background:d.surface,color:d.text,fontSize:13,fontFamily:DS.f.sans}}>Donaris Joias</div>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:500,color:d.textSec,fontFamily:DS.f.sans,marginBottom:4}}>Buscar</div>
              <div style={{padding:"9px 12px",borderRadius:DS.r.sm,border:`1px solid ${d.borderFocus}`,background:d.surface,color:d.textMuted,fontSize:13,fontFamily:DS.f.sans,boxShadow:`0 0 0 2px ${d.brandMuted}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:d.textMuted}}>{Icons.search(14)}</span>Buscar clientes...
              </div>
              <div style={{fontSize:11,color:d.textMuted,fontFamily:DS.f.sans,marginTop:3}}>Focus ring: brandMuted + borderFocus</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:DS.s[3],marginTop:DS.s[2]}}>
              <div style={{width:36,height:20,borderRadius:DS.r.pill,background:d.brand,position:"relative",cursor:"pointer"}}>
                <div style={{width:16,height:16,background:"#fff",borderRadius:"50%",position:"absolute",top:2,right:2,boxShadow:"0 1px 2px rgba(0,0,0,0.3)"}}/>
              </div>
              <span style={{fontSize:13,color:d.text,fontFamily:DS.f.sans}}>Dark mode ativo</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* ═══ PREVIEW: Integration Card + Ranked List ═══ */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Preview — Cards Portal</div>
      <div style={{background:d.bg,borderRadius:DS.r.md,padding:DS.s[6],border:`1px solid ${d.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4]}}>
        {/* Integration card */}
        <div style={{background:d.surface,borderRadius:DS.r.md,border:`1px solid ${d.border}`,padding:DS.s[4]}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:DS.s[3]}}>
            <div style={{display:"flex",gap:DS.s[3],alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:DS.r.md,background:d.surfaceEl,display:"flex",alignItems:"center",justifyContent:"center",color:d.brand,fontSize:12,fontWeight:700,fontFamily:DS.f.sans}}>K</div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:d.text,fontFamily:DS.f.sans}}>Klaviyo</div>
                <div style={{fontSize:12,color:d.textMuted,fontFamily:DS.f.sans}}>Email marketing</div>
              </div>
            </div>
            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:DS.r.sm,background:d.posBg,border:`1px solid ${d.posBorder}`,fontSize:11,fontWeight:600,color:d.posText}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:d.posText}}/>Conectado
            </span>
          </div>
          <div style={{fontSize:12,color:d.textMuted,fontFamily:DS.f.mono,marginBottom:DS.s[3]}}>Private Key · Configurada</div>
          <button style={{width:"100%",padding:"7px 0",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,background:"transparent",color:d.textSec,border:`1px solid ${d.border}`,cursor:"pointer"}}>{Icons.gear(13)} Editar</button>
        </div>
        {/* Ranked list */}
        <div style={{background:d.surface,borderRadius:DS.r.md,border:`1px solid ${d.border}`,overflow:"hidden"}}>
          <div style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${d.border}`,display:"flex",alignItems:"center",gap:DS.s[2],fontSize:13,fontWeight:500,color:d.text,fontFamily:DS.f.sans}}>
            <span style={{color:d.textMuted}}>{Icons.users(14)}</span>Top Clientes
          </div>
          {[{n:"dr_davidsantos@outlook.com",v:"R$ 981"},{n:"joseeduardo262@gmail.com",v:"R$ 845"},{n:"marciaescher10@gmail.com",v:"R$ 759"}].map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[2]}px ${DS.s[4]}px`,borderBottom:`1px solid ${d.border}`}}>
            <span style={{width:20,height:20,borderRadius:DS.r.pill,background:i<3?d.brandMuted:d.surfaceEl,color:i<3?d.brand:d.textMuted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,fontFamily:DS.f.mono,flexShrink:0}}>{i+1}</span>
            <span style={{flex:1,fontSize:12,color:d.text,fontFamily:DS.f.sans,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.n}</span>
            <span style={{fontSize:12,fontWeight:600,color:d.posText,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums"}}>{item.v}</span>
          </div>)}
        </div>
      </div>
    </div>

    {/* ═══ CSS Variables ═══ */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Implementação — CSS Variables</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>globals.css com next-themes. Componentes usam var(--token). Nunca hex direto no código.</div>
      <div style={{background:DS.colors.gray[900],borderRadius:DS.r.md,padding:DS.s[4],fontFamily:DS.f.mono,fontSize:11,color:"#A8B2D1",lineHeight:1.8,overflow:"auto",whiteSpace:"pre"}}>
        <span style={{color:"#C792EA"}}>:root</span>{` {
  --bg: #FFFFFF;     --surface: #FFFFFF;
  --surface-el: #FFFFFF;
  --text: #111827;   --text-sec: #6B7280;
  --border: rgba(0,0,0,0.08);
  --brand: `}<span style={{color:"#F78C6C"}}>#4E62D8</span>{`;
}

`}<span style={{color:"#C792EA"}}>[data-theme="dark"]</span>{` {
  --bg: `}<span style={{color:"#F78C6C"}}>{d.bg}</span>{`;     --surface: `}<span style={{color:"#F78C6C"}}>{d.surface}</span>{`;
  --surface-el: `}<span style={{color:"#F78C6C"}}>{d.surfaceEl}</span>{`;
  --text: `}<span style={{color:"#F78C6C"}}>{d.text}</span>{`;   --text-sec: `}<span style={{color:"#F78C6C"}}>{d.textSec}</span>{`;
  --border: rgba(255,255,255,0.08);
  --brand: `}<span style={{color:"#F78C6C"}}>{d.brand}</span>{`;
}`}
      </div>
    </div>
  </div>;
}

function SecTipo() {
  const sc=[
    {el:"Page title",sz:24,wt:600,ls:"-0.02em",lh:1.2,c:DS.colors.gray[900],t:"Dashboard Overview"},
    {el:"Section head",sz:18,wt:600,ls:"-0.01em",lh:1.3,c:DS.colors.gray[900],t:"Receita Mensal"},
    {el:"KPI value",sz:32,wt:600,ls:"-0.03em",lh:1.0,c:DS.colors.gray[900],t:"R$ 842.567,00",m:false},
    {el:"KPI label",sz:13,wt:500,ls:"0.01em",lh:1.4,c:DS.colors.gray[500],t:"Receita total atribuída"},
    {el:"Card title",sz:14,wt:500,ls:"0",lh:1.4,c:DS.colors.gray[700],t:"Evolução da Receita"},
    {el:"Body",sz:14,wt:400,ls:"0",lh:1.5,c:DS.colors.gray[600],t:"Taxa de abertura média de 32.5% nos últimos 30 dias."},
    {el:"Table header",sz:12,wt:500,ls:"0.04em",lh:1.4,c:DS.colors.gray[500],t:"CLIENTE",u:true},
    {el:"Table cell",sz:13,wt:400,ls:"0",lh:1.4,c:DS.colors.gray[700],t:"AchaTudo Store"},
    {el:"Badge",sz:11,wt:600,ls:"0.02em",lh:1.2,c:DS.colors.sem.posText,t:"Ativo"},
    {el:"Caption",sz:12,wt:400,ls:"0.01em",lh:1.4,c:DS.colors.gray[400],t:"Atualizado há 5 min · 250 clientes"},
    {el:"Chart axis",sz:11,wt:400,ls:"0",lh:1.2,c:DS.colors.gray[400],t:"Jan   Feb   Mar   Apr"},
  ];
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[6]}}>
    <div style={{display:"flex",gap:DS.s[4]}}>
      {[{n:"Inter",r:"UI, headings, KPIs, labels, body, badges",s:"Aa Bb Cc 0123",fam:DS.f.sans,note:"Mesma fonte do Shopify Admin (Polaris). Tabular-nums nativo."},{n:"Geist Mono",r:"Tabelas numéricas, deltas, código",s:"R$ 1.234,56 +12.5%",fam:DS.f.mono,note:"Mono de Vercel. Apenas dados tabulares."}].map(f=><div key={f.n} style={{flex:1,padding:DS.s[4],background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`}}>
        <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:DS.s[2],fontFamily:DS.f.sans}}>{f.r}</div>
        <div style={{fontSize:20,fontWeight:600,fontFamily:f.fam,color:DS.colors.gray[900]}}>{f.n}</div>
        <div style={{fontSize:16,fontFamily:f.fam,color:DS.colors.gray[500],marginTop:DS.s[2],fontVariantNumeric:"tabular-nums lining-nums"}}>{f.s}</div>
        <div style={{fontSize:11,color:DS.colors.brand.blueLight,fontFamily:DS.f.sans,marginTop:DS.s[2],fontWeight:500}}>{f.note}</div>
      </div>)}
    </div>
    <div style={{padding:DS.s[3],background:DS.colors.sem.infoBg,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.sem.infoBorder}`,fontSize:12,color:DS.colors.sem.infoText,fontFamily:DS.f.sans}}>
      Regra: <span style={{fontFamily:DS.f.mono}}>font-variant-numeric: tabular-nums lining-nums</span> em todo número. KPIs hero usam Inter (sans), não mono.
    </div>
    <div style={{display:"flex",flexDirection:"column"}}>
      {sc.map((s,i)=><div key={i} style={{display:"flex",alignItems:"baseline",gap:DS.s[6],padding:`${DS.s[3]}px 0`,borderBottom:i<sc.length-1?`1px solid ${DS.colors.border}`:"none"}}>
        <div style={{minWidth:90,flexShrink:0}}>
          <div style={{fontSize:12,fontWeight:500,color:DS.colors.brand.blueLight,fontFamily:DS.f.sans}}>{s.el}</div>
          <div style={{fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.mono,marginTop:1}}>{s.sz}px · {s.wt}</div>
        </div>
        <div style={{fontSize:s.sz,fontWeight:s.wt,letterSpacing:s.ls,lineHeight:s.lh,color:s.c,fontFamily:s.m?DS.f.mono:DS.f.sans,textTransform:s.u?"uppercase":"none",fontVariantNumeric:s.m?"tabular-nums lining-nums":"normal"}}>{s.t}</div>
      </div>)}
    </div>
    <div style={{fontSize:12,color:DS.colors.gray[500],fontFamily:DS.f.sans,lineHeight:1.6}}>Máximo 3 pesos: 400 (body), 500 (labels), 600–700 (headings/KPIs).</div>
  </div>;
}

function SecEspac() {
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[6]}}>
    <div style={{fontSize:12,color:DS.colors.gray[500],fontFamily:DS.f.sans,lineHeight:1.6}}>Grid de 8px. Regra de Gestalt: padding interno ≤ margem entre elementos.</div>
    <div style={{display:"flex",flexDirection:"column",gap:DS.s[2]}}>
      {Object.entries(DS.s).map(([k,v])=><div key={k} style={{display:"flex",alignItems:"center",gap:DS.s[4]}}>
        <div style={{width:52,fontSize:12,fontWeight:500,color:DS.colors.gray[600],fontFamily:DS.f.mono}}>space-{k}</div>
        <div style={{width:36,fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.mono,textAlign:"right"}}>{v}px</div>
        <div style={{width:v,height:14,background:DS.colors.brand.blueLight,borderRadius:3,opacity:.7,transition:DS.t}}/>
      </div>)}
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Border Radius — 4 tokens</div>
      <div style={{display:"flex",gap:DS.s[6]}}>
        {Object.entries(DS.r).map(([k,v])=><div key={k} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{width:44,height:44,border:`1.5px solid ${DS.colors.brand.blueLight}`,borderRadius:v,background:DS.colors.brand.blue50}}/>
          <span style={{fontSize:11,fontWeight:500,color:DS.colors.gray[600],fontFamily:DS.f.mono}}>{k}</span>
          <span style={{fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.mono}}>{v}px</span>
        </div>)}
      </div>
      <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:DS.s[3]}}>6px inputs/botões · 8px cards · 12px modals/dialogs · 9999px pills</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Shadows</div>
      <div style={{display:"flex",gap:DS.s[6]}}>
        {Object.entries(DS.shadow).map(([k])=><div key={k} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <div style={{width:64,height:40,background:DS.colors.gray.white,borderRadius:DS.r.md,boxShadow:DS.shadow[k]}}/>
          <span style={{fontSize:11,fontWeight:500,color:DS.colors.gray[600],fontFamily:DS.f.mono}}>{k}</span>
        </div>)}
      </div>
      <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:DS.s[3]}}>Layered (2-3 camadas, max 0.06 alpha). Default: borders. Shadows só para elevation.</div>
    </div>
  </div>;
}

function SecIcones() {
  const list=[["dollar","Revenue"],["mail","Email"],["users","Clientes"],["bar","Analytics"],["pulse","Atividade"],["zap","Automação"],["send","Campanhas"],["layers","Flows"],["store","Loja"],["package","Pedidos"],["arrowUp","Subindo"],["arrowDown","Caindo"],["target","Meta"],["search","Busca"],["gear","Config"],["bell","Notif."],["home","Home"],["filter","Filtro"],["dl","Download"],["dots","Menu"],["extLink","Link ext."],["heart","Health"],["chevRight","Navegar"]];
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[6]}}>
    <div style={{padding:DS.s[4],background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`}}>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Outlined · 24×24 viewBox · 2px stroke · Rounded caps</div>
      <div style={{fontSize:12,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginTop:4}}>Mesmo estilo visual da sidebar do Klaviyo, Yampi e Shopify Admin. Mais substância que Lucide (1.5px), sem o peso excessivo de ícones filled.</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Tamanhos: 16px (tabela) · 20px (botões) · 24px (nav/sidebar)</div>
      <div style={{display:"flex",gap:DS.s[6]}}>
        {[{sz:16,label:"Inline / Tabela"},{sz:20,label:"Botões / Forms"},{sz:24,label:"Nav / Sidebar"}].map(({sz,label})=><div key={sz} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",background:DS.colors.gray[50],borderRadius:DS.r.md,color:DS.colors.gray[700]}}>{Icons.bar(sz)}</div>
          <span style={{fontSize:12,fontWeight:600,color:DS.colors.gray[800],fontFamily:DS.f.mono}}>{sz}px</span>
          <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{label}</span>
        </div>)}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:DS.s[2]}}>
      {list.map(([k,l])=><div key={k} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:`${DS.s[4]}px ${DS.s[2]}px`,borderRadius:DS.r.md,color:DS.colors.gray[500],transition:DS.t,cursor:"default"}}
        onMouseEnter={e=>{e.currentTarget.style.background=DS.colors.gray[50];e.currentTarget.style.color=DS.colors.gray[900]}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=DS.colors.gray[500]}}>
        {Icons[k](24)}<span style={{fontSize:11,fontWeight:500,fontFamily:DS.f.sans,color:"inherit"}}>{l}</span>
      </div>)}
    </div>
  </div>;
}

function SecBotoes() {
  const base={fontFamily:DS.f.sans,fontWeight:500,border:"none",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:DS.s[2],transition:DS.t,borderRadius:DS.r.sm};
  const sizes={
    sm:{...base,height:28,padding:"0 12px",fontSize:13},
    md:{...base,height:36,padding:"0 16px",fontSize:13},
    lg:{...base,height:44,padding:"0 24px",fontSize:14,fontWeight:600},
  };
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    {/* Size scale */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Tamanhos — sm (28px) · md (36px) · lg (44px)</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Altura fixa previne layout shift em loading. Padding horizontal varia, vertical é auto via height + flexbox center.</div>
      <div style={{display:"flex",gap:DS.s[3],alignItems:"center"}}>
        <button style={{...sizes.sm,background:DS.colors.brand.blueLight,color:"#fff"}}>Small 28px</button>
        <button style={{...sizes.md,background:DS.colors.brand.blueLight,color:"#fff"}}>{Icons.send(14)} Medium 36px</button>
        <button style={{...sizes.lg,background:DS.colors.brand.blueLight,color:"#fff"}}>{Icons.send(16)} Large 44px</button>
      </div>
    </div>
    {/* Variants */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>4 variantes — Primary · Secondary · Ghost · Destructive</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Stripe, Shopify, Linear: máximo 4 variantes. "Soft" não existe em nenhum DS profissional. 1 primary por contexto.</div>
      <div style={{display:"flex",gap:DS.s[3],alignItems:"center",flexWrap:"wrap"}}>
        <button style={{...sizes.md,background:DS.colors.brand.blueLight,color:"#fff"}}>{Icons.send(14)} Criar Campanha</button>
        <button style={{...sizes.md,background:DS.colors.gray.white,color:DS.colors.gray[700],border:`1px solid ${DS.colors.border}`}}>{Icons.dl(14)} Exportar</button>
        <button style={{...sizes.md,background:DS.colors.sem.negBg,color:DS.colors.sem.negText,border:`1px solid ${DS.colors.sem.negBorder}`}}>Excluir</button>
        <button style={{...sizes.md,background:DS.colors.brand.blueLight,color:"#fff",opacity:.5,cursor:"not-allowed"}}>Disabled</button>
      </div>
    </div>
    {/* Gradient CTA */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Gradient CTA — 1 por página</div>
      <button style={{...sizes.lg,background:DS.colors.brand.gradient,color:"#fff",fontWeight:600}}>Upgrade Pro</button>
    </div>
    {/* Ghost / Icon-only */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Ghost / Icon-only</div>
      <div style={{display:"flex",gap:DS.s[2]}}>
        {["search","bell","gear","filter","dots"].map(k=><button key={k} style={{...base,width:36,height:36,padding:0,background:"transparent",color:DS.colors.gray[500],borderRadius:DS.r.sm}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.04)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{Icons[k](20)}</button>)}
      </div>
    </div>
    {/* Focus ring */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Focus Ring — acessibilidade obrigatória</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>box-shadow: {DS.focus}. Offset 2px. Nunca remover outline — sem isso, keyboard users ficam perdidos.</div>
      <div style={{display:"flex",gap:DS.s[3],alignItems:"center"}}>
        <button style={{...sizes.md,background:DS.colors.brand.blueLight,color:"#fff",boxShadow:DS.focus,outline:"2px solid transparent",outlineOffset:2}}>Com Focus</button>
        <button style={{...sizes.md,background:DS.colors.gray.white,color:DS.colors.gray[700],border:`1px solid ${DS.colors.border}`,boxShadow:DS.focus,outline:"2px solid transparent",outlineOffset:2}}>Secondary Focus</button>
      </div>
    </div>
  </div>;
}

function SecCards() {
  const stats=[
    {l:"Receita total atribuída",v:"R$ 842.567",d:"+16.4%",u:true,sp:[420,450,500,540,580,620,670,700,760,810,842]},
    {l:"Taxa de abertura",v:"32.5%",d:"−2.1%",u:false,sp:[38,37,36,35,34.5,34,33.5,33,32.8,32.5,32.5]},
    {l:"Campanhas ativas",v:"24",d:"+3",u:true,sp:[14,15,16,18,19,20,21,22,23,24,24]},
    {l:"Clientes ativos",v:"248",d:"+12",u:true,sp:[210,215,220,225,228,230,235,238,242,245,248]},
  ];
  // Chart data matching reference pattern — 19 days of data
  const cRevenue = [10,340,710,750,80,195,215,230,230,290,950,700,870,780,920,780,180,480,340];
  const cRecoveries = [0,1,3,2,0,1,1,1,1,1,4,3,3,3,4,3,0,3,2];
  const cDays = 19;
  const cLabels = ["2026-03-01","2026-03-03","2026-03-05","2026-03-07","2026-03-09","2026-03-11","2026-03-13","2026-03-15","2026-03-17","2026-03-19"];

  // Catmull-Rom to Bezier — high tension smooth curves
  const catmullRom = (pts, tension = 0.35) => {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const DualChart = ({ data1, data2, h = 240 }) => {
    const W = 680, H = h, PL = 44, PR = 36, PT = 12, PB = 32;
    const cw = W - PL - PR, ch = H - PT - PB;
    const mx1 = Math.max(...data1) * 1.12;
    const mx2 = Math.max(...data2) + 1;
    const toX = i => PL + (i / (data1.length - 1)) * cw;
    const toY1 = v => PT + ch - (v / mx1) * ch;
    const toY2 = v => PT + ch - (v / mx2) * ch;

    const pts1 = data1.map((v, i) => [toX(i), toY1(v)]);
    const pts2 = data2.map((v, i) => [toX(i), toY2(v)]);
    const line1 = catmullRom(pts1);
    const line2 = catmullRom(pts2);
    // Area: close the smooth path down to baseline
    const area1 = `${line1} L${pts1[pts1.length-1][0]},${PT+ch} L${pts1[0][0]},${PT+ch} Z`;

    const yTicks = [0, 250, 500, 750, 1000];
    const yTicksR = [0, 1, 2, 3, 4];

    return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="dualFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={DS.colors.brand.blueLight} stopOpacity=".22" />
          <stop offset="60%" stopColor={DS.colors.brand.blueLight} stopOpacity=".06" />
          <stop offset="100%" stopColor={DS.colors.brand.blueLight} stopOpacity=".01" />
        </linearGradient>
      </defs>
      {/* Horizontal gridlines + left Y labels */}
      {yTicks.map((v, i) => {
        const y = toY1(v);
        return <g key={i}>
          <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={DS.colors.gray[200]} strokeWidth="1" />
          <text x={PL - 8} y={y + 4} textAnchor="end" fontSize="10" fill={DS.colors.gray[400]} fontFamily={DS.f.mono}>
            {v >= 1000 ? `${v / 1000}k` : v}
          </text>
        </g>;
      })}
      {/* Right Y labels */}
      {yTicksR.map((v, i) => {
        const y = toY2(v);
        return <text key={`r${i}`} x={W - PR + 8} y={y + 4} textAnchor="start" fontSize="10" fill={DS.colors.sem.posText} fontFamily={DS.f.mono} opacity="0.65">{v}</text>;
      })}
      {/* X axis date labels */}
      {cLabels.map((l, i) => <text key={i} x={PL + (i / (cLabels.length - 1)) * cw} y={H - 8} textAnchor="middle" fontSize="9" fill={DS.colors.gray[400]} fontFamily={DS.f.sans}>{l}</text>)}
      {/* Revenue area fill */}
      <path d={area1} fill="url(#dualFill)" />
      {/* Revenue line — smooth, no dots, thicker */}
      <path d={line1} fill="none" stroke={DS.colors.brand.blueLight} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {/* Recoveries line — smooth, with dots on ALL points */}
      <path d={line2} fill="none" stroke={DS.colors.sem.posText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots on EVERY green point (like reference) */}
      {pts2.map((p, i) => <circle key={`d${i}`} cx={p[0]} cy={p[1]} r="4" fill={DS.colors.gray.white} stroke={DS.colors.sem.posText} strokeWidth="2" />)}
    </svg>;
  };

  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    {/* 1. KPI Cards padrão */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>KPI Cards — nível 1</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Label 13px muted, valor 32px semibold sans, delta colorido, sparkline.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:DS.s[4]}}>
        {stats.map((s,i)=><div key={i} style={{background:DS.colors.gray.white,borderRadius:DS.r.md,padding:`${DS.s[4]}px ${DS.s[6]}px`,border:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>{s.l}</div>
            <div style={{fontSize:32,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1}}>{s.v}</div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:DS.s[2]}}>
              <span style={{color:s.u?DS.colors.sem.posText:DS.colors.sem.negText}}>{s.u?Icons.arrowUp(14):Icons.arrowDown(14)}</span>
              <span style={{fontSize:13,fontWeight:500,fontFamily:DS.f.mono,color:s.u?DS.colors.sem.posText:DS.colors.sem.negText}}>{s.d}</span>
            </div>
          </div>
          <Spark data={s.sp} color={s.u?DS.colors.sem.posText:DS.colors.brand.blueLight} w={64} h={28}/>
        </div>)}
      </div>
    </div>

    {/* 2. Card Destaque Grande — full width com gradiente */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Card Destaque Grande</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Full-width com gradiente. Uso: 1 por página para a métrica hero ou CTA principal.</div>
      <div style={{
        background:DS.colors.brand.gradient,borderRadius:DS.r.md,padding:`${DS.s[8]}px ${DS.s[8]}px`,
        color:"#fff",position:"relative",overflow:"hidden",
        display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[8],alignItems:"center",
      }}>
        {/* Decorative circles */}
        <div style={{position:"absolute",top:-60,right:-60,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
        <div style={{position:"absolute",bottom:-40,right:120,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,0.03)"}}/>
        <div style={{position:"absolute",top:20,left:-30,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.03)"}}/>
        {/* Left: Metrics */}
        <div style={{position:"relative",zIndex:1}}>
          <div style={{fontSize:13,fontWeight:500,opacity:0.7,fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Receita total recuperada via Flows</div>
          <div style={{fontSize:42,fontWeight:600,fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1,marginBottom:DS.s[4]}}>R$ 1.237.484</div>
          <div style={{display:"flex",gap:DS.s[4],marginBottom:DS.s[4]}}>
            <div>
              <div style={{fontSize:11,opacity:0.6,fontFamily:DS.f.sans,marginBottom:4}}>Recuperações</div>
              <div style={{fontSize:20,fontWeight:600,fontFamily:DS.f.sans}}>133</div>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,0.15)"}}/>
            <div>
              <div style={{fontSize:11,opacity:0.6,fontFamily:DS.f.sans,marginBottom:4}}>Taxa</div>
              <div style={{fontSize:20,fontWeight:600,fontFamily:DS.f.sans}}>13.3%</div>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,0.15)"}}/>
            <div>
              <div style={{fontSize:11,opacity:0.6,fontFamily:DS.f.sans,marginBottom:4}}>Ticket médio</div>
              <div style={{fontSize:20,fontWeight:600,fontFamily:DS.f.sans}}>R$ 210,14</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
            <span style={{background:"rgba(255,255,255,0.15)",borderRadius:DS.r.pill,padding:"3px 10px",fontSize:11,fontWeight:600,letterSpacing:"0.02em"}}>↑ +34.2% vs período anterior</span>
          </div>
        </div>
        {/* Right: Mini sparkline visualization */}
        <div style={{position:"relative",zIndex:1}}>
          <svg width="100%" viewBox="0 0 260 100" style={{display:"block",opacity:0.7}}>
            {[85,120,340,710,165,210,195,950,870,780,920,680].map((v,i,arr)=>{
              const mx=Math.max(...arr),x=(i/(arr.length-1))*260,y=100-4-(v/mx)*88;
              return <circle key={i} cx={x} cy={y} r="3" fill="rgba(255,255,255,0.5)"/>;
            })}
            <polyline points={[85,120,340,710,165,210,195,950,870,780,920,680].map((v,i,arr)=>{
              const mx=Math.max(...arr);return `${(i/(arr.length-1))*260},${100-4-(v/mx)*88}`;
            }).join(' ')} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points={`0,100 ${[85,120,340,710,165,210,195,950,870,780,920,680].map((v,i,arr)=>{
              const mx=Math.max(...arr);return `${(i/(arr.length-1))*260},${100-4-(v/mx)*88}`;
            }).join(' ')} 260,100`} fill="rgba(255,255,255,0.06)"/>
          </svg>
        </div>
      </div>
    </div>

    {/* 3. Card com informação + gráfico integrado */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Card com Gráfico Integrado</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Chart inline com header, subtitle, legenda, e period tabs. Dual-axis para 2 métricas.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>Evolução Temporal</div>
            <div style={{fontSize:13,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:2}}>Recuperações e receita ao longo do tempo</div>
          </div>
          <div style={{display:"flex",gap:DS.s[1]}}>
            {["Diário","Semanal","Mensal"].map((p,i)=><button key={p} style={{padding:"5px 14px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:i===0?DS.colors.brand.blueLight:"transparent",color:i===0?"#fff":DS.colors.gray[500],border:i===0?"none":`1px solid ${DS.colors.border}`}}>{p}</button>)}
          </div>
        </div>
        {/* KPI row inside card */}
        <div style={{display:"flex",gap:DS.s[8],padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`,background:DS.colors.gray[50]}}>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Receita recuperada</div>
            <div style={{display:"flex",alignItems:"baseline",gap:DS.s[2]}}>
              <span style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums"}}>R$ 6.713,75</span>
              <span style={{fontSize:12,fontWeight:500,color:DS.colors.sem.posText,fontFamily:DS.f.mono}}>↑ +18.4%</span>
            </div>
          </div>
          <div style={{width:1,background:DS.colors.border}}/>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Recuperações</div>
            <div style={{display:"flex",alignItems:"baseline",gap:DS.s[2]}}>
              <span style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums"}}>33</span>
              <span style={{fontSize:12,fontWeight:500,color:DS.colors.sem.posText,fontFamily:DS.f.mono}}>↑ +12</span>
            </div>
          </div>
          <div style={{width:1,background:DS.colors.border}}/>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4}}>Ticket médio</div>
            <div style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.02em",fontVariantNumeric:"tabular-nums"}}>R$ 210,14</div>
          </div>
        </div>
        {/* Chart */}
        <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:DS.s[3],fontSize:12,fontFamily:DS.f.sans}}>
            <div style={{display:"flex",gap:DS.s[6]}}>
              <span style={{display:"flex",alignItems:"center",gap:6,color:DS.colors.gray[500]}}>
                <span style={{width:14,height:2,background:DS.colors.brand.blueLight,borderRadius:1}}/>Receita (R$) — eixo esquerdo
              </span>
              <span style={{display:"flex",alignItems:"center",gap:6,color:DS.colors.gray[500]}}>
                <span style={{width:14,height:2,background:DS.colors.sem.posText,borderRadius:1}}/>Recuperações — eixo direito
              </span>
            </div>
          </div>
          <DualChart data1={cRevenue} data2={cRecoveries} h={240} />
        </div>
      </div>
    </div>

    {/* 4. Section Container */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Section Container</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`}}>
          <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Resumo Financeiro</div>
          <div style={{display:"flex",gap:DS.s[2]}}>
            {["Hoje","7D","30D"].map((p,i)=><button key={p} style={{padding:"5px 12px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:i===0?DS.colors.gray[900]:"transparent",color:i===0?"#fff":DS.colors.gray[500],border:i===0?"none":`1px solid ${DS.colors.border}`}}>{p}</button>)}
          </div>
        </div>
        <div style={{padding:DS.s[8],textAlign:"center",color:DS.colors.gray[300],fontSize:13,fontFamily:DS.f.sans,border:"none",margin:DS.s[4],borderRadius:DS.r.sm}}>Gráfico, tabela ou lista aqui</div>
      </div>
    </div>
  </div>;
}

function SecBadges() {
  const sts=[
    {l:"Ativo",bg:DS.colors.sem.posBg,t:DS.colors.sem.posText,b:DS.colors.sem.posBorder},
    {l:"Pausado",bg:DS.colors.sem.warnBg,t:DS.colors.sem.warnText,b:DS.colors.sem.warnBorder},
    {l:"Falhou",bg:DS.colors.sem.negBg,t:DS.colors.sem.negText,b:DS.colors.sem.negBorder},
    {l:"Rascunho",bg:DS.colors.sem.neutBg,t:DS.colors.sem.neutText,b:DS.colors.sem.neutBorder},
    {l:"Live",bg:DS.colors.sem.infoBg,t:DS.colors.sem.infoText,b:DS.colors.sem.infoBorder},
  ];
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[6]}}>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Status — muted bg + dark text + dot</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Inter 11px, weight 600, ls: 0.02em. Fundo muted, texto escuro, dot 6px à esquerda. Padding: 2px 8px. Radius: 6px.</div>
      <div style={{display:"flex",gap:DS.s[3]}}>{sts.map(s=><span key={s.l} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"2px 8px",borderRadius:DS.r.sm,background:s.bg,border:`1px solid ${s.b}`,fontSize:11,fontWeight:600,color:s.t,fontFamily:DS.f.sans,letterSpacing:"0.02em"}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:s.t}}/>{s.l}
      </span>)}</div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Count Pills</div>
      <div style={{display:"flex",gap:DS.s[3],alignItems:"center"}}>
        {[{n:"3",bg:DS.colors.brand.blueLight,c:"#fff"},{n:"12",bg:DS.colors.sem.negBg,c:DS.colors.sem.negText},{n:"99+",bg:DS.colors.gray[100],c:DS.colors.gray[600]}].map((p,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,padding:"0 6px",borderRadius:DS.r.pill,background:p.bg,color:p.c,fontSize:11,fontWeight:600,fontFamily:DS.f.mono}}>{p.n}</span>)}
      </div>
    </div>
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Tags</div>
      <div style={{display:"flex",gap:DS.s[2]}}>
        {["Shopify","Klaviyo","WooCommerce","Email","WhatsApp"].map((t,i)=><span key={t} style={{padding:"4px 10px",borderRadius:DS.r.sm,background:i===0?DS.colors.brand.blue50:DS.colors.gray[50],color:i===0?DS.colors.brand.blue:DS.colors.gray[600],border:`1px solid ${i===0?DS.colors.brand.blue100:DS.colors.border}`,fontSize:12,fontWeight:500,fontFamily:DS.f.sans}}>{t}</span>)}
      </div>
    </div>
  </div>;
}

function SecInputs() {
  const inp={width:"100%",padding:"9px 12px",fontSize:14,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.sm,background:DS.colors.gray.white,color:DS.colors.gray[900],outline:"none",boxSizing:"border-box",transition:DS.t};
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[6],maxWidth:400}}>
    <div>
      <label style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],display:"block",marginBottom:DS.s[1],fontFamily:DS.f.sans}}>Nome do Cliente</label>
      <input placeholder="Ex: AchaTudo Store" style={inp} onFocus={e=>{e.target.style.borderColor=DS.colors.brand.blueLight;e.target.style.boxShadow=`0 0 0 2px ${DS.colors.brand.blue50}`}} onBlur={e=>{e.target.style.borderColor=DS.colors.border;e.target.style.boxShadow="none"}}/>
      <span style={{fontSize:12,color:DS.colors.gray[400],marginTop:DS.s[1],display:"block",fontFamily:DS.f.sans}}>Nome exibido no painel admin</span>
    </div>
    <div>
      <label style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],display:"block",marginBottom:DS.s[1],fontFamily:DS.f.sans}}>Buscar</label>
      <div style={{position:"relative"}}><div style={{position:"absolute",left:10,top:10,color:DS.colors.gray[400]}}>{Icons.search(16)}</div><input placeholder="Buscar clientes..." style={{...inp,paddingLeft:32}}/></div>
    </div>
    <div>
      <label style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],display:"block",marginBottom:DS.s[1],fontFamily:DS.f.sans}}>Email (erro)</label>
      <input defaultValue="invalido" style={{...inp,borderColor:DS.colors.sem.negText,background:DS.colors.sem.negBg}}/>
      <span style={{fontSize:12,color:DS.colors.sem.negText,marginTop:DS.s[1],display:"block",fontFamily:DS.f.sans,fontWeight:500}}>Email inválido</span>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:DS.s[3]}}>
      <div style={{width:40,height:22,background:DS.colors.brand.blueLight,borderRadius:DS.r.pill,position:"relative",cursor:"pointer"}}><div style={{width:16,height:16,background:"#fff",borderRadius:"50%",position:"absolute",top:3,right:3,boxShadow:DS.shadow.sm}}/></div>
      <span style={{fontSize:14,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Notificações ativas</span>
    </div>
  </div>;
}

function SecTabela() {
  const rows=[
    {n:"AchaTudo Store",r:"R$ 124.567,89",o:"34.2%",cl:"4.8%",st:"Ativo",sp:[80,90,100,115,120,124]},
    {n:"Donaris Joias",r:"R$ 156.234,12",o:"36.1%",cl:"5.2%",st:"Ativo",sp:[100,120,135,145,155,156]},
    {n:"Clube Rock",r:"R$ 67.891,45",o:"31.5%",cl:"3.9%",st:"Pausado",sp:[90,85,78,72,68,67]},
    {n:"EPORTH Energia",r:"R$ 89.345,67",o:"28.7%",cl:"3.1%",st:"Ativo",sp:[50,60,72,80,86,89]},
    {n:"Oak Vintage",r:"R$ 43.123,00",o:"25.3%",cl:"2.4%",st:"Rascunho",sp:[45,44,43,43,43,43]},
  ];
  const sm={Ativo:{bg:DS.colors.sem.posBg,t:DS.colors.sem.posText,b:DS.colors.sem.posBorder},Pausado:{bg:DS.colors.sem.warnBg,t:DS.colors.sem.warnText,b:DS.colors.sem.warnBorder},Rascunho:{bg:DS.colors.sem.neutBg,t:DS.colors.sem.neutText,b:DS.colors.sem.neutBorder}};
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[4]}}>
    <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,lineHeight:1.6}}>Texto left-align. Números right-align. Sem zebra-striping. Hover rgba(0,0,0,0.02).</div>
    <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
        <thead><tr style={{background:DS.colors.gray[50]}}>
          {["Cliente","Receita","Open","Click","Trend","Status",""].map((h,i)=><th key={i} style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,textAlign:i>=1&&i<=4?"right":"left",fontSize:12,fontWeight:600,color:DS.colors.gray[500],letterSpacing:"0.04em",textTransform:"uppercase",borderBottom:`1px solid ${DS.colors.border}`}}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((r,i)=>{const st=sm[r.st];const trending=r.sp[r.sp.length-1]>=r.sp[0];return <tr key={i} style={{borderBottom:i<rows.length-1?`1px solid ${DS.colors.border}`:"none",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900]}}>{r.n}</td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.r}</td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.o}</td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.cl}</td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,textAlign:"right"}}><Spark data={r.sp} color={trending?DS.colors.sem.posText:DS.colors.gray[400]} w={56} h={18} fill={false}/></td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`}}><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:DS.r.sm,background:st.bg,border:`1px solid ${st.b}`,fontSize:11,fontWeight:600,color:st.t,letterSpacing:"0.02em"}}><span style={{width:6,height:6,borderRadius:"50%",background:st.t}}/>{r.st}</span></td>
          <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,color:DS.colors.gray[400]}}>{Icons.dots(16)}</td>
        </tr>})}</tbody>
      </table>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderTop:`1px solid ${DS.colors.border}`,background:DS.colors.gray[50]}}>
        <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>5 de 248 clientes</span>
        <div style={{display:"flex",gap:DS.s[2]}}>
          <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,color:DS.colors.gray[500],cursor:"pointer"}}>Anterior</button>
          <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,color:DS.colors.gray[500],cursor:"pointer"}}>Próximo</button>
        </div>
      </div>
    </div>
  </div>;
}

function SecSidebar() {
  const [active, setActive] = useState("Dashboard");
  const navItems = [
    { icon: "home", label: "Início" },
    { icon: "bar", label: "Dashboard" },
    { icon: "users", label: "Clientes" },
    { icon: "send", label: "Campanhas" },
    { icon: "layers", label: "Flows" },
    { icon: "dollar", label: "Receita" },
    { icon: "pulse", label: "Analytics" },
    { icon: "zap", label: "Automações" },
  ];
  const bottomItems = [
    { icon: "gear", label: "Configurações" },
  ];
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,lineHeight:1.6}}>
      Sidebar 240px (expandida) ou 64px (colapsada). Ícones filled = estado ativo. Agrupamento por seções.
    </div>
    <div style={{display:"flex",gap:DS.s[6]}}>
      {/* Expanded */}
      <div style={{width:240,background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:`${DS.s[6]}px ${DS.s[3]}px`,display:"flex",flexDirection:"column",gap:DS.s[1]}}>
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2],padding:`${DS.s[2]}px ${DS.s[3]}px`,marginBottom:DS.s[4]}}>
          <div style={{width:32,height:32,borderRadius:DS.r.md,background:DS.colors.brand.gradient,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#fff",fontWeight:700,fontSize:14}}>C</span>
          </div>
          <span style={{fontWeight:600,fontSize:15,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>Convertfy</span>
        </div>
        {navItems.map(item => (
          <div key={item.label} onClick={() => setActive(item.label)}
            style={{
              display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[2]}px ${DS.s[3]}px`,
              borderRadius:DS.r.sm,cursor:"pointer",transition:DS.t,
              background: active===item.label ? DS.colors.brand.blue50 : "transparent",
              color: active===item.label ? DS.colors.brand.blueLight : DS.colors.gray[500],
              fontWeight: active===item.label ? 600 : 500, fontSize:14, fontFamily:DS.f.sans,
            }}>
            {Icons[item.icon](20)}{item.label}
          </div>
        ))}
        <div style={{flex:1,minHeight:DS.s[8]}}/>
        <div style={{borderTop:`1px solid ${DS.colors.border}`,paddingTop:DS.s[3]}}>
          {bottomItems.map(item => (
            <div key={item.label} style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[2]}px ${DS.s[3]}px`,borderRadius:DS.r.sm,cursor:"pointer",color:DS.colors.gray[500],fontSize:14,fontFamily:DS.f.sans,fontWeight:500}}>
              {Icons[item.icon](20)}{item.label}
            </div>
          ))}
        </div>
        {/* User */}
        <div style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[3]}px ${DS.s[3]}px`,borderTop:`1px solid ${DS.colors.border}`,marginTop:DS.s[2]}}>
          <div style={{width:32,height:32,borderRadius:DS.r.pill,background:DS.colors.gray[200],display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,color:DS.colors.gray[600]}}>V</div>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>Victor B.</div>
            <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>Admin</div>
          </div>
        </div>
      </div>
      {/* Collapsed */}
      <div style={{width:64,background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:`${DS.s[6]}px 0`,display:"flex",flexDirection:"column",alignItems:"center",gap:DS.s[1]}}>
        <div style={{width:32,height:32,borderRadius:DS.r.md,background:DS.colors.brand.gradient,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:DS.s[4]}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:14}}>C</span>
        </div>
        {navItems.map((item,i) => (
          <div key={i} style={{
            width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",
            borderRadius:DS.r.sm,cursor:"pointer",transition:DS.t,
            background: i===1 ? DS.colors.brand.blue50 : "transparent",
            color: i===1 ? DS.colors.brand.blueLight : DS.colors.gray[400],
          }}>
            {Icons[item.icon](20)}
          </div>
        ))}
        <div style={{flex:1}}/>
        <div style={{width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",color:DS.colors.gray[400],cursor:"pointer"}}>{Icons.gear(20)}</div>
        <div style={{width:32,height:32,borderRadius:DS.r.pill,background:DS.colors.gray[200],display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600,color:DS.colors.gray[600],marginTop:DS.s[2]}}>V</div>
      </div>
    </div>
  </div>;
}

// ── EMAIL PERFORMANCE — Data ─────────────────────────────
const PERF_METRICS = [
  { key:"openRate",label:"Open Rate",value:38.40,bm:32.00,delta:3.2 },
  { key:"clickRate",label:"Click Rate",value:4.20,bm:2.80,delta:0.5 },
  { key:"ctor",label:"CTOR",value:10.90,bm:8.50,delta:1.1 },
  { key:"placedOrder",label:"Placed Order Rate",value:1.80,bm:1.20,delta:-0.2 },
  { key:"rpe",label:"RPE (R$)",value:0.87,bm:0.65,delta:0.1 },
  { key:"deliverability",label:"Deliverability",value:98.90,bm:97.50,delta:0.3 },
];
const perfFmtVal=(m)=>m.key==="rpe"?`R$ ${m.value.toFixed(2).replace(".",",")}`:`${m.value.toFixed(2).replace(".",",")}%`;
const perfFmtBM=(m)=>m.key==="rpe"?`R$ ${m.bm.toFixed(2).replace(".",",")}`:`${m.bm.toFixed(2).replace(".",",")}%`;
const PERF_CHART={
  labels:["23/02","25/02","27/02","01/03","03/03","05/03","07/03","09/03","11/03","13/03","15/03","17/03","19/03","21/03","24/03"],
  openRate:[36.2,35.8,37.1,38.5,37.9,39.2,38.1,37.5,38.8,39.1,38.4,37.8,38.9,39.2,38.4],
  openRatePrev:[33.1,33.5,34.0,33.8,34.2,34.5,34.1,33.9,34.3,34.8,34.6,34.2,34.5,35.0,35.2],
  clickRate:[3.8,4.1,3.9,4.5,4.2,4.0,4.3,3.7,4.6,4.1,4.4,4.0,4.2,4.5,4.2],
  clickRatePrev:[3.2,3.4,3.1,3.5,3.3,3.6,3.4,3.2,3.5,3.3,3.4,3.1,3.3,3.5,3.7],
  ctor:[10.2,11.1,10.5,11.6,10.9,10.3,11.0,9.8,11.8,10.5,11.3,10.6,10.9,11.5,10.9],
  ctorPrev:[9.5,9.8,9.2,10.1,9.7,9.4,9.9,9.1,10.0,9.6,9.8,9.3,9.5,10.0,9.8],
  placedOrder:[1.6,1.9,1.7,2.0,1.8,1.5,1.9,1.4,2.1,1.7,1.8,1.6,1.8,2.0,1.8],
  placedOrderPrev:[1.8,1.7,1.9,2.1,2.0,1.8,2.0,1.7,2.2,1.9,2.0,1.8,1.9,2.1,2.0],
  rpe:[0.72,0.85,0.78,0.92,0.87,0.80,0.89,0.71,0.95,0.82,0.88,0.79,0.87,0.93,0.87],
  rpePrev:[0.65,0.70,0.68,0.74,0.71,0.69,0.72,0.66,0.75,0.70,0.73,0.68,0.71,0.74,0.77],
  deliverability:[98.5,98.7,98.9,99.1,98.8,98.6,99.0,98.4,99.2,98.9,98.7,98.8,98.9,99.0,98.9],
  deliverabilityPrev:[97.8,97.9,98.0,98.2,98.1,97.9,98.1,97.7,98.3,98.0,98.1,97.9,98.0,98.2,98.5],
};
const PERF_BM={openRate:32,clickRate:2.8,ctor:8.5,placedOrder:1.2,rpe:0.65,deliverability:97.5};

function PerfAreaChart({dataKey}){
  const [hIdx,setHIdx]=useState(null);
  const data=PERF_CHART[dataKey],prev=PERF_CHART[dataKey+"Prev"],labels=PERF_CHART.labels;
  const color=DS.colors.brand.blueLight;
  const W=580,H=220,PL=44,PR=12,PT=8,PB=28;
  const cw=W-PL-PR,ch=H-PT-PB;
  const all=[...data,...(prev||[])];
  const dataMin=Math.min(...all),dataMax=Math.max(...all);
  const range=dataMax-dataMin||1;
  const yMin=dataMin-range*0.3,yMax=dataMax+range*0.3,yRange=yMax-yMin;
  const toX=(i)=>PL+(i/(data.length-1))*cw;
  const toY=(v)=>PT+ch-((v-yMin)/yRange)*ch;
  const smooth=(pts)=>{if(pts.length<2)return'';let d=`M${pts[0][0]},${pts[0][1]}`;for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];d+=` C${p1[0]+(p2[0]-p0[0])*.35},${p1[1]+(p2[1]-p0[1])*.35} ${p2[0]-(p3[0]-p1[0])*.35},${p2[1]-(p3[1]-p1[1])*.35} ${p2[0]},${p2[1]}`;}return d;};
  const pts=data.map((v,i)=>[toX(i),toY(v)]);
  const prevPts=prev?prev.map((v,i)=>[toX(i),toY(v)]):null;
  const line=smooth(pts);
  const prevLine=prevPts?smooth(prevPts):null;
  const area=`${line} L${pts[pts.length-1][0]},${PT+ch} L${pts[0][0]},${PT+ch} Z`;
  const grids=Array.from({length:5},(_,i)=>yMin+(yRange/4)*i);
  const fmtY=(v)=>dataKey==="rpe"?`R$ ${v.toFixed(2)}`:`${v.toFixed(v<10?1:0)}%`;
  const fmtV=(v)=>dataKey==="rpe"?`R$ ${v.toFixed(2)}`:`${v.toFixed(1)}%`;
  // Hover detection: invisible rects per data point
  const slotW=cw/(data.length-1);
  return <div style={{position:"relative"}}>
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block"}} onMouseLeave={()=>setHIdx(null)}>
      <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="60%" stopColor={color} stopOpacity=".06"/><stop offset="100%" stopColor={color} stopOpacity=".01"/></linearGradient></defs>
      {grids.map((v,i)=>{const y=toY(v);return <g key={i}><line x1={PL} y1={y} x2={W-PR} y2={y} stroke={DS.colors.gray[200]} strokeWidth="1"/><text x={PL-6} y={y+4} textAnchor="end" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.mono}>{fmtY(v)}</text></g>;})}
      {labels.map((l,i)=><text key={i} x={toX(i)} y={H-6} textAnchor="middle" fontSize="11" fill={DS.colors.gray[400]} fontFamily={DS.f.sans}>{l}</text>)}
      {/* Previous period line */}
      {prevLine&&<path d={prevLine} fill="none" stroke={DS.colors.gray[300]} strokeWidth="2" strokeDasharray="6,4" opacity=".45"/>}
      {/* Current area + line */}
      <path d={area} fill="url(#pf)"/><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Hover vertical line + dots */}
      {hIdx!==null&&<>
        <line x1={toX(hIdx)} y1={PT} x2={toX(hIdx)} y2={PT+ch} stroke={DS.colors.gray[300]} strokeWidth="1" strokeDasharray="3,3"/>
        <circle cx={toX(hIdx)} cy={toY(data[hIdx])} r="4" fill={color} stroke={DS.colors.gray.white} strokeWidth="2"/>
        {prev&&<circle cx={toX(hIdx)} cy={toY(prev[hIdx])} r="3" fill={DS.colors.gray[400]} stroke={DS.colors.gray.white} strokeWidth="2"/>}
      </>}
      {/* Invisible hover zones */}
      {data.map((_,i)=><rect key={i} x={toX(i)-slotW/2} y={PT} width={slotW} height={ch} fill="transparent" onMouseEnter={()=>setHIdx(i)} style={{cursor:"crosshair"}}/>)}
    </svg>
    {/* Tooltip popup */}
    {hIdx!==null&&<div style={{position:"absolute",top:0,left:toX(hIdx)>W/2?"auto":toX(hIdx)/(W)*100+"%",right:toX(hIdx)>W/2?(1-toX(hIdx)/W)*100+"%":"auto",background:DS.colors.gray.white,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`,boxShadow:DS.shadow.md,padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:12,fontFamily:DS.f.sans,zIndex:10,pointerEvents:"none",minWidth:120}}>
      <div style={{fontSize:11,color:DS.colors.gray[400],marginBottom:4}}>{labels[hIdx]}</div>
      <div style={{display:"flex",justifyContent:"space-between",gap:DS.s[4],marginBottom:prev?4:0}}>
        <span style={{display:"flex",alignItems:"center",gap:4,color:DS.colors.gray[600]}}><span style={{width:8,height:2,background:color,borderRadius:1}}/>Atual</span>
        <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:600,color:DS.colors.gray[900]}}>{fmtV(data[hIdx])}</span>
      </div>
      {prev&&<div style={{display:"flex",justifyContent:"space-between",gap:DS.s[4]}}>
        <span style={{display:"flex",alignItems:"center",gap:4,color:DS.colors.gray[400]}}><span style={{width:8,height:2,background:DS.colors.gray[300],borderRadius:1,opacity:.6}}/>Anterior</span>
        <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[500]}}>{fmtV(prev[hIdx])}</span>
      </div>}
    </div>}
  </div>;
}

// ── SAÚDE DOS CLIENTES — Data ────────────────────────────
function healthColor(score){
  if(score>=70)return{bar:DS.colors.sem.posText,bg:DS.colors.sem.posBg,label:"Saudável"};
  if(score>=50)return{bar:DS.colors.accent.amber,bg:DS.colors.sem.warnBg,label:"Atenção"};
  return{bar:DS.colors.accent.red,bg:DS.colors.sem.negBg,label:"Crítico"};
}

function EmailPerfCard(){
  const [sel,setSel]=useState("openRate");
  const [hover,setHover]=useState(null);
  const B=DS.colors.border,W=DS.colors.gray.white,BR=DS.colors.brand.blueLight;
  const stats=[
    {key:"openRate",l:"Open Rate",v:"38,4%",bm:"32,0%",d:"+3,2%",up:true,desc:"Taxa de abertura dos emails enviados"},
    {key:"clickRate",l:"Click Rate",v:"4,2%",bm:"2,8%",d:"+0,5%",up:true,desc:"Taxa de cliques sobre emails entregues"},
    {key:"ctor",l:"CTOR",v:"10,9%",bm:"8,5%",d:"+1,1%",up:true,desc:"Click-to-open rate: cliques sobre aberturas"},
    {key:"placedOrder",l:"Placed Order",v:"1,8%",bm:"1,2%",d:"-0,2%",up:false,desc:"Taxa de pedidos gerados via email"},
    {key:"rpe",l:"RPE",v:"R$ 0,87",bm:"R$ 0,65",d:"+0,1%",up:true,desc:"Receita por email entregue"},
    {key:"deliverability",l:"Deliverability",v:"98,9%",bm:"97,5%",d:"+0,3%",up:true,desc:"Taxa de entrega bem-sucedida"},
  ];
  return <div style={{background:W,borderRadius:DS.r.md,border:`1px solid ${B}`,padding:DS.s[6],display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:DS.s[4]}}>
      <div>
        <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Performance do Email</div>
        <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:2}}>198.6K entregues · R$ 847K receita atribuída</div>
      </div>
      <div style={{display:"flex",gap:DS.s[4],fontSize:12,fontFamily:DS.f.sans}}>
        <span style={{display:"flex",alignItems:"center",gap:6,color:DS.colors.gray[600]}}><span style={{width:12,height:2,background:BR,borderRadius:1}}/>Atual</span>
        <span style={{display:"flex",alignItems:"center",gap:6,color:DS.colors.gray[400]}}><span style={{width:12,height:2,background:DS.colors.gray[300],borderRadius:1,opacity:.6}}/>Período anterior</span>
      </div>
    </div>
    {/* Compact metrics */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:`${DS.s[2]}px ${DS.s[3]}px`,marginBottom:DS.s[4]}}>
      {stats.map((s,i)=>{const act=sel===s.key;const isHov=hover===i;return <div key={s.key}
        style={{position:"relative",padding:`${DS.s[2]}px ${DS.s[3]}px`,borderRadius:DS.r.sm,cursor:"pointer",transition:"all 120ms ease",
          border:act?`1px solid ${DS.colors.brand.blue200}`:`1px solid ${B}`,
          background:act?DS.colors.brand.blue50:isHov?"rgba(0,0,0,0.02)":"transparent",
        }}
        onClick={()=>setSel(s.key)}
        onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <span style={{fontSize:12,color:act?BR:DS.colors.gray[500],fontFamily:DS.f.sans,fontWeight:500}}>{s.l}</span>
          <span style={{display:"flex",alignItems:"center",gap:2}}>
            <span style={{color:s.up?DS.colors.sem.posText:DS.colors.sem.negText}}>{s.up?Icons.arrowUp(10):Icons.arrowDown(10)}</span>
            <span style={{fontSize:11,fontWeight:500,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:s.up?DS.colors.sem.posText:DS.colors.sem.negText}}>{s.d}</span>
          </span>
        </div>
        <div style={{fontSize:20,fontWeight:600,color:act?BR:DS.colors.gray[900],fontFamily:DS.f.sans,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.02em",marginTop:2}}>{s.v}</div>
        {isHov&&<div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:4,zIndex:10,background:W,borderRadius:DS.r.sm,border:`1px solid ${B}`,boxShadow:DS.shadow.md,padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:12,fontFamily:DS.f.sans}}>
          <div style={{color:DS.colors.gray[600],marginBottom:4,lineHeight:1.4}}>{s.desc}</div>
          <div style={{display:"flex",justifyContent:"space-between",color:DS.colors.gray[400],paddingTop:4,borderTop:`1px solid ${B}`}}><span>Benchmark</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{s.bm}</span></div>
        </div>}
      </div>;})}
    </div>
    {/* Chart */}
    <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <PerfAreaChart dataKey={sel}/>
    </div>
    {/* Footer stats — clean inline */}
    <div style={{display:"flex",gap:DS.s[6],marginTop:"auto",paddingTop:DS.s[3],borderTop:`1px solid ${B}`}}>
      {[{l:"Volume de Envios",v:"4.820.350"},{l:"Perfis Ativos",v:"187.420"},{l:"Engajados (90d)",v:"62.4%"},{l:"Unsub Rate",v:"0.08%"}].map((s,i)=><div key={i}>
        <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{s.l}</div>
        <div style={{fontSize:13,fontWeight:600,color:DS.colors.gray[800],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",marginTop:2}}>{s.v}</div>
      </div>)}
    </div>
  </div>;
}

function HealthCard(){
  const [hover,setHover]=useState(null);
  const [sort,setSort]=useState("score");
  const B=DS.colors.border,W=DS.colors.gray.white;
  const clients=[
    {n:"Based 3.0",score:28,fatLoja:42100,fatAtrib:18400,or:"12.3%",cr:"0.4%",ctor:"3.2%",bounce:"4.1%",unsub:"1.8%",tag:"Deliverability em queda"},
    {n:"EPORTH Energia",score:31,fatLoja:245000,fatAtrib:89300,or:"28.7%",cr:"3.1%",ctor:"10.8%",bounce:"2.3%",unsub:"0.6%",tag:"3 flows pausados"},
    {n:"NUZE",score:48,fatLoja:98500,fatAtrib:34200,or:"22.1%",cr:"1.8%",ctor:"8.1%",bounce:"3.2%",unsub:"1.1%",tag:"9 dias sem envio"},
    {n:"Donaris Joias",score:58,fatLoja:412000,fatAtrib:156000,or:"36.1%",cr:"5.2%",ctor:"14.4%",bounce:"1.4%",unsub:"0.23%",tag:"Campanha atrasada"},
    {n:"Nivalé",score:65,fatLoja:198000,fatAtrib:72900,or:"30.4%",cr:"2.7%",ctor:"8.9%",bounce:"1.8%",unsub:"0.4%",tag:"Engagement caindo"},
    {n:"Clube Rock",score:76,fatLoja:189000,fatAtrib:67900,or:"31.5%",cr:"3.9%",ctor:"12.4%",bounce:"1.2%",unsub:"0.2%"},
    {n:"Blessed Choice",score:82,fatLoja:267000,fatAtrib:98100,or:"33.8%",cr:"4.1%",ctor:"12.1%",bounce:"1.0%",unsub:"0.15%"},
    {n:"Oak Vintage",score:87,fatLoja:145000,fatAtrib:58200,or:"32.1%",cr:"3.6%",ctor:"11.2%",bounce:"0.9%",unsub:"0.12%"},
    {n:"AchaTudo",score:92,fatLoja:310000,fatAtrib:124000,or:"34.2%",cr:"4.8%",ctor:"14.0%",bounce:"0.8%",unsub:"0.08%"},
  ];
  const fmt=(v)=>v>=1000000?`${(v/1000000).toFixed(1)}M`:v>=1000?`${(v/1000).toFixed(0)}K`:v.toString();
  const pct=(a,b)=>b>0?`${((a/b)*100).toFixed(1)}%`:"0%";
  const sorted=sort==="score"?[...clients].sort((a,b)=>a.score-b.score):sort==="receita"?[...clients].sort((a,b)=>b.fatAtrib-a.fatAtrib):sort==="pct"?[...clients].sort((a,b)=>(b.fatAtrib/b.fatLoja)-(a.fatAtrib/a.fatLoja)):[...clients].sort((a,b)=>b.fatLoja-a.fatLoja);
  const needsAtt=clients.filter(c=>c.score<70).length;
  const cols=[{l:"Cliente",align:"left",w:"auto"},{l:"Fat. Loja",align:"right"},{l:"Fat. Atrib.",align:"right"},{l:"% Receita",align:"right"},{l:"Score",align:"right"}];
  return <div style={{background:W,borderRadius:DS.r.md,border:`1px solid ${B}`,overflow:"hidden",display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[4]}px ${DS.s[4]}px`,borderBottom:`1px solid ${B}`}}>
      <div>
        <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Saúde dos Clientes</div>
        <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:2}}>{needsAtt} precisam atenção · {clients.length} de 248</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:DS.s[3]}}>
        <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:"4px 24px 4px 8px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,border:`1px solid ${B}`,background:W,color:DS.colors.gray[600],cursor:"pointer",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239CA3AF' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 6px center"}}>
          <option value="score">Score</option>
          <option value="receita">Fat. Atribuído</option>
          <option value="pct">% Receita</option>
          <option value="fatLoja">Fat. Loja</option>
        </select>
        <button style={{fontSize:12,fontWeight:500,color:DS.colors.brand.blueLight,background:"transparent",border:"none",cursor:"pointer",fontFamily:DS.f.sans}}>Ver todos</button>
      </div>
    </div>
    {/* Table */}
    <div style={{flex:1}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
      <thead><tr style={{background:DS.colors.gray[50]}}>
        {cols.map((h,i)=><th key={i} style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,textAlign:h.align,fontSize:11,fontWeight:600,color:DS.colors.gray[500],letterSpacing:"0.04em",textTransform:"uppercase",borderBottom:`1px solid ${B}`}}>{h.l}</th>)}
      </tr></thead>
      <tbody>{sorted.map((c,i)=>{
        const sc=healthColor(c.score);
        const pctVal=(c.fatAtrib/c.fatLoja)*100;
        const isHov=hover===i;
        return <tr key={c.n} style={{borderBottom:i<sorted.length-1?`1px solid ${B}`:"none",transition:DS.t,position:"relative",cursor:"pointer"}} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}>
          <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900],position:"relative"}}>
            <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
              {c.tag&&<span style={{width:6,height:6,borderRadius:"50%",background:sc.bar,flexShrink:0}}/>}
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.n}</span>
            </div>
            {/* Hover tooltip */}
            {isHov&&<div style={{position:"absolute",left:0,top:"100%",zIndex:10,background:W,borderRadius:DS.r.sm,border:`1px solid ${B}`,boxShadow:DS.shadow.md,padding:`${DS.s[3]}px`,fontSize:12,fontFamily:DS.f.sans,minWidth:220,marginTop:2}} onMouseEnter={()=>setHover(i)}>
              <div style={{fontWeight:600,color:DS.colors.gray[800],marginBottom:DS.s[2],fontSize:13}}>{c.n}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 12px",marginBottom:DS.s[2]}}>
                <span style={{color:DS.colors.gray[500]}}>Faturamento Loja</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:500,color:DS.colors.gray[800],textAlign:"right"}}>R$ {c.fatLoja.toLocaleString("pt-BR")}</span>
                <span style={{color:DS.colors.gray[500]}}>Faturamento Atribuído</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:500,color:DS.colors.gray[800],textAlign:"right"}}>R$ {c.fatAtrib.toLocaleString("pt-BR")}</span>
                <span style={{color:DS.colors.gray[500]}}>% da Receita</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:600,color:DS.colors.brand.blueLight,textAlign:"right"}}>{pct(c.fatAtrib,c.fatLoja)}</span>
              </div>
              <div style={{borderTop:`1px solid ${B}`,paddingTop:DS.s[2],display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 12px"}}>
                <span style={{color:DS.colors.gray[500]}}>Open Rate</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700],textAlign:"right"}}>{c.or}</span>
                <span style={{color:DS.colors.gray[500]}}>Click Rate</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700],textAlign:"right"}}>{c.cr}</span>
                <span style={{color:DS.colors.gray[500]}}>CTOR</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700],textAlign:"right"}}>{c.ctor}</span>
                <span style={{color:DS.colors.gray[500]}}>Bounce</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700],textAlign:"right"}}>{c.bounce}</span>
                <span style={{color:DS.colors.gray[500]}}>Unsub Rate</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700],textAlign:"right"}}>{c.unsub}</span>
              </div>
              {c.tag&&<div style={{marginTop:DS.s[2],paddingTop:DS.s[2],borderTop:`1px solid ${B}`}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:DS.r.sm,background:sc.bg,fontSize:11,fontWeight:600,color:sc.bar}}><span style={{width:5,height:5,borderRadius:"50%",background:sc.bar}}/>{c.tag}</span>
              </div>}
            </div>}
          </td>
          <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{fmt(c.fatLoja)}</td>
          <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{fmt(c.fatAtrib)}</td>
          <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:13,fontWeight:500,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right",color:pctVal>=35?DS.colors.sem.posText:pctVal>=20?DS.colors.gray[700]:DS.colors.sem.negText}}>{pctVal.toFixed(0)}%</td>
          <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,textAlign:"right"}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:32,padding:"2px 6px",borderRadius:DS.r.sm,fontSize:12,fontWeight:600,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",background:sc.bg,color:sc.bar}}>{c.score}</span>
          </td>
        </tr>;
      })}</tbody>
    </table>
    </div>
    {/* Footer */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderTop:`1px solid ${B}`,background:DS.colors.gray[50],marginTop:"auto"}}>
      <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>9 de 248 clientes</span>
      <div style={{display:"flex",gap:DS.s[2]}}>
        <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${B}`,background:W,color:DS.colors.gray[500],cursor:"pointer"}}>Anterior</button>
        <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${B}`,background:W,color:DS.colors.gray[500],cursor:"pointer"}}>Próximo</button>
      </div>
    </div>
  </div>;
}

function OnboardingSummary(){
  const B=DS.colors.border,W=DS.colors.gray.white;
  const phases=[
    {id:"config",l:"Config.",c:DS.colors.gray[500]},
    {id:"briefing",l:"Briefing",c:DS.colors.brand.blueLight},
    {id:"klaviyo",l:"Klaviyo",c:"#7C3AED"},
    {id:"campanha",l:"1ª Camp.",c:DS.colors.accent.amber},
    {id:"golive",l:"Go Live",c:DS.colors.sem.posText},
  ];
  const stores=[
    {n:"Casa & Decor",ph:"campanha",days:11,late:true},
    {n:"Green Garden",ph:"klaviyo",days:9,late:true},
    {n:"TechHub Store",ph:"briefing",days:6},
    {n:"Moda Viva",ph:"klaviyo",days:4},
    {n:"Pet Kingdom",ph:"config",days:3},
    {n:"Esporte Total",ph:"campanha",days:3},
    {n:"Sabor & Arte",ph:"briefing",days:2},
    {n:"Doce Encanto",ph:"golive",days:2},
    {n:"Nova Beleza",ph:"config",days:1,isNew:true},
  ];
  const lateCount=stores.filter(s=>s.late).length;
  const avgDays=Math.round(stores.reduce((a,s)=>a+s.days,0)/stores.length);
  const phCount=(id)=>stores.filter(s=>s.ph===id).length;

  return <div style={{background:W,borderRadius:DS.r.md,border:`1px solid ${B}`,overflow:"hidden",display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${B}`}}>
      <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Onboarding</div>
      <button style={{fontSize:12,fontWeight:500,color:DS.colors.brand.blueLight,background:"transparent",border:"none",cursor:"pointer",fontFamily:DS.f.sans}}>Ver board</button>
    </div>
    {/* KPIs row */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",borderBottom:`1px solid ${B}`}}>
      {[
        {l:"Em andamento",v:stores.length,c:DS.colors.gray[900]},
        {l:"Tempo médio",v:`${avgDays}d`,c:DS.colors.gray[900]},
        {l:"Concluídos 30d",v:"4",c:DS.colors.sem.posText},
        {l:"Atrasados",v:lateCount,c:lateCount>0?DS.colors.sem.negText:DS.colors.gray[900]},
      ].map((k,i)=><div key={i} style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,textAlign:"center",borderRight:i<3?`1px solid ${B}`:"none"}}>
        <div style={{fontSize:20,fontWeight:600,color:k.c,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{k.v}</div>
        <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:4}}>{k.l}</div>
      </div>)}
    </div>
    {/* Pipeline bar */}
    <div style={{padding:`${DS.s[2]}px ${DS.s[4]}px ${DS.s[2]}px`,borderBottom:`1px solid ${B}`}}>
      <div style={{display:"flex",height:4,borderRadius:2,overflow:"hidden",gap:1}}>
        {phases.map((p,i)=>{const n=phCount(p.id);return n>0?<div key={i} style={{flex:n,background:p.c}}/>:null;})}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        {phases.map(p=>{const n=phCount(p.id);return <span key={p.id} style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:p.c}}/>{p.l} <span style={{fontWeight:600,color:DS.colors.gray[600]}}>{n}</span>
        </span>;})}
      </div>
    </div>
    {/* Table */}
    <div style={{flex:1}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
        <tbody>{stores.sort((a,b)=>b.days-a.days).map((s,i)=>{
          const ph=phases.find(p=>p.id===s.ph);
          return <tr key={s.n} style={{borderBottom:i<stores.length-1?`1px solid ${B}`:"none",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <td style={{padding:`${DS.s[2]}px ${DS.s[4]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900],width:"45%"}}>
              <div style={{display:"flex",alignItems:"center",gap:DS.s[2],overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {s.n}
                {s.isNew&&<span style={{fontSize:9,fontWeight:600,padding:"1px 5px",borderRadius:DS.r.sm,background:DS.colors.sem.infoBg,color:DS.colors.sem.infoText,flexShrink:0}}>Novo</span>}
              </div>
            </td>
            <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,color:DS.colors.gray[500]}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:ph.c}}/>{ph.l}
              </span>
            </td>
            <td style={{padding:`${DS.s[2]}px ${DS.s[4]}px`,fontSize:12,fontWeight:600,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right",color:s.late?DS.colors.sem.negText:s.days>5?DS.colors.sem.warnText:DS.colors.gray[400]}}>{s.days}d</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {/* Footer */}
    <div style={{padding:`${DS.s[2]}px ${DS.s[4]}px`,borderTop:`1px solid ${B}`,background:DS.colors.gray[50],marginTop:"auto"}}>
      <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{stores.length} em andamento · média {avgDays} dias</span>
    </div>
  </div>;
}

function FlowCards(){
  const [hover,setHover]=useState(null);
  const B=DS.colors.border,W=DS.colors.gray.white;
  const flows=[
    {l:"Recuperação de Carrinho",rate:12.4,rev:"R$ 98K",d:"+3.2%",up:true,bm:10,sp:[9.5,10.1,10.8,11.2,11.5,11.8,12.0,12.1,12.3,12.4],
     worst:[{n:"EPORTH Energia",v:"3.2%"},{n:"Based 3.0",v:"4.1%"}],
     detail:{sent:"48.2K",conv:"5.981",aov:"R$ 164",unsub:"0.02%",flow:"12 ativos"}},
    {l:"Abandono de Navegação",rate:4.8,rev:"R$ 54K",d:"-1.1%",up:false,bm:4,sp:[5.5,5.2,5.0,4.9,4.8,4.7,4.6,4.7,4.8,4.8],
     worst:[{n:"NUZE",v:"1.8%"},{n:"Donaris Joias",v:"2.4%"}],
     detail:{sent:"32.1K",conv:"1.541",aov:"R$ 135",unsub:"0.04%",flow:"9 ativos"}},
    {l:"Win-back",rate:2.3,rev:"R$ 28K",d:"-0.8%",up:false,bm:2.5,sp:[3.0,2.8,2.7,2.6,2.5,2.4,2.3,2.3,2.3,2.3],
     worst:[{n:"Based 3.0",v:"0.4%"},{n:"EPORTH Energia",v:"0.9%"}],
     detail:{sent:"18.7K",conv:"430",aov:"R$ 151",unsub:"0.08%",flow:"7 ativos"}},
  ];
  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:DS.s[4]}}>
    {flows.map((f,fi)=>{
      const isHov=hover===fi;
      const spColor=f.up?DS.colors.sem.posText:DS.colors.sem.negText;
      return <div key={fi} style={{background:W,borderRadius:DS.r.md,border:`1px solid ${B}`,padding:`${DS.s[4]}px ${DS.s[6]}px`,position:"relative",transition:"all 120ms ease",cursor:"default"}} onMouseEnter={()=>setHover(fi)} onMouseLeave={()=>setHover(null)}>
        {/* Title */}
        <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>{f.l}</div>
        {/* Rate + Spark */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:DS.s[2]}}>
          <div style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums",lineHeight:1}}>{f.rate}%</div>
          <Spark data={f.sp} color={spColor} w={56} h={24}/>
        </div>
        {/* Revenue + Delta */}
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2],marginBottom:DS.s[2]}}>
          <span style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums"}}>{f.rev}</span>
          <span style={{fontSize:12,fontWeight:500,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:f.up?DS.colors.sem.posText:DS.colors.sem.negText}}>{f.d}</span>
        </div>
        {/* Benchmark */}
        <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Benchmark: {f.bm}%</div>
        {/* Worst clients */}
        <div style={{borderTop:`1px solid ${B}`,paddingTop:DS.s[2]}}>
          <div style={{fontSize:10,fontWeight:600,color:DS.colors.gray[400],fontFamily:DS.f.sans,letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:DS.s[1]}}>Piores clientes</div>
          {f.worst.map((w,wi)=><div key={wi} style={{display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:DS.f.sans,padding:`2px 0`}}>
            <span style={{fontWeight:500,color:DS.colors.gray[700]}}>{w.n}</span>
            <span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",fontWeight:600,color:DS.colors.sem.negText}}>{w.v}</span>
          </div>)}
        </div>
        {/* Hover tooltip — extra details */}
        {isHov&&<div style={{position:"absolute",left:0,right:0,top:"100%",marginTop:4,zIndex:10,background:W,borderRadius:DS.r.sm,border:`1px solid ${B}`,boxShadow:DS.shadow.md,padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:12,fontFamily:DS.f.sans}}>
          <div style={{fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2]}}>{f.l}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 12px"}}>
            <span style={{color:DS.colors.gray[500]}}>Emails enviados</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{f.detail.sent}</span>
            <span style={{color:DS.colors.gray[500]}}>Conversões</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{f.detail.conv}</span>
            <span style={{color:DS.colors.gray[500]}}>Ticket médio</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{f.detail.aov}</span>
            <span style={{color:DS.colors.gray[500]}}>Unsub rate</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{f.detail.unsub}</span>
            <span style={{color:DS.colors.gray[500]}}>Flows</span><span style={{fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",color:DS.colors.gray[700]}}>{f.detail.flow}</span>
          </div>
        </div>}
      </div>;
    })}
  </div>;
}

function AlertsCard(){
  const [filter,setFilter]=useState("all");
  const B=DS.colors.border,W=DS.colors.gray.white;
  const selStyle={padding:"3px 20px 3px 6px",borderRadius:DS.r.sm,fontSize:11,fontWeight:500,fontFamily:DS.f.sans,border:`1px solid ${B}`,background:W,color:DS.colors.gray[600],cursor:"pointer",appearance:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239CA3AF' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 5px center"};
  const alerts=[
    {t:"Deliverability em queda",client:"Based 3.0",sev:0,desc:"Bounce rate 4.1%, limite 2%",cat:"email"},
    {t:"3 flows pausados",client:"EPORTH Energia",sev:0,desc:"Welcome, Abandono, Win-back",cat:"flow"},
    {t:"9 dias sem envio",client:"NUZE",sev:1,desc:"Última campanha: 15/03",cat:"email"},
    {t:"Onboarding atrasado",client:"Casa & Decor",sev:1,desc:"11d na fase 1ª Campanha",cat:"onboard"},
    {t:"Unsub rate alto",client:"Donaris Joias",sev:1,desc:"0.23% nos últimos 30 dias",cat:"email"},
    {t:"Lista estagnada",client:"Clube Rock",sev:2,desc:"0.1% crescimento, meta 2%",cat:"list"},
  ];
  const sevMap=[
    {l:"Crítico",bg:DS.colors.sem.negBg,t:DS.colors.sem.negText,b:DS.colors.sem.negBorder},
    {l:"Alerta",bg:DS.colors.sem.warnBg,t:DS.colors.sem.warnText,b:DS.colors.sem.warnBorder},
    {l:"Info",bg:DS.colors.sem.infoBg,t:DS.colors.sem.infoText,b:DS.colors.sem.infoBorder},
  ];
  const filtered=filter==="all"?alerts:filter==="critico"?alerts.filter(a=>a.sev===0):filter==="alerta"?alerts.filter(a=>a.sev===1):alerts.filter(a=>a.sev===2);
  const critCount=alerts.filter(a=>a.sev===0).length;

  return <div style={{background:W,borderRadius:DS.r.md,border:`1px solid ${B}`,overflow:"hidden",display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${B}`}}>
      <div style={{display:"flex",alignItems:"center",gap:DS.s[2],fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>
        Alertas
        {critCount>0&&<span style={{background:DS.colors.sem.negBg,color:DS.colors.sem.negText,fontSize:11,fontWeight:600,padding:"1px 7px",borderRadius:DS.r.pill,fontFamily:DS.f.mono}}>{critCount} críticos</span>}
      </div>
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={selStyle}>
        <option value="all">Todos ({alerts.length})</option>
        <option value="critico">Críticos ({alerts.filter(a=>a.sev===0).length})</option>
        <option value="alerta">Alertas ({alerts.filter(a=>a.sev===1).length})</option>
        <option value="info">Info ({alerts.filter(a=>a.sev===2).length})</option>
      </select>
    </div>
    {/* Table */}
    <div style={{flex:1}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
        <tbody>{filtered.map((a,i)=>{
          const sev=sevMap[a.sev];
          return <tr key={i} style={{borderBottom:i<filtered.length-1?`1px solid ${B}`:"none",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,width:"3px",paddingRight:0}}>
              <div style={{width:3,height:28,borderRadius:2,background:sev.t}}/>
            </td>
            <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`}}>
              <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[800]}}>{a.t}</div>
              <div style={{fontSize:12,color:DS.colors.gray[400],marginTop:2}}>{a.desc}</div>
            </td>
            <td style={{padding:`${DS.s[2]}px ${DS.s[4]}px`,textAlign:"right",verticalAlign:"top",paddingTop:DS.s[3]}}>
              <div style={{fontSize:12,fontWeight:500,color:DS.colors.gray[600],whiteSpace:"nowrap"}}>{a.client}</div>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {/* Footer */}
    <div style={{padding:`${DS.s[2]}px ${DS.s[4]}px`,borderTop:`1px solid ${B}`,background:DS.colors.gray[50],marginTop:"auto"}}>
      <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{filtered.length} de {alerts.length} alertas</span>
    </div>
  </div>;
}

function SecDashboard() {
  const rev=[120,145,135,180,210,195,230,260,240,290,310,340];
  const revP=[95,100,110,105,130,140,135,150,160,170,175,180];
  const mo=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const revHover=rev.map((v,i)=>{const camp=Math.round(v*0.62);const auto=v-camp;const fatLoja=Math.round(v/0.38);return[
    {l:"Fat. Atribuído",v:`R$ ${v}K`,bold:true,color:DS.colors.brand.blueLight},
    {l:"Campanhas",v:`R$ ${camp}K`},
    {l:"Automações",v:`R$ ${auto}K`},
    {l:"Fat. Total Lojas",v:`R$ ${fatLoja}K`},
    {l:"Taxa Receita Atrib.",v:`${((v/fatLoja)*100).toFixed(1)}%`,bold:true,color:DS.colors.sem.posText},
  ];});
  const cGroups=[{label:"Sem 1",values:[32,28,4.2]},{label:"Sem 2",values:[35,30,4.5]},{label:"Sem 3",values:[38,33,4.8]},{label:"Sem 4",values:[42,36,5.1]}];
  const topCli=[
    {n:"Donaris Joias",r:"R$ 156.234",o:"36.1%",cl:"5.2%",st:"Ativo",sp:[100,120,135,150,156]},
    {n:"AchaTudo Store",r:"R$ 124.567",o:"34.2%",cl:"4.8%",st:"Ativo",sp:[80,90,100,115,124]},
    {n:"EPORTH Energia",r:"R$ 89.345",o:"28.7%",cl:"3.1%",st:"Ativo",sp:[50,60,72,80,89]},
    {n:"Clube Rock",r:"R$ 67.891",o:"31.5%",cl:"3.9%",st:"Pausado",sp:[90,85,78,72,68,67]},
    {n:"Oak Vintage",r:"R$ 43.123",o:"25.3%",cl:"2.4%",st:"Rascunho",sp:[45,44,43,43,43,43]},
  ];
  const sm={Ativo:{bg:DS.colors.sem.posBg,t:DS.colors.sem.posText,b:DS.colors.sem.posBorder},Pausado:{bg:DS.colors.sem.warnBg,t:DS.colors.sem.warnText,b:DS.colors.sem.warnBorder},Rascunho:{bg:DS.colors.sem.neutBg,t:DS.colors.sem.neutText,b:DS.colors.sem.neutBorder}};

  const [period, setPeriod] = useState(2);
  const periods = [
    {l:"Hoje",range:"20 mar 2026"},
    {l:"7D",range:"14–20 mar 2026"},
    {l:"30D",range:"19 fev–20 mar 2026"},
    {l:"90D",range:"21 dez–20 mar 2026"},
  ];
  const [showCustom, setShowCustom] = useState(false);

  return <div style={{background:DS.colors.gray[50],minHeight:"100vh"}}>
    {/* Top bar */}
    <div style={{background:DS.colors.gray.white,borderBottom:`1px solid ${DS.colors.border}`,padding:`${DS.s[4]}px ${DS.s[8]}px`}}>
      {/* Row 1: Title + Actions */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:DS.s[3]}}>
          <span style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.02em"}}>Dashboard</span>
          <span style={{fontSize:13,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>Olá, Victor</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
          <button style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.gray.white,color:DS.colors.gray[500],border:`1px solid ${DS.colors.border}`,transition:DS.t}}>{Icons.dl(14)} Exportar</button>
          <button style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.gray.white,color:DS.colors.gray[500],border:`1px solid ${DS.colors.border}`,transition:DS.t}}>{Icons.bell(14)}</button>
        </div>
      </div>
      {/* Row 2: Date range bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:DS.s[3]}}>
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
          {/* Period presets */}
          <div style={{display:"flex",gap:2,background:DS.colors.gray[50],padding:2,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`}}>
            {periods.map((p,i)=><button key={p.l} onClick={()=>{setPeriod(i);setShowCustom(false)}} style={{padding:"5px 14px",borderRadius:DS.r.sm-1,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:period===i&&!showCustom?DS.colors.gray[900]:"transparent",color:period===i&&!showCustom?"#fff":DS.colors.gray[500],border:"none"}}>{p.l}</button>)}
          </div>
          {/* Custom range trigger */}
          <button onClick={()=>setShowCustom(!showCustom)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:showCustom?DS.colors.brand.blue50:"transparent",color:showCustom?DS.colors.brand.blueLight:DS.colors.gray[500],border:`1px solid ${showCustom?DS.colors.brand.blue100:DS.colors.border}`}}>
            {Icons.target(13)} Personalizado
          </button>
          {/* Divider */}
          <div style={{width:1,height:20,background:DS.colors.border,margin:`0 ${DS.s[1]}px`}}/>
          {/* Current range indicator */}
          <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>
            {showCustom ? "01 mar – 20 mar 2026" : periods[period].range}
          </span>
        </div>
        {/* Compare toggle */}
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
          <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>vs anterior</span>
          <div style={{width:32,height:18,borderRadius:DS.r.pill,background:DS.colors.brand.blueLight,position:"relative",cursor:"pointer"}}>
            <div style={{width:14,height:14,background:"#fff",borderRadius:"50%",position:"absolute",top:2,right:2,boxShadow:DS.shadow.sm}}/>
          </div>
        </div>
      </div>
      {/* Custom range panel (collapsed by default) */}
      {showCustom && <div style={{marginTop:DS.s[3],paddingTop:DS.s[3],borderTop:`1px solid ${DS.colors.border}`,display:"flex",gap:DS.s[4],alignItems:"flex-start"}}>
        {/* Quick presets list */}
        <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:140}}>
          {["Hoje","Ontem","Últimos 7 dias","Últimos 30 dias","Este mês","Mês passado","Últimos 90 dias","Este trimestre"].map((pr,i)=><button key={pr} style={{padding:"5px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,cursor:"pointer",textAlign:"left",border:"none",transition:DS.t,background:i===3?DS.colors.brand.blue50:"transparent",color:i===3?DS.colors.brand.blueLight:DS.colors.gray[500],fontWeight:i===3?500:400}} onMouseEnter={e=>{if(i!==3)e.currentTarget.style.background="rgba(0,0,0,0.02)"}} onMouseLeave={e=>{if(i!==3)e.currentTarget.style.background="transparent"}}>{pr}</button>)}
        </div>
        {/* Mini calendar placeholder (2 months side by side) */}
        <div style={{display:"flex",gap:DS.s[4],flex:1}}>
          {["Fevereiro 2026","Março 2026"].map((month,mi)=><div key={mi} style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:DS.colors.gray[700],fontFamily:DS.f.sans,textAlign:"center",marginBottom:DS.s[2]}}>{month}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
              {["D","S","T","Q","Q","S","S"].map((d,di)=><div key={di} style={{fontSize:10,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,textAlign:"center",padding:3}}>{d}</div>)}
              {/* Sample days */}
              {Array.from({length:mi===0?28:20},(_,d)=>d+1).map(d=>{
                const isInRange = mi===1 && d>=1 && d<=20;
                const isStart = mi===1 && d===1;
                const isEnd = mi===1 && d===20;
                const isToday = mi===1 && d===20;
                return <div key={d} style={{fontSize:11,fontFamily:DS.f.mono,textAlign:"center",padding:"4px 0",borderRadius:isStart||isEnd?DS.r.sm:2,cursor:"pointer",
                  background:isStart||isEnd?DS.colors.brand.blueLight:isInRange?DS.colors.brand.blue50:"transparent",
                  color:isStart||isEnd?"#fff":isToday?DS.colors.brand.blueLight:isInRange?DS.colors.brand.blue:DS.colors.gray[600],
                  fontWeight:isToday||isStart||isEnd?600:400,
                }}>{d}</div>;
              })}
            </div>
          </div>)}
        </div>
        {/* Inputs + Apply */}
        <div style={{display:"flex",flexDirection:"column",gap:DS.s[2],minWidth:140}}>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:2}}>De</div>
            <input defaultValue="01/03/2026" style={{width:"100%",padding:"5px 8px",fontSize:12,fontFamily:DS.f.mono,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.sm,color:DS.colors.gray[700],boxSizing:"border-box"}}/>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:2}}>Até</div>
            <input defaultValue="20/03/2026" style={{width:"100%",padding:"5px 8px",fontSize:12,fontFamily:DS.f.mono,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.sm,color:DS.colors.gray[700],boxSizing:"border-box"}}/>
          </div>
          <button style={{marginTop:DS.s[2],padding:"7px 0",borderRadius:DS.r.sm,fontSize:12,fontWeight:600,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.brand.blueLight,color:"#fff",border:"none",transition:DS.t}}>Aplicar</button>
          <button onClick={()=>setShowCustom(false)} style={{padding:"5px 0",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:"transparent",color:DS.colors.gray[500],border:"none"}}>Cancelar</button>
        </div>
      </div>}
    </div>

    <div style={{padding:DS.s[6],maxWidth:1280,margin:"0 auto"}}>

      {/* ROW 1: 3 KPI Cards + Highlight Card */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:DS.s[4],marginBottom:DS.s[6]}}>
        {/* Card 1: Receita Total — normal */}
        <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,padding:`${DS.s[4]}px ${DS.s[6]}px`,border:`1px solid ${DS.colors.border}`,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Receita Total</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div style={{fontSize:32,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1}}>R$ 2.28M</div>
              <Spark data={[1.4,1.5,1.6,1.7,1.8,1.9,2.0,2.05,2.1,2.2,2.28]} color={DS.colors.sem.posText} w={64} h={28}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:DS.s[3]}}>
            <span style={{color:DS.colors.sem.posText}}>{Icons.arrowUp(14)}</span>
            <span style={{fontSize:13,fontWeight:500,fontFamily:DS.f.mono,color:DS.colors.sem.posText}}>+34.2%</span>
            <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginLeft:4}}>vs anterior</span>
          </div>
        </div>

        {/* Card 2: Receita Campanhas — normal */}
        <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,padding:`${DS.s[4]}px ${DS.s[6]}px`,border:`1px solid ${DS.colors.border}`,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Receita Campanhas</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div style={{fontSize:32,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1}}>R$ 1.28M</div>
              <Spark data={[0.8,0.9,0.85,1.0,1.1,1.05,1.15,1.2,1.18,1.25,1.28]} color={DS.colors.sem.posText} w={64} h={28}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:DS.s[3]}}>
            <span style={{color:DS.colors.sem.posText}}>{Icons.arrowUp(14)}</span>
            <span style={{fontSize:13,fontWeight:500,fontFamily:DS.f.mono,color:DS.colors.sem.posText}}>+22.1%</span>
            <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginLeft:4}}>vs anterior</span>
          </div>
        </div>

        {/* Card 3: Receita Automações — normal */}
        <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,padding:`${DS.s[4]}px ${DS.s[6]}px`,border:`1px solid ${DS.colors.border}`,display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Receita Automações</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div style={{fontSize:32,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1}}>R$ 1.02M</div>
              <Spark data={[1.1,1.08,1.05,1.04,1.06,1.03,1.04,1.02,1.03,1.01,1.02]} color={DS.colors.sem.negText} w={64} h={28}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginTop:DS.s[3]}}>
            <span style={{color:DS.colors.sem.negText}}>{Icons.arrowDown(14)}</span>
            <span style={{fontSize:13,fontWeight:500,fontFamily:DS.f.mono,color:DS.colors.sem.negText}}>-1.8%</span>
            <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginLeft:4}}>vs anterior</span>
          </div>
        </div>

        {/* Card 4: Taxa Média da Convertfy — Gradiente destaque */}
        <div style={{
          background:DS.colors.brand.gradient,borderRadius:DS.r.md,padding:`${DS.s[6]}px ${DS.s[6]}px`,
          color:"#fff",position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"space-between",
        }}>
          <div style={{position:"absolute",top:-40,right:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>
          <div style={{position:"absolute",bottom:-20,right:60,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.04)"}}/>
          <div>
            <div style={{fontSize:13,fontWeight:500,opacity:0.75,fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Taxa média da Convertfy</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div style={{fontSize:32,fontWeight:600,fontFamily:DS.f.sans,letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums lining-nums",lineHeight:1}}>21%</div>
              <Spark data={[15,16,17,16.5,18,18.5,19,19.5,20,20.5,21]} color="rgba(255,255,255,0.7)" w={64} h={28}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:DS.s[4]}}>
            <span style={{background:"rgba(255,255,255,0.15)",borderRadius:DS.r.pill,padding:"2px 8px",fontSize:11,fontWeight:600,letterSpacing:"0.02em"}}>↑ +3.2%</span>
            <span style={{fontSize:11,opacity:0.6}}>vs período anterior</span>
          </div>
        </div>
      </div>

      {/* ROW 2: Charts */}
      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:DS.s[4],marginBottom:DS.s[4]}}>
        <AreaChart data={rev} prev={revP} labels={mo} color={DS.colors.brand.blueLight} title="Receita Atribuída" sub="Atual vs anterior (milhares R$)" height={260} hoverData={revHover}/>
        <BarChart groups={cGroups} series={["Open %","Click %","Conv %"]} colors={[DS.colors.brand.blueLight,DS.colors.brand.blue200,DS.colors.brand.blue100]} title="Performance por Semana" height={260}/>
      </div>

      {/* ROW 3: Performance do Email + Saúde dos Clientes — side by side */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4],marginBottom:DS.s[4],alignItems:"stretch"}}>
        <EmailPerfCard />
        <HealthCard />
      </div>

      {/* ROW 4: Flow Performance — 3 cards */}
      <div style={{marginBottom:DS.s[4]}}>
        <FlowCards />
      </div>

      {/* ROW 5: Onboarding + Alertas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4],marginBottom:DS.s[4],alignItems:"start"}}>
        <OnboardingSummary />
        <AlertsCard />
      </div>

      {/* ROW 6: Full table */}
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`}}>
          <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Clientes por Receita</div>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[3]}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:8,top:7,color:DS.colors.gray[400]}}>{Icons.search(14)}</span>
              <input placeholder="Buscar cliente..." style={{padding:"6px 10px 6px 28px",fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.sm,background:DS.colors.gray.white,color:DS.colors.gray[700],outline:"none",width:180,boxSizing:"border-box"}}/>
            </div>
            <button style={{fontSize:12,fontWeight:500,color:DS.colors.brand.blueLight,background:"transparent",border:"none",cursor:"pointer",fontFamily:DS.f.sans,display:"flex",alignItems:"center",gap:4}}>Ver todos {Icons.extLink(14)}</button>
          </div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
          <thead><tr style={{background:DS.colors.gray[50]}}>
            {["Cliente","Receita","Open Rate","Click Rate","Trend","Status"].map((h,i)=><th key={i} style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,textAlign:i>=1&&i<=4?"right":"left",fontSize:12,fontWeight:600,color:DS.colors.gray[500],letterSpacing:"0.04em",textTransform:"uppercase",borderBottom:`1px solid ${DS.colors.border}`}}>{h}</th>)}
          </tr></thead>
          <tbody>{topCli.map((r,i)=>{const st=sm[r.st];const trending=r.sp[r.sp.length-1]>=r.sp[0];return <tr key={i} style={{borderBottom:i<topCli.length-1?`1px solid ${DS.colors.border}`:"none",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900]}}>{r.n}</td>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,fontWeight:500,color:DS.colors.gray[900],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.r}</td>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.o}</td>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{r.cl}</td>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,textAlign:"right"}}><Spark data={r.sp} color={trending?DS.colors.sem.posText:DS.colors.gray[400]} w={56} h={18} fill={false}/></td>
            <td style={{padding:`${DS.s[3]}px ${DS.s[4]}px`}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:DS.r.sm,background:st.bg,border:`1px solid ${st.b}`,fontSize:11,fontWeight:600,color:st.t,letterSpacing:"0.02em"}}><span style={{width:5,height:5,borderRadius:"50%",background:st.t}}/>{r.st}</span>
            </td>
          </tr>})}</tbody>
        </table>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderTop:`1px solid ${DS.colors.border}`,background:DS.colors.gray[50]}}>
          <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>5 de 248 clientes</span>
          <div style={{display:"flex",gap:DS.s[2]}}>
            <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,color:DS.colors.gray[500],cursor:"pointer"}}>Anterior</button>
            <button style={{padding:"4px 10px",borderRadius:DS.r.sm,fontSize:12,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,color:DS.colors.gray[500],cursor:"pointer"}}>Próximo</button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

function SecPagina() {
  const [activeTab,setActiveTab]=useState(0);
  const [statusTab,setStatusTab]=useState(0);
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div style={{fontSize:12,color:DS.colors.sem.infoText,fontFamily:DS.f.sans,padding:DS.s[3],background:DS.colors.sem.infoBg,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.sem.infoBorder}`}}>
      Padrões extraídos das telas reais do admin: Dashboard, Clientes, Lojas, Campanhas, Financeiro, Onboarding.
    </div>

    {/* 1. PAGE HEADER */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Page Header</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Título 22px/600 + count badge + descrição + actions. Sem icon-in-circle (padrão Shopify/Linear/Stripe). Breadcrumbs acima quando sub-página.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6]}}>
        {/* Breadcrumb example */}
        <nav style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontFamily:DS.f.sans,marginBottom:DS.s[4]}}>
          <span style={{color:DS.colors.gray[400]}}>Dashboard</span>
          <span style={{color:DS.colors.gray[300]}}>{Icons.chevRight(12)}</span>
          <span style={{color:DS.colors.gray[900],fontWeight:500}}>Clientes</span>
        </nav>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
              <span style={{fontSize:22,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,letterSpacing:"-0.02em"}}>Clientes</span>
              <span style={{fontSize:12,fontWeight:600,color:DS.colors.gray[400],fontFamily:DS.f.mono,background:DS.colors.gray[100],padding:"2px 8px",borderRadius:DS.r.pill}}>72</span>
            </div>
            <div style={{fontSize:13,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:4}}>Gerencie sua carteira e acompanhe a saúde de cada conta</div>
          </div>
          <div style={{display:"flex",gap:DS.s[2]}}>
            <button style={{padding:"8px 14px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.gray.white,color:DS.colors.gray[600],border:`1px solid ${DS.colors.border}`,display:"flex",alignItems:"center",gap:6,transition:DS.t}}>{Icons.dl(14)} Importar</button>
            <button style={{padding:"8px 14px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.brand.blueLight,color:"#fff",border:"none",display:"flex",alignItems:"center",gap:6,transition:DS.t}}>+ Novo Cliente</button>
          </div>
        </div>
      </div>
    </div>

    {/* 2. ALERT BANNER */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Alert Banner</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Bg semântico + ícone inline + texto. Sem wrappers, sem border-left. Mostrar 1 por vez. Dismiss com close.</div>
      <div style={{display:"flex",flexDirection:"column",gap:DS.s[3]}}>
        {[
          {ic:Icons.bell,text:"Lojas sem feedback agendado — agende calls para manter a saúde dos clientes",cta:"Ver lojas",bg:DS.colors.sem.warnBg,b:DS.colors.sem.warnBorder,t:DS.colors.sem.warnText},
          {ic:Icons.zap,text:"8 assinaturas vencidas totalizando R$ 29.909,30",cta:"Ver inadimplentes",bg:DS.colors.sem.negBg,b:DS.colors.sem.negBorder,t:DS.colors.sem.negText},
          {ic:Icons.send,text:"Receita gerada pela Convertfy: R$ 25.761,52 últimos 30 dias",cta:null,bg:DS.colors.sem.infoBg,b:DS.colors.sem.infoBorder,t:DS.colors.sem.infoText},
        ].map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[3]}px ${DS.s[4]}px`,borderRadius:DS.r.md,background:a.bg,border:`1px solid ${a.b}`}}>
          <span style={{color:a.t,flexShrink:0,opacity:0.8}}>{a.ic(16)}</span>
          <span style={{flex:1,fontSize:13,color:a.t,fontFamily:DS.f.sans,fontWeight:500}}>{a.text}</span>
          {a.cta && <button style={{padding:"5px 12px",borderRadius:DS.r.sm,fontSize:12,fontWeight:600,fontFamily:DS.f.sans,cursor:"pointer",background:a.t,color:a.bg,border:"none",whiteSpace:"nowrap",transition:DS.t}}>{a.cta}</button>}
          <button style={{background:"none",border:"none",cursor:"pointer",color:a.t,opacity:0.35,padding:0,display:"flex",flexShrink:0}}>{Icons.close(14)}</button>
        </div>)}
      </div>
    </div>

    {/* 3. TABS NAVIGATION */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Tabs</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>2 estilos: segmented (como period toggles da Dashboard) e underline (detalhe de página). Sem container colorido.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6],display:"flex",flexDirection:"column",gap:DS.s[6]}}>
        {/* Segmented tabs — same pattern as Dashboard period toggles */}
        <div>
          <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Segmented (com ícone)</div>
          <div style={{display:"flex",gap:DS.s[1]}}>
            {[{l:"Análise",icon:Icons.bar},{l:"Faturas",icon:Icons.dollar},{l:"Assinaturas",icon:Icons.layers},{l:"Wise",icon:Icons.extLink}].map((t,i)=><button key={i} onClick={()=>setActiveTab(i)} style={{padding:"7px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:activeTab===i?DS.colors.gray[900]:"transparent",color:activeTab===i?"#fff":DS.colors.gray[500],border:activeTab===i?"none":`1px solid ${DS.colors.border}`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{opacity:activeTab===i?0.7:0.5}}>{t.icon(14)}</span>{t.l}
            </button>)}
          </div>
        </div>
        {/* Underline tabs */}
        <div>
          <div style={{fontSize:11,fontWeight:500,color:DS.colors.gray[400],letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:DS.s[3],fontFamily:DS.f.sans}}>Underline</div>
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${DS.colors.border}`}}>
            {["Calendário","Desempenho","Copy"].map((t,i)=><button key={i} style={{padding:"8px 16px",fontSize:13,fontWeight:i===0?500:400,fontFamily:DS.f.sans,cursor:"pointer",background:"transparent",color:i===0?DS.colors.gray[900]:DS.colors.gray[500],border:"none",borderBottom:i===0?`2px solid ${DS.colors.brand.blueLight}`:"2px solid transparent",marginBottom:-1,transition:DS.t}}>{t}</button>)}
          </div>
        </div>
      </div>
    </div>

    {/* 4. STATUS TABS WITH COUNTS */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Status Tabs com Contagem</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Filtro rápido de status. Número em mono ao lado do label. Ativo = border-bottom brand.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:`${DS.s[4]}px ${DS.s[6]}px`}}>
        <div style={{display:"flex",gap:0,borderBottom:`1px solid ${DS.colors.border}`}}>
          {[{l:"Todos",n:72},{l:"Ativos",n:67},{l:"Prospect",n:3},{l:"Onboarding",n:2},{l:"Churned",n:0}].map((t,i)=><button key={i} onClick={()=>setStatusTab(i)} style={{padding:"8px 14px",fontSize:13,fontFamily:DS.f.sans,cursor:"pointer",background:"transparent",border:"none",borderBottom:statusTab===i?`2px solid ${DS.colors.brand.blueLight}`:"2px solid transparent",marginBottom:-1,display:"flex",alignItems:"center",gap:6,fontWeight:statusTab===i?500:400,color:statusTab===i?DS.colors.gray[900]:DS.colors.gray[500],transition:DS.t}}>
            {t.l}
            <span style={{fontSize:11,fontWeight:600,fontFamily:DS.f.mono,padding:"1px 6px",borderRadius:DS.r.pill,background:statusTab===i?DS.colors.brand.blue50:DS.colors.gray[100],color:statusTab===i?DS.colors.brand.blueLight:DS.colors.gray[400]}}>{t.n}</span>
          </button>)}
        </div>
      </div>
    </div>

    {/* 5. PROGRESS BAR */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Progress Bar</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Onboarding cards usam. Height 4px, bg gray-100, fill brand ou semântico. Label opcional.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6],display:"flex",flexDirection:"column",gap:DS.s[4]}}>
        {[{l:"Progresso",v:0,c:DS.colors.gray[300]},{l:"Gerando copies",v:35,c:DS.colors.brand.blueLight},{l:"Implementação",v:75,c:DS.colors.sem.posText},{l:"Completo",v:100,c:DS.colors.sem.posText}].map((p,i)=><div key={i}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12,fontFamily:DS.f.sans}}>
            <span style={{color:DS.colors.gray[600],fontWeight:500}}>{p.l}</span>
            <span style={{color:DS.colors.gray[400],fontFamily:DS.f.mono,fontWeight:500}}>{p.v}%</span>
          </div>
          <div style={{height:4,background:DS.colors.gray[100],borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${p.v}%`,background:p.c,borderRadius:2,transition:"width 300ms ease"}}/>
          </div>
        </div>)}
      </div>
    </div>

    {/* 7. KANBAN CARD */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Kanban Card</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Boards de Onboarding e Pipeline. Simplicidade do Linear: nome + sub + tags inline + progress. Sem badge de status dentro do card (a coluna já comunica o status).</div>
      <div style={{background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[4]}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:DS.s[3]}}>
          {[
            {l:"Aguardando",n:1,c:DS.colors.accent.amber,cards:[
              {name:"Convertfy Acesso",sub:"Teste222222",tags:["shopify"],prog:0,date:"27 mar."}
            ]},
            {l:"Gerando Copies",n:3,c:DS.colors.brand.blueLight,cards:[
              {name:"Bruno Pinheiro",sub:"Orto Sole",tags:["Orto Sole","shopify"],prog:0,date:"25 mar."},
              {name:"Matheus",sub:"Convertfy",tags:["TeSTE","shopify"],prog:0,date:"17 mar."},
            ]},
            {l:"Design",n:0,c:DS.colors.gray[300],cards:[]},
            {l:"Implementação",n:1,c:DS.colors.sem.posText,cards:[
              {name:"Blessed Choice",sub:"Bruna Janete",tags:["Blessed Choice"],prog:75,date:"20 mar."}
            ]},
          ].map((col,ci)=><div key={ci}>
            {/* Column header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:DS.s[3]}}>
              <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
                <span style={{fontSize:13,fontWeight:600,color:DS.colors.gray[800],fontFamily:DS.f.sans}}>{col.l}</span>
                <span style={{fontSize:11,fontWeight:600,color:DS.colors.gray[400],fontFamily:DS.f.mono,background:DS.colors.gray[100],padding:"1px 6px",borderRadius:DS.r.pill}}>{col.n}</span>
              </div>
              {col.n>0 && <span style={{color:DS.colors.gray[300],cursor:"pointer"}}>{Icons.dots(14)}</span>}
            </div>
            {/* Cards */}
            <div style={{display:"flex",flexDirection:"column",gap:DS.s[2]}}>
              {col.cards.map((card,ci2)=><div key={ci2} style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[3],transition:DS.t,cursor:"grab"}} onMouseEnter={e=>e.currentTarget.style.boxShadow=DS.shadow.sm} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div style={{fontSize:13,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:2}}>{card.name}</div>
                <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>{card.sub}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:DS.s[2]}}>
                  {card.tags.map(tag=><span key={tag} style={{padding:"1px 6px",borderRadius:DS.r.sm,fontSize:10,fontWeight:500,fontFamily:DS.f.sans,background:tag==="shopify"?DS.colors.ch.whatsappBg:DS.colors.gray[50],color:tag==="shopify"?DS.colors.ch.whatsapp:DS.colors.gray[500],border:`1px solid ${tag==="shopify"?DS.colors.ch.whatsappBorder:DS.colors.gray[200]}`}}>{tag}</span>)}
                </div>
                {/* Progress */}
                <div style={{height:3,background:DS.colors.gray[100],borderRadius:2,marginBottom:DS.s[2]}}>
                  <div style={{height:"100%",width:`${card.prog}%`,background:card.prog>50?DS.colors.sem.posText:DS.colors.brand.blueLight,borderRadius:2,transition:"width 300ms ease"}}/>
                </div>
                {/* Footer */}
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>
                  <span>{Icons.users(11)} Atribuir</span>
                  <span style={{fontFamily:DS.f.mono}}>{card.date}</span>
                </div>
              </div>)}
              {col.cards.length===0 && <div style={{padding:`${DS.s[6]}px 0`,textAlign:"center",fontSize:12,color:DS.colors.gray[300],fontFamily:DS.f.sans}}>Vazio</div>}
            </div>
          </div>)}
        </div>
      </div>
    </div>

    {/* 8. CALENDAR MINI (Month Grid) */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Calendário Mensal</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Grid 7 colunas, header com navegação mês. Eventos como mini-cards com cor de canal (Email/SMS/Push).</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        {/* Calendar header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${DS.colors.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[3]}}>
            <button style={{width:28,height:28,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:DS.colors.gray[500]}}>‹</button>
            <span style={{fontSize:16,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>Março 2026</span>
            <button style={{width:28,height:28,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:DS.colors.gray[500]}}>›</button>
            <button style={{padding:"4px 12px",borderRadius:DS.r.sm,fontSize:12,fontWeight:500,fontFamily:DS.f.sans,border:`1px solid ${DS.colors.border}`,background:DS.colors.gray.white,color:DS.colors.gray[600],cursor:"pointer"}}>Hoje</button>
          </div>
          <div style={{display:"flex",gap:DS.s[4],fontSize:11,fontFamily:DS.f.sans,color:DS.colors.gray[500]}}>
            {[{l:"Email",c:DS.colors.brand.blueLight},{l:"SMS",c:DS.colors.sem.posText},{l:"Push",c:DS.colors.ch.push}].map(ch=><span key={ch.l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:ch.c}}/>{ch.l}</span>)}
          </div>
        </div>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${DS.colors.border}`}}>
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><div key={d} style={{padding:"6px 0",textAlign:"center",fontSize:11,fontWeight:500,color:DS.colors.gray[400],fontFamily:DS.f.sans,textTransform:"uppercase",letterSpacing:"0.04em"}}>{d}</div>)}
        </div>
        {/* Calendar grid — week sample */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {/* Empty + days 1-7 */}
          {[null,2,3,4,5,6,7].map((d,i)=><div key={i} style={{minHeight:72,padding:4,borderRight:i<6?`1px solid ${DS.colors.border}`:"none",borderBottom:`1px solid ${DS.colors.border}`}}>
            {d && <div style={{fontSize:12,fontWeight:d===3?600:400,color:d===3?DS.colors.gray[900]:DS.colors.gray[500],fontFamily:DS.f.mono,marginBottom:4,display:"flex",justifyContent:"space-between"}}>
              {d}{d===2&&<span style={{fontSize:10,color:DS.colors.brand.blueLight,fontWeight:600}}>+28</span>}
            </div>}
            {d===2 && <>
              <div style={{fontSize:10,padding:"2px 5px",borderRadius:3,background:DS.colors.brand.blue50,color:DS.colors.brand.blueLight,fontWeight:500,marginBottom:2,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>Email 10:00</div>
              <div style={{fontSize:10,padding:"2px 5px",borderRadius:3,background:DS.colors.brand.blue50,color:DS.colors.brand.blueLight,fontWeight:500,marginBottom:2,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>Email 10:00</div>
            </>}
            {d===3 && <>
              <div style={{fontSize:10,padding:"2px 5px",borderRadius:3,background:DS.colors.brand.blue50,color:DS.colors.brand.blueLight,fontWeight:500,marginBottom:2}}>Email 07:00</div>
              <div style={{fontSize:10,padding:"2px 5px",borderRadius:3,background:DS.colors.ch.pushBg,color:DS.colors.ch.push,fontWeight:500,marginBottom:2}}>Push 10:00</div>
              <div style={{fontSize:10,color:DS.colors.brand.blueLight,fontWeight:600}}>+2 mais</div>
            </>}
          </div>)}
        </div>
      </div>
    </div>

    {/* 9. ACTIVITY FEED */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Activity Feed</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Timeline vertical com connector line entre items. Ícone de ação em circle + texto + actor + timestamp.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>Atividade Recente</span>
          <span style={{fontSize:12,color:DS.colors.brand.blueLight,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer"}}>Ver tudo</span>
        </div>
        {[
          {icon:Icons.users,action:'Cliente "Donaris Joias" foi atualizado',who:"Ryan Fernando",time:"3d atrás",c:DS.colors.brand.blueLight},
          {icon:Icons.send,action:'Campanha "Dia das Mães" enviada — 12.4k emails',who:"Sistema",time:"4d atrás",c:DS.colors.sem.posText},
          {icon:Icons.zap,action:'Flow "Carrinho Abandonado" ativado para AchaTudo',who:"Ryan Fernando",time:"4d atrás",c:DS.colors.accent.amber},
          {icon:Icons.users,action:'Cliente "Based 3.0" vinculado ao Asaas',who:"Ryan Fernando",time:"5d atrás",c:DS.colors.brand.blueLight},
        ].map((a,i,arr)=><div key={i} style={{display:"flex",gap:DS.s[3],padding:`${DS.s[3]}px ${DS.s[4]}px`,position:"relative"}}>
          {/* Timeline connector */}
          {i<arr.length-1 && <div style={{position:"absolute",left:32,top:44,bottom:0,width:1,background:DS.colors.gray[200]}}/>}
          <div style={{width:32,height:32,borderRadius:DS.r.pill,background:DS.colors.gray[50],display:"flex",alignItems:"center",justifyContent:"center",color:a.c,flexShrink:0,position:"relative",zIndex:1}}>{a.icon(16)}</div>
          <div style={{flex:1,minWidth:0,paddingBottom:i<arr.length-1?DS.s[3]:0}}>
            <div style={{fontSize:13,color:DS.colors.gray[800],fontFamily:DS.f.sans,lineHeight:1.4}}>{a.action}</div>
            <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:2}}>{a.who} · {a.time}</div>
          </div>
        </div>)}
      </div>
    </div>
  </div>;
}

function SecPortal() {
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div style={{fontSize:12,color:DS.colors.sem.infoText,fontFamily:DS.f.sans,padding:DS.s[3],background:DS.colors.sem.infoBg,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.sem.infoBorder}`}}>
      Componentes do portal do cliente. Cada um reutiliza os mesmos tokens e padrões de Cards, Tabela e Badges — sem exceções.
    </div>

    {/* 1. DONUT / RING — Saúde da Lista */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Saúde da Lista (Ring Chart)</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>PatternFly standard: valor central 24px/600, label 12px abaixo. Stroke 14px. Cor semântica por score. Stats ao lado com right-align mono.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4]}}>
        {[{v:80,l:"Saúde boa",c:DS.colors.sem.posText,metrics:[{l:"Tamanho da Lista",v:"11.3K"},{l:"Taxa de Opt-in",v:"100.0%"},{l:"Open Rate Médio",v:"45.5%"},{l:"Click Rate",v:"0.6%"},{l:"Unsub Rate",v:"0.23%"},{l:"Deliverability",v:"100.0%"}]},
          {v:42,l:"Requer atenção",c:DS.colors.accent.amber,metrics:[{l:"Tamanho da Lista",v:"8.1K"},{l:"Taxa de Opt-in",v:"72.3%"},{l:"Open Rate Médio",v:"18.2%"},{l:"Click Rate",v:"0.3%"},{l:"Unsub Rate",v:"1.8%"},{l:"Deliverability",v:"91.5%"}]}
        ].map((d,di)=>{
          const r=44,circ=2*Math.PI*r,off=circ-(d.v/100)*circ;
          return <div key={di} style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6],display:"flex",gap:DS.s[6],alignItems:"center"}}>
            <div style={{position:"relative",width:100,height:100,flexShrink:0}}>
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={r} fill="none" stroke={DS.colors.gray[100]} strokeWidth="14"/>
                <circle cx="50" cy="50" r={r} fill="none" stroke={d.c} strokeWidth="14" strokeLinecap="round"
                  strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 50 50)"/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:24,fontWeight:600,color:d.c,fontFamily:DS.f.sans,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{d.v}%</span>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:600,color:d.c,fontFamily:DS.f.sans,letterSpacing:"0.02em",marginBottom:DS.s[3]}}>{d.l}</div>
              {d.metrics.map((m,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:12,fontFamily:DS.f.sans,borderBottom:j<d.metrics.length-1?`1px solid ${DS.colors.border}`:"none"}}>
                <span style={{color:DS.colors.gray[500]}}>{m.l}</span>
                <span style={{color:DS.colors.gray[900],fontWeight:500,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums"}}>{m.v}</span>
              </div>)}
            </div>
          </div>;
        })}
      </div>
    </div>

    {/* 3. HORIZONTAL BAR — Email Performance */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Horizontal Bar — Email Performance</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Barra 10px com radius 5. Label esquerdo com ícone, valor right-align mono. Background track em gray-100.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[2],fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>
            <span style={{color:DS.colors.gray[400]}}>{Icons.mail(16)}</span>Email Performance
          </div>
          <div style={{display:"flex",gap:DS.s[4],fontSize:12,fontFamily:DS.f.sans}}>
            <span style={{fontWeight:500,color:DS.colors.gray[900],fontFamily:DS.f.mono}}>198.6K</span>
            <span style={{color:DS.colors.gray[400]}}>entregues</span>
          </div>
        </div>
        <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,display:"flex",flexDirection:"column",gap:DS.s[4]}}>
          {[
            {l:"Open Rate",v:45.5,c:DS.colors.brand.blueLight},
            {l:"Click Rate",v:0.6,c:DS.colors.brand.blue200},
            {l:"CTOR",v:1.4,c:DS.colors.accent.amber},
            {l:"Bounce",v:1.4,c:DS.colors.sem.negText},
          ].map((b,i)=><div key={i}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:500,color:DS.colors.gray[600],fontFamily:DS.f.sans}}>{b.l}</span>
              <span style={{fontSize:13,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums"}}>{b.v}%</span>
            </div>
            <div style={{height:10,background:DS.colors.gray[100],borderRadius:5,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(b.v/50*100,100)}%`,background:b.c,borderRadius:5,transition:"width 400ms ease"}}/>
            </div>
          </div>)}
        </div>
      </div>
    </div>

    {/* 4. INTEGRATION CARD */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Integration Card</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Avatar 36px com iniciais + nome/descrição + status badge (nosso padrão) + detalhe em mono + action. Border e radius padrão.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:DS.s[4]}}>
        {[
          {name:"Shopify",desc:"Loja e-commerce",status:"Conectado",ok:true,detail:"aokvintage.myshopify.com",action:"Editar",initials:"S",bg:DS.colors.ch.whatsapp},
          {name:"Klaviyo",desc:"Email marketing",status:"Conectado",ok:true,detail:"Private Key · Configurada",action:"Editar",initials:"K",bg:DS.colors.gray[800]},
          {name:"17track",desc:"Rastreamento",status:"Ativo",ok:true,detail:"Chave API · Gerenciada",action:"Ver Rastreamento",primary:true,initials:"17",bg:DS.colors.gray[600]},
        ].map((ig,i)=><div key={i} style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[4],display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:DS.s[3]}}>
            <div style={{display:"flex",gap:DS.s[3],alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:DS.r.md,background:ig.bg,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700,fontFamily:DS.f.sans}}>{ig.initials}</div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>{ig.name}</div>
                <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{ig.desc}</div>
              </div>
            </div>
            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:DS.r.sm,fontSize:11,fontWeight:600,letterSpacing:"0.02em",
              background:DS.colors.sem.posBg,color:DS.colors.sem.posText,border:`1px solid ${DS.colors.sem.posBorder}`
            }}><span style={{width:5,height:5,borderRadius:"50%",background:DS.colors.sem.posText}}/>{ig.status}</span>
          </div>
          <div style={{fontSize:12,color:DS.colors.gray[500],fontFamily:DS.f.mono,marginBottom:DS.s[3],flex:1}}>{ig.detail}</div>
          <button style={{width:"100%",padding:"8px 0",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            background:ig.primary?DS.colors.brand.blueLight:DS.colors.gray.white,
            color:ig.primary?"#fff":DS.colors.gray[600],
            border:ig.primary?"none":`1px solid ${DS.colors.border}`
          }}>{Icons.gear(14)} {ig.action}</button>
        </div>)}
      </div>
    </div>

    {/* 5. RANKED LIST */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Ranked List</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Top 5. Número em circle 22px brand-50, nome truncado, valor right-align em posText + mono tabular-nums. Segue padrão de tabela (no zebra, hover rgba).</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4]}}>
        {[{title:"Top Clientes",icon:Icons.users,items:[
          {n:"dr_davidsantos@outlook.com",sub:"1 pedido · R$ 981,30",v:"R$ 981,30"},
          {n:"joseeduardo262@gmail.com",sub:"1 pedido · R$ 845,21",v:"R$ 845,21"},
          {n:"marciaescher10@gmail.com",sub:"1 pedido · R$ 759,44",v:"R$ 759,44"},
          {n:"dahasthiago@gmail.com",sub:"1 pedido · R$ 715,50",v:"R$ 715,50"},
          {n:"marcello21br@gmail.com",sub:"1 pedido · R$ 551,60",v:"R$ 551,60"},
        ]},{title:"Top Produtos",icon:Icons.package,items:[
          {n:"Óculos de Sol - Kalib™ - UV400",sub:"51 unidades",v:"R$ 7,1 mil"},
          {n:"Óculos de Sol - Nova York™",sub:"37 unidades",v:"R$ 5,1 mil"},
          {n:"Armação Para Grau - Kalib 2.0™",sub:"29 unidades",v:"R$ 4 mil"},
          {n:"Óculos de Sol - Orlando™",sub:"28 unidades",v:"R$ 3,8 mil"},
          {n:"Óculos de Sol - Vintage Kant™",sub:"23 unidades",v:"R$ 3,2 mil"},
        ]}].map((list,li)=><div key={li} style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
          <div style={{padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:`1px solid ${DS.colors.border}`,display:"flex",alignItems:"center",gap:DS.s[2],fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans}}>
            <span style={{color:DS.colors.gray[400]}}>{list.icon(16)}</span>{list.title}
          </div>
          {list.items.map((item,ii)=><div key={ii} style={{display:"flex",alignItems:"center",gap:DS.s[3],padding:`${DS.s[3]}px ${DS.s[4]}px`,borderBottom:ii<list.items.length-1?`1px solid ${DS.colors.border}`:"none",transition:DS.t}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.02)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{width:22,height:22,borderRadius:DS.r.pill,background:ii<3?DS.colors.brand.blue50:DS.colors.gray[100],color:ii<3?DS.colors.brand.blueLight:DS.colors.gray[500],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,fontFamily:DS.f.mono,flexShrink:0}}>{ii+1}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[800],fontFamily:DS.f.sans,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.n}</div>
              <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{item.sub}</div>
            </div>
            <span style={{fontSize:13,fontWeight:600,color:DS.colors.sem.posText,fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{item.v}</span>
          </div>)}
        </div>)}
      </div>
    </div>

    {/* 6. METRIC PAIR — Audiência */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Metric Pair — Audiência & Clientes</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Grid 3 colunas. Ícone brand 16px + label 12px gray-400 + valor 20px/600 tabular-nums + subtitle 11px. Mesma hierarquia do type scale.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6]}}>
        <div style={{fontSize:14,fontWeight:500,color:DS.colors.gray[700],fontFamily:DS.f.sans,marginBottom:DS.s[4],display:"flex",alignItems:"center",gap:DS.s[2]}}>
          <span style={{color:DS.colors.gray[400]}}>{Icons.users(16)}</span> Audiência & Clientes
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:`${DS.s[4]}px ${DS.s[6]}px`}}>
          {[
            {icon:Icons.users,l:"Total de Leads",v:"11.3K",sub:"na lista"},
            {icon:Icons.zap,l:"Leads Engajados",v:"14.3K",sub:"100% do total"},
            {icon:Icons.pulse,l:"Taxa de Engajamento",v:"100%",sub:"engajados / total"},
            {icon:Icons.heart,l:"Novos Clientes",v:"1.1K",sub:"no período"},
            {icon:Icons.target,l:"Taxa Recorrente",v:"36.11%",sub:"compraram mais de 1x"},
          ].map((m,i)=><div key={i} style={{display:"flex",gap:DS.s[3],alignItems:"flex-start"}}>
            <span style={{color:DS.colors.brand.blueLight,marginTop:2}}>{m.icon(16)}</span>
            <div>
              <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:4}}>{m.l}</div>
              <div style={{fontSize:20,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,fontVariantNumeric:"tabular-nums lining-nums",letterSpacing:"-0.02em"}}>{m.v}</div>
              <div style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginTop:2}}>{m.sub}</div>
            </div>
          </div>)}
        </div>
      </div>
    </div>

    {/* 7. STEPPER */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Stepper — Como funciona</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Circles 32px numerados com linha conectora. Step ativo = brand, futuros = gray-200 outline.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6]}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:DS.s[6],position:"relative"}}>
          <div style={{position:"absolute",top:16,left:"16.6%",right:"16.6%",height:2,background:DS.colors.gray[200],zIndex:0}}/>
          {[
            {n:1,t:"Personalize",d:"Escolha a cor e o idioma que combinam com sua loja.",done:true},
            {n:2,t:"Instale o Script",d:"Copie o código e cole em uma página HTML da sua loja Shopify.",done:false},
            {n:3,t:"Clientes rastreiam",d:"Seus clientes consultam o rastreio em tempo real pela 17track.",done:false},
          ].map((s,i)=><div key={i} style={{textAlign:"center",position:"relative",zIndex:1}}>
            <div style={{width:32,height:32,borderRadius:DS.r.pill,background:s.done?DS.colors.brand.blueLight:DS.colors.gray.white,border:s.done?"none":`2px solid ${DS.colors.gray[200]}`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",marginBottom:DS.s[3],fontSize:14,fontWeight:600,color:s.done?"#fff":DS.colors.gray[500],fontFamily:DS.f.sans}}>{s.n}</div>
            <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[1]}}>{s.t}</div>
            <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,lineHeight:1.5,maxWidth:200,margin:"0 auto"}}>{s.d}</div>
          </div>)}
        </div>
      </div>
    </div>

    {/* 8. INFO BOX */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Info Box — Informações de Pagamento</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Background gray-50, ícones SVG em circles 24px semânticos. Para instruções e disclaimers.</div>
      <div style={{background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6]}}>
        <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[4]}}>Informações de Pagamento</div>
        <div style={{display:"flex",flexDirection:"column",gap:DS.s[3]}}>
          {[
            {ic:Icons.target,c:DS.colors.sem.posText,text:"As faturas são geradas automaticamente todo mês com base no seu plano contratado."},
            {ic:Icons.bell,c:DS.colors.accent.amber,text:"Você receberá um lembrete por email alguns dias antes do vencimento."},
            {ic:Icons.zap,c:DS.colors.sem.negText,text:"Em caso de atraso, entre em contato conosco para negociar as condições."},
          ].map((item,i)=><div key={i} style={{display:"flex",gap:DS.s[3],alignItems:"flex-start"}}>
            <span style={{width:24,height:24,borderRadius:DS.r.pill,background:item.c,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{item.ic(12)}</span>
            <span style={{fontSize:13,color:DS.colors.gray[600],fontFamily:DS.f.sans,lineHeight:1.5}}>{item.text}</span>
          </div>)}
        </div>
        <div style={{marginTop:DS.s[4],fontSize:13,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>
          Dúvidas? <span style={{color:DS.colors.brand.blueLight,fontWeight:500,cursor:"pointer"}}>Entre em contato</span>
        </div>
      </div>
    </div>

    {/* 9. FOOTER STATS */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Footer Stats</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Rodapé de conteúdo. Cards inline com ícone + label + valor, divididos por border. Timestamp right-align. Não é uma barra flat — são mini-cards dentro de um container.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:`${DS.s[3]}px ${DS.s[4]}px`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:0}}>
          {[
            {icon:Icons.users,l:"Clientes",v:"114.2K"},
            {icon:Icons.zap,l:"Novos",v:"1.1K"},
            {icon:Icons.heart,l:"Recorrentes",v:"36.11%"},
            {icon:Icons.target,l:"Leads",v:"11.3K"},
          ].map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:`0 ${DS.s[4]}px`,borderRight:i<3?`1px solid ${DS.colors.border}`:"none"}}>
            <span style={{color:DS.colors.gray[300]}}>{s.icon(14)}</span>
            <span style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>{s.l}</span>
            <span style={{fontSize:12,fontWeight:600,color:DS.colors.gray[800],fontFamily:DS.f.mono,fontVariantNumeric:"tabular-nums"}}>{s.v}</span>
          </div>)}
        </div>
        <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.mono}}>20/03/2026 19:40</span>
      </div>
    </div>
  </div>;
}

function SecExtras() {
  const [modal,setModal]=useState(false);
  const [toast,setToast]=useState(false);
  return <div style={{display:"flex",flexDirection:"column",gap:DS.s[8]}}>
    <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,padding:DS.s[3],background:DS.colors.sem.infoBg,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.sem.infoBorder}`,color:DS.colors.sem.infoText}}>
      Componentes que faltam no admin atual. Cada um mostra o spec visual + tokens corretos.
    </div>

    {/* EMPTY STATE */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Empty State</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Quando não há dados. Ícone muted 48px + título + descrição + CTA opcional.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:`${DS.s[16]}px ${DS.s[8]}px`,display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:DS.r.md,background:DS.colors.gray[50],border:`1px solid ${DS.colors.border}`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:DS.s[4],color:DS.colors.gray[300]}}>{Icons.mail(32)}</div>
        <div style={{fontSize:16,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Nenhuma campanha encontrada</div>
        <div style={{fontSize:13,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:DS.s[6],maxWidth:360}}>Crie sua primeira campanha para começar a enviar emails para seus clientes.</div>
        <button style={{padding:"10px 20px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.brand.blueLight,color:"#fff",border:"none",display:"flex",alignItems:"center",gap:6,transition:DS.t}}>{Icons.send(16)} Criar campanha</button>
      </div>
    </div>

    {/* AVATAR */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Avatar</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>3 tamanhos (24/32/40), iniciais em bg-brand-50 com text-brand, ou imagem. Border radius: pill.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6],display:"flex",alignItems:"center",gap:DS.s[6]}}>
        {[{s:24,f:10,initials:"V"},{s:32,f:12,initials:"VC"},{s:40,f:14,initials:"VCF"}].map((a,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:DS.s[2]}}>
          <div style={{width:a.s,height:a.s,borderRadius:DS.r.pill,background:DS.colors.brand.blue50,display:"flex",alignItems:"center",justifyContent:"center",color:DS.colors.brand.blueLight,fontSize:a.f,fontWeight:600,fontFamily:DS.f.sans}}>{a.initials}</div>
          <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.mono}}>{a.s}px</span>
        </div>)}
        <div style={{width:1,height:40,background:DS.colors.border}}/>
        {/* Avatar with online indicator */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:DS.s[2]}}>
          <div style={{position:"relative"}}>
            <div style={{width:40,height:40,borderRadius:DS.r.pill,background:DS.colors.brand.blue50,display:"flex",alignItems:"center",justifyContent:"center",color:DS.colors.brand.blueLight,fontSize:14,fontWeight:600,fontFamily:DS.f.sans}}>VC</div>
            <div style={{position:"absolute",bottom:0,right:0,width:10,height:10,borderRadius:"50%",background:DS.colors.sem.posText,border:`2px solid ${DS.colors.gray.white}`}}/>
          </div>
          <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>online</span>
        </div>
      </div>
    </div>

    {/* MODAL / DIALOG */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Modal / Dialog</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Overlay rgba(0,0,0,0.4), card white max-w 480, radius 8, shadow-lg. Header + body + footer.</div>
      <button onClick={()=>setModal(true)} style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.brand.blueLight,color:"#fff",border:"none",marginBottom:DS.s[4]}}>Abrir modal</button>
      {modal && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}} onClick={()=>setModal(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:DS.colors.gray.white,borderRadius:DS.r.lg,boxShadow:DS.shadow.lg,width:440,maxWidth:"90vw",overflow:"hidden"}}>
          <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,borderBottom:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:16,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>Confirmar exclusão</div>
            <button onClick={()=>setModal(false)} style={{background:"none",border:"none",cursor:"pointer",color:DS.colors.gray[400],padding:4,display:"flex"}}>{Icons.close(16)}</button>
          </div>
          <div style={{padding:`${DS.s[6]}px`,fontSize:14,color:DS.colors.gray[600],fontFamily:DS.f.sans,lineHeight:1.6}}>
            Tem certeza que deseja excluir <strong style={{color:DS.colors.gray[900]}}>Donaris Joias</strong>? Esta ação não pode ser desfeita.
          </div>
          <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,borderTop:`1px solid ${DS.colors.border}`,display:"flex",justifyContent:"flex-end",gap:DS.s[2],background:DS.colors.gray[50]}}>
            <button onClick={()=>setModal(false)} style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.gray.white,color:DS.colors.gray[600],border:`1px solid ${DS.colors.border}`}}>Cancelar</button>
            <button onClick={()=>setModal(false)} style={{padding:"8px 16px",borderRadius:DS.r.sm,fontSize:13,fontWeight:500,fontFamily:DS.f.sans,cursor:"pointer",background:DS.colors.sem.negBg,color:DS.colors.sem.negText,border:`1px solid ${DS.colors.sem.negBorder}`}}>Excluir</button>
          </div>
        </div>
      </div>}
    </div>

    {/* TOAST / NOTIFICATION */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Toast / Notification</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Bottom-right, max-w 380, shadow-md, auto-dismiss 5s. 4 variantes semânticas.</div>
      <div style={{display:"flex",flexDirection:"column",gap:DS.s[3]}}>
        {[
          {type:"success",ic:Icons.target,title:"Campanha enviada",desc:"12.450 emails processados com sucesso.",bg:DS.colors.sem.posBg,b:DS.colors.sem.posBorder,t:DS.colors.sem.posText},
          {type:"error",ic:Icons.zap,title:"Falha no envio",desc:"Verifique a autenticação do domínio.",bg:DS.colors.sem.negBg,b:DS.colors.sem.negBorder,t:DS.colors.sem.negText},
          {type:"warning",ic:Icons.bell,title:"Deliverability baixa",desc:"Taxa caiu para 78% — revisar lista.",bg:DS.colors.sem.warnBg,b:DS.colors.sem.warnBorder,t:DS.colors.sem.warnText},
          {type:"info",ic:Icons.send,title:"Sync completo",desc:"Klaviyo sincronizado há 2 min.",bg:DS.colors.sem.infoBg,b:DS.colors.sem.infoBorder,t:DS.colors.sem.infoText},
        ].map((n,i)=><div key={i} style={{background:n.bg,border:`1px solid ${n.b}`,borderRadius:DS.r.md,padding:`${DS.s[3]}px ${DS.s[4]}px`,display:"flex",gap:DS.s[3],alignItems:"flex-start",maxWidth:380,boxShadow:DS.shadow.md}}>
          <span style={{width:24,height:24,borderRadius:DS.r.pill,background:n.t,color:n.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n.ic(12)}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:n.t,fontFamily:DS.f.sans}}>{n.title}</div>
            <div style={{fontSize:12,color:n.t,fontFamily:DS.f.sans,opacity:0.8,marginTop:2}}>{n.desc}</div>
          </div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:n.t,opacity:0.4,padding:2,flexShrink:0,display:"flex"}}>{Icons.close(12)}</button>
        </div>)}
      </div>
    </div>

    {/* SKELETON / LOADING */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Skeleton / Loading</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Background gray-100 com pulse animation. Mesmo radius e tamanho do elemento final.</div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        {/* Skeleton KPI row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:DS.s[4],padding:DS.s[4]}}>
          {[0,1,2,3].map(i=><div key={i} style={{padding:DS.s[4],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`}}>
            <div style={{width:"60%",height:12,background:DS.colors.gray[100],borderRadius:4,marginBottom:DS.s[3],animation:"pulse 1.8s ease-in-out infinite"}}/>
            <div style={{width:"45%",height:28,background:DS.colors.gray[100],borderRadius:4,marginBottom:DS.s[2],animation:"pulse 1.8s ease-in-out infinite"}}/>
            <div style={{width:"30%",height:12,background:DS.colors.gray[100],borderRadius:4,animation:"pulse 1.8s ease-in-out infinite"}}/>
          </div>)}
        </div>
        {/* Skeleton table rows */}
        <div style={{borderTop:`1px solid ${DS.colors.border}`,padding:DS.s[4]}}>
          {[0,1,2].map(i=><div key={i} style={{display:"flex",gap:DS.s[4],alignItems:"center",padding:`${DS.s[3]}px 0`,borderBottom:i<2?`1px solid ${DS.colors.border}`:"none"}}>
            <div style={{width:120,height:12,background:DS.colors.gray[100],borderRadius:4,animation:"pulse 1.8s ease-in-out infinite"}}/>
            <div style={{flex:1}}/>
            <div style={{width:80,height:12,background:DS.colors.gray[100],borderRadius:4,animation:"pulse 1.8s ease-in-out infinite"}}/>
            <div style={{width:60,height:12,background:DS.colors.gray[100],borderRadius:4,animation:"pulse 1.8s ease-in-out infinite"}}/>
            <div style={{width:48,height:20,background:DS.colors.gray[100],borderRadius:DS.r.sm,animation:"pulse 1.8s ease-in-out infinite"}}/>
          </div>)}
        </div>
      </div>
    </div>

    {/* TOOLTIP */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Tooltip</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>Background gray-800, text white, 12px, radius 6, padding 6px 10px. Para gráficos: white bg + shadow-md.</div>
      <div style={{background:DS.colors.gray.white,borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,padding:DS.s[6],display:"flex",gap:DS.s[8],alignItems:"flex-start"}}>
        {/* Dark tooltip */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:DS.s[2]}}>
          <div style={{background:DS.colors.gray[800],color:DS.colors.gray.white,fontSize:12,fontFamily:DS.f.sans,padding:"6px 10px",borderRadius:DS.r.sm,boxShadow:DS.shadow.sm,whiteSpace:"nowrap"}}>Receita total atribuída</div>
          <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>UI tooltip (dark)</span>
        </div>
        {/* Chart tooltip */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:DS.s[2]}}>
          <div style={{background:DS.colors.gray.white,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.md,padding:`${DS.s[2]}px ${DS.s[3]}px`,boxShadow:DS.shadow.md,fontFamily:DS.f.sans}}>
            <div style={{fontSize:12,fontWeight:500,color:DS.colors.gray[900],marginBottom:4}}>2026-03-16</div>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:DS.colors.gray[600]}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:DS.colors.brand.blueLight}}/>R$ 461,89
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:DS.colors.gray[600],marginTop:2}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:DS.colors.sem.posText}}/>3 recuperações
            </div>
          </div>
          <span style={{fontSize:11,color:DS.colors.gray[400],fontFamily:DS.f.sans}}>Chart tooltip (light)</span>
        </div>
      </div>
    </div>

    {/* DROPDOWN / SELECT */}
    <div>
      <div style={{fontSize:13,fontWeight:500,color:DS.colors.gray[700],marginBottom:DS.s[2],fontFamily:DS.f.sans}}>Dropdown / Select</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],marginBottom:DS.s[4],fontFamily:DS.f.sans}}>White bg, shadow-md, radius 8, border. Item hover: gray-50. Active: brand-50 + brand text.</div>
      <div style={{display:"flex",gap:DS.s[6],alignItems:"flex-start"}}>
        {/* Trigger */}
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.sm,cursor:"pointer",fontSize:13,fontFamily:DS.f.sans,color:DS.colors.gray[700],background:DS.colors.gray.white}}>
            {Icons.filter(14)} Período: Últimos 30 dias
            <span style={{color:DS.colors.gray[400],marginLeft:4}}>▾</span>
          </div>
        </div>
        {/* Open state */}
        <div style={{background:DS.colors.gray.white,border:`1px solid ${DS.colors.border}`,borderRadius:DS.r.md,boxShadow:DS.shadow.md,overflow:"hidden",width:200}}>
          {["Hoje","Últimos 7 dias","Últimos 30 dias","Últimos 90 dias","Custom"].map((opt,i)=><div key={i} style={{padding:"8px 12px",fontSize:13,fontFamily:DS.f.sans,cursor:"pointer",transition:DS.t,background:i===2?DS.colors.brand.blue50:"transparent",color:i===2?DS.colors.brand.blueLight:DS.colors.gray[600],fontWeight:i===2?500:400,borderBottom:i<4?`1px solid ${DS.colors.border}`:"none"}} onMouseEnter={e=>{if(i!==2)e.target.style.background=DS.colors.gray[50]}} onMouseLeave={e=>{if(i!==2)e.target.style.background="transparent"}}>{opt}{i===2&&<span style={{float:"right",fontSize:11}}>✓</span>}</div>)}
        </div>
      </div>
    </div>
  </div>;
}

function SecOrientacoes() {
  const Rule = ({num, title, desc, doList, dontList}) => (
    <div style={{padding:`${DS.s[6]}px 0`, borderBottom:`1px solid ${DS.colors.border}`}}>
      <div style={{display:"flex",alignItems:"baseline",gap:DS.s[3],marginBottom:DS.s[3]}}>
        <span style={{fontSize:11,fontWeight:700,fontFamily:DS.f.mono,color:DS.colors.brand.blueLight,background:DS.colors.brand.blue50,padding:"2px 8px",borderRadius:DS.r.sm,flexShrink:0}}>{num}</span>
        <span style={{fontSize:16,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans}}>{title}</span>
      </div>
      <div style={{fontSize:13,color:DS.colors.gray[600],fontFamily:DS.f.sans,lineHeight:1.7,marginBottom:DS.s[4],marginLeft:40}}>{desc}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4],marginLeft:40}}>
        <div style={{padding:DS.s[4],borderRadius:DS.r.md,background:DS.colors.sem.posBg,border:`1px solid ${DS.colors.sem.posBorder}`}}>
          <div style={{fontSize:12,fontWeight:600,color:DS.colors.sem.posText,fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>✓ Fazer</div>
          {doList.map((d,i)=><div key={i} style={{fontSize:12,color:DS.colors.gray[700],fontFamily:DS.f.sans,lineHeight:1.6,marginBottom:4}}>→ {d}</div>)}
        </div>
        <div style={{padding:DS.s[4],borderRadius:DS.r.md,background:DS.colors.sem.negBg,border:`1px solid ${DS.colors.sem.negBorder}`}}>
          <div style={{fontSize:12,fontWeight:600,color:DS.colors.sem.negText,fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>✗ Evitar</div>
          {dontList.map((d,i)=><div key={i} style={{fontSize:12,color:DS.colors.gray[700],fontFamily:DS.f.sans,lineHeight:1.6,marginBottom:4}}>→ {d}</div>)}
        </div>
      </div>
    </div>
  );

  return <div style={{display:"flex",flexDirection:"column",gap:0}}>
    {/* Header */}
    <div style={{padding:`${DS.s[4]}px ${DS.s[6]}px`,background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,marginBottom:DS.s[6]}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Orientações para Redesign — 20 Regras + Migração</div>
      <div style={{fontSize:13,color:DS.colors.gray[500],fontFamily:DS.f.sans,lineHeight:1.7}}>
        Todas as decisões de design, anti-padrões de IA, regras de dark mode, ordem de migração, e breaking changes. Cada regra existe por um motivo pesquisado e testado — este é o documento de referência para o time de desenvolvimento manter a qualidade durante a implementação.
      </div>
    </div>

    <Rule num="01" title="Cor é informação, não decoração"
      desc="O erro mais comum de UIs geradas por IA é usar cor em excesso. Gradientes em backgrounds de cards, cada KPI com uma cor diferente, badges saturados com texto branco. Na Convertfy, 90% da interface é grayscale. O azul aparece APENAS quando comunica algo: ação (botão), estado ativo (sidebar), ou link."
      doList={[
        "Gradiente apenas no CTA principal e logo da sidebar",
        "Cards KPI: fundo branco, borda rgba(0,0,0,0.08)",
        "Cor semântica: verde=positivo, vermelho=negativo, só",
        "Badges: fundo muted (#ECFDF5) + texto escuro (#065F46)",
      ]}
      dontList={[
        "Gradiente em backgrounds de cards ou seções",
        "Cada card com cor de destaque diferente (rainbow)",
        "Badges com fundo saturado e texto branco",
        "Azul em texto body ou labels normais",
      ]}
    />

    <Rule num="02" title="Espaçamento é o design — use tokens, não valores aleatórios"
      desc="IA gera paddings e margins inconsistentes: 13px aqui, 17px ali, 22px acolá. Isso cria uma sensação subconsciente de amadorismo. A Convertfy usa grid rígido de 8px (space-2=8, space-4=16, space-6=24, space-8=32). Nunca hardcode valores fora da escala."
      doList={[
        "Padding interno de cards: space-4 (16px) ou space-6 (24px)",
        "Gap entre cards: space-4 (16px)",
        "Padding interno ≤ margem entre elementos (Gestalt)",
        "Testar com DevTools: todo valor deve ser múltiplo de 4 ou 8",
      ]}
      dontList={[
        "Valores quebrados: padding: 13px, margin: 17px",
        "Espaçamentos diferentes entre cards na mesma row",
        "Padding maior que gap entre elementos (quebra agrupamento)",
        "Ajustar 'no olho' — sempre usar tokens",
      ]}
    />

    <Rule num="03" title="Tipografia: 3 pesos, 2 fontes, tabular-nums em todo número"
      desc="IA aplica pesos aleatórios (300, 400, 500, 600, 700, 800) sem hierarquia. Na Convertfy: Inter 400 (body), 500 (labels), 600 (headings/KPIs). Geist Mono APENAS em tabelas. KPI values: Inter 32px/600 ls: -0.03em. Badges: Inter 11px/600 ls: 0.02em."
      doList={[
        "font-variant-numeric: tabular-nums lining-nums em TUDO que é número",
        "KPI hero: Inter 32px, weight 600, ls: -0.03em",
        "Badges: Inter 11px, weight 600, ls: 0.02em (compacto e assertivo)",
        "Table headers: 12px, weight 500, uppercase, ls: 0.04em",
      ]}
      dontList={[
        "Mais de 3 pesos diferentes na mesma tela",
        "Monospace para KPI values (parece terminal)",
        "Tamanhos fora da escala (11, 12, 13, 14, 16, 18, 24, 32)",
        "Numbers com fontes proporcionais em colunas de tabela",
      ]}
    />

    <Rule num="04" title="Ícones: um estilo, um stroke, zero emojis"
      desc='IA mistura Lucide na sidebar, Material nos botões, e emojis (📊💰📈) nos cards. Isso destrói a consistência visual instantaneamente. A Convertfy usa ícones outlined 24×24 com 2px stroke e caps arredondados — o mesmo estilo visual que Klaviyo, Yampi e Shopify usam.'
      doList={[
        "Todos os ícones: 24×24 viewBox, stroke 2px, rounded",
        "Tamanhos: 16px (tabela), 20px (botões), 24px (nav)",
        "Cor via currentColor (herda do pai)",
        "Gap ícone→texto: 8px padrão, 4px compacto",
      ]}
      dontList={[
        "Emojis como substituto de ícones (📊 💰 📈 🎯)",
        "Misturar outlined e filled no mesmo contexto",
        "Ícones de bibliotecas diferentes na mesma tela",
        "Ícones decorativos sem função (só pra preencher espaço)",
      ]}
    />

    <Rule num="05" title="Border-radius: 4 tokens, sem variação"
      desc="IA aplica rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl e rounded-full aleatoriamente. Isso cria inconsistência visual. A Convertfy tem APENAS 4 tokens: 6px (inputs/botões), 8px (cards), 12px (modals/dialogs), 9999px (pills/badges)."
      doList={[
        "Inputs e botões: border-radius: 6px (sm)",
        "Cards, containers: border-radius: 8px (md)",
        "Modals, dialogs, dropdowns: border-radius: 12px (lg)",
        "Badges pill e avatares: border-radius: 9999px (pill)",
      ]}
      dontList={[
        "Rounded-2xl ou rounded-3xl em cards (faz parecer toy)",
        "Rounded-full em containers (deforma conteúdo)",
        "Misturar 8px, 16px, 20px na mesma tela",
        "Border-radius diferente em cards adjacentes",
      ]}
    />

    <Rule num="06" title="Shadows: layered e quase invisíveis — borders fazem o trabalho"
      desc="IA aplica box-shadow pesado em tudo. Profissionais (Stripe, Shopify) usam shadows LAYERED com opacity 0.03-0.06. Na Convertfy, o default é border 1px solid rgba(0,0,0,0.08). Shadows existem APENAS para elevation com 2+ camadas sobrepostas."
      doList={[
        "Default: border 1px solid rgba(0,0,0,0.08)",
        "Shadow sm (tooltips): 2 layers, max 0.05 alpha",
        "Shadow md (dropdowns): 2 layers, max 0.05 alpha",
        "Shadow lg (modals): 3 layers, max 0.06 alpha",
      ]}
      dontList={[
        "Shadow de 1 camada só (ex: 0 4px 12px rgba(0,0,0,0.15))",
        "Opacity acima de 0.08 em qualquer shadow",
        "Shadow em cards normais do layout (usar border)",
        "Shadow + border simultaneamente (redundante)",
      ]}
    />

    <Rule num="07" title="Tabelas: números à direita, texto à esquerda, sem zebra"
      desc="IA alinha tudo à esquerda e adiciona zebra-striping. Profissionais alinham números à direita para comparação visual instantânea, usam hover sutil rgba(0,0,0,0.02), e headers sticky com background #F8FAFC."
      doList={[
        "Colunas de texto: text-align left",
        "Colunas numéricas: text-align right + tabular-nums",
        "Header: 12px, medium, uppercase, ls: 0.04em, bg: gray-50",
        "Paginação com total (ex: '5 de 248 clientes')",
      ]}
      dontList={[
        "Alinhar números à esquerda (impossibilita comparação)",
        "Zebra-striping (visual poluído, desnecessário)",
        "Linhas com heights inconsistentes",
        "Sem overflow menu (⋯) para ações por linha",
      ]}
    />

    <Rule num="08" title="Transitions: 150ms ease-out, nada mais"
      desc="IA ou não coloca transition (jumps abruptos) ou usa 300-500ms que parecem lentos. O padrão da Convertfy é 150ms com cubic-bezier(0.16, 1, 0.3, 1) — a mesma curva que Linear e Vercel usam."
      doList={[
        "Hover: 150ms ease-out para background/color",
        "Panel transitions: 200ms ease-out",
        "Curva: cubic-bezier(0.16, 1, 0.3, 1)",
        "Focus ring: box-shadow 0 0 0 2px #4E62D8 (OBRIGATÓRIO em todos os interativos)",
      ]}
      dontList={[
        "Transitions acima de 300ms (parecem lentos)",
        "ease-in para UI (sensação de lag)",
        "Scale transforms em hover de cards (efeito toy)",
        "Remover focus ring/outline (acessibilidade obrigatória — WCAG 2.4.7)",
      ]}
    />

    <Rule num="09" title="Dados reais, não placeholder mágicos"
      desc='IA gera números redondos perfeitos: "R$ 100.000", "50%", "1.000 clientes". Dados reais são assimétricos: "R$ 124.567,89", "34.2%", "248". Sempre usar dados que pareçam extraídos de um banco real.'
      doList={[
        "Valores assimétricos: R$ 842.567, 32.5%, 248",
        "Nomes reais de clientes (AchaTudo, Donaris Joias)",
        "Variações negativas existem: −2.1%, −7.63%",
        "Sparklines com dados irregulares, não lineares",
      ]}
      dontList={[
        "Números redondos: R$ 100.000, 50%, 1.000",
        "Nomes genéricos: 'Empresa A', 'Loja 1', 'Cliente X'",
        "Todos os deltas positivos (irreal, perde credibilidade)",
        "Gráficos com curvas perfeitas (parecem inventados)",
      ]}
    />

    <Rule num="10" title="Hierarquia de informação: pirâmide invertida"
      desc="IA coloca elementos sem prioridade — tudo no mesmo nível visual. Dashboards profissionais usam pirâmide invertida: KPIs no topo (responde 'está tudo bem?' em 5 segundos), gráficos de tendência no meio (mostra 'por quê'), tabela de detalhe embaixo (permite drill-down)."
      doList={[
        "Nível 1: 4 KPI cards — full-width, acima do fold",
        "Nível 2: 2 charts lado a lado (area + bar)",
        "Nível 3: Tabela com sparklines e paginação",
        "Sidebar 240px com agrupamento de seções",
      ]}
      dontList={[
        "Cards e gráficos misturados sem hierarquia",
        "Mais de 7-8 elementos visuais por viewport",
        "Tabela acima dos gráficos (detail before context)",
        "Sidebar com mais de 10 items sem agrupamento",
      ]}
    />

    <Rule num="11" title="Comparação período-a-período: solid + dashed"
      desc="Para mostrar evolução, nunca plotar apenas o período atual. Sempre incluir o período anterior como referência. Período atual: linha sólida na cor brand blue. Período anterior: linha dashed em gray-300, opacity 0.45."
      doList={[
        "Atual: solid 2px, cor brand.blueLight",
        "Anterior: dashed 1.5px, cor gray-300, opacity 0.45",
        "Legenda com sample de cada estilo de linha",
        "Delta no KPI card acima do chart",
      ]}
      dontList={[
        "Duas linhas sólidas de cores diferentes (confuso)",
        "Mais de 2 períodos no mesmo chart",
        "Chart sem legenda identificando as linhas",
        "Delta sem indicar o período de comparação",
      ]}
    />

    <Rule num="12" title="O teste final: 'Isso parece gerado por IA?'"
      desc="Antes de enviar qualquer tela para review, aplique este checklist mental. Se a resposta for 'sim' para qualquer item, refatore."
      doList={[
        "Tem personalidade da marca Convertfy (gradiente, não genérico)?",
        "Espaçamentos são todos múltiplos de 4 ou 8?",
        "Apenas 3 pesos tipográficos na tela?",
        "Todos os ícones são do mesmo sistema (outlined 2px)?",
      ]}
      dontList={[
        "Tem emojis no lugar de ícones?",
        "Tem mais de 2 cores de destaque (fora semantic)?",
        "Tem gradiente em mais de 1 elemento?",
        "Tem border-radius inconsistente entre cards?",
      ]}
    />

    <Rule num="13" title="Dark mode: redesign, não inversão"
      desc="Dark mode não é filter: invert(). É um redesign completo com tokens semânticos separados. Superfícies elevadas = mais claras. Cores desaturadas. Texto off-white."
      doList={[
        "3 camadas de superfície: bg → surface → surfaceEl (mais clara = mais elevada)",
        "Texto off-white #EAEDF3 (nunca #FFFFFF puro — causa vibração)",
        "Borders rgba(255,255,255,0.08) — branco alpha, não cinza",
        "Brand desaturado: #7B8CEA no dark (não #4E62D8 do light)",
        "Semânticas: tons 200-range p/ texto, 900-range p/ bg",
        "Testar contraste WCAG 4.5:1 em TODOS os níveis de elevação",
      ]}
      dontList={[
        "Inverter cores automaticamente (filter/invert proibido)",
        "Usar #000000 puro como fundo (usar #0F1117 — gray com blue tint)",
        "Manter as mesmas cores do light mode sem ajuste",
        "Usar shadows para hierarquia (usar surface layers + border)",
        "Usar cores saturadas — vibram contra fundo escuro",
      ]}
    />

    <Rule num="14" title="Page Header: título + ações, sem ícone decorativo"
      desc="IA sempre coloca um ícone em circle colorido (40×40 blue50) ao lado do título. Shopify, Linear, Stripe, Vercel — nenhum faz isso. O título já comunica a página. Breadcrumbs acima quando sub-página. Count badge em pill mono ao lado do título."
      doList={[
        "Título 22px/600 + count badge pill + descrição abaixo",
        "Breadcrumbs quando em sub-página (Dashboard → Clientes → Donaris)",
        "Actions à direita: botão primary + secondary",
        "Greeting inline com o título ('Olá, Victor') — não como subtítulo separado",
      ]}
      dontList={[
        "Ícone em circle colorido ao lado do título (AI tell #1)",
        "Subtítulo genérico ('Gerencie seus clientes') sem valor informativo",
        "Breadcrumbs + título com ícone + descrição (3 layers demais)",
        "Mais de 2 CTAs no header (causa decision paralysis)",
      ]}
    />

    <Rule num="15" title="Date Range: presets em segmented control + painel personalizado"
      desc="Filtros de data são o controle mais usado da dashboard. Shopify Polaris usa presets numa lista lateral + calendário duplo. Sempre mostrar qual range está ativo. Toggle de comparação para período anterior."
      doList={[
        "Presets (Hoje, 7D, 30D, 90D) em segmented control com container",
        "'Personalizado' como botão separado que expande painel com: presets lista + calendário duplo + inputs de/até + Aplicar",
        "Range ativo SEMPRE visível em texto (ex: '14–20 mar 2026')",
        "Toggle 'vs anterior' para comparação período-a-período",
        "Calendário duplo horizontal (mês atual + anterior) — padrão Shopify/Google Analytics",
      ]}
      dontList={[
        "Toggles soltos sem container visual (parecem desagrupados)",
        "Sem feedback de qual range está selecionado",
        "Dropdown genérico para selecionar período (esconde opções)",
        "Forçar o usuário a sempre abrir um date picker para ranges comuns",
      ]}
    />

    <Rule num="16" title="Componente único: 1 padrão, 1 lugar no DS"
      desc="Se um componente aparece em Cards e também em Portal, é duplicata. KPI Cards existem UMA vez na seção Cards — Portal e Dashboard apenas instanciam o mesmo pattern. Isso vale para Tags (Badges), Breadcrumbs (Page Header), Progress (Kanban)."
      doList={[
        "Definir cada componente 1 vez na seção correta",
        "Outras seções referenciam: 'Usa o padrão de KPI Card (ver Cards)'",
        "Variações de escala (32px vs 22px) = prop do mesmo componente, não componente novo",
        "Tags = definido em Badges. Breadcrumbs = definido em Page Header",
      ]}
      dontList={[
        "Mesmo componente renderizado em 2+ seções com dados diferentes",
        "Criar 'KPI Card Portal' separado de 'KPI Card Admin' (são o mesmo)",
        "Variações que quebram tokens (icon-in-circle no Portal mas não no Admin)",
        "Duplicar para 'mostrar contexto' — a referência basta",
      ]}
    />

    <Rule num="17" title="Alert Banner: flat, inline, 1 por vez"
      desc="Carbon DS (IBM), GitLab Pajamas: banners são flat — fundo semântico + ícone inline + texto + CTA. Sem border-left accent, sem icon wrappers, sem empilhar múltiplos. Dismiss com close button. O terceiro variante (info sem CTA) valida que o componente funciona sem ação."
      doList={[
        "Background semântico + ícone SVG inline 16px + texto em 1 linha",
        "CTA com bg=textColor invertido (text vira fundo, bg vira texto)",
        "Close button Icons.close(14) sempre presente",
        "Mostrar 1 banner por vez — priorizar por severidade",
      ]}
      dontList={[
        "Icon em circle preenchido (28px pill) — pesado demais",
        "Border-left 3px accent (padrão de 2018, ultrapassado)",
        "Empilhar 3+ banners (sobrecarga cognitiva)",
        "Title + description separados (juntar em 1 frase)",
      ]}
    />

    <Rule num="18" title="Tabs: segmented control ou underline — sem container cinza"
      desc="Pill tabs com container gray-50 ao redor é AI tell #1 de tabs. Shopify, Linear, Vercel usam botões diretos (segmented) ou underline. A Convertfy usa o mesmo padrão dos period toggles da Dashboard: ativo = gray-900 fill branco, inativo = transparente com border."
      doList={[
        "Segmented: botões lado a lado, ativo = gray-900 fill, gap: 2px",
        "Underline: border-bottom 2px brand no ativo, texto gray-900",
        "Status tabs: count em pill badge (11px mono, bg blue50 quando ativo)",
        "Máximo 5-6 tabs visíveis — usar scroll ou dropdown para mais",
      ]}
      dontList={[
        "Container cinza (gray-50) ao redor de pill tabs",
        "Ativo com white bg + shadow (parece card flutuando)",
        "Texto ativo em brand color no underline (usar gray-900, só a linha é brand)",
        "Misturar segmented e underline na mesma página",
      ]}
    />

    <Rule num="19" title="Kanban: dados unificados, sem frankenstein"
      desc="IA hardcoda cada coluna (ci===0, ci===1...) com JSX diferente. Impossível de manter. Cada coluna deve ter a mesma estrutura de dados: {l, n, c, cards:[]}. Cada card: {name, sub, tags, prog, date}. Um loop renderiza tudo. Empty state = texto simples, sem dashed border."
      doList={[
        "Estrutura de dados unificada: columns[] → cards[]",
        "Card hover: boxShadow shadow.sm + cursor grab",
        "Tags inline 10px com border, progress bar 3px",
        "Empty state: 'Vazio' em texto gray-300, sem borda",
      ]}
      dontList={[
        "Hardcodar cada coluna com JSX diferente",
        "Badge de status DENTRO do card (a coluna já diz o status)",
        "Dashed border no empty state (AI tell clássico)",
        "Card sem hover state (parece estático, não interativo)",
      ]}
    />

    <Rule num="20" title="Migração: ordem de implementação em 5 sprints"
      desc="Não migrar tudo de uma vez. Seguir a ordem que maximiza impacto visual com mínimo de quebras. Cada sprint entrega valor visível. Testar em light E dark mode a cada sprint."
      doList={[
        "Sprint 1: Foundations — globals.css (tokens, CSS vars, Inter font, next-themes)",
        "Sprint 2: Sidebar + Layout Shell — sidebar light/dark, content area, responsive",
        "Sprint 3: Componentes base — Button, Badge, Input, Card, Table (shadcn/ui + tokens)",
        "Sprint 4: Dashboard — top bar + date range + KPI cards + charts + table",
        "Sprint 5: Página + Portal — Page Header, Alert, Tabs, Kanban, Donut, Integration Cards",
      ]}
      dontList={[
        "Migrar dark mode depois — implementar junto desde Sprint 1",
        "Trocar tudo de uma vez (risco de regressão)",
        "Ignorar os componentes do Portal (são 50% da experiência do cliente)",
        "Pular testes de contraste no dark mode (vai quebrar em produção)",
      ]}
    />

    <Rule num="21" title="Responsive: mobile-first com 5 breakpoints"
      desc="Shopify Polaris usa 5 breakpoints mobile-first: xs(0), sm(490), md(768), lg(1040), xl(1440). Design começa no menor e adiciona complexidade progressivamente. Touch targets mínimo 44×44px. Padding escala: 16px mobile → 24px tablet → 32px desktop."
      doList={[
        "Mobile-first: estilos base para xs, @media min-width para cima",
        "Breakpoints: xs(0) sm(490) md(768) lg(1040) xl(1440) — padrão Polaris",
        "Padding: space-4(16px) mobile → space-6(24px) tablet → space-8(32px) desktop",
        "Touch targets: mínimo 44×44px para TODOS os interativos em mobile",
        "Sidebar: drawer overlay em <768px, collapsed 64px em 768-1040px, expanded 240px em >1040px",
      ]}
      dontList={[
        "Desktop-first (max-width queries — mais difícil de manter)",
        "Ignorar a faixa 768-1040px (tablet é onde mais quebra)",
        "Botões menores que 44px em mobile (falha de usabilidade)",
        "Scroll horizontal em qualquer viewport (exceto tabelas com overflow controlado)",
      ]}
    />

    <Rule num="22" title="Tabelas mobile: card view, não tabela esmagada"
      desc="Tabelas com 5+ colunas são ilegíveis em mobile. Padrão profissional: converter cada row em card vertical com label:value pairs. Manter coluna primária como título do card. Ações como swipe ou menu dots."
      doList={[
        "< 768px: converter table → card stack (cada row vira um card)",
        "Card: nome como título, status como badge, metrics como label:value pairs",
        "768-1040px: esconder colunas secundárias (Trend, Click), manter as primárias",
        "> 1040px: tabela completa com todas as colunas",
        "Paginação mobile: 'Carregar mais' em vez de Anterior/Próximo",
      ]}
      dontList={[
        "Espremer tabela inteira em tela de 375px (ilegível)",
        "Scroll horizontal como solução primária (último recurso)",
        "Cards sem hierarquia — o nome/título deve ser o elemento mais proeminente",
        "Zebra-striping em cards (cada card já é separado visualmente)",
      ]}
    />

    <Rule num="23" title="Dashboard mobile: KPIs scroll horizontal, charts full-width"
      desc="Dashboard em mobile não é a desktop empilhada. Reorganizar: KPIs em scroll horizontal (2 visíveis por vez), charts full-width empilhados, tabela vira card list. Date range simplificado para dropdown. Sidebar vira bottom nav ou hamburger drawer."
      doList={[
        "KPI cards: scroll horizontal (overflow-x: auto, snap) — 2 visíveis, indicador de scroll",
        "Charts: full-width empilhados verticalmente, height reduzido (200px vs 280px desktop)",
        "Date range: dropdown select com presets em vez de segmented control",
        "Sidebar → bottom tab bar com 5 items máximo (Dashboard, Clientes, Campanhas, Flows, Mais)",
        "Charts touch: tap para tooltip (substituir hover)",
      ]}
      dontList={[
        "Empilhar 4 KPI cards em coluna (ocupa toda a tela, perde contexto)",
        "Manter sidebar lateral em mobile (rouba 240px de uma tela de 375px)",
        "Charts com legends que ocupam mais espaço que o gráfico",
        "Date range picker com calendário duplo em mobile (single month)",
      ]}
    />

    {/* ═══ RESPONSIVE BEHAVIOR MAP ═══ */}
    <div style={{marginTop:DS.s[6]}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Mapa de Comportamento Responsivo</div>
      <div style={{fontSize:12,color:DS.colors.gray[400],fontFamily:DS.f.sans,marginBottom:DS.s[4]}}>Como cada componente se adapta em cada breakpoint.</div>
      <div style={{borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:DS.f.sans}}>
          <thead><tr style={{background:DS.colors.gray[50]}}>
            {["Componente","xs (0-489)","sm (490-767)","md (768-1039)","lg (1040+)"].map((h,i)=><th key={i} style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:11,fontWeight:600,color:DS.colors.gray[500],letterSpacing:"0.04em",textTransform:"uppercase",borderBottom:`1px solid ${DS.colors.border}`,textAlign:"left"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[
              {c:"Sidebar",xs:"Drawer (hamburger)",sm:"Drawer",md:"Collapsed 64px",lg:"Expanded 240px"},
              {c:"KPI Cards",xs:"Scroll horizontal 2-up",sm:"Grid 2 col",md:"Grid 3 col",lg:"Grid 4 col"},
              {c:"Charts",xs:"Full-width, h:180px",sm:"Full-width, h:200px",md:"Full-width, h:240px",lg:"Grid 3fr+2fr, h:280px"},
              {c:"Tabela",xs:"Card stack (1 col)",sm:"Card stack (1 col)",md:"Table (cols primárias)",lg:"Table (todas as cols)"},
              {c:"Date Range",xs:"Dropdown select",sm:"Dropdown select",md:"Segmented control",lg:"Segmented + painel"},
              {c:"Page Header",xs:"Title + 1 CTA",sm:"Title + actions row",md:"Title + actions inline",lg:"Full header pattern"},
              {c:"Buttons",xs:"Full-width stacked",sm:"Inline, height 44px",md:"Inline, height 36px",lg:"Inline, height 36px"},
              {c:"Modals",xs:"Full-screen sheet",sm:"Full-screen sheet",md:"Centered 440px",lg:"Centered 440px"},
              {c:"Tabs",xs:"Scroll horizontal",sm:"Scroll horizontal",md:"Full visible",lg:"Full visible"},
              {c:"Alert Banner",xs:"Stacked (icon+text / CTA)",sm:"Inline",md:"Inline",lg:"Inline"},
              {c:"Kanban",xs:"1 coluna (swipe)",sm:"2 colunas",md:"3 colunas",lg:"4 colunas"},
              {c:"Padding page",xs:"space-4 (16px)",sm:"space-4 (16px)",md:"space-6 (24px)",lg:"space-8 (32px)"},
            ].map((r,i)=><tr key={i} style={{borderBottom:`1px solid ${DS.colors.border}`}}>
              <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:12,fontWeight:600,color:DS.colors.gray[800]}}>{r.c}</td>
              <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:11,color:DS.colors.gray[600]}}>{r.xs}</td>
              <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:11,color:DS.colors.gray[600]}}>{r.sm}</td>
              <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:11,color:DS.colors.gray[600]}}>{r.md}</td>
              <td style={{padding:`${DS.s[2]}px ${DS.s[3]}px`,fontSize:11,color:DS.colors.gray[600]}}>{r.lg}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>

    {/* ═══ TAILWIND BREAKPOINTS CONFIG ═══ */}
    <div style={{marginTop:DS.s[4]}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Implementação — tailwind.config.ts</div>
      <div style={{background:DS.colors.gray[900],borderRadius:DS.r.md,padding:DS.s[4],fontFamily:DS.f.mono,fontSize:11,color:"#A8B2D1",lineHeight:1.8,overflow:"auto",whiteSpace:"pre"}}>
{`// tailwind.config.ts
`}<span style={{color:"#C792EA"}}>screens</span>{`: {
  sm: '`}<span style={{color:"#F78C6C"}}>490px</span>{`',   // mobile landscape
  md: '`}<span style={{color:"#F78C6C"}}>768px</span>{`',   // tablet / sidebar collapses
  lg: '`}<span style={{color:"#F78C6C"}}>1040px</span>{`',  // desktop / sidebar expands
  xl: '`}<span style={{color:"#F78C6C"}}>1440px</span>{`',  // large desktop
},

// Touch-safe sizing utility
`}<span style={{color:"#82AAFF"}}>{`.touch-target { min-width: 44px; min-height: 44px; }`}</span>{`
`}<span style={{color:"#82AAFF"}}>{`.touch-comfortable { min-width: 48px; min-height: 48px; }`}</span>
      </div>
    </div>

    {/* ═══ MIGRATION CHECKLIST ═══ */}
    <div style={{marginTop:DS.s[6],padding:DS.s[6],background:DS.colors.gray[50],borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[4]}}>Checklist de Migração — Antes de Começar</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:DS.s[4]}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:DS.colors.gray[700],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Pré-requisitos técnicos</div>
          {[
            "next-themes instalado e configurado",
            "Inter via next/font/google (não CDN)",
            "tailwind.config.ts com todos os tokens do DS",
            "globals.css com CSS vars :root e [data-theme='dark']",
            "Geist Mono via next/font/local para tabelas",
            "shadcn/ui inicializado com tema customizado",
          ].map((t,i)=><div key={i} style={{display:"flex",gap:DS.s[2],fontSize:12,color:DS.colors.gray[600],fontFamily:DS.f.sans,lineHeight:1.6}}>
            <span style={{width:16,height:16,borderRadius:DS.r.sm,border:`1px solid ${DS.colors.border}`,flexShrink:0,marginTop:2}}/>
            {t}
          </div>)}
        </div>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:DS.colors.gray[700],fontFamily:DS.f.sans,marginBottom:DS.s[2]}}>Arquivos a criar/modificar</div>
          {[
            "globals.css — todos os CSS vars (light + dark)",
            "tailwind.config.ts — extend colors, spacing, radius, fonts",
            "components/ui/icon.tsx — wrapper OI com 24 ícones",
            "components/ui/badge.tsx — 5 variantes semânticas",
            "components/ui/kpi-card.tsx — label + valor + delta + spark",
            "components/layout/sidebar.tsx — light + dark, expanded + collapsed",
          ].map((t,i)=><div key={i} style={{display:"flex",gap:DS.s[2],fontSize:12,color:DS.colors.gray[600],fontFamily:DS.f.sans,lineHeight:1.6}}>
            <span style={{fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.mono,width:16,textAlign:"center",flexShrink:0,marginTop:2}}>{i+1}</span>
            {t}
          </div>)}
        </div>
      </div>
    </div>

    {/* ═══ BREAKING CHANGES ═══ */}
    <div style={{marginTop:DS.s[4],padding:DS.s[6],background:DS.colors.sem.warnBg,borderRadius:DS.r.md,border:`1px solid ${DS.colors.sem.warnBorder}`}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.sem.warnText,fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Breaking Changes — O que vai quebrar</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:DS.s[4]}}>
        {[
          {from:"Geist Sans",to:"Inter",scope:"Toda a UI"},
          {from:"#05AFF2 / #3B82F6",to:"#4E62D8 / #2137B6",scope:"Todas as cores brand"},
          {from:"GlowCard (border-top accent)",to:"Card com border padrão",scope:"Dashboard, Clientes"},
          {from:"Dark sidebar (#0d1117)",to:"Light sidebar (white)",scope:"Layout principal"},
          {from:"Lucide strokeWidth 1.5",to:"OI wrapper strokeWidth 2",scope:"Todos os ícones"},
          {from:"Shadow em cards",to:"Border rgba(0,0,0,0.08)",scope:"Todos os cards"},
        ].map((b,i)=><div key={i} style={{fontSize:12,fontFamily:DS.f.sans,lineHeight:1.5}}>
          <div style={{color:DS.colors.sem.negText,fontWeight:500,fontSize:11}}>De: <span style={{fontFamily:DS.f.mono}}>{b.from}</span></div>
          <div style={{color:DS.colors.sem.posText,fontWeight:500,fontSize:11}}>Para: <span style={{fontFamily:DS.f.mono}}>{b.to}</span></div>
          <div style={{color:DS.colors.gray[500],fontSize:10,marginTop:2}}>Escopo: {b.scope}</div>
        </div>)}
      </div>
    </div>

    {/* ═══ TOKEN MAPPING (Light ↔ Dark) ═══ */}
    <div style={{marginTop:DS.s[4]}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.gray[900],fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Mapeamento de Tokens — Light ↔ Dark</div>
      <div style={{borderRadius:DS.r.md,border:`1px solid ${DS.colors.border}`,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",padding:`${DS.s[2]}px ${DS.s[4]}px`,background:DS.colors.gray[50],borderBottom:`1px solid ${DS.colors.border}`}}>
          {["CSS Variable","Light","Dark"].map(h=><span key={h} style={{fontSize:11,fontWeight:500,color:DS.colors.gray[500],fontFamily:DS.f.sans,letterSpacing:"0.04em",textTransform:"uppercase"}}>{h}</span>)}
        </div>
        {[
          {v:"--bg",l:"#FFFFFF",dk:DS.dark.bg},
          {v:"--surface",l:"#FFFFFF",dk:DS.dark.surface},
          {v:"--surface-el",l:"#FFFFFF",dk:DS.dark.surfaceEl},
          {v:"--text",l:"#111827",dk:DS.dark.text},
          {v:"--text-sec",l:"#6B7280",dk:DS.dark.textSec},
          {v:"--text-muted",l:"#9CA3AF",dk:DS.dark.textMuted},
          {v:"--border",l:"rgba(0,0,0,0.08)",dk:"rgba(255,255,255,0.08)"},
          {v:"--brand",l:"#4E62D8",dk:DS.dark.brand},
          {v:"--pos-text",l:"#065F46",dk:DS.dark.posText},
          {v:"--neg-text",l:"#991B1B",dk:DS.dark.negText},
          {v:"--warn-text",l:"#92400E",dk:DS.dark.warnText},
        ].map((row,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",padding:`${DS.s[2]}px ${DS.s[4]}px`,borderBottom:`1px solid ${DS.colors.border}`,alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:500,color:DS.colors.gray[800],fontFamily:DS.f.mono}}>{row.v}</span>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
            <span style={{width:16,height:16,borderRadius:3,background:row.l,border:`1px solid ${DS.colors.border}`}}/>
            <span style={{fontSize:11,color:DS.colors.gray[500],fontFamily:DS.f.mono}}>{row.l}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:DS.s[2]}}>
            <span style={{width:16,height:16,borderRadius:3,background:row.dk,border:`1px solid ${DS.colors.gray[300]}`}}/>
            <span style={{fontSize:11,color:DS.colors.gray[500],fontFamily:DS.f.mono}}>{row.dk}</span>
          </div>
        </div>)}
      </div>
    </div>

    {/* Summary card */}
    <div style={{marginTop:DS.s[6],padding:DS.s[6],background:DS.colors.brand.blue50,borderRadius:DS.r.md,border:`1px solid ${DS.colors.brand.blue100}`}}>
      <div style={{fontSize:14,fontWeight:600,color:DS.colors.brand.blueDark,fontFamily:DS.f.sans,marginBottom:DS.s[3]}}>Resumo — Design System v2.2 + Dark Mode</div>
      <div style={{fontSize:13,color:DS.colors.gray[700],fontFamily:DS.f.sans,lineHeight:1.8}}>
        <strong>Font:</strong> Inter (Shopify Admin). Geist Mono tabelas. KPIs: 32px/600. Badges: 11px/600.<br/>
        <strong>Ícones:</strong> Outlined 24×24, 2px stroke, rounded — 24 ícones no sistema OI.<br/>
        <strong>Cor:</strong> 90% gray. Azul = ação. Gradiente = 1 CTA. Semantic: pos/neg/warn/info com bg muted + text escuro.<br/>
        <strong>Dark Mode:</strong> 3 surface layers (#0F1117 → #1A1D27 → #242836). Brand #7B8CEA. Texto #EAEDF3. next-themes + CSS vars.<br/>
        <strong>Borders:</strong> Light rgba(0,0,0,0.08) · Dark rgba(255,255,255,0.08).<br/>
        <strong>Radius:</strong> 6px (inputs/botões) · 8px (cards) · 12px (modals) · 9999px (pills). 4 tokens.<br/>
        <strong>Shadows:</strong> Layered (2-3 camadas), opacity max 0.06. Borders fazem o trabalho primário.<br/>
        <strong>Buttons:</strong> 3 tamanhos (28/36/44px height). 4 variantes (Primary/Secondary/Ghost/Destructive). Focus ring obrigatório.<br/>
        <strong>Spacing:</strong> Grid 8px. 8 tokens (space-1 a space-16).<br/>
        <strong>Transitions:</strong> 150ms cubic-bezier(0.16, 1, 0.3, 1).<br/>
        <strong>Dashboard:</strong> Date range com presets segmented + painel personalizado (Shopify pattern). Toggle vs anterior.<br/>
        <strong>Migração:</strong> 5 sprints. Foundations → Layout → Components → Dashboard → Pages. Dark mode desde Sprint 1.<br/>
        <strong>Responsive:</strong> Mobile-first, 5 breakpoints (xs/sm/md/lg/xl). Sidebar → drawer/collapsed/expanded. Tables → card stack. Touch 44px min.<br/>
        <strong>Regras:</strong> 23 orientações. Anti-AI checklist. Breaking changes. Token mapping Light ↔ Dark. Mapa responsivo por componente.<br/>
        <strong>Referências:</strong> Shopify Polaris, Stripe, Linear, Klaviyo, Material Design, Carbon DS, GitLab Pajamas, PatternFly.
      </div>
    </div>
  </div>;
}

export default function App() {
  const [a,setA]=useState("Dashboard");
  const R={Cores:SecCores,"Dark Mode":SecDarkMode,Tipografia:SecTipo,Espaçamento:SecEspac,Ícones:SecIcones,Botões:SecBotoes,Cards:SecCards,Badges:SecBadges,Inputs:SecInputs,Tabela:SecTabela,Sidebar:SecSidebar,Dashboard:SecDashboard,Página:SecPagina,Portal:SecPortal,Extras:SecExtras,Orientações:SecOrientacoes};
  const Sec=R[a];
  return <>
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <div style={{minHeight:"100vh",background:DS.colors.gray.white,fontFamily:DS.f.sans,display:"flex"}}>
      <div style={{width:200,borderRight:`1px solid ${DS.colors.border}`,padding:`${DS.s[6]}px ${DS.s[3]}px`,position:"sticky",top:0,height:"100vh",display:"flex",flexDirection:"column",gap:DS.s[1],overflowY:"auto",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:DS.s[2],padding:`${DS.s[2]}px ${DS.s[3]}px`,marginBottom:DS.s[4]}}>
          <div style={{width:26,height:26,borderRadius:DS.r.sm,background:DS.colors.brand.gradient,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontWeight:700,fontSize:12}}>C</span></div>
          <div><span style={{fontWeight:600,fontSize:14,color:DS.colors.gray[900]}}>Convertfy</span><div style={{fontSize:10,color:DS.colors.gray[400],fontFamily:DS.f.mono}}>DS v3.0</div></div>
        </div>
        {secs.map(g=><div key={g.g}>
          <div style={{fontSize:10,fontWeight:500,color:DS.colors.gray[400],letterSpacing:"0.06em",textTransform:"uppercase",padding:`${DS.s[3]}px ${DS.s[3]}px ${DS.s[1]}px`}}>{g.g}</div>
          {g.items.map(it=><button key={it} onClick={()=>setA(it)} style={{display:"block",width:"100%",textAlign:"left",padding:`7px ${DS.s[3]}px`,borderRadius:DS.r.sm,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:DS.f.sans,transition:DS.t,background:a===it?DS.colors.brand.blue50:"transparent",color:a===it?DS.colors.brand.blue:DS.colors.gray[600]}}>{it}</button>)}
        </div>)}
      </div>
      <div style={{flex:1,padding: a==="Dashboard" ? 0 : `${DS.s[8]}px ${DS.s[12]}px`, maxWidth: a==="Dashboard" ? "none" : 920, overflow:"auto"}}>
        {a!=="Dashboard" && <div style={{marginBottom:DS.s[6]}}>
          <h2 style={{fontSize:24,fontWeight:600,color:DS.colors.gray[900],letterSpacing:"-0.02em",margin:0}}>{a}</h2>
          <div style={{height:2,width:36,background:DS.colors.brand.blueLight,borderRadius:1,marginTop:DS.s[2]}}/>
        </div>}
        {Sec && <Sec/>}
      </div>
    </div>
  </>;
}
