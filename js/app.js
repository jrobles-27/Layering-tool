/* Exposure Layering - UI. No persistence: all state lives in this module's memory and is lost on refresh. */
(function () {
  'use strict';
  const E = Engine, V = Views, P = Parse;
  const fm = E.fmtMonth;
  const $ = s => document.querySelector(s);

  // ---------- helpers ----------
  const WIN = () => V.resolveWin(S.R, S.win);   // display window (Settings); default = product horizon
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d) => Math.abs(v) < 1e-9 ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const sum = E.sum;
  const ICONS = {
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    bar: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    cog: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    flask: '<path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>'
  };
  const I = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

  const PALETTE = ['#3b6cf6', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#6366f1', '#14b8a6', '#eab308'];
  const GREY = '#71717a', DARKROSE = '#be123c';

  // ---------- state ----------
  const S = {
    page: 'data', input: null, R: null, issues: [], file: '', win: null, priority: E.DEFAULT_PRIORITY.slice(),
    f: { crude: { bench: '', grade: '', pbench: '', dim: 'pricing' }, prod: { bench: '', kind: '' }, margin: { show: 'vol' }, me: { dim: 'pricing', kind: '', bench: '' }, pct: { row: 'pricing', col: 'sale', basis: 'col' }, cargo: { mode: 'prod', show: 'vol', cargoId: '' }, dash: { dim: 'pricing', month: null }, bal: {} },
    charts: [], after: [], priceColors: {}, tbl: {}, tolerance: 0.5, showLoading: true, crudeOrder: 'arrival'
  };

  const PAGES = [
    { id: 'dash', label: 'Dashboard', icon: 'dash', group: 'Overview', sub: 'Exposure at a glance across the planning horizon.' },
    { id: 'crude', label: 'Crude Layering', icon: 'layers', group: 'Analysis', sub: 'Crude pricing month × product sales month - when each priced barrel gets sold as product.' },
    { id: 'product', label: 'Product Layering', icon: 'package', group: 'Analysis', sub: 'Which opening, production or purchase layer each product sale comes from, in your chosen sales priority.' },
    { id: 'margin', label: 'Margin Exposure', icon: 'trend', group: 'Analysis', sub: 'Product crack exposure by sales month, and flat-price exposure by benchmark.' },
    { id: 'monthend', label: 'Month-End Profile', icon: 'bar', group: 'Analysis', sub: 'Open crude inventory exposure at each month-end, by pricing month.' },
    { id: 'balances', label: 'Balances', icon: 'table', group: 'Review', sub: 'Opening, receipts, consumption and closing by crude grade and product.' },
    { id: 'checks', label: 'Data Checks', icon: 'alert', group: 'Review', sub: 'Mass balance, supply cover and input quality.' },
    { id: 'data', label: 'Data Input', icon: 'upload', group: 'Data', sub: 'Load this session\'s inputs. Nothing is saved - you will need to load them again next time.' },
    { id: 'settings', label: 'Settings', icon: 'cog', group: 'Data', sub: 'Choose which months to display. Applies to every page and to the Excel export.' }
  ];

  // ---------- colours ----------
  function buildColors() {
    const keys = [...new Set(S.R.expRows.map(r => r.pricing).concat(S.R.snaps.flatMap(s => s.map(r => r.pricing))))].sort((a, b) => a - b);
    const m = {}; let i = 0;
    keys.forEach(k => { m[k] = k === E.PRE ? GREY : k === E.UNPLANNED ? DARKROSE : PALETTE[i++ % PALETTE.length]; });
    S.priceColors = m;
  }
  function dimInfo(dim) {
    const f = V.DIMS[dim] ? V.DIMS[dim].fmt : (x => x);
    if (dim === 'pricing') return { fmt: f, color: (k) => S.priceColors[k] || GREY };
    return { fmt: f, color: (k, i) => PALETTE[i % PALETTE.length] };
  }
  const monthOrText = x => typeof x === 'number' ? fm(x) : x;

  // ---------- components ----------
  function card(title, sub, body, tools, flush) {
    return `<section class="card"><div class="card-h"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${tools ? `<div class="tools">${tools}</div>` : ''}</div><div class="card-b${flush ? ' flush' : ''}">${body}</div></section>`;
  }
  function seg(path, cur, opts) {
    return `<div class="seg">${opts.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-set="${path}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function select(label, path, cur, opts) {
    return `<div class="field"><label>${esc(label)}</label><select data-bind="${path}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  }
  function spark(values, color, uid) {
    const w = 200, h = 44, n = values.length;
    if (n < 2) return '';
    const mx = Math.max(...values, 1e-9), mn = Math.min(...values, 0);
    const pts = values.map((v, i) => [i * w / (n - 1), h - 4 - (v - mn) / (mx - mn || 1) * (h - 12)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="sg${uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#sg${uid})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function kpi(i, label, val, unit, sub, icon, cls, sparkVals, color) {
    return `<div class="card kpi"><div class="top"><div><div class="lbl">${esc(label)}</div><div class="val">${val}<small>${esc(unit)}</small></div></div><div class="chip bg-${cls} c-${cls}">${I(icon)}</div></div><div class="sub">${sub}</div>${spark(sparkVals, color, i)}</div>`;
  }
  function empty() {
    return `<div class="card"><div class="empty">${I('upload')}<h3>No data loaded</h3><p>Load your inputs to see the exposure analysis.</p><button class="btn primary" data-go="data">Go to Data Input</button></div></div>`;
  }

  /** A value that is not zero but would print as "0" shows as "<1" (or "<0.1"), never a misleading 0. */
  function cell(v, d) {
    if (Math.abs(v) < 1e-9) return '–';
    const step = Math.pow(10, -(d || 0));
    if (Math.abs(v) < step / 2) return (v < 0 ? '>-' : '<') + step.toFixed(d || 0);
    return v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  /** Per-table sort/filter state, keyed by the table id passed to matrix(). */
  function tstate(id) { return S.tbl[id] || (S.tbl[id] = { sort: null, filter: '' }); }
  function tableTools(id, hasFilter) {
    const t = tstate(id);
    const sorted = t.sort ? `<button class="btn sm ghost" data-tbl-reset="${id}" title="Back to the natural order">${I('reset')} Sort</button>` : '';
    const filter = hasFilter === false ? '' : `<label class="tfilter">${I('search')}<input data-tbl-filter="${id}" value="${esc(t.filter)}" placeholder="Filter rows" aria-label="Filter rows"></label>`;
    return filter + sorted;
  }

  /** Heat-map matrix from a pivot, with sortable headers, a row filter and sticky header/first column.
   *  o.rowCols: extra leading columns [{label, get(rowKey)}] instead of one label column. */
  function matrix(pv, o) {
    o = o || {};
    const id = o.id || 't';
    const st = tstate(id);
    const di = o.dim ? dimInfo(o.dim) : { fmt: o.rowFmt || (x => x), color: null };
    if (o.rowFmt && o.dim) di.fmt = o.rowFmt;
    const d = o.dec || 0;
    // Leading columns carry their own sort key, so month columns sort chronologically, not as text.
    const lead = o.rowCols || [{ label: o.rowHdr || '', get: rk => di.fmt(rk), key: rk => rk }];
    const cols = pv.colKeys.map((ck, j) => [ck, j]).filter(([ck, j]) => typeof ck === 'number' || pv.colTotals[j] > 1e-9);
    let rows = pv.rowKeys.map((rk, i) => [rk, i]).filter(([rk, i]) => pv.rowTotals[i] > 1e-9 || o.keepEmpty);
    // filter on the text of the leading columns
    const q = st.filter.trim().toLowerCase();
    if (q) rows = rows.filter(([rk]) => lead.some(c => String(c.get(rk)).toLowerCase().includes(q)));
    // sort: "L<i>" = leading column i (by its own key), "<j>" = data column j, "T" = Total
    if (st.sort) {
      const { col, dir } = st.sort;
      const keyOf = ([rk, i]) => {
        if (col === 'T') return pv.rowTotals[i];
        if (typeof col === 'string' && col[0] === 'L') {
          const c = lead[+col.slice(1)];
          return c ? (c.key ? c.key(rk) : String(c.get(rk))) : '';
        }
        return pv.get(rk, cols[col][0]);
      };
      rows = rows.slice().sort((a, b) => {
        const x = keyOf(a), y = keyOf(b);
        const nx = typeof x === 'number', ny = typeof y === 'number';
        // numbers (months, volumes) sort numerically and come before text labels
        const c = nx && ny ? x - y : nx ? -1 : ny ? 1 : String(x).localeCompare(String(y));
        return dir === 'asc' ? c : -c;
      });
    }
    let max = 0;
    rows.forEach(([rk]) => cols.forEach(([ck]) => { max = Math.max(max, pv.get(rk, ck)); }));
    const arrow = i => st.sort && String(st.sort.col) === String(i) ? `<i class="sa">${st.sort.dir === 'asc' ? '▲' : '▼'}</i>` : '';
    const span = lead.length;
    const tall = rows.length > 12 ? ' tall' : '';
    let h = `<div class="tbl-wrap${tall}"><table class="m"><thead><tr>` +
      lead.map((c, i) => `<th class="lead" data-tbl-sort="${id}|L${i}">${esc(c.label)}${arrow('L' + i)}</th>`).join('') +
      cols.map(([ck], j) => `<th data-tbl-sort="${id}|${j}">${esc(o.colFmt ? o.colFmt(ck) : fm(ck))}${arrow(j)}</th>`).join('') +
      `<th class="tot" data-tbl-sort="${id}|T">Total${arrow('T')}</th></tr></thead><tbody>`;
    rows.forEach(([rk, i], ri) => {
      const sw = o.rowColor ? `<span class="sw" style="background:${o.rowColor(rk)}"></span>` : (o.dim && di.color ? `<span class="sw" style="background:${di.color(rk, ri)}"></span>` : '');
      h += '<tr>' + lead.map((c, li) => `<td class="lead">${li === 0 ? sw : ''}${esc(c.get(rk))}</td>`).join('');
      cols.forEach(([ck]) => {
        const v = pv.get(rk, ck);
        const a = max > 0 && v > 1e-9 && o.heat !== false ? Math.round(6 + 52 * v / max) : 0;
        h += `<td class="${v < 1e-9 ? 'zero' : ''}"${a ? ` style="background:color-mix(in oklab, var(--blue) ${a}%, transparent)"` : ''}>${cell(v, d)}</td>`;
      });
      h += `<td class="tot">${cell(pv.rowTotals[i], d)}</td></tr>`;
    });
    if (!rows.length) h += `<tr><td colspan="${cols.length + span + 1}" style="text-align:center;color:var(--muted-foreground)">${q ? 'No rows match this filter' : 'No exposure for this selection'}</td></tr>`;
    h += `<tr class="tot">${lead.map((c, li) => `<td class="lead">${li === 0 ? 'Total' : ''}</td>`).join('')}${cols.map(([, j]) => `<td>${cell(pv.colTotals[j], d)}</td>`).join('')}<td>${cell(pv.total, d)}</td></tr></tbody></table></div>`;
    return h;
  }

  // ---------- charts ----------
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    return { text: cs.getPropertyValue('--muted-foreground').trim() || '#999', grid: cs.getPropertyValue('--grid').trim() || 'rgba(255,255,255,.07)', card: getComputedStyle(document.body).backgroundColor };
  }
  function chartBox(id, tall) { return `<div class="chart-box${tall ? ' tall' : ''}"><canvas id="${id}"></canvas></div>`; }
  function barChart(id, labels, series, stacked, unit) {
    unit = unit || 'kb';
    S.after.push(() => {
      const el = document.getElementById(id); if (!el) return;
      const t = themeColors();
      S.charts.push(new Chart(el, {
        type: 'bar',
        data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: stacked ? 0 : 3, borderSkipped: false, maxBarThickness: 56 })) },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } } },
            tooltip: {   // only series that actually have a value at this point, largest first
              filter: it => Math.abs(it.parsed.y) > 1e-9,
              callbacks: { label: c => unit === '%' ? ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)}%` : ` ${c.dataset.label}: ${cell(c.parsed.y, 0)} kb` },
              // keep the series in their own order (oldest month first) rather than ranking by size
              itemSort: (a, b) => a.datasetIndex - b.datasetIndex
            }
          },
          scales: {
            x: { stacked, grid: { display: false }, ticks: { color: t.text } },
            y: Object.assign({ stacked, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.text, callback: v => unit === '%' ? v + '%' : fmt(v) }, title: { display: true, text: unit, color: t.text } }, unit === '%' ? { max: 100 } : {})
          }
        }
      }));
    });
    return chartBox(id);
  }
  function donut(id, labels, data, colors) {
    S.after.push(() => {
      const el = document.getElementById(id); if (!el) return;
      const t = themeColors();
      S.charts.push(new Chart(el, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: t.card, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)} kb` } } } }
      }));
    });
    return `<div class="chart-box" style="height:200px"><canvas id="${id}"></canvas></div>`;
  }
  function seriesFromPivot(pv, dim, skipEnd) {
    const di = dimInfo(dim);
    const cols = pv.colKeys.filter(ck => !(skipEnd && ck === E.END));
    const series = pv.rowKeys.map((rk, i) => ({ label: di.fmt(rk), color: di.color(rk, i), data: cols.map(ck => pv.get(rk, ck)) })).filter(s => s.data.some(v => v > 1e-9));
    return { labels: cols.map(ck => ck === E.END ? 'Unsold' : fm(ck)), series };
  }

  // ---------- pages ----------
  function pageDash() {
    const R = S.R, s = R.summary, w = WIN();
    const wm = V.winMonths(R, w), pm = V.pMonthsInWin(R, w);
    const inW = k => k >= w.start && k <= w.end;
    // KPIs follow the display window (Settings)
    const tot = wm.map(m => s.monthTotals[R.months.indexOf(m)]);
    let pi = 0; tot.forEach((v, i) => { if (v > tot[pi]) pi = i; });
    const soldW = R.expRows.filter(r => r.stage === 'Sold' && inW(r.sale) && r.pricing !== E.PRE && r.pricing !== E.UNPLANNED);
    const ageV = sum(soldW.map(r => r.vol));
    const ageW = ageV > 0 ? sum(soldW.map(r => r.vol * (r.sale - r.pricing))) / ageV : null;
    const ageBy = pm.map(mk => {
      const rows = soldW.filter(r => r.sale === mk);
      const v = sum(rows.map(r => r.vol)); return v > 0 ? sum(rows.map(r => r.vol * (r.sale - r.pricing))) / v : 0;
    });
    const balW = R.prodBal.filter(b => inW(b.month));
    const demW = sum(balW.map(b => b.demand)), unmetW = sum(balW.map(b => b.unmet));
    const shortW = sum(R.shortfalls.filter(x => inW(R.months[x.t])).map(x => x.vol));
    const soldBy = pm.map(mk => sum(R.prodBal.filter(b => b.month === mk).map(b => b.sales)));
    const shortBy = pm.map(mk => sum(R.crudeBal.filter(b => b.month === mk).map(b => b.unplanned)) + sum(R.prodBal.filter(b => b.month === mk).map(b => b.unmet)));
    const gaps = shortW + unmetW;
    const cover = demW > 0 ? (demW - unmetW) / demW : 1;
    const kpis = `<div class="grid g4">
      ${kpi(1, 'Peak month-end exposure', fmt(tot[pi] || 0), 'kb', `<span>in ${tot.length ? fm(wm[pi]) : '-'} · window end ${fmt(tot[tot.length - 1] || 0)} kb</span>`, 'layers', 'blue', tot, '#3b6cf6')}
      ${kpi(2, 'Avg exposure age', ageW == null ? 'n/a' : ageW.toFixed(1), 'months', '<span>crude pricing month → product sale</span>', 'clock', 'violet', ageBy, '#a855f7')}
      ${kpi(3, 'Demand covered', (cover * 100).toFixed(1), '%', `<span class="${unmetW > 0 ? 'down' : 'up'}">${fmt(unmetW)} kb unmet of ${fmt(demW)} kb</span>`, 'percent', unmetW > 0 ? 'amber' : 'green', soldBy, unmetW > 0 ? '#f59e0b' : '#10b981')}
      ${kpi(4, 'Supply gaps', fmt(gaps), 'kb', `<span>${fmt(shortW)} kb unplanned crude · ${fmt(unmetW)} kb unmet product</span>`, 'alert', gaps > 0 ? 'rose' : 'green', shortBy, gaps > 0 ? '#f43f5e' : '#10b981')}
    </div>`;

    const d = S.f.dash;
    if (d.month == null || !wm.includes(d.month)) d.month = wm.length ? wm[pi] : R.productStart;
    const meAll = V.monthEnd(R, d.dim, '', {}, w);
    const ser = seriesFromPivot(meAll, d.dim);
    const main = card('Month-end exposure', 'Volume still exposed to price at each month-end (crude in tanks + product in tanks).',
      barChart('c_dash_me', ser.labels, ser.series, true),
      seg('dash.dim', d.dim, [['pricing', 'Pricing month'], ['bench', 'Benchmark'], ['kind', 'Inventory type']]));
    const mb = V.monthEnd(R, 'bench', '', {}, w);
    const bi = mb.colKeys.indexOf(d.month);
    const bd = mb.rowKeys.map((rk, i) => ({ l: rk, v: mb.get(rk, d.month), c: PALETTE[i % PALETTE.length] })).filter(x => x.v > 1e-9);
    const side = card('Exposure by benchmark', `Month-end ${fm(d.month)}`,
      donut('c_dash_bench', bd.map(x => x.l), bd.map(x => x.v), bd.map(x => x.c)) +
      `<div class="legend" style="flex-direction:column;gap:7px;margin-top:14px">${bd.map(x => `<div style="display:flex;align-items:center;justify-content:space-between;color:var(--foreground)"><span><span class="sw" style="background:${x.c}"></span>${esc(x.l)}</span><b>${fmt(x.v)} kb · ${bi >= 0 ? (x.v / mb.colTotals[bi] * 100).toFixed(0) : 0}%</b></div>`).join('')}</div>`,
      select('', 'dash.month', d.month, wm.map(m => [m, fm(m)])));

    const cl = V.crudeLayering(R, {}, 'pricing', 'sale', w); const cs = seriesFromPivot(cl, 'pricing', false);
    const rel = card('Exposure released by sales month', 'Barrels sold each month, coloured by the month their crude was priced.', barChart('c_dash_rel', cs.labels, cs.series, true));
    const mg = V.marginByBench(R, w); const ms = seriesFromPivot(mg, 'pbench', true);
    const mgn = card('Margin exposure by benchmark', 'Refinery production sold per month - the crack exposure of each sales month.', barChart('c_dash_mg', ms.labels, ms.series, true));

    const attn = R.checks.filter(c => c.level === 'error' || c.level === 'warn').slice(0, 5);
    const alerts = card('Needs attention', 'Top issues from the data checks.',
      attn.length ? attn.map(c => `<div class="issue"><span class="tag ${c.level}">${c.level}</span><div><b>${esc(c.title)}</b><span class="d">${esc(c.detail)}</span></div></div>`).join('') : `<div class="issue"><span class="tag ok">ok</span><div><b>No blocking issues</b></div></div>`,
      `<button class="btn sm" data-go="checks">All checks</button>`, true);
    return kpis + `<div class="grid g-main">${main}${side}</div><div class="grid g2">${rel}${mgn}</div>` + alerts;
  }

  const DIM_OPTS = [['pricing', 'Pricing month'], ['prod', 'Production month'], ['sale', 'Sales month'], ['bench', 'Crude benchmark'], ['grade', 'Crude grade'], ['pbench', 'Product benchmark']];

  function pctSection(filt) {
    const R = S.R, p = S.f.pct;
    const presets = [['pricing|sale|col', 'Sales mix by pricing month'], ['pricing|sale|row', 'Where each pricing month is sold'],
      ['prod|sale|col', 'Sales mix by production month'], ['prod|sale|row', 'Where each production month is sold'], ['pricing|prod|row', 'Pricing → production month']];
    const cur = [p.row, p.col, p.basis].join('|');
    const presetBar = `<div class="seg" style="flex-wrap:wrap">${presets.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-preset="${v}">${l}</button>`).join('')}</div>`;
    const pv = V.crudeLayering(R, filt, p.row, p.col, WIN());
    const pp = V.pct(pv, p.basis);
    const rl = V.DIMS[p.row].label.toLowerCase(), cl = V.DIMS[p.col].label.toLowerCase();
    const what = p.basis === 'col' ? `Each ${cl} column adds up to 100%: the share of that ${cl}'s volume that comes from each ${rl}.`
      : p.basis === 'row' ? `Each ${rl} row adds up to 100%: how that ${rl}'s volume is spread across ${cl}s.`
      : `Every cell is its share of the grand total (100%).`;
    const controls = `<div class="filters" style="padding-top:12px">
      ${select('Rows', 'pct.row', p.row, DIM_OPTS)}${select('Columns', 'pct.col', p.col, DIM_OPTS)}
      ${select('Percent of', 'pct.basis', p.basis, [['col', 'Column total (each column = 100%)'], ['row', 'Row total (each row = 100%)'], ['total', 'Grand total']])}
      <div class="field"><label>Quick views</label>${presetBar}</div></div>`;
    // 100% stacked chart: x axis = the dimension that sums to 100%
    const byRow = p.basis === 'row';
    const xKeys = (byRow ? pp.rowKeys : pp.colKeys), sKeys = (byRow ? pp.colKeys : pp.rowKeys);
    const xTot = byRow ? pv.rowTotals : pv.colTotals, sTot = byRow ? pv.colTotals : pv.rowTotals;
    const xd = dimInfo(byRow ? p.row : p.col), sd = dimInfo(byRow ? p.col : p.row);
    const xi = xKeys.map((k, i) => i).filter(i => xTot[i] > 1e-9);
    const series = sKeys.map((sk, j) => ({ label: sd.fmt(sk), color: sd.color(sk, j), data: xi.map(i => byRow ? pp.get(xKeys[i], sk) : pp.get(sk, xKeys[i])) })).filter(s => s.data.some(v => v > 1e-9));
    const chart = barChart('c_pct', xi.map(i => xd.fmt(xKeys[i])), series, true, '%');
    return card('Percentage breakdown', what + ' Uses the filters above.',
      controls + matrix(pp, { id: 'pct', dim: p.row, rowHdr: V.DIMS[p.row].label, colFmt: V.DIMS[p.col].fmt, dec: 1 }), tableTools('pct'), true) +
      card('Percentage profile', 'Same data as the percentage table, as 100% stacked bars.', chart);
  }

  /** Leading columns for the cargo tables: grade, loading, arrival and pricing month each get their own. */
  function cargoCols(R, byId) {
    const g = id => byId.get(id) || {};
    const monthKeyOf = v => v == null ? -Infinity : v;   // blanks sort before any month
    const cols = [{ label: 'Crude grade', get: id => g(id).grade || String(id) }];
    if (S.showLoading) cols.push({ label: 'Loading month', get: id => g(id).loading != null ? fm(g(id).loading) : '–', key: id => monthKeyOf(g(id).loading) });
    cols.push({ label: 'Arrival month', get: id => { const c = g(id); return c.arrival == null ? (c.src === 'Opening' ? 'Opening stock' : 'Unplanned') : fm(c.arrival); }, key: id => monthKeyOf(g(id).arrival) });
    cols.push({ label: 'Pricing month', get: id => { const c = g(id); return fm(c.pricing) + (c.seq > 1 ? ` #${c.seq}` : ''); }, key: id => monthKeyOf(g(id).pricing) });
    cols.push({ label: 'Cargo (kb)', get: id => fmt(g(id).vol || 0), key: id => g(id).vol || 0 });
    return cols;
  }

  /** Product layer rows split into their own columns (source, month, half, pricing month). */
  function layerCols(R) {
    const inf = l => R.layerInfo[l] || {};
    const mk = v => v == null ? -Infinity : v;
    return [
      { label: 'Source', get: l => { const i = inf(l); return (i.kind || '–') + (i.opening ? ' (opening stock)' : ''); }, key: l => (inf(l).kind || '') + (inf(l).opening ? ' 0' : ' 1') },
      { label: 'Production / arrival month', get: l => inf(l).month != null ? fm(inf(l).month) : '–', key: l => mk(inf(l).month) },
      { label: 'Half', get: l => inf(l).half === 2 ? '2nd' : inf(l).half === 1 ? '1st' : '–', key: l => inf(l).half || 0 },
      { label: 'Pricing month', get: l => inf(l).pricing != null ? fm(inf(l).pricing) : 'Crude blend', key: l => mk(inf(l).pricing) }
    ];
  }

  function cargoSection(filt) {
    const R = S.R, c = S.f.cargo;
    const cf = { bench: filt.bench, grade: filt.grade, pbench: filt.pbench };
    const list = V.cargoFilter(R, cf);
    const byId = new Map(R.cargoes.map(x => [x.id, x]));
    const lab = id => { const x = byId.get(id); return x ? `${x.label} (${fmt(x.vol)} kb)` : String(id); };
    const color = id => { const x = byId.get(id); return x ? (S.priceColors[x.pricing] || GREY) : GREY; };
    if (c.cargoId !== '' && !list.some(x => x.id === c.cargoId)) c.cargoId = '';
    const pctOn = c.show === 'pct';
    const rowCols = cargoCols(R, byId);
    let sub, table;
    if (c.mode === 'prod') {
      const { pv } = V.cargoByProduction(R, cf, WIN());
      sub = 'Crude kb of each cargo run through the refinery in each production month. "Not yet consumed" = still in tanks at the end of the horizon.' + (pctOn ? ' Each cargo row = 100%.' : '');
      table = matrix(pctOn ? V.pct(pv, 'row') : pv, { id: 'cargo', rowCols, rowColor: color, colFmt: fm, dec: pctOn ? 1 : 0 });
    } else if (c.mode === 'sale') {
      const { pv } = V.cargoBySales(R, cf, WIN());
      sub = 'Product kb traced to each cargo, by the month that product is sold. "Unsold at end" = product (or crude) still in stock at the end of the horizon. Product kb can differ slightly from crude kb where yields are not 100%.' + (pctOn ? ' Each cargo row = 100%.' : '');
      table = matrix(pctOn ? V.pct(pv, 'row') : pv, { id: 'cargo', rowCols, rowColor: color, colFmt: fm, dec: pctOn ? 1 : 0 });
    } else {
      const pv = V.cargoProdSales(R, cf, c.cargoId === '' ? null : c.cargoId, WIN());
      sub = (c.cargoId === '' ? 'All cargoes combined: ' : 'The selected cargo: ') + 'product kb by the month it was produced (rows) and the month it is sold (columns).' + (pctOn ? ' Cells are % of the total shown.' : '');
      table = matrix(pctOn ? V.pct(pv, 'total') : pv, { id: 'cargo', dim: 'prod', rowHdr: 'Production month ↓ / sales month →', colFmt: fm, dec: pctOn ? 1 : 0 });
    }
    const pick = c.mode === 'both' ? `<div class="filters" style="padding-top:12px">${select('Cargo', 'cargo.cargoId', c.cargoId, [['', 'All cargoes (combined)'], ...list.map(x => [x.id, lab(x.id)])])}</div>` : '';
    const tools = seg('cargo.mode', c.mode, [['prod', 'By production month'], ['sale', 'By sales month'], ['both', 'Production × sales']]) + seg('cargo.show', c.show, [['vol', 'kb'], ['pct', '%']]) + tableTools('cargo');
    return card('Cargo analysis', sub + ' A cargo is one import or opening-inventory layer. The filters above apply.', pick + table, tools, !pick);
  }

  function pageCrude() {
    const R = S.R, f = S.f.crude;
    const rows = V.crudeRows(R);
    const benches = [...new Set(rows.map(r => r.bench || 'Unmapped'))].sort();
    const grades = [...new Set(rows.map(r => r.grade))].sort();
    const filt = { bench: f.bench, grade: f.grade, pbench: f.pbench };
    const pv = V.crudeLayering(R, filt, f.dim, undefined, WIN());
    const filters = `<div class="filters">
      ${select('Group rows by', 'crude.dim', f.dim, DIM_OPTS.filter(o => o[0] !== 'sale'))}
      ${select('Crude benchmark', 'crude.bench', f.bench, [['', 'All'], ...benches.map(b => [b, b])])}
      ${select('Crude grade', 'crude.grade', f.grade, [['', 'All'], ...grades.map(b => [b, b])])}
      ${select('Sold as (product benchmark)', 'crude.pbench', f.pbench, [['', 'All'], ...V.benchmarks(R).map(b => [b, b])])}
    </div>`;
    const ser = seriesFromPivot(pv, f.dim, false);
    return card('Crude layering', 'Volume (kb) of the refinery\'s own crude, by pricing month (rows) and the month the product made from it is sold (columns). "Unsold" = still in tanks at the end of the horizon. Purchased product is not crude exposure and is on Product Layering.',
      filters + matrix(pv, { id: 'crude', dim: f.dim, rowHdr: V.DIMS[f.dim].label }), tableTools('crude'), true) + pctSection(filt) +
      `<div class="grid g-main">${card('Layering profile', 'Same data as the table, stacked by row group.', barChart('c_crude', ser.labels, ser.series, true))}
      ${card('How to read this', '', `<div class="how">Each row is a pricing month (or other group); each column is a <b>product sales month</b>.<ol>
        <li>Crude is consumed <b>FIFO</b> by grade, so the oldest priced layer runs first.</li>
        <li>Production is a <b>pro-rata blend</b> of the crude consumed that month.</li>
        <li>Products are sold in the <b>sales priority</b> order set on the Product Layering page; each sale is traced back to the crude pricing month(s) behind it.</li>
        <li><b>Pre-horizon</b> = pricing month not given; <b>Unplanned</b> = crude needed beyond the purchase plan (gaps under the ${S.tolerance} kb tolerance are ignored).</li>
        <li>Products are grouped by <b>benchmark</b>, so products priced off the same index are analysed together.</li></ol></div>`)}</div>` + cargoSection(filt);
  }

  function priorityCard() {
    const isDefault = S.priority.join() === E.DEFAULT_PRIORITY.join();
    const list = S.priority.map((c, i) => `<div class="prio"><span class="n">${i + 1}</span><span class="t">${esc(E.PRIORITY_LABELS[c])}</span>
      <span class="btns"><button class="btn sm icon" data-act="prio-up" data-i="${i}" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${I('up')}</button><button class="btn sm icon" data-act="prio-down" data-i="${i}" aria-label="Move down"${i === S.priority.length - 1 ? ' disabled' : ''}>${I('down')}</button></span></div>`).join('');
    const body = `<div class="prio-list">${list}</div>
      <p class="how" style="margin:12px 0 0">Stock older than the previous month - opening purchases, and production from before then - is always sold first, oldest first. Opening production from the month before the product data starts counts as "previous month's production". Changing the order recalculates every page.
      Purchases count as 1st half if they arrive on the 1st-15th, 2nd half from the 16th (set by the arrival date or an "Arrival Half" column).</p>`;
    return card('Sales priority', 'Order in which product layers are sold within a month (1 = sold first).', body,
      `<span class="tag ${isDefault ? 'ok' : 'info'}" style="border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600">${isDefault ? 'Default order' : 'Custom order'}</span><button class="btn sm" data-act="prio-reset"${isDefault ? ' disabled' : ''}>${I('reset')} Reset to default</button>`);
  }

  function pageProduct() {
    const R = S.R, f = S.f.prod;
    const w = WIN();
    const kindLabel = { Production: 'production', Purchase: 'purchase', Opening: 'opening' };
    const pv = V.productLayering(R, f.bench, w, f.kind), inv = V.productInventory(R, f.bench, w, f.kind);
    const ser = seriesFromPivot(pv, 'src', false);
    const sumRows = V.productSummary(R, w);
    const sumTbl = `<div class="tbl-wrap"><table class="m"><thead><tr><th>Product benchmark</th><th>Products</th><th>Opening</th><th>Production</th><th>Purchases</th><th>Sales</th><th>Unmet</th><th>Closing</th></tr></thead><tbody>
      ${sumRows.map(x => `<tr><td>${esc(x.bench)}</td><td>${fmt(x.products)}</td><td>${cell(x.open)}</td><td>${cell(x.production)}</td><td>${cell(x.purchases)}</td><td>${cell(x.sales)}</td><td class="${x.unmet > 0 ? 'neg' : ''}">${cell(x.unmet)}</td><td>${cell(x.close)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td></td>${['open', 'production', 'purchases', 'sales', 'unmet', 'close'].map(k => `<td>${cell(sum(sumRows.map(x => x[k])))}</td>`).join('')}</tr></tbody></table></div>`;
    const sel = `<div class="filters">${select('Product benchmark', 'prod.bench', f.bench, [['', 'All benchmarks'], ...V.benchmarks(R).map(p => [p, p])])}
      <div class="field"><label>Rows</label>${seg('prod.kind', f.kind, [['', 'All sources'], ['Production', 'Production'], ['Purchase', 'Purchase']])}</div></div>`;
    return priorityCard() + card('Product layering - sales by source',
        `Volume (kb) sold in each month (columns) from each opening / production / purchase layer (rows), following the sales priority above. Purchases are separate rows per pricing month.${f.kind ? ` Showing ${kindLabel[f.kind]} rows only.` : ''}`,
        sel + matrix(pv, { id: 'prodlayer', rowCols: layerCols(R) }), tableTools('prodlayer'), true) +
      `<div class="grid g2">${card('Sales by source layer', '', barChart('c_prod', ser.labels, ser.series, true))}
       ${card('Month-end inventory by layer', 'What is left in tanks at each month-end, by the layer it came from.', matrix(inv, { id: 'prodinv', rowCols: layerCols(R) }), tableTools('prodinv'), true)}</div>` +
      card('Product summary', `Display window, kb, grouped by benchmark. Products sharing a benchmark (e.g. Jet and Kerosene) are reported together.`, sumTbl, '', true);
  }

  function pageMargin() {
    const R = S.R, f = S.f.margin;
    const w = WIN(), pmw = V.pMonthsInWin(R, w);
    const pctOn = f.show === 'pct';
    const mb = V.marginByBench(R, w), mpm = V.marginByProdMonth(R, w), cb = V.crudeByBench(R, w);
    const ser = seriesFromPivot(mb, 'pbench', true);
    const unmet = E.pivot(R.unmet.map(u => ({ vol: u.vol, b: R.prodBench[u.product] || 'Unmapped', m: R.months[u.t] })).filter(u => pmw.includes(u.m)), r => r.b, r => r.m, { colKeys: pmw });
    const view = (pv, basis) => pctOn ? V.pct(pv, basis) : pv;
    const dec = pctOn ? 1 : 0;
    const tools = seg('margin.show', f.show, [['vol', 'kb'], ['pct', '%']]);
    return `<div class="grid g-main">${card('Margin (crack) exposure',
        `Product volume sold in each sales month that came out of the refinery (kb) - this volume carries crack exposure in that month. Purchased product has no crude leg and is excluded.${pctOn ? ' Each sales month = 100%.' : ''}`,
        matrix(view(mb, 'col'), { id: 'margin', dim: 'pbench', rowHdr: 'Product benchmark', dec }), tools + tableTools('margin'), true)}
      ${card('Crack volume by benchmark', '', barChart('c_margin', ser.labels, ser.series, true))}</div>` +
      `<div class="grid g2">${card('Crack exposure by production month', 'Which production month the crack volume sold in each month came from.', matrix(view(mpm, 'col'), { id: 'marginprod', dim: 'prod', rowHdr: 'Production month', dec }), tableTools('marginprod'), true)}
       ${card('Crude flat-price exposure released', 'Barrels sold each month whose crude price was fixed earlier, by crude benchmark.', matrix(view(cb, 'col'), { id: 'marginbench', rowHdr: 'Crude benchmark', rowFmt: x => x, dec }), tableTools('marginbench'), true)}</div>` +
      (unmet.total > 0 ? card('Unmet demand', 'Demand not covered by stock, production or purchases (kb) - an open short position until supplied.', matrix(unmet, { id: 'marginunmet', rowHdr: 'Product benchmark', rowFmt: x => x, heat: false }), tableTools('marginunmet'), true) : '');
  }

  function pageMonthEnd() {
    const R = S.R, f = S.f.me;
    const benches = [...new Set(R.snaps.flatMap(s => s.map(r => r.bench || 'Unmapped')))].sort();
    const pv = V.monthEnd(R, f.dim, f.kind, { bench: f.bench }, WIN());
    const ser = seriesFromPivot(pv, f.dim, false);
    const filters = `<div class="filters">
      ${select('Group rows by', 'me.dim', f.dim, [['pricing', 'Pricing month'], ['bench', 'Crude benchmark'], ['grade', 'Crude grade / source'], ['pbench', 'Product benchmark'], ['kind', 'Inventory type'], ['src', 'Exposure source']])}
      ${select('Inventory', 'me.kind', f.kind, [['', 'Crude + product'], ['Crude inventory', 'Crude only'], ['Product inventory', 'Product only']])}
      ${select('Benchmark', 'me.bench', f.bench, [['', 'All'], ...benches.map(b => [b, b])])}</div>`;
    return card('Month-end exposure profile', 'Volume (kb) at each month-end still exposed to the crude price it was priced at. Product inventory is traced back to its crude pricing month.',
      filters + matrix(pv, { id: 'monthend', dim: f.dim, rowHdr: V.DIMS[f.dim].label, colFmt: ck => fm(ck) }), tableTools('monthend'), true) +
      card('Profile', '', barChart('c_me', ser.labels, ser.series, true));
  }

  function pageBalances() {
    const R = S.R, w = WIN();
    const wm = V.winMonths(R, w), pm = V.pMonthsInWin(R, w);
    const hdrFor = ms => `<thead><tr><th>Line</th>${ms.map(m => `<th>${fm(m)}</th>`).join('')}<th class="tot">Total</th></tr></thead>`;
    const tbl = (rows, defs, totalFor, ms) => `<div class="tbl-wrap"><table class="m">${hdrFor(ms)}<tbody>${defs.map(([l, k, cls]) => {
      const vals = rows.map(r => r[k]);
      const tot = totalFor.includes(k) ? fmt(sum(vals)) : '';
      return `<tr class="${cls || ''}"><td>${l}</td>${vals.map(v => `<td class="${k === 'unplanned' || k === 'unmet' ? (v > 1e-9 ? 'neg' : 'zero') : v < 1e-9 ? 'zero' : ''}">${fmt(v)}</td>`).join('')}<td class="tot">${tot}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    const cdefs = [['Opening', 'open'], ['+ Receipts', 'receipts'], ['− Consumption (from stock)', 'consumed'], ['Unplanned crude (shortfall)', 'unplanned'], ['Closing', 'close', 'tot']];
    const pdefs = [['Opening', 'open'], ['+ Production', 'production'], ['+ Purchases', 'purchases'], ['− Sales', 'sales'], ['Demand', 'demand'], ['Unmet demand', 'unmet'], ['Closing', 'close', 'tot']];
    const cr = R.grades.map((g, i) => `<details class="ent"${i === 0 ? ' open' : ''}><summary>${esc(g)} <span style="color:var(--muted-foreground);font-weight:400">· ${esc(R.crudeBench[g] || 'Unmapped')}</span></summary>${tbl(R.crudeBal.filter(b => b.grade === g && wm.includes(b.month)), cdefs, ['receipts', 'consumed', 'unplanned'], wm)}</details>`).join('');
    const pr = R.products.map((p, i) => `<details class="ent"${i === 0 ? ' open' : ''}><summary>${esc(p)} <span style="color:var(--muted-foreground);font-weight:400">· ${esc(R.prodBench[p] || 'Unmapped')}</span></summary>${tbl(R.prodBal.filter(b => b.product === p && pm.includes(b.month)), pdefs, ['production', 'purchases', 'sales', 'demand', 'unmet'], pm)}</details>`).join('');
    return card('Crude balances', `kb, ${fm(w.start)} to ${fm(w.end)} (display window). Consumption is drawn from stock FIFO; any shortfall is shown separately as unplanned crude. Crude data may start before the product data.`, cr, '', true) +
      card('Product balances', `kb, from ${fm(pm[0] != null ? pm[0] : R.productStart)}. Product data starts at the first product month; earlier months have crude only.`, pr, '', true);
  }

  function checksList(items) {
    return items.map(c => `<div class="issue"><span class="tag ${c.level}">${c.level}</span><div><b>${esc(c.title)}</b><span class="d">${esc(c.detail)}</span></div></div>`).join('');
  }
  function pageChecks() {
    const R = S.R;
    const order = { error: 0, warn: 1, info: 2, ok: 3 };
    const items = R.checks.slice().sort((a, b) => order[a.level] - order[b.level]);
    const inp = S.issues.map(i => ({ level: i.level, title: 'Input file', detail: i.msg }));
    return card('Model checks', 'Mass balance, supply cover, demand cover and benchmark mapping.', checksList(items), '', true) +
      (inp.length ? card('Input file notes', 'Raised while reading the file.', checksList(inp), '', true) : '');
  }

  function previewTables() {
    const inp = S.input, M = inp.months;
    const PM = M.filter(m => m >= inp.productStart);   // product data starts later than crude data
    const mh = M.map(m => `<th>${fm(m)}</th>`).join('');
    const pmh = PM.map(m => `<th>${fm(m)}</th>`).join('');
    const pm = k => k == null ? '–' : fm(k);
    const t = (head, body) => `<div class="tbl-wrap"><table class="m"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    const cr = t(`<th>Crude grade</th><th>Benchmark</th>${mh}`, inp.crudes.map(r => `<tr><td>${esc(r.grade)}</td><td>${esc(r.benchmark || '–')}</td>${M.map(m => `<td>${fmt(r.consumption[m] || 0)}</td>`).join('')}</tr>`).join(''));
    const yl = t(`<th>Product</th><th>Benchmark</th>${pmh}`, inp.products.map(r => `<tr><td>${esc(r.product)}</td><td>${esc(r.benchmark || '–')}</td>${PM.map(m => `<td>${fmt(r.production[m] || 0, 1)}</td>`).join('')}</tr>`).join(''));
    const oc = t('<th>Crude grade</th><th>Pricing month</th><th>Volume</th>', inp.openCrude.map(r => `<tr><td>${esc(r.grade)}</td><td>${r.pricing == null ? '<span class="c-amber">not specified</span>' : fm(r.pricing)}</td><td>${fmt(r.volume)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center">None</td></tr>');
    const srcLabel = x => x === 'Production' ? 'Production' : x === 'Purchase' ? 'Purchase' : 'Opening (priced)';
    const op = t('<th>Product</th><th>Source</th><th>Month</th><th>Volume</th>', inp.openProducts.map(r => `<tr><td>${esc(r.product)}</td><td>${srcLabel(r.source)}</td><td>${r.month == null ? '<span class="c-amber">not specified</span>' : fm(r.month)}</td><td>${fmt(r.volume)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center">None</td></tr>');
    const im = t('<th>Crude grade</th><th>Loading</th><th>Arrival</th><th>Pricing</th><th>Volume</th>', inp.crudeImports.map(r => `<tr><td>${esc(r.grade)}</td><td>${pm(r.loading)}</td><td>${fm(r.arrival)}</td><td>${pm(r.pricing)}</td><td>${fmt(r.volume)}</td></tr>`).join(''));
    const pu = t('<th>Product</th><th>Arrival</th><th>Half</th><th>Pricing</th><th>Volume</th>', inp.productPurchases.map(r => `<tr><td>${esc(r.product)}</td><td>${fm(r.arrival)}</td><td>${r.half === 2 ? '2nd half' : '1st half'}</td><td>${pm(r.pricing)}</td><td>${fmt(r.volume)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center">None</td></tr>');
    const dm = t(`<th>Product</th>${pmh}`, inp.demand.map(r => `<tr><td>${esc(r.product)}</td>${PM.map(m => `<td>${fmt(r.demand[m] || 0)}</td>`).join('')}</tr>`).join(''));
    const blk = (title, body, open) => `<details class="ent"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
    return card('Loaded inputs', 'As read from your file (kb). Held in memory only.',
      blk('Crude consumption', cr, true) + blk('Product yield', yl) + blk('Opening crude inventory (by pricing month)', oc) + blk('Opening product inventory (by source and month)', op) +
      blk('Crude imports', im) + blk('Product purchases', pu) + blk('Demand', dm), '', true);
  }

  function pageData() {
    const loaded = !!S.R;
    const issues = S.issues.length ? card('File notes', 'Please fix errors and load the file again.', checksList(S.issues.map(i => ({ level: i.level, title: 'Input file', detail: i.msg }))), '', true) : '';
    const drop = `<div class="drop" id="drop"><div class="big bg-blue c-blue">${I('upload')}</div><h4>Drop your input workbook here</h4>
      <p>One workbook with a worksheet per input: Crude Consumption, Product Yield, Opening Crude, Opening Product, Crude Imports, Product Purchases, Demand.</p>
      <div class="acts"><button class="btn primary" data-act="browse">${I('file')} Choose file</button><button class="btn" data-act="demo">${I('flask')} Load demo data</button><button class="btn" data-act="template">${I('download')} Download template</button></div></div>`;
    const priv = `<div class="note">${I('lock')}<div><b>Your data never leaves this tab.</b> The page cannot make network requests (enforced by a Content-Security-Policy), uses no cookies or browser storage, and forgets everything when you close or refresh. Use <b>Export</b> to save results to your own computer.</div></div>`;
    let loadedCard = '';
    if (loaded) {
      const inp = S.input;
      loadedCard = card('Session data', `Loaded from ${esc(S.file)}`,
        `<div class="stat-row"><div><b>${inp.months.length}</b>months (${fm(inp.months[0])} – ${fm(inp.months[inp.months.length - 1])})</div><div><b>${fm(inp.productStart)}</b>product data starts</div><div><b>${inp.crudes.length}</b>crude grades</div><div><b>${inp.products.length}</b>products</div><div><b>${inp.openCrude.length + inp.openProducts.length}</b>opening layers</div><div><b>${inp.crudeImports.length}</b>crude imports</div><div><b>${inp.productPurchases.length}</b>product purchases</div></div>
         <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" data-go="dash">View dashboard</button><button class="btn" data-act="xlsx">${I('download')} Export results (.xlsx)</button><button class="btn" data-act="csv">${I('download')} Export detail (.csv)</button><button class="btn" data-act="clear">${I('trash')} Clear data</button></div>`);
    }
    return priv + card('Load data', 'Required every session. Volumes in thousand barrels (kb).', `<div style="padding-top:2px">${drop}</div>`) + issues + loadedCard + (loaded ? previewTables() : '');
  }

  function pageSettings() {
    const R = S.R, w = WIN(), last = R.months[R.months.length - 1];
    const opts = R.months.map(m => [m, fm(m)]);
    const isDefault = w.start === R.productStart && w.end === last;
    const isAll = w.start === R.months[0] && w.end === last;
    const body = `<div class="filters" style="padding:4px 0 0">
        ${select('Display from', 'win.start', w.start, opts)}${select('Display to', 'win.end', w.end, opts)}
        <div class="field"><label>Quick ranges</label><div class="seg"><button class="${isDefault ? 'on' : ''}" data-act="win-default">Product horizon</button><button class="${isAll ? 'on' : ''}" data-act="win-all">All months</button></div></div>
      </div>
      <div class="stat-row" style="margin-top:14px"><div><b>${fm(R.months[0])} - ${fm(last)}</b>model timeline (crude data from ${fm(R.months[0])})</div><div><b>${fm(R.productStart)}</b>product data starts</div><div><b>${fm(w.start)} - ${fm(w.end)}</b>currently displayed</div></div>
      <div class="how" style="margin-top:14px"><b>How the window works</b><ol>
        <li><b>Flow tables</b> (sales-month and production-month axes, percentages, cargo analysis): months before or after the window fold into <b>Earlier months</b> / <b>Later months</b> columns, so totals still tie to the full model.</li>
        <li><b>Stock tables</b> (month-end exposure, inventory, balances) and the margin tables show only the months inside the window.</li>
        <li>The dashboard figures and the Excel export follow the window. Calculations always use the whole timeline.</li></ol></div>`;
    const prio = `<div class="prio-list">${S.priority.map((c, i) => `<div class="prio"><span class="n">${i + 1}</span><span class="t">${esc(E.PRIORITY_LABELS[c])}</span></div>`).join('')}</div>
      <p class="how" style="margin:12px 0 0">Older stock is always sold first. The order is set on the Product Layering page.</p>`;
    const nCargo = R.cargoes.filter(c => c.loading != null).length;
    const opt = `<div class="filters" style="padding:4px 0 0">
        <div class="field"><label>Zero tolerance (kb)</label><input class="num" type="number" min="0" step="0.1" data-opt="tolerance" value="${S.tolerance}"></div>
        <div class="field"><label>Crude consumption order</label>${seg('opt.crudeOrder', S.crudeOrder, [['arrival', 'Arrival month'], ['pricing', 'Pricing month']])}</div>
        <div class="field"><label>Loading month column</label>${seg('opt.showLoading', S.showLoading ? 'on' : 'off', [['on', 'Show'], ['off', 'Hide']])}</div>
      </div>
      <div class="how" style="margin-top:14px">
        <p style="margin:0 0 6px"><b>Zero tolerance</b> - a crude shortfall smaller than this is treated as rounding rather than unplanned crude, so it no longer appears as a 0 kb "Unplanned" row. Ignored gaps are still listed in Data Checks. ${R.tinyGaps.length ? `<span class="c-amber">${R.tinyGaps.length} gap(s) currently ignored.</span>` : 'No gaps are currently being ignored.'}</p>
        <p style="margin:0 0 6px"><b>Crude consumption order</b> - which layer of a grade is run first. <b>Arrival month</b> is physical FIFO: whatever arrived first is consumed first. <b>Pricing month</b> runs the oldest priced layer first. They only differ when the pricing lag varies between cargoes; if your manual numbers disagree with the tool, this is the first thing to check.</p>
        <p style="margin:0"><b>Loading month</b> - shown beside arrival month in the cargo tables and the export. Availability and FIFO always follow the arrival and pricing months. ${nCargo ? `${nCargo} cargo(es) have a loading month.` : 'No cargo in this file has a loading month; add a "Loading Month" column to Crude Imports.'}</p>
      </div>`;
    return card('Display months', 'Choose the first and last month to show. Defaults to the product horizon, so crude-only months before it are folded away.', body) +
      card('Calculation and display options', 'Changing the tolerance recalculates every page.', opt) +
      card('Sales priority (current order)', '', prio, `<button class="btn sm" data-go="product">Edit on Product Layering</button>`);
  }

  const RENDER = { settings: pageSettings, dash: pageDash, crude: pageCrude, product: pageProduct, margin: pageMargin, monthend: pageMonthEnd, balances: pageBalances, checks: pageChecks, data: pageData };

  // ---------- render ----------
  function renderNav() {
    const groups = [...new Set(PAGES.map(p => p.group))];
    const nErr = S.R ? S.R.checks.filter(c => c.level === 'error' || c.level === 'warn').length : 0;
    const hasErr = S.R && S.R.checks.some(c => c.level === 'error');
    $('#nav').innerHTML = groups.map(g => `<div class="nav-label">${g}</div>` + PAGES.filter(p => p.group === g).map(p =>
      `<button class="nav-item${p.id === S.page ? ' active' : ''}" data-go="${p.id}" title="${p.label}">${I(p.icon)}<span>${p.label}</span>${p.id === 'checks' && nErr ? `<em class="badge ${hasErr ? 'err' : 'warn'}" style="font-style:normal">${nErr}</em>` : ''}</button>`).join('')).join('');
  }
  function renderState() {
    $('#stateDot').className = 'dot' + (S.R ? ' on' : '');
    $('#stateTxt').textContent = S.R ? `${S.file} · ${S.R.months.length} months` : 'No data loaded';
    $('#exportTop').disabled = !S.R;
    const pill = $('#winPill');
    if (S.R) { const w = WIN(); pill.innerHTML = I('cal') + `Display ${fm(w.start)} - ${fm(w.end)}`; pill.style.display = 'inline-flex'; }
    else pill.style.display = 'none';
  }
  function render() {
    const y = window.scrollY;
    S.charts.forEach(c => c.destroy()); S.charts = []; S.after = [];
    const pg = PAGES.find(p => p.id === S.page);
    let body;
    try { body = (S.R || S.page === 'data') ? RENDER[S.page]() : empty(); }
    catch (e) { console.error(e); body = card('Something went wrong', '', `<p style="color:var(--rose)">${esc(e.message)}</p>`); }
    $('#page').innerHTML = `<div class="page-head"><h1>${pg.label}</h1><p>${pg.sub}</p></div>${body}`;
    S.after.forEach(fn => fn());
    renderNav(); renderState();
    window.scrollTo(0, y);
  }
  function go(id) {
    S.page = RENDER[id] ? id : 'data';
    if (location.hash !== '#/' + S.page) history.replaceState(null, '', '#/' + S.page);
    $('#app').classList.remove('mobile-open');
    window.scrollTo(0, 0); render();
  }

  // ---------- data loading ----------
  function rerun() { S.R = E.run(S.input, { priority: S.priority, tolerance: S.tolerance, crudeOrder: S.crudeOrder }); buildColors(); }
  function setData(sheets, name) {
    const res = P.parseSheets(sheets);
    S.issues = res.issues;
    if (!res.ok) { S.R = null; S.input = null; S.file = ''; go('data'); return; }
    try {
      S.input = res.input; S.file = name; S.win = null; rerun();
      S.f.dash.month = null;
      go('dash');
    } catch (e) { console.error(e); S.R = null; S.issues.push({ level: 'error', msg: 'Calculation failed: ' + e.message }); go('data'); }
  }
  function loadFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
        const sheets = wb.SheetNames.map(name => ({ name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) }));
        setData(sheets, file.name);
      } catch (e) { S.issues = [{ level: 'error', msg: 'Could not read this file: ' + e.message }]; S.R = null; go('data'); }
    };
    rd.readAsArrayBuffer(file);
  }
  function clearData() { S.R = null; S.input = null; S.issues = []; S.file = ''; S.win = null; go('data'); }

  // ---------- events ----------
  function setPath(path, val) {
    const [a, b] = path.split('.');
    if (a === 'opt') {
      if (b === 'crudeOrder') { S.crudeOrder = val; rerun(); return; }
      S[b] = val === 'on'; return;
    }
    if (a === 'win') {   // display window: keep start <= end
      const cur = WIN(), v = +val;
      S.win = { start: cur.start, end: cur.end }; S.win[b] = v;
      if (S.win.start > S.win.end) { if (b === 'start') S.win.end = v; else S.win.start = v; }
      return;
    }
    const m = { crude: S.f.crude, prod: S.f.prod, margin: S.f.margin, me: S.f.me, dash: S.f.dash, pct: S.f.pct, cargo: S.f.cargo }[a];
    if (a === 'dash' && b === 'month') val = +val;
    if (a === 'cargo' && b === 'cargoId') val = val === '' ? '' : +val;
    m[b] = val;
  }
  document.addEventListener('click', e => {
    const sh = e.target.closest('[data-tbl-sort]');
    if (sh) {   // click a header: label columns start ascending, value columns descending; then flip, then off
      const [id, c] = sh.dataset.tblSort.split('|'), st = tstate(id);
      const col = /^[0-9]+$/.test(c) ? +c : c;
      const first = typeof col === 'string' && col[0] === 'L' ? 'asc' : 'desc';
      st.sort = !st.sort || String(st.sort.col) !== String(col) ? { col, dir: first }
        : st.sort.dir === first ? { col, dir: first === 'asc' ? 'desc' : 'asc' } : null;
      return render();
    }
    const rs = e.target.closest('[data-tbl-reset]');
    if (rs) { tstate(rs.dataset.tblReset).sort = null; return render(); }
    const t = e.target.closest('[data-go],[data-set],[data-act],[data-preset]'); if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.preset) { const [row, col, basis] = t.dataset.preset.split('|'); S.f.pct = { row, col, basis }; return render(); }
    if (t.dataset.set) { setPath(t.dataset.set, t.dataset.val); return render(); }
    const a = t.dataset.act;
    if (a === 'browse') $('#file').click();
    else if (a === 'demo') setData(Demo.buildDemoSheets().map(s => ({ name: s.name, aoa: s.aoa })), 'Demo data (fictional)');
    else if (a === 'prio-up' || a === 'prio-down') {
      const i = +t.dataset.i, j = a === 'prio-up' ? i - 1 : i + 1;
      if (j >= 0 && j < S.priority.length) { [S.priority[i], S.priority[j]] = [S.priority[j], S.priority[i]]; rerun(); render(); }
    }
    else if (a === 'prio-reset') { S.priority = E.DEFAULT_PRIORITY.slice(); rerun(); render(); }
    else if (a === 'template') Export.downloadTemplate();
    else if (a === 'win-default') { S.win = null; render(); }
    else if (a === 'win-all') { S.win = { start: S.R.months[0], end: S.R.months[S.R.months.length - 1] }; render(); }
    else if (a === 'xlsx') Export.downloadXlsx(S.R, WIN());
    else if (a === 'csv') Export.downloadCsv(S.R);
    else if (a === 'clear') clearData();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'file') { if (t.files[0]) loadFile(t.files[0]); t.value = ''; return; }
    if (t.dataset && t.dataset.opt === 'tolerance') {
      const v = parseFloat(t.value);
      S.tolerance = isFinite(v) && v >= 0 ? v : 0.5;
      rerun(); render(); return;
    }
    if (t.dataset && t.dataset.bind) { setPath(t.dataset.bind, t.value); render(); }
  });
  // row filters: re-render as you type, keeping focus and caret
  document.addEventListener('input', e => {
    const f = e.target.closest('[data-tbl-filter]'); if (!f) return;
    const id = f.dataset.tblFilter, pos = f.selectionStart;
    tstate(id).filter = f.value;
    render();
    const again = document.querySelector(`[data-tbl-filter="${id}"]`);
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
  });
  ['dragover', 'dragenter'].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } else e.preventDefault(); }));
  ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
    const d = document.getElementById('drop'); if (d) d.classList.remove('over');
    if (ev === 'drop') { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); }
  }));

  // ---------- chrome ----------
  $('#logo').innerHTML = `<svg class="i" style="width:16px;height:16px" viewBox="0 0 24 24">${ICONS.layers}</svg>`;
  $('#collapse').innerHTML = I('left');
  $('#lockIc').innerHTML = I('lock');
  $('#searchIc').innerHTML = I('search');
  $('#menuBtn').innerHTML = I('menu');
  $('#exportTop').innerHTML = I('download') + 'Export';
  const setTheme = t => { document.documentElement.setAttribute('data-theme', t); $('#theme').innerHTML = I(t === 'dark' ? 'sun' : 'moon'); };
  setTheme('light');
  $('#theme').addEventListener('click', () => { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); render(); });
  $('#collapse').addEventListener('click', () => $('#app').classList.toggle('collapsed'));
  $('#menuBtn').addEventListener('click', () => $('#app').classList.toggle('mobile-open'));
  $('#exportTop').addEventListener('click', () => { if (S.R) Export.downloadXlsx(S.R, WIN()); });

  const si = $('#search'), sr = $('#searchRes');
  function showSearch() {
    const q = si.value.trim().toLowerCase();
    const hits = PAGES.filter(p => !q || p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
    sr.innerHTML = hits.map((p, i) => `<button data-go="${p.id}" class="${i === 0 ? 'hl' : ''}">${I(p.icon)}${p.label}</button>`).join('');
    sr.classList.toggle('open', document.activeElement === si && hits.length > 0);
  }
  si.addEventListener('input', showSearch); si.addEventListener('focus', showSearch);
  si.addEventListener('blur', () => setTimeout(() => sr.classList.remove('open'), 150));
  si.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = sr.querySelector('button'); if (b) { go(b.dataset.go); si.value = ''; si.blur(); } } if (e.key === 'Escape') si.blur(); });
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); si.focus(); } });

  const h = (location.hash || '').replace('#/', '');
  S.page = 'data';
  render();
  if (RENDER[h] && h === 'data') go('data');

  // test hook (no data involved)
  window.__layering = { S, setData, go };
})();
