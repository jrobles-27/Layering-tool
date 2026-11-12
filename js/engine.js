/* Exposure layering engine. Pure computation, no DOM, no storage, no network.
 *
 * Month keys are integers: year*12 + monthIndex(0-11).
 * Pricing keys also use two sentinels: PRE (pricing month unknown / before the horizon)
 * and UNPLANNED (crude needed to cover a shortfall - no purchase in the plan).
 *
 * Method (FIFO layers):
 *  1. Crude layers (opening + imports) are consumed FIFO per grade, oldest pricing month first.
 *  2. Each month's production is a pro-rata blend of the crude layers consumed that month.
 *  3. Product layers (opening, production, purchases) are sold FIFO, oldest availability first.
 *  4. Every barrel sold is traced back to its crude pricing month => pricing x sale month matrix.
 */
(function (root) {
  'use strict';

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PRE = 0;
  const UNPLANNED = 1e9;
  const UNPRICED = 1e9 - 1;    // in tank at this month-end but its pricing month has not arrived yet
  const END = 'END';
  const EARLIER = 'EARLIER';   // display bucket: months before the display window
  const LATER = 'LATER';       // display bucket: months after the display window
  const EPS = 1e-9;

  function fmtMonth(k) {
    if (k === PRE) return 'Pre-horizon';
    if (k === UNPRICED) return 'Not yet priced';
    if (k === UNPLANNED) return 'Unplanned';
    if (k === END) return 'Unsold at end';
    if (k === EARLIER) return 'Earlier months';
    if (k === LATER) return 'Later months';
    if (typeof k !== 'number') return String(k);
    const y = Math.floor(k / 12), m = k % 12;
    return MON[m] + '-' + String(y % 100).padStart(2, '0');
  }

  function sum(a) { let s = 0; for (const x of a) s += x; return s; }

  /** Draw `need` from layers (already sorted oldest-first). Returns draws and the unmet remainder. */
  function drawFifo(layers, need) {
    const draws = [];
    for (const l of layers) {
      if (need <= EPS) break;
      if (l.rem <= EPS) continue;
      const take = Math.min(l.rem, need);
      l.rem -= take;
      need -= take;
      draws.push({ layer: l, vol: take });
    }
    return { draws, short: need > EPS ? need : 0 };
  }

  // Order in which product layers are sold within a month. Anything older than the previous month
  // (including opening inventory) is always sold first, oldest first.
  const DEFAULT_PRIORITY = ['prevProd', 'prevImp', 'curImp1', 'curProd', 'curImp2'];
  const PRIORITY_LABELS = {
    prevProd: "Previous month's production",
    prevImp: "Previous month's imports",
    curImp1: "Current month's imports, arriving 1st-15th",
    curProd: "Current month's production",
    curImp2: "Current month's imports, arriving 16th-month end"
  };
  function validPriority(p) {
    return Array.isArray(p) && p.length === DEFAULT_PRIORITY.length && DEFAULT_PRIORITY.every(c => p.includes(c));
  }
  function openingLabel(pricing) {
    return pricing === PRE ? 'Opening inventory (pricing month not specified)' : 'Opening inventory (priced ' + fmtMonth(pricing) + ')';
  }

  function run(inp, opts) {
    const prio = validPriority(opts && opts.priority) ? opts.priority.slice() : DEFAULT_PRIORITY.slice();
    // Volumes at or below this are rounding noise, not real gaps: a crude shortfall smaller than this
    // does not become an "unplanned" cargo (it would otherwise show as a 0 kb row after rounding).
    const TOL = opts && opts.tolerance != null && isFinite(opts.tolerance) && opts.tolerance >= 0 ? +opts.tolerance : 0.5;
    // Order in which crude layers of a grade are drawn down. 'arrival' = physical FIFO (what arrived
    // first is run first), 'pricing' = oldest priced layer first. These differ whenever the pricing
    // lag is not the same for every cargo.
    const crudeOrder = (opts && opts.crudeOrder) === 'pricing' ? 'pricing' : 'arrival';
    const drawOrder = crudeOrder === 'pricing'
      ? (a, b) => a.pricing - b.pricing || a.avail - b.avail || a.id - b.id
      : (a, b) => a.avail - b.avail || a.pricing - b.pricing || a.id - b.id;
    /** A layer only carries price exposure once its pricing month has arrived. */
    const pricedAt = (pricing, mk) => (typeof pricing === 'number' && pricing !== PRE && pricing !== UNPLANNED && pricing > mk) ? UNPRICED : pricing;
    const posOf = new Map(prio.map((c, i) => [c, i]));
    const catOf = (L, t) => {
      const d = t - L.a;
      if (L.type === 'Opening' || d >= 2) return 'old';
      if (d === 1) return L.type === 'Production' ? 'prevProd' : 'prevImp';
      return L.type === 'Production' ? 'curProd' : (L.half === 2 ? 'curImp2' : 'curImp1');
    };
    // Sort key: [group, ...]. Group 0 = old stock (oldest first); group 1 = user-ordered categories.
    const saleKey = (L, t) => {
      const c = catOf(L, t);
      if (c === 'old') return [0, L.a, L.type === 'Opening' ? 0 : posOf.get(L.type === 'Production' ? 'prevProd' : 'prevImp'), L.type === 'Opening' ? L.comp[0].pricing : L.id];
      return [1, posOf.get(c), 0, L.id];
    };
    const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    const months = inp.months.slice();   // full model timeline: earliest crude month .. last month
    const T = months.length;
    const start = months[0];
    const idx = k => k - start;
    // Product simulation (production, purchases, demand) starts at the first product month; crude runs from `start`.
    const pStart = Math.max(0, Math.min(T - 1, inp.productStart != null ? inp.productStart - start : 0));
    const notes = [];
    const checks = [];
    const add = (level, title, detail) => checks.push({ level, title, detail });

    // ---------- benchmark maps ----------
    const crudeBench = {};
    const openCrude = inp.openCrude || [], openProducts = inp.openProducts || [];
    inp.crudes.concat(openCrude, inp.crudeImports).forEach(r => { if (r.benchmark && !crudeBench[r.grade]) crudeBench[r.grade] = r.benchmark; });
    const benchOf = g => crudeBench[g] || 'Unmapped';
    const prodBench = {};
    inp.products.concat(openProducts, inp.productPurchases).forEach(r => { if (r.benchmark && !prodBench[r.product]) prodBench[r.product] = r.benchmark; });
    const pBenchOf = p => prodBench[p] || 'Unmapped';

    // ---------- universes ----------
    const grades = [];
    const gset = new Set();
    const addGrade = g => { if (!gset.has(g)) { gset.add(g); grades.push(g); } };
    inp.crudes.forEach(r => addGrade(r.grade));
    openCrude.forEach(r => addGrade(r.grade));
    inp.crudeImports.forEach(r => addGrade(r.grade));
    const products = [];
    const pset = new Set();
    const addProd = p => { if (!pset.has(p)) { pset.add(p); products.push(p); } };
    inp.products.forEach(r => addProd(r.product));
    openProducts.forEach(r => addProd(r.product));
    inp.productPurchases.forEach(r => addProd(r.product));
    inp.demand.forEach(r => addProd(r.product));

    // ---------- crude layers ----------
    let lid = 0;
    const crudeLayers = [];
    openCrude.forEach(r => {
      if (r.volume > 0) {
        const unspecified = r.pricing == null;
        if (unspecified) add('warn', 'Opening crude without pricing month', `${r.grade}: ${r.volume} kb of opening inventory has no pricing month - assigned to "Pre-horizon". Add the pricing month in the input.`);
        crudeLayers.push({ id: lid++, grade: r.grade, bench: benchOf(r.grade), pricing: unspecified ? PRE : r.pricing, avail: 0, vol: r.volume, rem: r.volume, src: 'Opening' });
      }
    });
    inp.crudeImports.forEach(r => {
      const a = idx(r.arrival);
      if (a >= T) { add('info', 'Crude import after horizon (ignored)', `${r.grade} ${fmtMonth(r.arrival)}: ${r.volume} kb.`); return; }
      if (a < 0) add('info', 'Crude import before horizon start', `${r.grade} arriving ${fmtMonth(r.arrival)} (${r.volume} kb) is added to opening supply and available from ${fmtMonth(start)}.`);
      let pricing = r.pricing;
      if (pricing == null) { pricing = r.arrival - 1; add('warn', 'Import without pricing month', `${r.grade} ${fmtMonth(r.arrival)}: assumed priced in ${fmtMonth(pricing)} (arrival - 1).`); }
      crudeLayers.push({ id: lid++, grade: r.grade, bench: benchOf(r.grade), pricing, avail: Math.max(0, a), vol: r.volume, rem: r.volume, src: 'Import', arrival: r.arrival, loading: r.loading == null ? null : r.loading });
    });
    // cargo labels (every crude layer = one cargo): "Grade | arr Jan-27 | priced Dec-26"
    const cargoSeen = new Map();
    crudeLayers.forEach(l => {
      const base = l.src === 'Opening'
        ? `${l.grade} | opening, priced ${l.pricing === PRE ? 'not specified' : fmtMonth(l.pricing)}`
        : `${l.grade} | arr ${fmtMonth(l.arrival)} | priced ${fmtMonth(l.pricing)}`;
      const n = (cargoSeen.get(base) || 0) + 1; cargoSeen.set(base, n);
      l.seq = n;
      l.label = n > 1 ? `${base} #${n}` : base;
    });
    const extraCargo = [];  // pseudo-cargoes for unplanned (shortfall) crude
    const cargoUse = [];    // {cargoId, t, month, vol}: crude of each cargo consumed in each production month
    const prodKeyOf = L => L.prodKey;   // production month (number) or 'Purchased product' / 'Opening stock'
    const consumption = {}; // grade -> [T]
    grades.forEach(g => { consumption[g] = new Array(T).fill(0); });
    inp.crudes.forEach(r => { for (const k in r.consumption) { const i = idx(+k); if (i >= 0 && i < T) consumption[r.grade][i] += r.consumption[k]; } });

    // ---------- production / demand / purchases ----------
    const production = {}, demand = {};
    products.forEach(p => { production[p] = new Array(T).fill(0); demand[p] = new Array(T).fill(0); });
    inp.products.forEach(r => { for (const k in r.production) { const i = idx(+k); if (i >= 0 && i < T) production[r.product][i] += r.production[k]; } });
    inp.demand.forEach(r => { for (const k in r.demand) { const i = idx(+k); if (i >= 0 && i < T) demand[r.product][i] += r.demand[k]; } });

    let plid = 0;
    const prodLayers = [];
    // Opening product stock (at the start of the first product month). Each row is one layer:
    //   source 'Production': made in `month` -> traced to the crude consumed in that month (needs crude data for it)
    //   source 'Purchase'  : bought and priced in `month`
    //   source 'Opening'   : older single-column format, `month` is the pricing month
    const openLayersPending = openProducts.filter(r => r.volume > 0);
    const blends = new Array(T).fill(null);   // crude blend (cargo shares) consumed in each month
    function createOpeningLayers() {
      openLayersPending.forEach(r => {
        const src = r.source || 'Opening';
        const unspecified = r.month == null;
        const pb = pBenchOf(r.product);
        if (src === 'Production') {
          const bt = unspecified ? NaN : idx(r.month);
          let comp, why = null;
          if (unspecified) why = 'no production month given';
          else if (bt >= pStart) why = `${fmtMonth(r.month)} is not before the first product month (${fmtMonth(months[pStart])})`;
          else if (bt < 0) why = `crude data starts ${fmtMonth(start)}, after that production month`;
          else if (!blends[bt]) why = 'no crude consumption in the crude data for that month';
          if (why) {
            add('warn', 'Opening product production cannot be traced to crude', `${r.product} produced ${unspecified ? '(month missing)' : fmtMonth(r.month)}, ${r.volume} kb: ${why}. Shown as "Pre-horizon" pricing. Extend the crude consumption data back to that month.`);
            comp = [{ cargoId: -1, cargo: 'Unattributed', pricing: PRE, grade: 'Unattributed', bench: 'Unmapped', src: 'Crude', share: 1 }];
          } else comp = blends[bt];
          prodLayers.push({ id: plid++, product: r.product, type: 'Production', kind: 'Production', opening: true, a: unspecified ? -999 : bt, half: 0, avail: pStart,
            label: unspecified ? 'Prod (month missing) (opening stock)' : 'Prod ' + fmtMonth(r.month) + ' (opening stock)', prodKey: unspecified ? 'Opening stock' : r.month, vol: r.volume, rem: r.volume, comp });
        } else {
          if (unspecified) add('warn', 'Opening product without pricing month', `${r.product}: ${r.volume} kb of opening inventory has no month - assigned to "Pre-horizon". Add the month in the input.`);
          const pk = unspecified ? PRE : r.month;
          const purchase = src === 'Purchase';
          prodLayers.push({ id: plid++, product: r.product, type: purchase && !unspecified ? 'Purchase' : 'Opening', kind: purchase ? 'Purchase' : 'Opening', opening: true, a: purchase && !unspecified ? idx(pk) : -999, half: 1, avail: pStart,
            label: purchase ? (unspecified ? 'Opening purchase (pricing month not specified)' : 'Opening purchase (priced ' + fmtMonth(pk) + ')') : openingLabel(pk),
            prodKey: purchase ? 'Purchased product' : 'Opening stock', vol: r.volume, rem: r.volume,
            comp: [{ pricing: pk, grade: purchase ? 'Purchased product' : 'Opening product', bench: pb, src: purchase ? 'Purchased product' : 'Opening product', share: 1 }] });
        }
      });
    }
    const purchasesByT = Array.from({ length: T }, () => []);
    inp.productPurchases.forEach(r => {
      const a = idx(r.arrival);
      if (a >= T) { add('info', 'Product purchase after horizon (ignored)', `${r.product} ${fmtMonth(r.arrival)}: ${r.volume} kb.`); return; }
      if (a < pStart) add('info', 'Product purchase before the first product month', `${r.product} arriving ${fmtMonth(r.arrival)} is available from ${fmtMonth(months[pStart])}. Pre-horizon purchases are better listed as opening product stock (Source = Purchase).`);
      let pricing = r.pricing;
      if (pricing == null) { pricing = r.arrival - 1; add('warn', 'Product purchase without pricing month', `${r.product} ${fmtMonth(r.arrival)}: assumed priced in ${fmtMonth(pricing)} (arrival - 1).`); }
      const t = Math.max(pStart, a);
      const half = r.half === 2 ? 2 : 1;
      // The pricing month is part of the label: two cargoes arriving in the same half-month but priced
      // in different months are different exposures and must stay separate line items.
      const L = { id: plid++, product: r.product, type: 'Purchase', kind: 'Purchase', prodKey: 'Purchased product', a, half, avail: t, label: 'Purchase ' + fmtMonth(r.arrival) + (half === 2 ? ' 2nd half' : ' 1st half') + ' (priced ' + fmtMonth(pricing) + ')', vol: r.volume, rem: r.volume,
        comp: [{ pricing, grade: 'Purchased product', bench: pBenchOf(r.product), src: 'Purchased product', share: 1 }] };
      prodLayers.push(L);
    });

    // ---------- outputs ----------
    const expRows = [];     // traced exposure rows (sold + unsold at end)
    const sales = [];       // product layering: product x layer x sale month
    const snaps = [];       // month-end exposure rows
    const prodInv = [];     // month-end product inventory by layer
    const crudeInv = [];    // month-end crude inventory by layer
    const crudeBal = [];    // grade x month
    const prodBal = [];     // product x month
    const unmet = [];       // {product,t,vol}
    const shortfalls = [];  // {grade,t,vol}
    const tinyGaps = [];    // sub-tolerance crude gaps, reported but not turned into cargoes
    const unpricedAtEnd = [];   // in tank at a month-end but not yet priced
    const consumedByMonth = new Array(T).fill(0);
    const producedByMonth = new Array(T).fill(0);
    const sold = {}; products.forEach(p => { sold[p] = new Array(T).fill(0); });

    const crudeClose = {}; grades.forEach(g => { crudeClose[g] = sum(crudeLayers.filter(l => l.grade === g && l.src === 'Opening').map(l => l.vol)); });
    const prodClose = {}; products.forEach(p => { prodClose[p] = 0; });   // set when the product horizon starts

    for (let t = 0; t < T; t++) {
      const mk = months[t];
      const inProd = t >= pStart;   // product simulation active (earlier months are crude-only)
      if (t === pStart) {
        createOpeningLayers();
        products.forEach(p => { prodClose[p] = sum(prodLayers.filter(l => l.product === p && l.avail <= t).map(l => l.vol)); });
      }
      // --- crude consumption (FIFO per grade) ---
      const parts = new Map(); // key -> part
      let C = 0;
      grades.forEach(g => {
        const need = consumption[g][t];
        const receipts = sum(crudeLayers.filter(l => l.grade === g && l.src === 'Import' && l.avail === t).map(l => l.vol));
        const open = crudeClose[g];
        let consumed = 0, shortVol = 0;
        if (need > 0) {
          const avail = crudeLayers.filter(l => l.grade === g && l.avail <= t && l.rem > EPS).sort(drawOrder);
          const { draws, short } = drawFifo(avail, need);
          draws.forEach(d => {
            consumed += d.vol;
            const p = parts.get(d.layer.id) || { cargoId: d.layer.id, cargo: d.layer.label, pricing: d.layer.pricing, grade: g, bench: d.layer.bench, src: 'Crude', vol: 0 };
            p.vol += d.vol; parts.set(d.layer.id, p);
            cargoUse.push({ cargoId: d.layer.id, t, month: mk, vol: d.vol });
          });
          if (short > TOL) {
            shortVol = short;
            shortfalls.push({ grade: g, t, vol: short });
            const uid = lid++, ulabel = `${g} | unplanned ${fmtMonth(mk)}`;
            extraCargo.push({ id: uid, label: ulabel, grade: g, bench: benchOf(g), pricing: UNPLANNED, arrival: null, loading: null, src: 'Unplanned', seq: 1, vol: short });
            parts.set(uid, { cargoId: uid, cargo: ulabel, pricing: UNPLANNED, grade: g, bench: benchOf(g), src: 'Crude', vol: short });
            cargoUse.push({ cargoId: uid, t, month: mk, vol: short });
            C += need;
          } else {
            // Sub-tolerance gap: treat the plan as met by what was actually in tank rather than
            // inventing a token "unplanned" cargo that rounds to 0 kb in every table.
            if (short > EPS) tinyGaps.push({ grade: g, t, vol: short });
            C += consumed;
          }
        }
        const close = sum(crudeLayers.filter(l => l.grade === g && l.avail <= t).map(l => l.rem));
        crudeClose[g] = close;
        crudeBal.push({ grade: g, t, month: mk, open, receipts, consumed, unplanned: shortVol, close });
      });
      consumedByMonth[t] = C;

      // --- production layers: pro-rata blend of crude consumed this month ---
      let P = 0;
      const compList = [...parts.values()].map(p => ({ cargoId: p.cargoId, cargo: p.cargo, pricing: p.pricing, grade: p.grade, bench: p.bench, src: 'Crude', share: C > 0 ? p.vol / C : 0 }));
      blends[t] = C > 0 ? compList : null;
      (inProd ? products : []).forEach(p => {
        const v = production[p][t];
        P += v;
        if (v > 0) {
          const comp = C > 0 ? compList : [{ cargoId: -1, cargo: 'Unattributed', pricing: UNPLANNED, grade: 'Unattributed', bench: 'Unmapped', src: 'Crude', share: 1 }];
          prodLayers.push({ id: plid++, product: p, type: 'Production', kind: 'Production', a: t, half: 0, avail: t, label: 'Prod ' + fmtMonth(mk), prodKey: mk, vol: v, rem: v, comp });
        }
      });
      producedByMonth[t] = P;
      if (P > 0 && C <= 0) add('error', 'Production without crude consumption', `${fmtMonth(mk)}: ${P.toFixed(1)} kb produced but no crude consumption planned; exposure cannot be traced.`);
      if (inProd && C > 0 && Math.abs(P - C) / C > 0.001) add('warn', 'Yield does not match crude consumption', `${fmtMonth(mk)}: crude ${C.toFixed(1)} kb vs products ${P.toFixed(1)} kb (${(P - C >= 0 ? '+' : '') + (P - C).toFixed(1)}). Product exposure is traced pro-rata to crude consumed.`);

      // --- demand (sales priority per product) ---
      (inProd ? products : []).forEach(p => {
        const open = prodClose[p];
        const prod = production[p][t];
        const purch = sum(prodLayers.filter(l => l.product === p && l.type === 'Purchase' && !l.opening && l.avail === t).map(l => l.vol));
        const need = demand[p][t];
        let soldVol = 0, unmetVol = 0;
        if (need > 0) {
          const avail = prodLayers.filter(l => l.product === p && l.avail <= t && l.rem > EPS)
            .map(l => ({ l, k: saleKey(l, t) }))
            .sort((x, y) => cmpKey(x.k, y.k)).map(x => x.l);
          const { draws, short } = drawFifo(avail, need);
          draws.forEach(d => {
            soldVol += d.vol;
            sales.push({ product: p, pbench: pBenchOf(p), sale: mk, layer: d.layer.label, type: d.layer.type, kind: d.layer.kind, opening: !!d.layer.opening, prodKey: d.layer.prodKey, vol: d.vol });
            d.layer.comp.forEach(c => {
              const v = d.vol * c.share;
              if (v > EPS) expRows.push({ stage: 'Sold', product: p, pbench: pBenchOf(p), kind: d.layer.kind, sale: mk, layer: d.layer.label, prodKey: prodKeyOf(d.layer), cargoId: c.cargoId == null ? null : c.cargoId, cargo: c.cargo || '', src: c.src, pricing: c.pricing, grade: c.grade, bench: c.bench, vol: v });
            });
          });
          if (short > 0) { unmetVol = short; unmet.push({ product: p, t, vol: short }); }
        }
        sold[p][t] = soldVol;
        const close = sum(prodLayers.filter(l => l.product === p && l.avail <= t).map(l => l.rem));
        prodClose[p] = close;
        prodBal.push({ product: p, t, month: mk, open, production: prod, purchases: purch, sales: soldVol, unmet: unmetVol, close, demand: need });
      });

      // --- month-end snapshots ---
      const snap = [];
      // Month-end exposure counts a barrel only once its price is fixed. Crude in tank whose pricing
      // month is still ahead carries no flat-price exposure yet, so it is left out of the exposure
      // figures entirely and reported separately instead of against a future month.
      crudeLayers.filter(l => l.avail <= t && l.rem > EPS).forEach(l => {
        const unpriced = pricedAt(l.pricing, mk) === UNPRICED;
        if (unpriced) unpricedAtEnd.push({ t, month: mk, grade: l.grade, bench: l.bench, pricing: l.pricing, vol: l.rem });
        else snap.push({ kind: 'Crude inventory', product: '', pbench: '', src: 'Crude', pricing: l.pricing, grade: l.grade, bench: l.bench, vol: l.rem });
        crudeInv.push({ t, month: mk, grade: l.grade, pricing: unpriced ? UNPRICED : l.pricing, src: l.src, vol: l.rem });
      });
      prodLayers.filter(l => l.avail <= t && l.rem > EPS).forEach(l => {
        prodInv.push({ t, month: mk, product: l.product, pbench: pBenchOf(l.product), layer: l.label, type: l.type, kind: l.kind, vol: l.rem });
        l.comp.forEach(c => {
          const v = l.rem * c.share;
          if (pricedAt(c.pricing, mk) === UNPRICED) { unpricedAtEnd.push({ t, month: mk, grade: c.grade, bench: c.bench, pricing: c.pricing, vol: v }); return; }
          snap.push({ kind: 'Product inventory', product: l.product, pbench: pBenchOf(l.product), src: c.src, pricing: c.pricing, grade: c.grade, bench: c.bench, vol: v });
        });
      });
      snaps.push(snap);
    }

    // ---------- end of horizon: what is still unsold ----------
    crudeLayers.filter(l => l.rem > EPS).forEach(l => {
      expRows.push({ stage: 'Unconsumed crude', product: '', pbench: '', kind: 'Crude', sale: END, layer: 'Crude inventory', prodKey: 'Not yet consumed', cargoId: l.id, cargo: l.label, src: 'Crude', pricing: l.pricing, grade: l.grade, bench: l.bench, vol: l.rem });
    });
    prodLayers.filter(l => l.rem > EPS).forEach(l => {
      l.comp.forEach(c => expRows.push({ stage: 'Unsold product', product: l.product, pbench: pBenchOf(l.product), kind: l.kind, sale: END, layer: l.label, prodKey: prodKeyOf(l), cargoId: c.cargoId == null ? null : c.cargoId, cargo: c.cargo || '', src: c.src, pricing: c.pricing, grade: c.grade, bench: c.bench, vol: l.rem * c.share }));
      sales.push({ product: l.product, pbench: pBenchOf(l.product), sale: END, layer: l.label, type: l.type, kind: l.kind, opening: !!l.opening, prodKey: l.prodKey, vol: l.rem });
    });

    // ---------- display order of product layers (chronological) ----------
    const lorder = new Map();
    prodLayers.forEach(l => {
      const within = l.type === 'Purchase' ? (l.half === 2 ? 3 : 1) : 2;
      const k = l.type === 'Opening' ? [-10000, l.comp[0].pricing, 0] : [l.a, within, l.type === 'Purchase' ? l.comp[0].pricing : 0];
      if (!lorder.has(l.label)) lorder.set(l.label, k);
    });
    const layerOrder = [...lorder.entries()].sort((x, y) => x[1][0] - y[1][0] || x[1][1] - y[1][1] || x[1][2] - y[1][2]).map(x => x[0]);
    const layerType = {};   // label -> Production | Purchase | Opening (for the row-source filter)
    const layerInfo = {};   // label -> the parts of the label as separate fields, for table columns
    prodLayers.forEach(l => {
      if (l.label in layerType) return;
      layerType[l.label] = l.kind;
      const isProd = l.kind === 'Production';
      layerInfo[l.label] = {
        kind: l.kind, opening: !!l.opening,
        month: isProd ? (typeof l.prodKey === 'number' ? l.prodKey : null) : (l.type === 'Purchase' && !l.opening ? months[Math.min(Math.max(l.a, 0), T - 1)] : null),
        arrival: l.type === 'Purchase' && !l.opening ? months[Math.min(Math.max(l.a, 0), T - 1)] : null,
        half: l.opening ? 0 : (l.half || 0),
        pricing: isProd ? null : l.comp[0].pricing
      };
    });

    if (inp.productPurchases.length) {
      const n2 = inp.productPurchases.filter(r => r.half === 2).length;
      add('info', 'Product purchase arrival timing', `${inp.productPurchases.length - n2} purchase(s) in the 1st half of the month, ${n2} in the 2nd half. Taken from the day of the arrival date (16th or later = 2nd half) or the "Arrival Half" column; a month-only date counts as 1st half.`);
    }

    // ---------- checks ----------
    const unmappedG = grades.filter(g => !crudeBench[g]);
    if (unmappedG.length) add('warn', 'Crude grades without benchmark', unmappedG.join(', ') + ' - shown as "Unmapped".');
    const unmappedP = products.filter(p => !prodBench[p]);
    if (unmappedP.length) add('warn', 'Products without benchmark', unmappedP.join(', ') + ' - shown as "Unmapped".');
    if (shortfalls.length) {
      const byG = {};
      shortfalls.forEach(s => { (byG[s.grade] = byG[s.grade] || []).push(`${fmtMonth(months[s.t])} ${s.vol.toFixed(0)} kb`); });
      Object.keys(byG).forEach(g => add('warn', `Crude shortfall: ${g}`, byG[g].join('; ') + '. Needs additional purchases - shown as "Unplanned" pricing.'));
    }
    if (unpricedAtEnd.length) {
      const byM = {};
      unpricedAtEnd.forEach(x => { byM[fmtMonth(x.month)] = (byM[fmtMonth(x.month)] || 0) + x.vol; });
      add('info', 'In tank but not yet priced - excluded from exposure', Object.keys(byM).map(m => m + ': ' + byM[m].toFixed(0) + ' kb').join('; ') + '. These barrels had arrived by that month-end but their pricing month was still ahead, so they carry no flat-price exposure yet and are left out of the month-end exposure figures. They remain in the Balances closing stock.');
    }
    if (tinyGaps.length) {
      const tot = sum(tinyGaps.map(x => x.vol));
      add('info', 'Tiny crude gaps ignored', `${tinyGaps.length} month/grade combination(s) were short by less than the ${TOL} kb tolerance (${tot.toFixed(4)} kb in total) - treated as rounding, not as unplanned crude. Change the tolerance in Settings to see them.`);
    }
    if (unmet.length) {
      const byP = {};
      unmet.forEach(s => { (byP[s.product] = byP[s.product] || []).push(`${fmtMonth(months[s.t])} ${s.vol.toFixed(0)} kb`); });
      Object.keys(byP).forEach(p => add('warn', `Unmet demand: ${p}`, byP[p].join('; ') + '. Needs product purchases or lower demand.'));
    }
    products.forEach(p => {
      if (!(production[p].some(v => v > 0) || openProducts.some(r => r.product === p && r.volume > 0) || inp.productPurchases.some(r => r.product === p)) && demand[p].some(v => v > 0)) {
        add('warn', `Demand without any supply: ${p}`, 'No opening stock, production or purchases for this product.');
      }
    });
    const endCrude = sum(crudeLayers.map(l => l.rem));
    const endProd = sum(prodLayers.map(l => l.rem));
    if (endProd > 0) add('info', 'Ending product inventory', `${endProd.toFixed(0)} kb of product remains unsold at the end of the horizon (exposure left open).`);
    if (endCrude > 0) add('info', 'Ending crude inventory', `${endCrude.toFixed(0)} kb of crude remains unconsumed at the end of the horizon.`);
    if (!checks.some(c => c.level === 'error' || c.level === 'warn')) add('ok', 'No blocking issues found', 'Mass balance, supply cover and demand cover all pass.');

    // ---------- summary ----------
    const soldRows = expRows.filter(r => r.stage === 'Sold');
    const aged = soldRows.filter(r => r.pricing !== PRE && r.pricing !== UNPLANNED);
    const agedVol = sum(aged.map(r => r.vol));
    const waAge = agedVol > 0 ? sum(aged.map(r => r.vol * (r.sale - r.pricing))) / agedVol : null;
    const totals = snaps.map(s => sum(s.map(r => r.vol)));
    let peakT = pStart; totals.forEach((v, i) => { if (i >= pStart && v > totals[peakT]) peakT = i; });
    // exposure at the start of the product horizon: crude in tanks then + opening product stock
    const openingExposure = (pStart > 0 ? totals[pStart - 1] : sum(crudeLayers.filter(l => l.src === 'Opening').map(l => l.vol))) + sum(openLayersPending.map(r => r.volume));
    const totalSold = sum(soldRows.filter(r => r.src).map(r => r.vol));
    const totalDemand = sum(products.map(p => sum(demand[p])));
    const totalUnmet = sum(unmet.map(u => u.vol));
    const totalShort = sum(shortfalls.map(s => s.vol));

    const summary = {
      totalConsumed: sum(consumedByMonth), totalProduced: sum(producedByMonth), totalDemand,
      totalSold: totalDemand - totalUnmet, totalUnmet, totalShort, endCrude, endProd,
      waAge, peakExposure: totals.length ? totals[peakT] : 0, peakMonth: months[peakT],
      openingExposure,
      endExposure: totals.length ? totals[totals.length - 1] : 0,
      demandCover: totalDemand > 0 ? (totalDemand - totalUnmet) / totalDemand : 1,
      monthTotals: totals
    };

    return { months, pStart, productStart: months[pStart], grades, products, crudeBench, prodBench, expRows, sales, snaps, prodInv, crudeInv, crudeBal, prodBal, unmet, shortfalls,
      consumedByMonth, producedByMonth, sold, demand, production, checks, summary, notes, layerOrder, layerType, layerInfo, priority: prio, cargoUse, tinyGaps, tolerance: TOL, crudeOrder, unpricedAtEnd,
      cargoes: crudeLayers.map(l => ({ id: l.id, label: l.label, grade: l.grade, bench: l.bench, pricing: l.pricing,
        arrival: l.arrival == null ? null : l.arrival, loading: l.loading == null ? null : l.loading, src: l.src, seq: l.seq, vol: l.vol })).concat(extraCargo) };
  }

  // ---------- pivot ----------
  function sortKeys(keys) {
    return keys.sort((a, b) => {
      const na = typeof a === 'number', nb = typeof b === 'number';
      if (na && nb) return a - b;
      if (na) return -1;
      if (nb) return 1;
      if (a === END) return 1;
      if (b === END) return -1;
      return String(a).localeCompare(String(b));
    });
  }

  function pivot(rows, rowFn, colFn, opts) {
    opts = opts || {};
    const cells = new Map(), rset = new Set(), cset = new Set();
    let total = 0;
    rows.forEach(r => {
      const rk = rowFn(r), ck = colFn(r);
      rset.add(rk); cset.add(ck);
      const key = rk + '\u0001' + ck;
      cells.set(key, (cells.get(key) || 0) + r.vol);
      total += r.vol;
    });
    let rowKeys = [...rset], colKeys = [...cset];
    if (opts.rowKeys) rowKeys = opts.rowKeys.filter(k => true); else sortKeys(rowKeys);
    if (opts.colKeys) colKeys = opts.colKeys; else sortKeys(colKeys);
    const get = (rk, ck) => cells.get(rk + '\u0001' + ck) || 0;
    const rowTotals = rowKeys.map(rk => sum(colKeys.map(ck => get(rk, ck))));
    const colTotals = colKeys.map(ck => sum(rowKeys.map(rk => get(rk, ck))));
    return { rowKeys, colKeys, get, rowTotals, colTotals, total };
  }

  const api = { run, pivot, fmtMonth, PRE, UNPLANNED, UNPRICED, END, EARLIER, LATER, MON, sum, DEFAULT_PRIORITY, PRIORITY_LABELS, validPriority };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
