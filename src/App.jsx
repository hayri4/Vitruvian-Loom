import { useState, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// VITRUVIAN TEMPLE GENERATOR — Complete Specification
// Sources: vitruvian_temple_equation_system.docx (§2–8)
//          vitruvian_column_specification_equations.docx (doc §2–9)
//          Vitruvius Book III.5 (pediment); Book IV.1 (Ionic/Corinthian capitals,
//          corrected against the primary text — H_cap,Ionic=d/3, A_abacus,Cor=d√2);
//          Book IV.3 (Doric module system — frieze=1.5M_D, B_abacus=13M_D/6,
//          corona=0.5M_D w/ M_D/3 projection, triglyph=M_D w/ 2 extra per bay, taenia/guttae);
//          Book IV.4.1 (pronaos/cella subdivision, shown when depth allows)
// Not modeled (clear scope boundaries, flagged rather than silently omitted):
//          door geometry (IV.6), Tuscan order (IV.7), circular temples (IV.8),
//          site orientation (IV.5), interior pronaos columns for wide cellas (IV.4.2),
//          systyle/monotriglyph Doric as a separate switchable mode (IV.3.7–8)
// All proportions in multiples of d (lower column diameter = 1 module M)
// ═══════════════════════════════════════════════════════════════════════════════

// §2 — Three peristyle plan types
const PT = {
  peripteral:{ n:"Peripteral",     ncDef:6, nY:F=>2*F-1, R:1, vitr:"F=B=6; S=2F−1; R=1; a_outer=s (§5)" },
  pseudo:    { n:"Pseudodipteral", ncDef:8, nY:F=>2*F-1, R:1, vitr:"F=B=8; S=2F−1; R=1; a_outer=2s+d (§6)" },
  dipteral:  { n:"Dipteral",       ncDef:8, nY:F=>2*F-1, R:2, vitr:"F=B=8; S=2F−1; R=2; a_inner=s; a_outer=2s+d (§7)" },
};
const NC_DEF = { peripteral:6, pseudo:8, dipteral:8 };

// Column orders (doc §2): Ionic · Doric · Corinthian
const ORDERS = { ionic:{n:"Ionic"}, doric:{n:"Doric"}, corinthian:{n:"Corinthian"} };

// §3 Intercolumniation species (Ionic / Corinthian; Doric: h fixed at 7d)
const VK = [
  { k:1.5,  n:"Pycnostylos", h:10,  eq:"s=1½d · c=2½d · h=10d" },
  { k:2.0,  n:"Systylos",    h:9.5, eq:"s=2d · c=3d · h=9½d" },
  { k:2.25, n:"Eustylos",    h:8.5, eq:"s=2¼d (s_cen=3d) · h=8½d" },
  { k:3.0,  n:"Diastylos",   h:8.5, eq:"s=3d · c=4d · h=8½d" },
  { k:4.0,  n:"Araeostylos", h:8.0, eq:"s>3d [missing—4d used] · h=8d" },
];
function hFromK(k){
  if(k<=1.5)return 10;
  if(k<=2.0)return 10-(k-1.5);
  if(k<=3.0)return 9.5-(k-2.0);
  return 8.5-(k-3.0)*0.5;
}
function typeAtK(k){return VK.find(v=>Math.abs(v.k-k)<0.001)||null;}

// Diminution (doc §3): d_t = (5/6)d_b for h≤15ft (standard Vitruvian case)
const DT = 5/6;

// Fixed global constants
const d_cor  = 1.02;   // corner column correction §6 / doc §3
const NS = 3, SR = 0.2, ST = 0.4;  // steps
const STEPH = NS*SR, STEPP = NS*ST; // 0.6d, 1.2d

// ═══ ORDER SPECIFICATIONS ═════════════════════════════════════════════════════
// Returns all proportional dimensions for a given order/intercolumniation.
function oSpec(order, k) {
  // ── Column shaft ──────────────────────────────────────────────────────────
  // Doric: h=7d fixed (doc §5.2); Ionic/Corinthian: h=f(k) species table (doc §4.1)
  // Corinthian: same shaft/base proportions as Ionic (Vitruvius Book IV.1.1)
  const hM = order==='doric' ? 7 : hFromK(k);

  // ── Base ──────────────────────────────────────────────────────────────────
  // DORIC HAS NO BASE — shaft sits directly on stylobate (fundamental Doric rule)
  // Ionic/Corinthian: Attic base H_b=d/2; B_b=1.5d; e_b=d/4 (doc §4.2)
  const hasBase = order!=='doric';
  const H_b = hasBase ? 0.5 : 0;
  const B_b = hasBase ? 1.5 : 0;
  const e_b = hasBase ? 0.25 : 0;

  // ── Capital ───────────────────────────────────────────────────────────────
  // Ionic: H_cap=d/3 (Vitruvius IV.1.1, explicit comparative statement — corrects
  //         an earlier d/2 placeholder taken from a secondary Book III synthesis)
  // Doric: H_cap=M_D=d/2; 3 sub-bands each d/6 (Book IV.3.4); B_cap=13M_D/6=13d/12
  //         — IV.3.4's "module and a sixth" (7M_D/6=7d/12) was tried first for
  //         textual fidelity, but it makes the abacus narrower than the tapered
  //         shaft top, which is architecturally wrong (a capital cannot taper
  //         inward at its crowning member). The "two modules and a sixth"
  //         reading (13M_D/6), attested in at least one secondary paraphrase,
  //         resolves this and is used here instead.
  // Corinthian: H_cap=d (IV.1.11); abacus is a square whose DIAGONAL = 2×H_cap,
  //         so side = d√2 (IV.1.11, confirmed across Morgan/Gwilt translations)
  const M_D = order==='doric' ? 0.5 : null; // Doric module = d/2 (IV.3.4), used below
  const H_cap = order==='corinthian' ? 1.0 : order==='doric' ? 0.5 : 1/3;
  const A_abacus = order==='doric' ? (13/6)*M_D : order==='corinthian' ? Math.SQRT2 : 10/9;

  // ── Fluting (doc §4.6 / §5.4) ─────────────────────────────────────────────
  const Nf = order==='doric' ? 20 : 24;
  const dphi = order==='doric' ? 18 : 15;

  // ── Entablature ───────────────────────────────────────────────────────────
  // Architrave: H_a=d/2 (all orders, §8.1)
  const H_a = 0.5;
  // Frieze: Doric triglyph/metope band H_z=1.5×M_D=0.75d (Book IV.3.4, explicit)
  //         Ionic/Corinthian continuous H_z=3H_a/4=3d/8 (§8.2)
  const H_z = order==='doric' ? 1.5*M_D : 3*H_a/4;
  // Cornice: Doric corona+2 cymatia = 0.5×M_D=0.25d (Book IV.3.6, explicit);
  //          projects (1/2+1/6)×M_D = M_D/3 ≈0.167d beyond the frieze face
  //          Corinthian modillion cornice 0.25d; Ionic corona 2H_a/7 (§8.2)
  const H_cor = order==='doric' ? 0.5*M_D : order==='corinthian' ? 0.25 : 2*H_a/7;
  const corProj = order==='doric' ? M_D/3 : 0; // Book IV.3.6 corona projection
  const H_ent = H_a + H_z + H_cor;

  return { hM, hasBase, H_b, B_b, e_b, H_cap, A_abacus, M_D, corProj, Nf, dphi, H_a, H_z, H_cor, H_ent };
}

// ═══ UTILITIES ════════════════════════════════════════════════════════════════
function fmt(v){
  if(!v&&v!==0)return"";
  if(Math.abs(v-1)<0.001)return"M";
  const w=Math.floor(v),f=v-w;
  const fs=Math.abs(f-0.5)<0.005?" ½":Math.abs(f-0.25)<0.005?" ¼":Math.abs(f-0.75)<0.005?" ¾":
    Math.abs(f-1/3)<0.008?" ⅓":Math.abs(f-2/3)<0.008?" ⅔":
    Math.abs(f-0.125)<0.005?" ⅛":Math.abs(f-0.375)<0.005?" ⅜":
    f>0.001?" "+parseFloat(f.toFixed(2)):"";
  return(w>0?w:"")+fs+" M";
}
function fmtN(v){return fmt(v).replace(/ M$/,"").trim()||"0";}

// Decorative volute spiral for the Ionic capital (visual cue only — Vitruvius's
// actual volute construction in Book III.5 is a precise multi-quadrant compass
// method not replicated here, per explicit request). Simple Archimedean spiral,
// sampled as a polyline; `mirror` flips it for the opposite side of the capital.
function spiralPath(cx,cy,r0,turns,mirror){
  const n=40, pts=[];
  for(let i=0;i<=n;i++){
    const t=i/n*turns*2*Math.PI;
    const r=r0*(1-i/n*0.90);
    const ang=t-Math.PI/2;
    let dx=r*Math.cos(ang), dy=r*Math.sin(ang);
    if(mirror) dx=-dx;
    pts.push(`${(cx+dx).toFixed(2)},${(cy+dy).toFixed(2)}`);
  }
  return "M"+pts.join(" L");
}

// ═══ SEGMENT BUILDERS ═════════════════════════════════════════════════════════
function buildX(k,nc){
  const ci=Math.floor((nc-1)/2), isE=Math.abs(k-2.25)<0.001, segs=[];
  for(let i=0;i<nc;i++){
    segs.push({k:'c',i,wM:1,xM:0});
    if(i<nc-1){const ic=isE&&(i===ci);segs.push({k:'s',si:i,ic,wM:ic?3:k,xM:0});}
  }
  let x=0;segs.forEach(g=>{g.xM=x;x+=g.wM;});return{segs,totalM:x};
}
function buildY(k,nc,pt){
  const nC=PT[pt].nY(nc),segs=[];
  for(let j=0;j<nC;j++){
    segs.push({k:'c',j,hM:1,yM:0});
    if(j<nC-1)segs.push({k:'s',sj:j,hM:k,yM:0});
  }
  let y=0;segs.forEach(g=>{g.yM=y;y+=g.hM;});return{segs,totalM:y};
}
function glines(segs,total,pk,sk){
  const map=new Map();
  for(let m=1;m<Math.ceil(total+0.001);m++)if(m<total)map.set(Math.round(m*1000),{pos:m,isB:false});
  segs.forEach(g=>{[g[pk],g[pk]+g[sk]].forEach(p=>{
    if(p<0.002||p>total-0.002)return;
    const key=Math.round(p*1000);
    if(map.has(key))map.get(key).isB=true;else map.set(key,{pos:p,isB:true});
  });});
  return Array.from(map.values()).sort((a,b)=>a.pos-b.pos);
}

// ═══ PLAN LOGIC ═══════════════════════════════════════════════════════════════
function colKind(i,j,nc,nYC,pt){
  const fr=j===0,bk=j===nYC-1,lf=i===0,rt=i===nc-1;
  const outerP=fr||bk||lf||rt;
  const innerR=((i===1||i===nc-2)&&j>=1&&j<=nYC-2)||((j===1||j===nYC-2)&&i>=1&&i<=nc-2);
  if(pt==='peripteral'||pt==='pseudo'){if(!outerP)return null;return(i===0&&j===0)?'mod':'col';}
  if(pt==='dipteral'){if(outerP)return(i===0&&j===0)?'mod':'col';if(innerR)return'inner';return null;}
  return null;
}
function getCella(xCols,yCols,nc,nYC,pt){
  const g=(a,i,fb)=>i>=0&&i<a.length?a[i]:fb;
  if(pt==='peripteral')
    return{cx1:g(xCols,1,xCols[0]).xM,     cx2:g(xCols,nc-2,xCols[nc-1]).xM+1,
           cy1:g(yCols,1,yCols[0]).yM,       cy2:g(yCols,nYC-2,yCols[nYC-1]).yM+1};
  const lo=Math.min(2,nc-1),hi=Math.max(nc-3,0),yl=Math.min(2,nYC-1),yh=Math.max(nYC-3,0);
  return{cx1:g(xCols,lo,xCols[0]).xM,       cx2:g(xCols,hi,xCols[nc-1]).xM+1,
         cy1:g(yCols,yl,yCols[0]).yM,         cy2:g(yCols,yh,yCols[nYC-1]).yM+1};
}

// ═══ SVG GENERATION ═══════════════════════════════════════════════════════════
function genSVG(k, nc, pt, order){
  const p   = PT[pt];
  const sp  = oSpec(order, k);
  const {hM,hasBase,H_b,B_b,e_b,H_cap,A_abacus,M_D,corProj,Nf,dphi,H_a,H_z,H_cor,H_ent} = sp;

  const xd=buildX(k,nc), yd=buildY(k,nc,pt);
  const wM=xd.totalM, dM=yd.totalM;
  const xSegs=xd.segs, ySegs=yd.segs;
  const xCols=xSegs.filter(g=>g.k==='c');
  const yCols=ySegs.filter(g=>g.k==='c');
  const nYC=yCols.length;

  // Pediment — Vitruvius Book III.5: H_tympanum = W_front / 9
  const H_ped = wM / 9;

  // Total elevation height (top of pediment apex to ground)
  const totalEleH = H_ped + H_ent + H_cap + hM + H_b + STEPH;
  const planExtW  = wM + 2*STEPP;
  const planExtH  = dM + 2*STEPP;

  // ── Side-by-side layout: plan (left) + elevation (right), sharing one PPM ──
  // Width budget covers BOTH views placed side by side; height budget covers
  // whichever single view is taller (no longer summed, since they're no
  // longer stacked) — this is what lets the whole drawing fit a laptop screen.
  const combinedWModules = 2*wM + 4*STEPP; // each view needs its own step overhang
  const refW=560, budH=600;
  const PPM = Math.max(5, Math.min(30,
    refW / combinedWModules,
    budH / Math.max(planExtH, totalEleH)
  ));

  const SPXP = STEPP*PPM;
  const PTOP=62, DIMH=44;

  // PLAN block (left)
  const planX=Math.ceil(SPXP)+64, planY=PTOP+22, planW=wM*PPM, planH=dM*PPM;
  const ypP = m => planY+(dM-m)*PPM;
  const xp  = m => planX+m*PPM;            // plan-only X transform

  // Gap sized to clear: plan's "front/back" labels (right) + elevation's own
  // dimension callouts and step overhang (left) — both scale with SPXP.
  const GAPX = SPXP + 110;
  const ELE_RPAD = 130; // room for labels right of elevation (e.g. "frieze: triglyphs/metopes")

  // ELEVATION block (right) — stylobate-aligned with plan: the plan's front
  // colonnade line (its bottom edge, where the front row of columns sits)
  // is set level with the elevation's stylobate (where the column bases
  // meet the top step), since both represent the same architectural plane.
  const eleStackPx = (totalEleH-STEPH)*PPM;       // pediment apex → top of steps, in px
  const eleX=planX+planW+GAPX, eleY=(planY+planH)-eleStackPx, eleW=wM*PPM;
  const xe  = m => eleX+m*PPM;             // elevation-only X transform

  // Elevation Y chain (SVG top→bottom = building top→ground)
  const yPedApex   = eleY;                          // tympanum apex (topmost)
  const yCorTop    = yPedApex   + H_ped*PPM;        // top of horizontal cornice
  const yFrTop     = yCorTop    + H_cor*PPM;        // top of frieze
  const yArchTop   = yFrTop     + H_z*PPM;          // top of architrave
  const yCapTop    = yArchTop   + H_a*PPM;          // top of capital
  const yShaftT    = yCapTop    + H_cap*PPM;        // top of shaft
  const yShaftB    = yShaftT    + hM*PPM;           // bottom of shaft
  const yBaseB     = yShaftB    + H_b*PPM;          // bottom of base (Doric: same as yShaftB)
  const yGround    = yBaseB     + STEPH*PPM;        // ground level

  const K="#1c1c1c", G="#c0bcb4", GD="2.2,4", BG="#ffffff";
  const Adim=3.5;

  const svgW = eleX + eleW + ELE_RPAD;
  const planBlockH = planY + planH + SPXP + 30;             // + step overhang + "PLAN" caption below
  const eleBlockH  = yGround + DIMH + 30;                    // + dim row + "ELEVATION (FRONT)" caption below
  const svgH = Math.max(planBlockH, eleBlockH);

  // ── DEFS ──────────────────────────────────────────────────────────────────
  let defs="<defs>";
  {
    const cx0=xe(xCols[0].xM)+PPM/2;
    defs+=`<clipPath id="sc0"><polygon points="${cx0-PPM/2},${yShaftB} ${cx0+PPM/2},${yShaftB} ${cx0+DT*PPM/2},${yShaftT} ${cx0-DT*PPM/2},${yShaftT}"/></clipPath>`;
    // Clip for raking cornice triangles
    defs+=`<clipPath id="pedClip"><polygon points="${eleX+eleW/2},${yPedApex} ${eleX},${yCorTop} ${eleX+eleW},${yCorTop}"/></clipPath>`;
  }
  defs+="</defs>";

  let s=`<rect width="${svgW}" height="${svgH}" fill="${BG}"/>`;

  // ── Column strip shading (each view tints its OWN columns independently —
  //    plan and elevation no longer share a vertical axis, so the strip can't
  //    span both as one shape the way it did when stacked) ──────────────────
  xCols.forEach(xc=>{
    s+=`<rect x="${xp(xc.xM)}" y="${planY}" width="${PPM}" height="${planH}" fill="rgba(0,0,0,0.02)"/>`;
    s+=`<rect x="${xe(xc.xM)}" y="${yPedApex}" width="${PPM}" height="${yGround-yPedApex}" fill="rgba(0,0,0,0.02)"/>`;
  });
  yCols.forEach(yc=>{
    s+=`<rect x="${planX}" y="${ypP(yc.yM+1)}" width="${planW}" height="${PPM}" fill="rgba(0,0,0,0.013)"/>`;
  });
  xSegs.filter(g=>g.k==='s'&&g.ic).forEach(g=>{
    s+=`<rect x="${xp(g.xM)}" y="${planY}" width="${g.wM*PPM}" height="${planH}" fill="rgba(50,80,40,0.03)"/>`;
    s+=`<rect x="${xe(g.xM)}" y="${yPedApex}" width="${g.wM*PPM}" height="${yGround-yPedApex}" fill="rgba(50,80,40,0.03)"/>`;
  });

  // ── Grid: each view now carries its own column-rhythm grid (no cross-view
  //    "parallel projection" lines — plan and elevation are side by side, not
  //    stacked, so a single shared vertical line no longer has meaning) ─────
  glines(xSegs,wM,'xM','wM').forEach(l=>{
    const gxP=xp(l.pos), gxE=xe(l.pos);
    s+=`<line x1="${gxP}" y1="${planY}" x2="${gxP}" y2="${planY+planH}" stroke="${G}" stroke-width="${l.isB?.6:.28}" stroke-dasharray="${GD}" opacity="${l.isB?.8:.4}"/>`;
    s+=`<line x1="${gxE}" y1="${yPedApex}" x2="${gxE}" y2="${yGround}" stroke="${G}" stroke-width="${l.isB?.6:.28}" stroke-dasharray="${GD}" opacity="${l.isB?.8:.4}"/>`;
  });
  glines(ySegs,dM,'yM','hM').forEach(l=>{
    const gy=ypP(l.pos);
    s+=`<line x1="${planX}" y1="${gy}" x2="${planX+planW}" y2="${gy}" stroke="${G}" stroke-width="${l.isB?.6:.28}" stroke-dasharray="${GD}" opacity="${l.isB?.8:.4}"/>`;
  });
  for(let i=1;i<Math.ceil(hM);i++){
    const gy=yShaftT+i*PPM;
    if(gy<yShaftB)s+=`<line x1="${eleX}" y1="${gy}" x2="${eleX+eleW}" y2="${gy}" stroke="${G}" stroke-width=".28" stroke-dasharray="${GD}" opacity=".4"/>`;
  }

  // ════════════════════════ PLAN ════════════════════════════════════════════

  // Steps (§5.4: N=3 concentric rings)
  for(let i=NS-1;i>=0;i--){
    const off=(i+1)*ST*PPM;
    s+=`<rect x="${planX-off}" y="${planY-off}" width="${planW+2*off}" height="${planH+2*off}" fill="rgba(0,0,0,${0.012-i*0.003})" stroke="${G}" stroke-width="${i===NS-1?.9:.6}" opacity="${0.55+i*0.15}"/>`;
  }

  // Cella — drawn as a walled room. Vitruvius doesn't give a wall thickness for
  // this app's purposes, so it's fixed at 1 module (d) for clarity: the outer
  // face (solid) sits at the position derived from the column-grid rule, the
  // inner face (dashed) is inset by that assumed thickness.
  const{cx1,cx2,cy1,cy2}=getCella(xCols,yCols,nc,nYC,pt);
  const cH=(cy2-cy1)*PPM;
  const wallT_m=1; // assumed wall thickness, in modules (d)
  const ix1=cx1+wallT_m, ix2=cx2-wallT_m, iy1=cy1+wallT_m, iy2=cy2-wallT_m;
  const innerOK = cH>0 && (ix2-ix1)>0.3 && (iy2-iy1)>0.3;
  const doorW_m=2; // assumed door width, in modules — Vitruvius ties door size
                    // to interior room height (Book IV.6), not modeled here
  const cxMid=(cx1+cx2)/2, doorX1=cxMid-doorW_m/2, doorX2=cxMid+doorW_m/2;
  const doorOK = innerOK && doorX1>cx1+0.15 && doorX2<cx2-0.15;

  if(!innerOK){
    if(cH>0)
      s+=`<rect x="${xp(cx1)}" y="${ypP(cy2)}" width="${(cx2-cx1)*PPM}" height="${cH}" fill="rgba(0,0,0,0.055)" stroke="${K}" stroke-width=".85"/>`;
  } else {
    // Outer wall face (solid — position follows the column-grid rule)
    s+=`<rect x="${xp(cx1)}" y="${ypP(cy2)}" width="${(cx2-cx1)*PPM}" height="${cH}" fill="rgba(90,72,50,0.14)" stroke="${K}" stroke-width=".85"/>`;
    // Inner wall face (dashed — position depends on the assumed 1-module thickness);
    // filled with the page background to read as open interior space
    s+=`<rect x="${xp(ix1)}" y="${ypP(iy2)}" width="${(ix2-ix1)*PPM}" height="${(iy2-iy1)*PPM}" fill="${BG}" stroke="${K}" stroke-width=".55" stroke-dasharray="3,2" opacity=".8"/>`;
    if(PPM>=13)
      s+=`<text x="${xp(ix1)+3}" y="${ypP(iy2)+10}" font-size="5.5" font-family="Georgia,serif" fill="#aaa">wall t=1d (assumed)</text>`;

    // Door opening through the front wall (solid jambs mark the actual cut;
    // the wall's own position behind them remains only as certain as the
    // dashed inner line above)
    if(doorOK){
      s+=`<rect x="${xp(doorX1)}" y="${ypP(iy1)}" width="${doorW_m*PPM}" height="${wallT_m*PPM}" fill="${BG}" stroke="none"/>`;
      s+=`<line x1="${xp(doorX1)}" y1="${ypP(iy1)}" x2="${xp(doorX1)}" y2="${ypP(cy1)}" stroke="${K}" stroke-width=".7"/>`;
      s+=`<line x1="${xp(doorX2)}" y1="${ypP(iy1)}" x2="${xp(doorX2)}" y2="${ypP(cy1)}" stroke="${K}" stroke-width=".7"/>`;
      if(PPM>=13)
        s+=`<text x="${xp(cxMid)}" y="${ypP(cy1)+9}" text-anchor="middle" font-size="6" font-family="Georgia,serif" fill="#999">door (2d, assumed)</text>`;
    }
  }

  // Pronaos / cella subdivision (Book IV.4.1): using the cella's own clear
  // interior width as the unit, pronaos depth = (3/4)×width, cella-proper depth
  // = (5/4)×width, total = 2×width — drawn only when the interior comfortably
  // accommodates both zones; otherwise this Book IV refinement is skipped
  // rather than drawn compressed or overflowing.
  if(innerOK){
    const cellaW_m=ix2-ix1, cellaD_m=iy2-iy1;
    const pronaosD_m=0.75*cellaW_m;
    if(cellaD_m>=2*cellaW_m){
      const ySplit=iy1+pronaosD_m;
      s+=`<line x1="${xp(ix1)}" y1="${ypP(ySplit)}" x2="${xp(ix2)}" y2="${ypP(ySplit)}" stroke="${K}" stroke-width=".55" stroke-dasharray="2,2" opacity=".55"/>`;
      if(PPM>=13){
        s+=`<text x="${xp(ix1)+4}" y="${(ypP(iy1)+ypP(ySplit))/2}" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#999">pronaos ¾W</text>`;
        s+=`<text x="${xp(ix1)+4}" y="${(ypP(ySplit)+ypP(iy2))/2}" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#999">cella ⁵⁄₄W</text>`;
      }
    }
  }

  // Stylobate outline
  s+=`<rect x="${planX}" y="${planY}" width="${planW}" height="${planH}" fill="none" stroke="${K}" stroke-width="1.1"/>`;

  // Base footprints in plan (Ionic/Corinthian only — Doric: no base)
  if(hasBase)xCols.forEach(xc=>{yCols.forEach(yc=>{
    const kind=colKind(xc.i,yc.j,nc,nYC,pt);if(!kind||kind==='anta')return;
    s+=`<rect x="${xp(xc.xM)-e_b*PPM}" y="${ypP(yc.yM+1)-e_b*PPM}" width="${B_b*PPM}" height="${B_b*PPM}" fill="rgba(0,0,0,0.035)" stroke="${G}" stroke-width=".35"/>`;
  });});

  // Plan columns + fluting tick marks
  xCols.forEach(xc=>{yCols.forEach(yc=>{
    const kind=colKind(xc.i,yc.j,nc,nYC,pt);if(!kind)return;
    const cx_=xp(xc.xM)+PPM/2, cy_=planY+(dM-yc.yM-0.5)*PPM, r=PPM/2*0.93;
    if(kind==='mod'){
      s+=`<rect x="${xp(xc.xM)}" y="${ypP(yc.yM+1)}" width="${PPM}" height="${PPM}" fill="none" stroke="${K}" stroke-width=".42" opacity=".38"/>`;
      s+=`<circle cx="${cx_}" cy="${cy_}" r="${r}" fill="${BG}" stroke="${K}" stroke-width=".95"/>`;
      if(PPM>=16){
        const dph=dphi*Math.PI/180;
        for(let fi=0;fi<Nf;fi++){
          const a=fi*dph;
          s+=`<line x1="${cx_+r*0.62*Math.cos(a)}" y1="${cy_+r*0.62*Math.sin(a)}" x2="${cx_+r*Math.cos(a)}" y2="${cy_+r*Math.sin(a)}" stroke="${K}" stroke-width=".4" opacity=".45"/>`;
        }
      }
    } else if(kind==='inner'){
      // Inner ring uses the SAME diameter as the outer ring (Vitruvius III.2.7,
      // III.3.8–9: the dipteral is simply a doubled colonnade, not a colonnade
      // with a separately-scaled inner ring — confirmed by Hermogenes's
      // pseudodipteral move of omitting the inner ring outright while keeping
      // everything else the same proportions). The 0.88 shrink here was a
      // leftover cosmetic choice with no textual basis; removed.
      s+=`<circle cx="${cx_}" cy="${cy_}" r="${r}" fill="${BG}" stroke="${K}" stroke-width=".5"/>`;
    } else {
      s+=`<circle cx="${cx_}" cy="${cy_}" r="${r}" fill="${BG}" stroke="${K}" stroke-width=".72"/>`;
    }
  });});

  // Plan labels
  s+=`<text x="${planX}" y="${planY+planH+SPXP+16}" font-size="7.5" font-family="Georgia,serif" fill="#aaa" letter-spacing=".5">PLAN</text>`;
  if(PPM>=10){
    s+=`<text x="${planX+planW+3}" y="${planY+planH}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">front</text>`;
    s+=`<text x="${planX+planW+3}" y="${planY}"       dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">back</text>`;
  }
  if(PPM>=14)xCols.forEach(xc=>{
    s+=`<text x="${xp(xc.xM)+PPM/2}" y="${planY-8}" text-anchor="middle" font-size="6" font-family="Georgia,serif" fill="#ccc">${xc.i+1}</text>`;
  });

  // Plan dimensions
  const pwY=planY-20;
  if(planW>Adim*2){
    s+=`<line x1="${planX}" y1="${planY-2}" x2="${planX}" y2="${pwY+2}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${planX+planW}" y1="${planY-2}" x2="${planX+planW}" y2="${pwY+2}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${planX+Adim}" y1="${pwY}" x2="${planX+planW-Adim}" y2="${pwY}" stroke="${K}" stroke-width=".75"/>`;
    s+=`<path d="M${planX} ${pwY} l${Adim} ${-Adim/2} l0 ${Adim} Z" fill="${K}"/>`;
    s+=`<path d="M${planX+planW} ${pwY} l${-Adim} ${-Adim/2} l0 ${Adim} Z" fill="${K}"/>`;
    s+=`<text x="${planX+planW/2}" y="${pwY-7}" text-anchor="middle" font-size="8" font-family="Georgia,serif" fill="${K}">${fmt(wM)}</text>`;
  }
  const pdX=planX-SPXP-26, pdMid=planY+planH/2;
  if(planH>Adim*2){
    s+=`<line x1="${planX-SPXP-2}" y1="${planY}" x2="${pdX+2}" y2="${planY}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${planX-SPXP-2}" y1="${planY+planH}" x2="${pdX+2}" y2="${planY+planH}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${pdX}" y1="${planY+Adim}" x2="${pdX}" y2="${planY+planH-Adim}" stroke="${K}" stroke-width=".75"/>`;
    s+=`<path d="M${pdX} ${planY} l${-Adim/2} ${Adim} l${Adim} 0 Z" fill="${K}"/>`;
    s+=`<path d="M${pdX} ${planY+planH} l${-Adim/2} ${-Adim} l${Adim} 0 Z" fill="${K}"/>`;
    s+=`<text x="${pdX-9}" y="${pdMid}" text-anchor="middle" dominant-baseline="middle" font-size="8.5" font-family="Georgia,serif" fill="${K}" transform="rotate(-90,${pdX-9},${pdMid})">${fmt(dM)}</text>`;
  }

  // ════════════════════════ ELEVATION ═══════════════════════════════════════

  s+=`<text x="${eleX}" y="${yGround+DIMH+16}" font-size="7.5" font-family="Georgia,serif" fill="#aaa" letter-spacing=".5">ELEVATION (FRONT)</text>`;

  // ─── PEDIMENT (Book III.5: H_tympanum = W/9) ──────────────────────────────
  {
    const cx_p=eleX+eleW/2;
    const acrH=H_cor*PPM*2.0; // acroterion height

    // Tympanum fill
    s+=`<polygon points="${cx_p},${yPedApex} ${eleX},${yCorTop} ${eleX+eleW},${yCorTop}" fill="rgba(0,0,0,0.03)" stroke="none"/>`;
    // Raking cornice (thick stroked slopes — represents physical cornice depth)
    const rcW=Math.max(2, H_cor*PPM*0.85);
    s+=`<line x1="${cx_p}" y1="${yPedApex}" x2="${eleX}" y2="${yCorTop}" stroke="${K}" stroke-width="${rcW}" stroke-linecap="square" opacity=".88"/>`;
    s+=`<line x1="${cx_p}" y1="${yPedApex}" x2="${eleX+eleW}" y2="${yCorTop}" stroke="${K}" stroke-width="${rcW}" stroke-linecap="square" opacity=".88"/>`;
    // Inner tympanum border (softer inner line)
    s+=`<line x1="${cx_p}" y1="${yPedApex+rcW*0.6}" x2="${eleX+rcW*0.7}" y2="${yCorTop}" stroke="${G}" stroke-width=".6" opacity=".5"/>`;
    s+=`<line x1="${cx_p}" y1="${yPedApex+rcW*0.6}" x2="${eleX+eleW-rcW*0.7}" y2="${yCorTop}" stroke="${G}" stroke-width=".6" opacity=".5"/>`;

    // Acroteria — palmette silhouettes at apex and corners
    // Apex
    const aW=acrH*0.55;
    s+=`<polygon points="${cx_p},${yPedApex-acrH} ${cx_p-aW/2},${yPedApex-acrH*0.3} ${cx_p-aW*0.2},${yPedApex} ${cx_p+aW*0.2},${yPedApex} ${cx_p+aW/2},${yPedApex-acrH*0.3}" fill="rgba(0,0,0,0.13)" stroke="${K}" stroke-width=".5"/>`;
    // Corner acroteria (smaller, angled)
    [[eleX,-1],[eleX+eleW,1]].forEach(([ax,dir])=>{
      const cW2=aW*0.65, cH2=acrH*0.65;
      s+=`<polygon points="${ax},${yCorTop-cH2} ${ax-dir*cW2*0.25},${yCorTop-cH2*0.3} ${ax-dir*cW2*0.08},${yCorTop} ${ax+dir*cW2*0.08},${yCorTop} ${ax+dir*cW2*0.25},${yCorTop-cH2*0.3}" fill="rgba(0,0,0,0.12)" stroke="${K}" stroke-width=".45"/>`;
    });
    // Labels
    if(PPM>=11)
      s+=`<text x="${eleX+eleW+4}" y="${(yPedApex+yCorTop)/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">tympanum  H=W/9</text>`;
  }

  // ─── CORNICE / GEISON ──────────────────────────────────────────────────────
  // Doric corona projects beyond the frieze face by M_D/3 (Book IV.3.6, explicit)
  const corPx = corProj*PPM;
  s+=`<rect x="${eleX-corPx}" y="${yCorTop}" width="${eleW+2*corPx}" height="${H_cor*PPM}" fill="rgba(0,0,0,0.13)" stroke="${K}" stroke-width=".8"/>`;
  if(PPM>=14)
    s+=`<text x="${eleX+eleW+corPx+4}" y="${yCorTop+H_cor*PPM/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">cornice</text>`;

  // Doric mutules (Book IV.3.6): flat slabs projecting below cornice over triglyphs,
  // each carrying six guttae in a row ("six guttae in front" — IV.3.6 explicit)
  if(order==='doric'){
    const mH=H_cor*PPM*0.35, mW=M_D*PPM*0.95; // mutule width ≈ triglyph width (M_D)
    xCols.forEach(xc=>{
      const mx=xe(xc.xM)+PPM/2-mW/2;
      s+=`<rect x="${mx}" y="${yCorTop+H_cor*PPM}" width="${mW}" height="${mH}" fill="rgba(0,0,0,0.18)" stroke="${K}" stroke-width=".4"/>`;
      if(PPM>=20){
        const gR=Math.min(mH*0.16, mW*0.07);
        for(let gi=0;gi<6;gi++){
          const gx=mx+mW*(gi+0.5)/6;
          s+=`<circle cx="${gx}" cy="${yCorTop+H_cor*PPM+mH+gR*1.3}" r="${gR}" fill="rgba(0,0,0,0.3)" stroke="none"/>`;
        }
      }
    });
  }
  // Ionic dentils: small square blocks below cornice
  if(order==='ionic'&&PPM>=18){
    const dW=PPM*0.16, dH=H_cor*PPM*0.52, dGap=PPM*0.09;
    const nd=Math.floor(eleW/(dW+dGap));
    const dOff=(eleW-nd*(dW+dGap))/2;
    for(let di=0;di<nd;di++)
      s+=`<rect x="${eleX+dOff+di*(dW+dGap)}" y="${yCorTop+H_cor*PPM*0.38}" width="${dW}" height="${dH}" fill="rgba(0,0,0,0.2)" stroke="none"/>`;
  }
  // Corinthian modillions: bracket projections below cornice
  if(order==='corinthian'&&PPM>=16){
    const mW=PPM*0.22, mH=H_cor*PPM*0.48, mGap=PPM*0.30;
    const nm=Math.floor(eleW/(mW+mGap));
    const mOff=(eleW-nm*(mW+mGap))/2;
    for(let mi=0;mi<nm;mi++){
      const mx=eleX+mOff+mi*(mW+mGap);
      s+=`<rect x="${mx}" y="${yCorTop+H_cor*PPM*0.28}" width="${mW}" height="${mH}" fill="rgba(0,0,0,0.22)" stroke="none"/>`;
    }
  }

  // ─── FRIEZE ────────────────────────────────────────────────────────────────
  if(order==='doric'){
    // Doric: alternating triglyphs (dark, with grooves) and metopes (light)
    s+=`<rect x="${eleX}" y="${yFrTop}" width="${eleW}" height="${H_z*PPM}" fill="rgba(220,215,205,0.7)" stroke="${K}" stroke-width=".7"/>`;
    const tW=M_D*PPM, tH=H_z*PPM; // triglyph width = M_D exactly (Book IV.3.4)

    // One triglyph, drawn left edge at tx: width divided into six parts — a
    // half-channel at each edge, three femora, two full channels (IV.3.5).
    // The text gives edges=0.5 of six parts but doesn't itemize the femur:channel
    // split within the remaining five; channel=half the femur width is used here
    // as the simplest ratio satisfying the stated total (an interpretive choice).
    const drawTriglyph=(tx)=>{
      s+=`<rect x="${tx}" y="${yFrTop}" width="${tW}" height="${tH}" fill="rgba(30,25,20,0.72)" stroke="${K}" stroke-width=".5"/>`;
      const u=tW/6, half=0.5*u, fem=1.25*u, chan=0.625*u;
      let cx0=tx+half+fem; // left edge of first channel
      [cx0, cx0+chan+fem].forEach(cxp=>
        s+=`<rect x="${cxp}" y="${yFrTop}" width="${chan}" height="${tH*0.93}" fill="rgba(255,255,255,0.55)" stroke="none"/>`);
      s+=`<rect x="${tx}" y="${yFrTop}" width="${half}" height="${tH*0.93}" fill="rgba(255,255,255,0.4)"/>`;
      s+=`<rect x="${tx+tW-half}" y="${yFrTop}" width="${half}" height="${tH*0.93}" fill="rgba(255,255,255,0.4)"/>`;
    };

    // Column-centered triglyphs (over every column, per IV.3.4)
    xCols.forEach(xc=> drawTriglyph(xe(xc.xM)+PPM/2-tW/2));

    // Within each intercolumniation: two more triglyphs, evenly spaced, giving
    // three metopes per bay ("two are to be placed in each intercolumniation" —
    // IV.3.4; the separate three-metope pronaos/posticum exception is not
    // modeled, since this app does not distinguish a pronaos zone)
    xSegs.filter(g=>g.k==='s').forEach(seg=>{
      const gapX=xe(seg.xM), gapW=seg.wM*PPM;
      const metW=(gapW-2*tW)/3;
      if(metW>1){
        let x=gapX;
        for(let i=0;i<3;i++){
          s+=`<rect x="${x}" y="${yFrTop}" width="${metW}" height="${tH}" fill="rgba(235,230,220,0.9)" stroke="${K}" stroke-width=".5"/>`;
          x+=metW;
          if(i<2){ drawTriglyph(x); x+=tW; }
        }
      } else {
        // bay too narrow at this zoom for two extra triglyphs — fall back to one plain metope
        s+=`<rect x="${gapX}" y="${yFrTop}" width="${gapW}" height="${tH}" fill="rgba(235,230,220,0.9)" stroke="${K}" stroke-width=".5"/>`;
      }
    });
    if(PPM>=14)
      s+=`<text x="${eleX+eleW+corPx+4}" y="${yFrTop+H_z*PPM/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">frieze: triglyphs/metopes</text>`;
  } else {
    // Ionic/Corinthian: continuous sculptural frieze
    const frFill=order==='corinthian'?"rgba(0,0,0,0.035)":"rgba(0,0,0,0.04)";
    s+=`<rect x="${eleX}" y="${yFrTop}" width="${eleW}" height="${H_z*PPM}" fill="${frFill}" stroke="${K}" stroke-width=".7"/>`;
    // Subtle horizontal register lines (suggest relief panels)
    if(PPM>=20){
      const mid=yFrTop+H_z*PPM*0.5;
      s+=`<line x1="${eleX+PPM*0.5}" y1="${mid}" x2="${eleX+eleW-PPM*0.5}" y2="${mid}" stroke="${G}" stroke-width=".4" opacity=".5"/>`;
    }
    if(PPM>=14)
      s+=`<text x="${eleX+eleW+4}" y="${yFrTop+H_z*PPM/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">frieze</text>`;
  }

  // ─── ARCHITRAVE (epistyle) ─────────────────────────────────────────────────
  if(order==='doric'){
    // Doric: plain architrave + taenia at top + guttae (Book IV.3.4)
    s+=`<rect x="${eleX}" y="${yArchTop}" width="${eleW}" height="${H_a*PPM}" fill="rgba(0,0,0,0.10)" stroke="${K}" stroke-width=".85"/>`;
    if(PPM>=16){
      // Taenia: M_D/7 high (IV.3.4)
      const taH=(M_D/7)*PPM;
      s+=`<rect x="${eleX}" y="${yArchTop}" width="${eleW}" height="${taH}" fill="rgba(0,0,0,0.22)" stroke="none"/>`;
      // Regula + guttae below taenia, plumb with each triglyph (i.e. over each
      // column); drop length M_D/6 (IV.3.4); six guttae, matching the explicit
      // mutule count below since no separate regula count is given
      if(PPM>=20){
        const gDrop=(M_D/6)*PPM, gR=Math.min(gDrop*0.4, M_D*PPM*0.09);
        xCols.forEach(xc=>{
          const tW0=M_D*PPM, rx0=xe(xc.xM)+PPM/2-tW0/2;
          for(let gi=0;gi<6;gi++)
            s+=`<circle cx="${rx0+tW0*(gi+0.5)/6}" cy="${yArchTop+taH+gDrop}" r="${gR}" fill="rgba(0,0,0,0.28)" stroke="none"/>`;
        });
      }
    }
  } else {
    // Ionic/Corinthian: three projecting fasciae (Book III.5)
    s+=`<rect x="${eleX}" y="${yArchTop}" width="${eleW}" height="${H_a*PPM}" fill="rgba(0,0,0,0.10)" stroke="${K}" stroke-width=".85"/>`;
    if(PPM>=18){
      const frac=[0.40,0.35,0.25]; // height fractions bottom→top
      let fy=yArchTop+H_a*PPM;
      frac.forEach((fh,fi)=>{
        fy-=fh*H_a*PPM;
        const proj=(fi+1)*PPM*0.018;
        s+=`<rect x="${eleX-proj}" y="${fy}" width="${eleW+2*proj}" height="${fh*H_a*PPM-0.4}" fill="rgba(0,0,0,${0.04+fi*0.03})" stroke="${K}" stroke-width=".3" opacity=".7"/>`;
      });
    }
  }
  if(PPM>=14)
    s+=`<text x="${eleX+eleW+4}" y="${yArchTop+H_a*PPM/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">architrave</text>`;

  // ─── CELLA WALL (elevation) ─────────────────────────────────────────────────
  // The cella's front wall, recessed behind the colonnade, with a door cut into
  // it. Wall thickness isn't visible face-on in elevation (only the plan shows
  // it), so this is a single face rather than the outer/inner pair used in plan;
  // the door width and the wall's vertical extent are the same assumed values
  // used there. Drawn before the columns so they sit in front of it.
  if(innerOK){
    const wallTopY=yCapTop, wallBotY=yShaftB;
    s+=`<rect x="${xe(cx1)}" y="${wallTopY}" width="${(cx2-cx1)*PPM}" height="${wallBotY-wallTopY}" fill="rgba(90,72,50,0.10)" stroke="${K}" stroke-width=".6" opacity=".8"/>`;
    if(doorOK){
      const doorH=(wallBotY-wallTopY)*0.78, doorTopY=wallBotY-doorH;
      s+=`<rect x="${xe(doorX1)}" y="${doorTopY}" width="${(doorX2-doorX1)*PPM}" height="${doorH}" fill="${BG}" stroke="${K}" stroke-width=".6"/>`;
    }
    if(PPM>=14)
      s+=`<text x="${xe(cx1)-4}" y="${(wallTopY+wallBotY)/2}" text-anchor="end" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#bbb">cella wall (t=1d, assumed)</text>`;
  }

  // ─── PER-COLUMN ELEMENTS ────────────────────────────────────────────────────
  xCols.forEach((xc,idx)=>{
    const cx_=xe(xc.xM)+PPM/2;
    const isCorner=(xc.i===0||xc.i===nc-1);
    const cw=(isCorner?d_cor:1)*PPM;
    const tw=DT*cw;
    const bL=cx_-cw/2, bR=cx_+cw/2, tL=cx_-tw/2, tR=cx_+tw/2;
    const capH=H_cap*PPM, capBotY=yCapTop+capH; // capBotY = yShaftT

    // ── Capital ──────────────────────────────────────────────────────────────
    if(order==='doric'){
      // THREE BANDS — bottom→top: hypotrachelium · echinus · abacus (IV.3.4)
      const bh=capH/3;
      const abW=A_abacus*PPM;
      // Hypotrachelium (annulet zone at shaft top, same width as shaft)
      s+=`<rect x="${cx_-tw/2}" y="${yCapTop+2*bh}" width="${tw}" height="${bh}" fill="rgba(70,55,30,0.16)" stroke="${K}" stroke-width=".55"/>`;
      if(PPM>=18)[0.25,0.5,0.75].forEach(f=>
        s+=`<line x1="${cx_-tw/2}" y1="${yCapTop+2*bh+f*bh}" x2="${cx_+tw/2}" y2="${yCapTop+2*bh+f*bh}" stroke="${K}" stroke-width=".3" opacity=".45"/>` );
      // Echinus (cushion moulding — widens from tw to abW)
      s+=`<polygon points="${cx_-tw/2},${yCapTop+2*bh} ${cx_+tw/2},${yCapTop+2*bh} ${cx_+abW/2},${yCapTop+bh} ${cx_-abW/2},${yCapTop+bh}" fill="rgba(70,55,30,0.20)" stroke="${K}" stroke-width=".65"/>`;
      // Abacus (flat square slab at top) — B_cap=13M_D/6=13d/12 (corrected reading,
      // see note above oSpec), comfortably wider than the tapered shaft top
      s+=`<rect x="${cx_-abW/2}" y="${yCapTop}" width="${abW}" height="${bh}" fill="rgba(70,55,30,0.22)" stroke="${K}" stroke-width=".75"/>`;
      if(idx===0&&PPM>=17){
        const lx=cx_-abW/2-3;
        s+=`<text x="${lx}" y="${yCapTop+bh/2}"   text-anchor="end" dominant-baseline="middle" font-size="6"   font-family="Georgia,serif" fill="#999">abacus</text>`;
        s+=`<text x="${lx}" y="${yCapTop+3*bh/2}" text-anchor="end" dominant-baseline="middle" font-size="6"   font-family="Georgia,serif" fill="#999">echinus</text>`;
        s+=`<text x="${lx}" y="${yCapTop+5*bh/2}" text-anchor="end" dominant-baseline="middle" font-size="5.5" font-family="Georgia,serif" fill="#999">hypotrachelium</text>`;
      }
    } else if(order==='corinthian'){
      // CORINTHIAN — four bands per IV.1.11–12: lower leaf, middle leaf, and
      // caulicoli each (6d/7)/3 = 2d/7; abacus = d/7 on top. Abacus is a square
      // whose diagonal = 2×H_cap(=2d), so its side = d√2 (confirmed across the
      // Morgan, Gwilt, and Loeb translations). A concave "pillow" profile on the
      // abacus's plan faces is a true plan-view feature, not visible in strict
      // elevation, so it's hinted here only as a shallow notch on the silhouette
      // — a common simplification in pattern-book elevation drawings.
      const bandH=capH/7;                 // = H_abacus, and the unit for the 3 leaf/caulicoli bands
      const leafH=2*bandH;                // each of the 3 lower bands
      const abW=A_abacus*PPM;             // d√2, from diagonal=2×H_cap
      const crownW=abW*0.85;              // bell crown width below the abacus (interpretive)
      const yLeaf1=capBotY-leafH, yLeaf2=yLeaf1-leafH, yCaul=yLeaf2-leafH; // = yCapTop+bandH

      // Bell body (kalathos) — tapers from tw (shaft top) to crownW (top of caulicoli zone)
      s+=`<polygon points="${cx_-tw/2},${capBotY} ${cx_+tw/2},${capBotY} ${cx_+crownW/2},${yCaul} ${cx_-crownW/2},${yCaul}" fill="rgba(0,0,0,0.065)" stroke="${K}" stroke-width=".65"/>`;
      // Tier lines at exact band boundaries (lower leaf / middle leaf / caulicoli)
      [yLeaf1, yLeaf2].forEach(ly=>{
        const t=(capBotY-ly)/leafH/3, lw=tw+(crownW-tw)*((capBotY-ly)/(capBotY-yCaul));
        s+=`<line x1="${cx_-lw/2}" y1="${ly}" x2="${cx_+lw/2}" y2="${ly}" stroke="${K}" stroke-width=".4" opacity=".32"/>`;
      });
      // Leaf cuspid marks in the two leaf bands
      if(PPM>=22)[ [capBotY,yLeaf1], [yLeaf1,yLeaf2] ].forEach(([yb,yt])=>{
        const lwB=tw+(crownW-tw)*((capBotY-yb)/(capBotY-yCaul));
        const lwT=tw+(crownW-tw)*((capBotY-yt)/(capBotY-yCaul));
        const ly=(yb+yt)/2, lw=(lwB+lwT)/2;
        for(let ci_=1;ci_<=4;ci_++){
          const lcx=cx_-lw/2+lw*ci_/5;
          s+=`<path d="M${lcx},${ly-1.2} Q${lcx+1.8},${ly-3.2} ${lcx+2.8},${ly-1}" stroke="${K}" stroke-width=".32" fill="none" opacity=".38"/>`;
          s+=`<path d="M${lcx},${ly-1.2} Q${lcx-1.8},${ly-3.2} ${lcx-2.8},${ly-1}" stroke="${K}" stroke-width=".32" fill="none" opacity=".38"/>`;
        }
      });
      // Caulicoli band — corner volutes spring toward the abacus angles (IV.1.12)
      if(PPM>=18){
        const vr=PPM*0.10;
        [cx_-abW/2+vr*1.2, cx_+abW/2-vr*1.2].forEach(vx=>{
          s+=`<circle cx="${vx}" cy="${yCaul-leafH*0.45}" r="${vr}" fill="none" stroke="${K}" stroke-width=".45" opacity=".5"/>`;
          s+=`<line x1="${vx}" y1="${yCaul-leafH*0.45-vr}" x2="${vx}" y2="${yCapTop}" stroke="${K}" stroke-width=".35" opacity=".35"/>`;
        });
      }
      // Abacus: d/7 tall, side=d√2; shallow concave notch hints the plan-view
      // "pillow" curve (true curve depth = side/9, per IV.1.11)
      const notch=(abW/9)*0.4; // shown shallow since this is an elevation hint, not the true plan curve
      s+=`<path d="M${cx_-abW/2},${yCapTop+bandH} L${cx_-abW/2},${yCapTop+notch} Q${cx_},${yCapTop-notch*0.5} ${cx_+abW/2},${yCapTop+notch} L${cx_+abW/2},${yCapTop+bandH} Z" fill="rgba(0,0,0,0.12)" stroke="${K}" stroke-width=".75"/>`;
      // Flower centered on the abacus face, diameter = H_abacus = d/7 (IV.1.12)
      if(PPM>=20)
        s+=`<circle cx="${cx_}" cy="${yCapTop+bandH*0.62}" r="${bandH*0.42}" fill="none" stroke="${K}" stroke-width=".4" opacity=".55"/>`;
      if(idx===0&&PPM>=14){
        s+=`<text x="${cx_-abW/2-3}" y="${yCapTop+bandH/2}" text-anchor="end" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#999">abacus d/7</text>`;
        s+=`<text x="${cx_-crownW/2-3}" y="${yCaul-leafH*1.5}" text-anchor="end" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#999">caulicoli</text>`;
        s+=`<text x="${cx_-tw/2-3}" y="${capBotY-leafH*0.5}" text-anchor="end" dominant-baseline="middle" font-size="6" font-family="Georgia,serif" fill="#999">lower leaf</text>`;
      }
    } else {
      // IONIC: abacus (thin rect) + echinus (trapezoid) + necking astragal (doc §4.5)
      const abH=capH*0.26, echH=capH*0.74;
      const abW=A_abacus*PPM;
      const abL=cx_-abW/2, abR=cx_+abW/2;
      // Echinus (cushion tapers from tw to abW)
      s+=`<polygon points="${cx_-tw/2},${capBotY} ${cx_+tw/2},${capBotY} ${abR},${yCapTop+abH} ${abL},${yCapTop+abH}" fill="rgba(0,0,0,0.07)" stroke="${K}" stroke-width=".6"/>`;
      // Abacus
      s+=`<rect x="${abL}" y="${yCapTop}" width="${abW}" height="${abH}" fill="rgba(0,0,0,0.10)" stroke="${K}" stroke-width=".75"/>`;
      // Volute scrolls — decorative only, not a precise Vitruvian construction
      // (Book III.5's actual volute-eye/quadrant method is not replicated here)
      if(PPM>=9){
        const vr=echH*0.40, vy=yCapTop+abH+echH*0.32;
        [[abL+echH*0.22,false],[abR-echH*0.22,true]].forEach(([vx,mir])=>{
          s+=`<path d="${spiralPath(vx,vy,vr,1.6,mir)}" fill="none" stroke="${K}" stroke-width=".7" opacity=".62"/>`;
          s+=`<circle cx="${vx}" cy="${vy}" r="${Math.max(.5,vr*0.07)}" fill="${K}" opacity=".55"/>`;
        });
      }
      // Necking astragal at shaft junction
      if(PPM>=18)
        s+=`<line x1="${cx_-tw/2}" y1="${capBotY-PPM*0.045}" x2="${cx_+tw/2}" y2="${capBotY-PPM*0.045}" stroke="${K}" stroke-width="1.3" opacity=".22"/>`;
      if(idx===0&&PPM>=14)
        s+=`<text x="${abL-3}" y="${yCapTop+abH/2}" text-anchor="end" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">capital</text>`;
    }

    // ── Shaft ─────────────────────────────────────────────────────────────────
    const isFirst=idx===0;
    const shFill=order==='doric'?"rgba(70,55,30,0.10)":"rgba(0,0,0,0.09)";
    if(isFirst){
      s+=`<polygon points="${bL},${yShaftB} ${bR},${yShaftB} ${tR},${yShaftT} ${tL},${yShaftT}" fill="${BG}" stroke="${K}" stroke-width=".9"/>`;
      const cr=PPM/2;
      for(let cy_=yShaftB-cr;cy_+cr>yShaftT-0.5;cy_-=PPM)
        s+=`<circle cx="${cx_}" cy="${cy_}" r="${cr}" fill="none" stroke="${K}" stroke-width=".85" clip-path="url(#sc0)"/>`;
    } else {
      s+=`<polygon points="${bL},${yShaftB} ${bR},${yShaftB} ${tR},${yShaftT} ${tL},${yShaftT}" fill="${shFill}" stroke="${K}" stroke-width=".7"/>`;
      // Fluting lines (elevation)
      if(PPM>=22){
        for(let fi=1;fi<Nf;fi++){
          const t=fi/Nf;
          s+=`<line x1="${bL+t*(bR-bL)}" y1="${yShaftB}" x2="${tL+t*(tR-tL)}" y2="${yShaftT}" stroke="${K}" stroke-width="${fi%4===0?.42:.20}" opacity=".18"/>`;
        }
      }
    }
    if(PPM>=10&&idx===0)
      s+=`<text x="${eleX+eleW+4}" y="${(yShaftT+yShaftB)/2}" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">shaft  h=${fmtN(hM)}M</text>`;

    // ── Base (Ionic/Corinthian only — Doric sits directly on stylobate) ───────
    if(hasBase){
      const bxL=cx_-B_b*PPM/2;
      s+=`<rect x="${bxL}" y="${yShaftB}" width="${B_b*PPM}" height="${H_b*PPM}" fill="rgba(0,0,0,0.08)" stroke="${K}" stroke-width=".7"/>`;
      // Attic base sub-mouldings: plinth (lower, d/6) · lower torus · scotia · upper torus (doc §4.3)
      if(PPM>=22){
        const bH=H_b*PPM;
        const plH=bH/3, torH=bH*0.20, scH=bH*0.18, tor2H=bH*0.12;
        // Plinth (lower projecting band)
        s+=`<rect x="${bxL}" y="${yShaftB+bH-plH}" width="${B_b*PPM}" height="${plH}" fill="rgba(0,0,0,0.07)" stroke="${K}" stroke-width=".35"/>`;
        // Upper torus (top projection)
        s+=`<rect x="${bxL+PPM*0.05}" y="${yShaftB}" width="${B_b*PPM-PPM*0.10}" height="${tor2H}" fill="rgba(0,0,0,0.06)" stroke="${K}" stroke-width=".3"/>`;
      }
      if(idx===0&&PPM>=14)
        s+=`<text x="${cx_-B_b*PPM/2-3}" y="${yShaftB+H_b*PPM/2}" text-anchor="end" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">base</text>`;
    }
  }); // end per-column

  // ── Note: Doric shaft sits on stylobate (no base) ─────────────────────────
  if(!hasBase&&PPM>=13)
    s+=`<text x="${eleX}" y="${yShaftB+7}" font-size="6" font-family="Georgia,serif" fill="#9b7050" opacity=".85">Doric: shaft sits directly on stylobate — no base</text>`;

  // ─── STEPS / CREPIDOMA (§5.4: stylobate = top step) ───────────────────────
  for(let i=0;i<NS;i++){
    const sy=yBaseB+i*SR*PPM, so=(i+1)*ST*PPM;
    s+=`<rect x="${eleX-so}" y="${sy}" width="${eleW+2*so}" height="${SR*PPM}" fill="rgba(0,0,0,${0.06+i*0.022})" stroke="${K}" stroke-width="${i===NS-1?.8:.6}"/>`;
  }
  if(PPM>=14)
    s+=`<text x="${eleX-SPXP-4}" y="${(yGround+yBaseB)/2}" text-anchor="end" dominant-baseline="middle" font-size="6.5" font-family="Georgia,serif" fill="#bbb">crepidoma  N=${NS}</text>`;

  // ─── SHAFT HEIGHT DIMENSION ────────────────────────────────────────────────
  const eDX=eleX-SPXP-26, eMid=(yShaftT+yShaftB)/2;
  if(hM*PPM>Adim*2){
    s+=`<line x1="${eleX-SPXP-2}" y1="${yShaftT}" x2="${eDX+2}" y2="${yShaftT}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${eleX-SPXP-2}" y1="${yShaftB}" x2="${eDX+2}" y2="${yShaftB}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${eDX}" y1="${yShaftT+Adim}" x2="${eDX}" y2="${yShaftB-Adim}" stroke="${K}" stroke-width=".75"/>`;
    s+=`<path d="M${eDX} ${yShaftT} l${-Adim/2} ${Adim} l${Adim} 0 Z" fill="${K}"/>`;
    s+=`<path d="M${eDX} ${yShaftB} l${-Adim/2} ${-Adim} l${Adim} 0 Z" fill="${K}"/>`;
    s+=`<text x="${eDX-9}" y="${eMid}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-family="Georgia,serif" fill="${K}" transform="rotate(-90,${eDX-9},${eMid})">${fmt(hM)}</text>`;
  }

  // ─── INTERCOLUMNIATION DIMS BELOW STEPS ────────────────────────────────────
  const eDY=yGround+20, eLY=eDY+11;
  xSegs.forEach(g=>{
    const x1=xe(g.xM),x2=xe(g.xM+g.wM),w=x2-x1,mid=(x1+x2)/2;
    s+=`<line x1="${x1}" y1="${yGround+2}" x2="${x1}" y2="${eDY+3}" stroke="${K}" stroke-width=".6"/>`;
    s+=`<line x1="${x2}" y1="${yGround+2}" x2="${x2}" y2="${eDY+3}" stroke="${K}" stroke-width=".6"/>`;
    if(w>Adim*2){
      s+=`<line x1="${x1+Adim}" y1="${eDY}" x2="${x2-Adim}" y2="${eDY}" stroke="${K}" stroke-width=".75"/>`;
      s+=`<path d="M${x1} ${eDY} l${Adim} ${-Adim/2} l0 ${Adim} Z" fill="${K}"/>`;
      s+=`<path d="M${x2} ${eDY} l${-Adim} ${-Adim/2} l0 ${Adim} Z" fill="${K}"/>`;
    }
    if(w>=12){
      const fc=g.ic?'#3a6640':K;
      s+=`<text x="${mid}" y="${eLY}" text-anchor="middle" font-size="${w<24?6.5:9}" font-family="Georgia,serif" fill="${fc}">${fmt(g.wM)}</text>`;
      if(g.ic&&w>=28)s+=`<text x="${mid}" y="${eLY+10}" text-anchor="middle" font-size="6" font-family="Georgia,serif" fill="${fc}" opacity=".6">center</text>`;
    }
  });

  return { vb:`0 0 ${svgW} ${svgH}`, html:s+defs };
}

// ═══ K-SLIDER ═════════════════════════════════════════════════════════════════
function KSlider({k, onChange, isDoric}){
  const min=1, max=4, step=0.25;
  const pct=v=>`${((v-min)/(max-min)*100).toFixed(2)}%`;
  return(
    <div style={{position:"relative",paddingBottom:"40px"}}>
      <div style={{fontSize:"8px",textTransform:"uppercase",letterSpacing:".14em",color:"#999",marginBottom:"5px"}}>
        Intercolumniation  k = s/d = {fmtN(k)}  {typeAtK(k)?`· ${typeAtK(k).n}`:"(between species)"}
        {isDoric&&<span style={{color:"#b07050",marginLeft:"8px"}}>· Doric: h=7d fixed — k affects plan only</span>}
      </div>
      <input type="range" min={min} max={max} step={step} value={k}
        onChange={e=>onChange(parseFloat(e.target.value))}
        style={{width:"100%",accentColor:"#1a1a1a"}}/>
      <div style={{position:"absolute",top:"28px",left:0,right:0}}>
        {VK.map(v=>{
          const active=Math.abs(k-v.k)<0.001;
          return(
            <div key={v.k} style={{position:"absolute",left:pct(v.k),transform:"translateX(-50%)",textAlign:"center",cursor:"pointer"}} onClick={()=>onChange(v.k)}>
              <div style={{width:"1px",height:"5px",background:active?"#1a1a1a":"#ccc",marginBottom:"1px"}}/>
              <span style={{fontSize:"7px",fontFamily:"Georgia,serif",color:active?"#1a1a1a":"#bbb",fontWeight:active?"bold":"normal",whiteSpace:"nowrap"}}>{v.n}</span>
            </div>
          );
        })}
      </div>
      <div style={{position:"absolute",top:"46px",left:0,right:0,pointerEvents:"none"}}>
        {[1,1.5,2,2.25,2.5,3,3.5,4].map(v=>(
          <div key={v} style={{position:"absolute",left:pct(v),transform:"translateX(-50%)",fontSize:"6.5px",fontFamily:"monospace",color:"#ccc"}}>{v}</div>
        ))}
      </div>
    </div>
  );
}

// ═══ EQUATIONS PANEL ══════════════════════════════════════════════════════════
function EqPanel({k, order, sp, wM, dM, S, p, vt}){
  const rows_ionic=[
    ["doc §4.1  h = f(k) [species]",    fmt(sp.hM)],
    ["doc §4.2  H_base = d/2",          "½ M"],
    ["doc §4.2  B_base = 1.5d",         "1½ M"],
    ["doc §4.2  e_b = d/4",             "¼ M"],
    ["doc §4.3  H_plinth = d/6",        "⅙ M"],
    ["Book IV.1.1  H_capital = d/3",    fmtN(1/3)+" M"],
    ["doc §4.5  A_abacus = 10d/9",      fmtN(10/9)+" M"],
    ["doc §4.5  H_abacus ≈ 0.26×H_cap", fmtN(0.26/3)+" M"],
    ["doc §4.6  N_flutes = 24; Δφ=15°", "24 · 15°"],
  ];
  const rows_doric=[
    ["doc §5.2  h = 7d [Doric fixed]",   fmt(sp.hM)],
    ["Book IV.3.4  M_D = d/2",           "½ M"],
    ["Book IV.3.4  H_capital = M_D",     "½ M (3 bands × d/6)"],
    ["Book IV.3.4  H_abacus = M_D/3",    fmtN(0.5/3)+" M"],
    ["Book IV.3.4  H_echinus = M_D/3",   fmtN(0.5/3)+" M"],
    ["Book IV.3.4  H_hypotrachelium = M_D/3",fmtN(0.5/3)+" M"],
    ["Book IV.3.4  B_abacus = 13M_D/6",  fmtN(13/12)+" M — corrected reading; flares out over the shaft"],
    ["Book IV.3.4  H_frieze = 1.5M_D",   fmtN(0.75)+" M"],
    ["Book IV.3.4  triglyph width = M_D",fmtN(0.5)+" M; 2 extra per bay → 3 metopes"],
    ["Book IV.3.4  taenia = M_D/7",      fmtN(0.5/7)+" M"],
    ["Book IV.3.4  guttae drop = M_D/6", fmtN(0.5/6)+" M; ×6 per mutule, ×6 per regula"],
    ["Book IV.3.6  H_corona+cymatia = 0.5M_D", fmtN(0.25)+" M"],
    ["Book IV.3.6  corona projection = M_D/3", fmtN(0.5/3)+" M"],
    ["doc §5.4  N_flutes = 20; Δφ=18°", "20 · 18°"],
    ["Base",                              "None — Doric sits on stylobate"],
  ];
  const rows_cor=[
    ["Book IV.1  h = f(k) [same as Ionic]", fmt(sp.hM)],
    ["Book IV.1.11  H_capital = d",          "1 M"],
    ["Book IV.1.11  A_abacus = d√2 (diag=2H_cap)", Math.SQRT2.toFixed(3)+" M"],
    ["Book IV.1.11  H_abacus = H_cap/7",     fmtN(1/7)+" M"],
    ["Book IV.1.12  H_lower leaf = 2d/7",    fmtN(2/7)+" M"],
    ["Book IV.1.12  H_middle leaf = 2d/7",   fmtN(2/7)+" M"],
    ["Book IV.1.12  H_caulicoli = 2d/7",     fmtN(2/7)+" M"],
    ["Book IV.1.12  flower diam. = H_abacus",fmtN(1/7)+" M"],
    ["doc §4.2   H_base = d/2 [as Ionic]",   "½ M"],
    ["doc §4.6   N_flutes = 24; Δφ=15°",    "24 · 15°"],
  ];
  const order_rows = order==='doric'?rows_doric:order==='corinthian'?rows_cor:rows_ionic;
  const shared=[
    ["§3       k = s/d",                    fmtN(k)],
    ["§3       c = s+d",                    fmtN(k+1)+" M"],
    ["doc §3   d_t = (5/6)d_b",             fmtN(DT)+" M"],
    ["§6       d_corner = 1.02d",           "1.02 M"],
    ["§8.1     H_architrave = d/2",         "½ M"],
    [`§8.2     H_frieze${order==='doric'?' (triglyph band)':''}`, fmt(sp.H_z)],
    ["§8.2     H_cornice",                  fmt(sp.H_cor)],
    ["Book III.5 H_pediment = W/9",         fmt(wM/9)],
    ["Book IV.4.1 pronaos = ¾·cella width", "shown when cella depth ≥ 2× its own width"],
    ["Book IV.4.1 cella = 5/4·cella width", "(uses cella's own width as the unit)"],
    ["§5.4     N_steps = 3 (odd)",          "3"],
    ["§3       W (front width)",            fmt(wM)],
    ["§5.3     L (depth)",                  fmt(dM)],
    ["§5.3     S = 2F−1",                   String(S)],
    ["§2       R (column ranks)",           String(p.R)],
  ];
  return(
    <div style={{padding:"8px 16px 12px",background:"#fff",borderTop:".5px solid #ddd",fontSize:"10px",lineHeight:"1.8",fontFamily:"monospace",color:"#666"}}>
      <div style={{fontFamily:"Georgia,serif",fontWeight:"bold",fontSize:"11px",color:"#333",marginBottom:"4px"}}>
        Active equations — {ORDERS[order].n} order
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px",maxWidth:"760px"}}>
        {[...order_rows,...shared].map(([lbl,val])=>(
          <div key={lbl} style={{display:"flex",gap:"6px"}}>
            <span style={{color:"#aaa",minWidth:"210px"}}>{lbl}</span>
            <span style={{color:"#333",fontWeight:"bold"}}>{val}</span>
          </div>
        ))}
      </div>
      {vt&&order!=='doric'&&<div style={{marginTop:"5px",color:"#888",fontFamily:"Georgia,serif",fontSize:"10px"}}>{vt.eq}</div>}
    </div>
  );
}

// ═══ MAIN APP ════════════════════════════════════════════════════════════════
const Bs={fontFamily:"Georgia,serif",fontSize:"10.5px",padding:"3px 9px",border:".5px solid #bbb",borderRadius:"2px",cursor:"pointer"};
const On={...Bs,background:"#1a1a1a",color:"#fff",borderColor:"#1a1a1a"};
const Off={...Bs,background:"transparent",color:"#1a1a1a"};

export default function App(){
  const [k,     setK]     = useState(2.25);
  const [nc,    setNc]    = useState(6);
  const [pt,    setPt]    = useState('peripteral');
  const [order, setOrder] = useState('ionic');
  const [showEq,setShowEq]= useState(false);

  const{vb,html}=useMemo(()=>genSVG(k,nc,pt,order),[k,nc,pt,order]);
  const p   = PT[pt];
  const sp  = oSpec(order,k);
  const vt  = typeAtK(k);
  const xd  = buildX(k,nc), yd=buildY(k,nc,pt);
  const S   = p.nY(nc);
  const cn  = nc===4?"Tetrastylos":nc===6?"Hexastylos":nc===8?"Octastylos":"Decastylos";

  return(
    <div style={{fontFamily:"Georgia,serif",background:"#e8e6e2",minHeight:"100vh",color:"#1a1a1a"}}>
    <div style={{maxWidth:"920px",margin:"0 auto"}}>

      {/* Header */}
      <div style={{padding:"11px 16px 8px",background:"#fff",borderBottom:".5px solid #ddd"}}>
        <div style={{fontSize:"14px",letterSpacing:".1em"}}>VITRUVIAN LOOM</div>
        <div style={{fontSize:"10px",color:"#777",fontFamily:"monospace"}}>
          De Architectura · Three Plan Types · Three Orders · Pediment · §2–8 + Book III.5 + IV.1, IV.3–4
        </div>
      </div>

      {/* Controls */}
      <div style={{padding:"8px 16px",background:"#fff",borderBottom:".5px solid #ddd",display:"flex",gap:"18px",flexWrap:"wrap",alignItems:"flex-end"}}>

        <div>
          <div style={{fontSize:"8px",textTransform:"uppercase",letterSpacing:".14em",color:"#999",marginBottom:"3px"}}>Plan Type</div>
          <div style={{display:"flex",gap:"2px"}}>
            {Object.entries(PT).map(([key,v])=>(
              <button key={key} style={pt===key?On:Off} onClick={()=>{setPt(key);setNc(NC_DEF[key]);}}>
                {v.n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{fontSize:"8px",textTransform:"uppercase",letterSpacing:".14em",color:"#999",marginBottom:"3px"}}>Front Columns F</div>
          <div style={{display:"flex",gap:"2px"}}>
            {[4,6,8,10].map(n=><button key={n} style={nc===n?On:Off} onClick={()=>setNc(n)}>{n}</button>)}
          </div>
        </div>

        <div>
          <div style={{fontSize:"8px",textTransform:"uppercase",letterSpacing:".14em",color:"#999",marginBottom:"3px"}}>Column Order</div>
          <div style={{display:"flex",gap:"2px"}}>
            {Object.entries(ORDERS).map(([key,v])=>(
              <button key={key} style={order===key?On:Off} onClick={()=>setOrder(key)}>{v.n}</button>
            ))}
          </div>
        </div>

        <div style={{marginLeft:"auto"}}>
          <button style={{...Off,fontSize:"9.5px",color:"#888"}} onClick={()=>setShowEq(e=>!e)}>
            {showEq?"Hide":"Show"} equations
          </button>
        </div>
      </div>

      {/* Slider */}
      <div style={{padding:"10px 16px 14px",background:"#fff",borderBottom:".5px solid #ddd"}}>
        <KSlider k={k} onChange={setK} isDoric={order==='doric'}/>
      </div>

      {showEq&&<EqPanel k={k} order={order} sp={sp} wM={xd.totalM} dM={yd.totalM} S={S} p={p} vt={vt}/>}

      {/* Drawing */}
      <div style={{padding:"12px 16px",overflowX:"auto",overflowY:"auto"}}>
        <div dangerouslySetInnerHTML={{__html:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" style="display:block;width:100%;height:auto">${html}</svg>`}}/>
      </div>

      {/* Status bar */}
      <div style={{padding:"9px 16px 14px",background:"#fff",borderTop:".5px solid #ddd",fontSize:"11px",lineHeight:"1.7",color:"#555",fontFamily:"Georgia,serif"}}>
        <div style={{fontWeight:"bold",fontSize:"12.5px",color:"#1a1a1a",marginBottom:"2px"}}>
          {p.n} {cn} · {ORDERS[order].n} · {order==='doric'?"h=7d (fixed)":(vt?vt.n:`k=${fmtN(k)}`)}
        </div>
        <div style={{fontSize:"10.5px",color:"#777"}}>
          {p.vitr}{order==='doric'
            ?" · h=7d; M_D=d/2; capital: abacus(13d/12)+echinus+hypotrachelium; frieze=1.5M_D w/ 3 metopes per bay; corona=0.5M_D, proj M_D/3; Nf=20; no base."
            :order==='corinthian'
            ?" · h=f(k); H_cap=d (4 bands: 2× leaf + caulicoli, each 2d/7, +abacus d/7); A_abacus=d√2; Nf=24; base as Ionic; modillions."
            :(vt?` · ${vt.eq}.`:` · s=${fmtN(k)}d; h=${fmtN(sp.hM)}d (interpolated); H_cap=d/3 (Book IV.1.1).`)}
        </div>
        <div style={{display:"flex",gap:"12px",marginTop:"7px",paddingTop:"7px",borderTop:".5px solid #eee",flexWrap:"wrap"}}>
          {[
            ["k",        fmtN(k)],
            ["h",        fmt(sp.hM)],
            ["dt/db",    "⁵⁄₆"],
            ["Nf",       String(sp.Nf)],
            ["H_ped",    fmt(xd.totalM/9)],
            ["W",        fmt(xd.totalM)],
            ["L",        fmt(yd.totalM)],
            ["H_base",   sp.hasBase?"½M":"—"],
            ["H_cap",    fmt(sp.H_cap)],
            ["H_ent",    fmtN(sp.H_ent)+"M"],
            ["S=2F−1",   String(S)],
            ["R",        String(p.R)],
          ].map(([l,v])=>(
            <div key={l} style={{display:"flex",flexDirection:"column",gap:"1px"}}>
              <div style={{fontSize:"13px"}}>{v}</div>
              <div style={{fontSize:"8.5px",textTransform:"uppercase",letterSpacing:".08em",color:"#aaa"}}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
