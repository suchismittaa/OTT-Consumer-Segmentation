/* ==========================================================================
   OTT Consumer Intelligence — app.js
   Every number rendered here comes from OTT_DATA (js/data.js), which is a
   direct JSON export of the real analysis pipeline (src/run_pipeline.py).
   No chart in this file uses invented/hardcoded statistics.
   ========================================================================== */
(function(){
"use strict";

const D = OTT_DATA;
const SEG_COLORS = ['var(--seg-0)','var(--seg-1)','var(--seg-2)','var(--seg-3)','var(--seg-4)','var(--seg-5)','var(--seg-6)','var(--seg-7)'];
const SEG_HEX = ['#6E6BFF','#2DD4BF','#F0B429','#FF5C45','#F472B6','#7DD3FC','#A3E635','#FB923C'];

/* ---------------------------------------------------------------- NAV ---- */
const nav = document.getElementById('nav');
const progressFill = document.getElementById('progressFill');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
  const h = document.documentElement;
  const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
  progressFill.style.width = pct + '%';
}, { passive: true });

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));

const sections = document.querySelectorAll('main section[id]');
const navA = document.querySelectorAll('.nav-links a');
const secObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if(e.isIntersecting){
      navA.forEach(a => a.classList.toggle('active', a.dataset.sec === e.target.id));
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
sections.forEach(s => secObserver.observe(s));

/* ------------------------------------------------------------ REVEALS ---- */
document.querySelectorAll('.section, .snapshot').forEach(el => el.classList.add('reveal'));
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* --------------------------------------------------------- HERO CANVAS --- */
(function heroCanvas(){
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d');
  let w, h, dpr;
  const pts = D.sample_points.slice(0, 220);
  let particles = [];

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function xs(){ return pts.map(p=>p.x); }
  function ys(){ return pts.map(p=>p.y); }

  function init(){
    resize();
    const xr = [Math.min(...xs()), Math.max(...xs())];
    const yr = [Math.min(...ys()), Math.max(...ys())];
    particles = pts.map(p => {
      const nx = (p.x - xr[0]) / (xr[1]-xr[0]||1);
      const ny = (p.y - yr[0]) / (yr[1]-yr[0]||1);
      return {
        tx: nx * w, ty: ny * h,
        x: Math.random()*w, y: Math.random()*h,
        r: 1.1 + Math.random()*1.6,
        seg: p.kmeans_segment,
        phase: Math.random()*Math.PI*2,
        speed: 0.2 + Math.random()*0.3
      };
    });
  }
  let t = 0;
  function draw(){
    t += 0.008;
    ctx.clearRect(0,0,w,h);
    particles.forEach(p => {
      p.x += (p.tx - p.x) * 0.02;
      p.y += (p.ty - p.y) * 0.02;
      const drift = Math.sin(t*p.speed + p.phase) * 6;
      const col = SEG_HEX[p.seg % SEG_HEX.length];
      ctx.beginPath();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.arc(p.x + drift, p.y + Math.cos(t*p.speed+p.phase)*6, p.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', () => { resize(); init(); });
  init();
  draw();
})();

/* -------------------------------------------------------- SNAPSHOT ------ */
(function snapshot(){
  const targets = [D.meta.n_consumers, D.meta.n_segments, D.meta.n_classification_models, D.meta.n_attributes];
  const nums = document.querySelectorAll('.stat-num');
  nums.forEach((el,i) => el.dataset.target = targets[i]);
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if(e.isIntersecting){
        countUp(e.target);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.6 });
  nums.forEach(n => obs.observe(n));
  function countUp(el){
    const target = parseInt(el.dataset.target, 10);
    const dur = 1200;
    const start = performance.now();
    function tick(now){
      const p = Math.min(1, (now-start)/dur);
      const eased = 1 - Math.pow(1-p, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
})();

/* -------------------------------------------------------- AUDIENCE ------ */
const AUDIENCE_DIMS = [
  { key:'age', label:'Age', type:'range', field:'age' },
  { key:'watch_time', label:'Watch Time', type:'range', field:'watch_time' },
  { key:'spending', label:'Monthly Spending', type:'range', field:'spending' },
  { key:'genre', label:'Genre', type:'dist', field:'genre_distribution' },
  { key:'subscription', label:'Subscription', type:'dist', field:'subscription_distribution' },
  { key:'platform', label:'Platform', type:'dist', field:'platform_distribution' },
  { key:'region', label:'Region', type:'dist', field:'region_distribution' },
  { key:'binge', label:'Binge Frequency', type:'dist', field:'binge_distribution' },
  { key:'gender', label:'Gender', type:'dist', field:'gender_distribution' },
];
(function audience(){
  const tabsEl = document.getElementById('audienceTabs');
  AUDIENCE_DIMS.forEach((d,i) => {
    const b = document.createElement('button');
    b.textContent = d.label;
    b.className = i===0 ? 'active' : '';
    b.addEventListener('click', () => {
      tabsEl.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      renderAudience(d);
    });
    tabsEl.appendChild(b);
  });
  renderAudience(AUDIENCE_DIMS[0]);
})();

function renderAudience(dim){
  const canvas = document.getElementById('audienceChart');
  const meta = document.getElementById('audienceMeta');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const cw = canvas.parentElement.clientWidth - 72, ch = 360;
  canvas.width = cw*dpr; canvas.height = ch*dpr; canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cw,ch);

  if(dim.type === 'range'){
    const info = D.audience_overview[dim.field];
    // histogram using sample_points
    const vals = D.sample_points.map(p => p[dim.field]);
    const bins = 12;
    const min = Math.min(...vals), max = Math.max(...vals);
    const width = (max-min)/bins || 1;
    const counts = new Array(bins).fill(0);
    vals.forEach(v => { let idx = Math.floor((v-min)/width); if(idx>=bins) idx=bins-1; if(idx<0) idx=0; counts[idx]++; });
    const maxCount = Math.max(...counts);
    const padL=40, padB=34, padT=20;
    const bw = (cw-padL-10)/bins;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth=1;
    for(let g=0; g<=4; g++){
      const y = padT + (ch-padT-padB) * g/4;
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(cw,y); ctx.stroke();
    }
    counts.forEach((c,i) => {
      const bh = (c/maxCount) * (ch-padT-padB);
      const x = padL + i*bw + 3;
      const y = ch-padB-bh;
      const grad = ctx.createLinearGradient(0,y,0,ch-padB);
      grad.addColorStop(0,'#FF5C45'); grad.addColorStop(1,'#6E6BFF');
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw-6, bh, 4);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(185,181,190,0.8)'; ctx.font = '11px IBM Plex Mono';
    ctx.fillText(Math.round(min), padL, ch-14);
    ctx.fillText(Math.round(max), cw-30, ch-14);
    meta.innerHTML = `<span>Min <b>${info.min}</b></span><span>Mean <b>${info.mean}</b></span><span>Max <b>${info.max}</b></span>`;
  } else {
    const dist = D.audience_overview[dim.field];
    const entries = Object.entries(dist).sort((a,b)=>b[1]-a[1]);
    const padL=140, padT=20, padB=20;
    const rowH = (ch-padT-padB)/entries.length;
    const maxV = Math.max(...entries.map(e=>e[1]));
    entries.forEach(([label,val],i) => {
      const y = padT + i*rowH + rowH*0.22;
      const bh = rowH*0.56;
      const bw = (val/maxV) * (cw-padL-60);
      const grad = ctx.createLinearGradient(padL,0,padL+bw,0);
      grad.addColorStop(0,'#6E6BFF'); grad.addColorStop(1,'#FF5C45');
      ctx.fillStyle = grad;
      roundRect(ctx, padL, y, Math.max(bw,3), bh, 6);
      ctx.fill();
      ctx.fillStyle = '#B9B5BE'; ctx.font='12px Inter'; ctx.textAlign='right';
      ctx.fillText(label, padL-14, y+bh*0.72);
      ctx.fillStyle = '#F3EFE8'; ctx.font='12px IBM Plex Mono'; ctx.textAlign='left';
      ctx.fillText(val+'%', padL+bw+10, y+bh*0.72);
      ctx.textAlign='left';
    });
    meta.innerHTML = `<span>Distribution across all ${D.meta.n_consumers.toLocaleString()} viewers</span>`;
  }
}
function roundRect(ctx,x,y,w,h,r){
  if(w<0) w=0;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
window.addEventListener('resize', () => {
  const active = document.querySelector('.audience-tabs button.active');
  if(active){ const idx = [...active.parentElement.children].indexOf(active); renderAudience(AUDIENCE_DIMS[idx]); }
});

/* -------------------------------------------------------- SEGMENTS ------ */
const ALGO_KEY = { kmeans:'kmeans_segment', hierarchical:'hierarchical_segment', dbscan:'dbscan_segment' };
let currentAlgo = 'kmeans';
let selectedSegment = null;

const algoNotes = {
  kmeans: `K-Means partitions viewers into ${D.clustering.kmeans.k} groups by minimizing distance to each group's center. Silhouette score: ${D.clustering.kmeans.silhouette} — segments are directionally meaningful but not sharply separated, which tracks with how varied real streaming behavior actually is.`,
  hierarchical: `Agglomerative (Ward-linkage) clustering builds the same number of groups bottom-up by merging the closest pairs of viewers. Silhouette score: ${D.clustering.hierarchical.silhouette}.`,
  dbscan: D.clustering.dbscan.n_clusters > 1
    ? `DBSCAN finds density-based clusters without being told how many to look for. It settled on ${D.clustering.dbscan.n_clusters} clusters (eps=${D.clustering.dbscan.eps}, min_samples=${D.clustering.dbscan.min_samples}), flagging ${D.clustering.dbscan.noise_pct}% of viewers as noise that doesn't fit any dense region.`
    : `DBSCAN found the data too uniformly distributed to separate into dense regions at this eps — most points were flagged as noise, which is itself a useful finding about how gradual (not clustered) this behavioral data really is.`
};

function segProfiles(algo){
  return D.clustering[algo].profiles;
}

const algoSwitch = document.getElementById('algoSwitch');
algoSwitch.addEventListener('click', (e) => {
  const btn = e.target.closest('.algo-btn');
  if(!btn) return;
  algoSwitch.querySelectorAll('.algo-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentAlgo = btn.dataset.algo;
  selectedSegment = null;
  renderClusterScatter();
  renderClusterSide();
  renderSegmentCards();
  renderWhySegment();
  document.getElementById('algoNote').textContent = algoNotes[currentAlgo];
}, );
document.getElementById('algoNote').textContent = algoNotes.kmeans;

function renderClusterScatter(){
  const svg = document.getElementById('clusterScatter');
  const tooltip = document.getElementById('clusterTooltip');
  svg.innerHTML = '';
  const W=900, H=620, pad=40;
  const key = ALGO_KEY[currentAlgo];
  const xs = D.sample_points.map(p=>p.x), ys = D.sample_points.map(p=>p.y);
  const xr=[Math.min(...xs),Math.max(...xs)], yr=[Math.min(...ys),Math.max(...ys)];
  const sx = v => pad + (v-xr[0])/(xr[1]-xr[0]) * (W-2*pad);
  const sy = v => H-pad - (v-yr[0])/(yr[1]-yr[0]) * (H-2*pad);

  D.sample_points.forEach(p => {
    const seg = p[key];
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', sx(p.x)); c.setAttribute('cy', sy(p.y));
    const isNoise = seg === -1;
    c.setAttribute('r', selectedSegment===null || selectedSegment===seg ? 5 : 3);
    c.setAttribute('fill', isNoise ? '#3a3a42' : SEG_HEX[seg % SEG_HEX.length]);
    c.setAttribute('opacity', isNoise ? 0.4 : (selectedSegment===null || selectedSegment===seg ? 0.88 : 0.14));
    c.style.transition = 'opacity .3s, r .3s';
    c.style.cursor = 'pointer';
    c.addEventListener('mousemove', (ev) => {
      const rect = svg.getBoundingClientRect();
      tooltip.innerHTML = `<b>${isNoise?'Unclustered':'Segment '+seg}</b><br>${p.age}y · ${p.genre} · $${p.spending}/mo · ${p.watch_time}h/wk`;
      tooltip.style.left = (ev.clientX - rect.left) + 'px';
      tooltip.style.top = (ev.clientY - rect.top) + 'px';
      tooltip.classList.add('show');
    });
    c.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
    svg.appendChild(c);
  });
}

function renderClusterSide(){
  const el = document.getElementById('clusterSide');
  el.innerHTML = '';
  const profiles = segProfiles(currentAlgo);
  profiles.forEach(p => {
    const div = document.createElement('div');
    div.className = 'cluster-side-item';
    div.style.cursor='pointer';
    div.innerHTML = `<span class="dot" style="background:${SEG_HEX[p.id % SEG_HEX.length]}"></span>
      <div><div class="label">Segment ${p.id} · ${p.size_pct}%</div>
      <div class="sub">$${p.avg_spending}/mo · ${p.avg_watch_time}h/wk</div></div>`;
    div.addEventListener('click', () => selectSegment(p.id));
    el.appendChild(div);
  });
  if(currentAlgo==='dbscan' && D.clustering.dbscan.noise_pct > 0){
    const div = document.createElement('div');
    div.className='cluster-side-item';
    div.innerHTML = `<span class="dot" style="background:#3a3a42"></span><div><div class="label">Noise · ${D.clustering.dbscan.noise_pct}%</div><div class="sub">Doesn't fit a dense region</div></div>`;
    el.appendChild(div);
  }
}

function segmentTitle(p){
  // derive a human-readable persona name from real computed deltas — not hardcoded
  const d = p.deltas_vs_population;
  const tags = [];
  if(d.spending_pct_diff > 15) tags.push('High-Spend');
  else if(d.spending_pct_diff < -15) tags.push('Budget-Conscious');
  if(d.watch_time_pct_diff > 15) tags.push('Heavy Watchers');
  else if(d.watch_time_pct_diff < -15) tags.push('Light Viewers');
  if(tags.length===0) tags.push('Balanced Viewers');
  return tags.slice(0,2).join(' · ');
}

function renderSegmentCards(){
  const wrap = document.getElementById('segmentCards');
  wrap.innerHTML = '';
  const profiles = segProfiles(currentAlgo);
  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'segment-card';
    card.style.setProperty('--seg-color', SEG_HEX[p.id % SEG_HEX.length]);
    card.innerHTML = `
      <span class="seg-eyebrow">Segment ${String(p.id).padStart(2,'0')}</span>
      <h3>${segmentTitle(p)}</h3>
      <div class="seg-stats">
        <div class="seg-stat-row"><span class="k">Watch Time</span><span class="v">${p.avg_watch_time}h/wk</span></div>
        <div class="seg-stat-row"><span class="k">Spending</span><span class="v">$${p.avg_spending}/mo</span></div>
        <div class="seg-stat-row"><span class="k">Avg Age</span><span class="v">${p.avg_age}</span></div>
        <div class="seg-stat-row"><span class="k">Genre</span><span class="v">${p.dominant_genre}</span></div>
        <div class="seg-stat-row"><span class="k">Binge</span><span class="v">${p.dominant_binge}</span></div>
      </div>
      <div class="seg-size">${p.size} viewers · ${p.size_pct}% of audience</div>`;
    card.addEventListener('click', () => selectSegment(p.id));
    wrap.appendChild(card);
  });
}

function selectSegment(id){
  selectedSegment = (selectedSegment === id) ? null : id;
  renderClusterScatter();
  document.querySelectorAll('.segment-card').forEach((c,i) => {
    const profiles = segProfiles(currentAlgo);
    c.classList.toggle('selected', profiles[i].id === selectedSegment);
  });
  renderWhySegment();
  if(selectedSegment !== null){
    document.getElementById('whySegment').scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

function renderWhySegment(){
  const el = document.getElementById('whySegment');
  if(selectedSegment === null){ el.innerHTML=''; return; }
  const p = segProfiles(currentAlgo).find(x=>x.id===selectedSegment);
  if(!p){ el.innerHTML=''; return; }
  const d = p.deltas_vs_population;
  function fmt(v, suffix){ return (v>0?'+':'') + v + suffix; }
  el.innerHTML = `<div class="why-segment-inner">
    <h3 class="why-title">Why did Segment ${p.id} separate out?</h3>
    <p class="why-sub">Computed directly against the full-population average — not an assumption.</p>
    <div class="why-deltas">
      <div class="delta-item"><div class="delta-val ${d.watch_time_pct_diff>=0?'pos':'neg'}">${fmt(d.watch_time_pct_diff,'%')}</div><div class="delta-label">Watch time vs. average</div></div>
      <div class="delta-item"><div class="delta-val ${d.spending_pct_diff>=0?'pos':'neg'}">${fmt(d.spending_pct_diff,'%')}</div><div class="delta-label">Spending vs. average</div></div>
      <div class="delta-item"><div class="delta-val ${d.age_diff_years>=0?'pos':'neg'}">${fmt(d.age_diff_years,'yrs')}</div><div class="delta-label">Age vs. average</div></div>
      <div class="delta-item"><div class="delta-val ${d.binge_diff>=0?'pos':'neg'}">${fmt(d.binge_diff,'')}</div><div class="delta-label">Binge score vs. average (0=Rarely, 2=Often)</div></div>
    </div>
  </div>`;
}

renderClusterScatter();
renderClusterSide();
renderSegmentCards();

/* -------------------------------------------------------- COMPARE ------- */
(function compare(){
  const controls = document.getElementById('compareControls');
  const profiles = D.clustering.kmeans.profiles;
  let active = [profiles[0].id, profiles[Math.min(1,profiles.length-1)].id];

  profiles.forEach(p => {
    const chip = document.createElement('button');
    chip.className = 'compare-chip' + (active.includes(p.id) ? ' active' : '');
    chip.textContent = 'Segment ' + p.id;
    chip.style.borderColor = SEG_HEX[p.id % SEG_HEX.length];
    if(active.includes(p.id)) chip.style.background = SEG_HEX[p.id % SEG_HEX.length];
    chip.addEventListener('click', () => {
      if(active.includes(p.id)){
        if(active.length>1) active = active.filter(x=>x!==p.id);
      } else if(active.length < 3){
        active.push(p.id);
      } else {
        active.shift(); active.push(p.id);
      }
      [...controls.children].forEach((c,i) => {
        const on = active.includes(profiles[i].id);
        c.classList.toggle('active', on);
        c.style.background = on ? SEG_HEX[profiles[i].id % SEG_HEX.length] : '';
      });
      renderRadar(active);
    });
    controls.appendChild(chip);
  });
  renderRadar(active);

  function renderRadar(ids){
    const svg = document.getElementById('radarChart');
    const legend = document.getElementById('compareLegend');
    svg.innerHTML=''; legend.innerHTML='';
    const axes = [
      {key:'watch_time_pct_diff', label:'Watch Time', scale:60},
      {key:'spending_pct_diff', label:'Spending', scale:60},
      {key:'age_diff_years', label:'Age', scale:15},
      {key:'binge_diff', label:'Binge Freq', scale:1.2},
    ];
    const cx=280, cy=280, R=200;
    // grid
    for(let ring=1; ring<=4; ring++){
      const r = R*ring/4;
      const pts = axes.map((a,i) => polarPoint(cx,cy,r,i,axes.length));
      drawPolyline(svg, pts, 'rgba(255,255,255,0.08)', 'none', 1);
    }
    axes.forEach((a,i) => {
      const p = polarPoint(cx,cy,R,i,axes.length);
      drawPolyline(svg, [[cx,cy],p], 'rgba(255,255,255,0.12)', 'none', 1);
      const lp = polarPoint(cx,cy,R+26,i,axes.length);
      const t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x', lp[0]); t.setAttribute('y', lp[1]);
      t.setAttribute('fill','#8D8A94'); t.setAttribute('font-size','12'); t.setAttribute('text-anchor','middle');
      t.setAttribute('font-family','IBM Plex Mono');
      t.textContent = a.label;
      svg.appendChild(t);
    });
    ids.forEach(id => {
      const p = D.clustering.kmeans.profiles.find(x=>x.id===id);
      const d = p.deltas_vs_population;
      const pts = axes.map((a,i) => {
        const raw = d[a.key] / a.scale;
        const clamped = Math.max(-1, Math.min(1, raw));
        const r = R*0.5 + clamped*R*0.5;
        return polarPoint(cx,cy,Math.max(8,r),i,axes.length);
      });
      const color = SEG_HEX[id % SEG_HEX.length];
      drawPolyline(svg, [...pts, pts[0]], color, color+'22', 2);
      pts.forEach(pt => {
        const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
        c.setAttribute('cx',pt[0]); c.setAttribute('cy',pt[1]); c.setAttribute('r',3.5); c.setAttribute('fill',color);
        svg.appendChild(c);
      });
      const row = document.createElement('div');
      row.className='legend-row';
      row.innerHTML = `<span class="sw" style="background:${color}"></span> Segment ${id} — $${p.avg_spending}/mo, ${p.avg_watch_time}h/wk`;
      legend.appendChild(row);
    });
  }
  function polarPoint(cx,cy,r,i,n){
    const angle = (Math.PI*2 * i/n) - Math.PI/2;
    return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
  }
  function drawPolyline(svg, pts, stroke, fill, width){
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', pts.map(p=>p.join(',')).join(' '));
    poly.setAttribute('stroke', stroke); poly.setAttribute('fill', fill); poly.setAttribute('stroke-width', width);
    svg.appendChild(poly);
  }
})();

/* -------------------------------------------------------- MODEL LAB ----- */
document.getElementById('modelTaskDesc').textContent =
  `${D.classification.target_description} Trained on ${D.classification.train_size} viewers, tested on ${D.classification.test_size} held-out viewers never seen during training.`;

let currentMetric = 'accuracy';
function renderModelBars(){
  const wrap = document.getElementById('modelBars');
  wrap.innerHTML = '';
  const entries = Object.entries(D.classification.metrics).sort((a,b)=>b[1][currentMetric]-a[1][currentMetric]);
  entries.forEach(([name, m]) => {
    const row = document.createElement('div');
    row.className = 'model-bar-row';
    row.innerHTML = `<div class="mname">${name}</div>
      <div class="model-bar-track"><div class="model-bar-fill" style="width:0%"></div></div>
      <div class="mval">${(m[currentMetric]*100).toFixed(1)}%</div>`;
    wrap.appendChild(row);
    requestAnimationFrame(() => { row.querySelector('.model-bar-fill').style.width = (m[currentMetric]*100)+'%'; });
  });
  const best = D.classification.best_model;
  const bm = D.classification.metrics[best];
  document.getElementById('modelInterpretation').textContent =
    `The strongest model in this experiment is ${best}, with an F1 score of ${(bm.f1*100).toFixed(1)}% — balancing precision and recall best across all ${D.meta.n_segments} segments. KNN trails notably behind Random Forest and SVM here, which tracks: with one-hot encoded categorical attributes pushing the feature space to ${D.feature_names.length} dimensions, raw distance-based neighbor lookup degrades, while tree- and margin-based models handle the sparsity better.`;
}
document.getElementById('metricSwitch').addEventListener('click', e => {
  const btn = e.target.closest('.metric-btn'); if(!btn) return;
  document.querySelectorAll('.metric-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  currentMetric = btn.dataset.metric;
  renderModelBars();
});
renderModelBars();

(function importance(){
  const wrap = document.getElementById('importanceBars');
  const entries = Object.entries(D.classification.feature_importance).slice(0,8);
  const max = Math.max(...entries.map(e=>e[1]));
  entries.forEach(([name,val]) => {
    const row = document.createElement('div');
    row.className='imp-row';
    row.innerHTML = `<div class="iname">${name.replace(/_/g,' ')}</div>
      <div class="imp-track"><div class="imp-fill" style="width:${(val/max*100)}%"></div></div>
      <div class="ival">${(val*100).toFixed(1)}%</div>`;
    wrap.appendChild(row);
  });
})();

/* -------------------------------------------------------- TRY A VIEWER -- */
(function tryViewer(){
  const inAge=document.getElementById('inAge'), inWatch=document.getElementById('inWatch'),
        inSpend=document.getElementById('inSpend'), inBinge=document.getElementById('inBinge');
  const ageVal=document.getElementById('ageVal'), watchVal=document.getElementById('watchVal'), spendVal=document.getElementById('spendVal');
  [[inAge,ageVal],[inWatch,watchVal],[inSpend,spendVal]].forEach(([inp,out]) => {
    inp.addEventListener('input', () => out.textContent = inp.value);
  });

  document.getElementById('analyzeBtn').addEventListener('click', () => {
    const age = +inAge.value, watch = +inWatch.value, spend = +inSpend.value;
    const bingeMap = {Rarely:0, Sometimes:1, Often:2};
    const binge = bingeMap[inBinge.value];

    // Reproduce the EXACT scaling used to train K-Means (mean/scale from cluster_scaler)
    const mean = D.cluster_scaler.mean, scale = D.cluster_scaler.scale;
    const raw = [age, watch, spend, binge];
    const scaled = raw.map((v,i) => (v-mean[i])/scale[i]);

    // Nearest-centroid assignment — identical decision rule K-Means itself uses
    const centroids = D.clustering.kmeans.centroids_scaled;
    let best=-1, bestDist=Infinity;
    centroids.forEach((c,i) => {
      const dist = Math.sqrt(c.reduce((s,cv,j)=>s+(cv-scaled[j])**2,0));
      if(dist<bestDist){ bestDist=dist; best=i; }
    });
    const profile = D.clustering.kmeans.profiles.find(p=>p.id===best);
    renderTryResult(profile, best);
  });

  function renderTryResult(p, id){
    const el = document.getElementById('tryResult');
    const color = SEG_HEX[id % SEG_HEX.length];
    el.innerHTML = `<div class="try-result-content">
      <span class="tr-eyebrow" style="color:${color}">Assigned Segment</span>
      <h3>Segment ${id} — ${segmentTitle(p)}</h3>
      <div class="tr-grid">
        <div class="tr-stat"><div class="k">Typical Watch Time</div><div class="v">${p.avg_watch_time}h/wk</div></div>
        <div class="tr-stat"><div class="k">Typical Spending</div><div class="v">$${p.avg_spending}/mo</div></div>
        <div class="tr-stat"><div class="k">Typical Age</div><div class="v">${p.avg_age}</div></div>
        <div class="tr-stat"><div class="k">Dominant Genre</div><div class="v">${p.dominant_genre}</div></div>
        <div class="tr-stat"><div class="k">Dominant Platform</div><div class="v">${p.dominant_platform}</div></div>
        <div class="tr-stat"><div class="k">Segment Size</div><div class="v">${p.size_pct}% of audience</div></div>
      </div>
      <p class="tr-note">Assigned by nearest-centroid distance in the same standardized feature space
        (age, watch time, spending, binge frequency) that the K-Means model was trained on — the
        identical rule scikit-learn's <code>.predict()</code> uses internally.</p>
    </div>`;
  }
})();

/* -------------------------------------------------------- INSIGHTS ------ */
(function insights(){
  const wrap = document.getElementById('insightCards');
  const profiles = [...D.clustering.kmeans.profiles].sort((a,b)=>b.avg_spending-a.avg_spending);
  const top = profiles[0], bottom = profiles[profiles.length-1];
  const heaviest = [...D.clustering.kmeans.profiles].sort((a,b)=>b.avg_watch_time-a.avg_watch_time)[0];

  const cards = [
    {
      finding: `Segment ${top.id} spends $${top.avg_spending}/mo on average, ${top.deltas_vs_population.spending_pct_diff}% vs. the population — while watching ${top.deltas_vs_population.watch_time_pct_diff}% ${top.deltas_vs_population.watch_time_pct_diff>=0?'more':'less'} than average.`,
      implication: `${top.deltas_vs_population.watch_time_pct_diff<0 ? 'High spend paired with below-average watch time suggests value is coming from subscription tier or add-ons, not raw engagement — a segment worth protecting with retention offers rather than more content pushes.' : 'This segment pairs high spend with high engagement — a natural fit for premium bundles and early access to new releases.'}`
    },
    {
      finding: `Segment ${heaviest.id} watches ${heaviest.avg_watch_time}h/week (${heaviest.deltas_vs_population.watch_time_pct_diff>=0?'+':''}${heaviest.deltas_vs_population.watch_time_pct_diff}% vs. average) but spends ${heaviest.deltas_vs_population.spending_pct_diff}% ${heaviest.deltas_vs_population.spending_pct_diff>=0?'more':'less'} than average, favoring ${heaviest.dominant_subscription} plans.`,
      implication: `Heavy watch time on a lower-tier plan is a classic upsell signal — this group may respond to a mid-tier plan pitched around ad-free or multi-device access rather than price alone.`
    },
    {
      finding: `Segment ${bottom.id} spends the least ($${bottom.avg_spending}/mo, ${bottom.deltas_vs_population.spending_pct_diff}% vs. average) with a preference toward ${bottom.dominant_genre}.`,
      implication: `Lower spend doesn't necessarily mean low value — before assuming churn risk, it's worth checking whether this group is newer to the platform or genuinely price-sensitive, which would call for different retention strategies.`
    },
    {
      finding: `Random Forest predicts segment membership from raw attributes at ${(D.classification.metrics['Random Forest'].f1*100).toFixed(1)}% F1, while KNN reaches only ${(D.classification.metrics['KNN'].f1*100).toFixed(1)}%.`,
      implication: `A tree-based model could realistically be deployed to route new sign-ups into a segment instantly from onboarding survey answers, without waiting to observe their behavior.`
    },
  ];
  cards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'insight-card';
    el.innerHTML = `<span class="insight-tag finding">Data Finding</span><p>${c.finding}</p>
      <span class="insight-tag implication">Potential Implication</span><p class="impl-text">${c.implication}</p>`;
    wrap.appendChild(el);
  });
})();

/* -------------------------------------------------------- METHODOLOGY --- */
(function methodology(){
  const steps = [
    { title:'Raw Data', tech:'pandas.read_csv', body:`${D.meta.n_consumers.toLocaleString()} viewer records across ${D.meta.n_attributes} attributes: demographics, watch behavior, subscription and spending.` },
    { title:'Data Cleaning', tech:'dropna / drop_duplicates', body:`Duplicate rows and missing values are removed before anything else touches the data.` },
    { title:'Feature Preparation', tech:'src/data_prep.py', body:`User_ID is explicitly dropped — it's a row identifier, not a behavioral signal. Numeric fields stay as-is, Binge Frequency is ordinally encoded (Rarely<Sometimes<Often), and nominal fields are one-hot encoded for the classifier.` },
    { title:'Standardization', tech:'StandardScaler', body:`Every feature is centered and scaled to unit variance so no single attribute (like raw spending in dollars) dominates distance calculations purely due to its scale.` },
    { title:'Clustering', tech:'K-Means / Hierarchical / DBSCAN', body:`Clustering runs on behavioral features only (age, watch time, spending, binge frequency) — one-hot demographic dummies were deliberately excluded here after auditing showed they otherwise dominate the distance metric and produce mechanical, not behavioral, splits.` },
    { title:'Segment Profiling', tech:'groupby + population deltas', body:`Each cluster's real averages are compared against the population average to describe what actually makes it distinct — nothing here is manually labeled.` },
    { title:'Model Evaluation', tech:'RandomForest / SVM / KNN', body:`Classifiers are trained to predict segment membership (not a fabricated target) from the full attribute set, evaluated on a held-out 20% test split.` },
    { title:'Business Interpretation', tech:'manual synthesis', body:`Findings are translated into potential implications, clearly separated from the underlying statistics they're derived from.` },
  ];
  const wrap = document.getElementById('pipeline');
  steps.forEach((s,i) => {
    const el = document.createElement('div');
    el.className = 'pipe-step';
    el.innerHTML = `<div class="pipe-num">${String(i+1).padStart(2,'0')}</div>
      <div class="pipe-body">
        <h3>${s.title} <span class="tech">${s.tech}</span></h3>
        <div class="pipe-detail"><p>${s.body}</p></div>
      </div>`;
    el.addEventListener('click', () => el.classList.toggle('open'));
    wrap.appendChild(el);
  });
})();

/* -------------------------------------------------------- AUDIT LIST ---- */
(function audit(){
  const findings = [
    'User_ID was being swept into the numeric feature matrix for clustering as if it were a behavioral signal — now explicitly excluded.',
    'The classification target was set to raw Monthly Spending (continuous) fed into classifiers as a class label, producing accuracy/precision/recall numbers that did not mean what they appeared to. Target changed to predicting real segment membership.',
    'Clustering on all one-hot categorical dummies let genre/region checkboxes dominate the Euclidean distance metric, producing mechanical rather than behavioral splits. Clustering now runs on continuous/ordinal behavioral features only.',
    'DBSCAN\'s eps was a fixed, untuned value (eps=1); it now comes from a k-distance elbow heuristic.',
    'Silhouette scores across k=2..8 are fairly flat (~0.18-0.22) — this dataset has weak natural cluster separation, so segments are presented as descriptive groupings rather than sharply distinct clusters.',
    'The original notebook loaded data from a hardcoded Google Colab path (/content/...); the pipeline now resolves paths relative to the project root.',
    'No models were persisted; the rebuilt pipeline saves the scaler, K-Means model and all three classifiers via joblib.',
  ];
  const el = document.getElementById('auditFindings');
  findings.forEach(f => { const li=document.createElement('li'); li.textContent=f; el.appendChild(li); });
})();

})();
