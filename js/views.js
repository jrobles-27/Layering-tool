/* View builders shared by the on-screen pages and the Excel export (single code path).
 *
 * Display window {start, end} (month keys):
 *  - flow tables (sales/production month axes): months before `start` / after `end` are collapsed into
 *    "Earlier months" / "Later months" columns, so totals still tie to the full model;
 *  - stock tables (month-end exposure, inventory, balances): months outside the window are hidden.
 * Without a window the default is the product horizon (first product month .. last month). */
(function (root) {
  'use strict';
  const E = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./engine.js') : root.Engine;
  const { pivot, fmtMonth, END, EARLIER, LATER } = E;

  const DIMS = {
    pricing: { label: 'Pricing month', fn: r => r.pricing, fmt: fmtMonth },
    bench: { label: 'Benchmark', fn: r => r.bench || 'Unmapped', fmt: x => x },
    grade: { label: 'Crude grade / source', fn: r => r.grade, fmt: x => x },
    src: { label: 'Exposure source', fn: r => r.src, fmt: x => x },
    pbench: { label: 'Product benchmark', fn: r => r.pbench || '(crude in tank)', fmt: x => x },
    product: { label: 'Product', fn: r => r.product || '(crude in tank)', fmt: x => x },
    kind: { label: 'Inventory type', fn: r => r.kind, fmt: x => x },
    prod: { label: 'Production month', fn: r => r.prodKey, fmt: fmtMonth },
    sale: { label: 'Sales month', fn: r => r.sale, fmt: fmtMonth }
  };

  // ---------- display window ----------
  const lastMonth = R => R.months[R.months.length - 1];
  function resolveWin(R, win) {
    const s = win && win.start != null ? win.start : R.productStart;
    const e = win && win.end != null ? win.end : lastMonth(R);
    return { start: Math.min(s, e), end: Math.max(s, e) };
  }
  const winMonths = (R, win) => { const w = resolveWin(R, win); return R.months.filter(m => m >= w.start && m <= w.end); };
  /** Window months that are also product months (product data does not exist before the first product month). */
  const pMonthsInWin = (R, win) => winMonths(R, win).filter(m => m >= R.productStart);
  const bucket = (k, w) => typeof k === 'number' ? (k < w.start ? EARLIER : (k > w.end ? LATER : k)) : k;
  const timeKeys = (R, w, tail) => [EARLIER].concat(R.months.filter(m => m >= w.start && m <= w.end), [LATER], tail || []);
  /** Sales-month axis: sales only exist from the first product month, so earlier (crude-only) months are never columns. */
  const saleKeys = (R, w, tail) => [EARLIER].concat(R.months.filter(m => m >= w.start && m <= w.end && m >= R.productStart), [LATER], tail || []);
  const inWin = (k, w) => typeof k === 'number' && k >= w.start && k <= w.end;

  /** Row/column function and key order for a dimension, honouring the window for the two time dimensions. */
  function dimFn(dim, w) {
    if (dim === 'sale') return r => bucket(r.sale, w);
    if (dim === 'prod') return r => bucket(r.prodKey, w);
    return DIMS[dim].fn;
  }
  function dimKeys(dim, R, w) {
    if (dim === 'sale') return saleKeys(R, w, [END]);
    if (dim === 'prod') return timeKeys(R, w, ['Purchased product', 'Opening stock', 'Not yet consumed']);
    return undefined;
  }

  /** Rows behind the Crude Layering page: own crude only. Purchased / opening product carries
   *  product flat-price exposure, not crude exposure, and is reported on Product Layering instead. */
  const crudeRows = R => R.expRows.filter(r => r.src === 'Crude');

  /** Crude layering: <rowDim> x <colDim> (default: sales month). Filters: {bench, grade, pbench}. */
  function crudeLayering(R, f, dim, colDim, win) {
    f = f || {};
    dim = dim || 'pricing'; colDim = colDim || 'sale';
    const w = resolveWin(R, win);
    const rows = crudeRows(R).filter(r =>
      (!f.bench || r.bench === f.bench) && (!f.grade || r.grade === f.grade) &&
      (!f.pbench || r.pbench === f.pbench));
    const o = {};
    const rk = dimKeys(dim, R, w), ck = dimKeys(colDim, R, w);
    if (rk) o.rowKeys = rk;
    if (ck) o.colKeys = ck;
    return pivot(rows, dimFn(dim, w), dimFn(colDim, w), o);
  }

  /** Percentage view of a pivot. basis: 'row' (each row = 100%), 'col' (each column = 100%), 'total' (grand total = 100%). */
  function pct(pv, basis) {
    const T = pv.total || 1;
    const get = (rk, ck) => {
      const i = pv.rowKeys.indexOf(rk), j = pv.colKeys.indexOf(ck);
      const v = pv.get(rk, ck);
      const d = basis === 'row' ? pv.rowTotals[i] : basis === 'col' ? pv.colTotals[j] : T;
      return d > 1e-9 ? v / d * 100 : 0;
    };
    const share = x => x / T * 100;
    return {
      rowKeys: pv.rowKeys, colKeys: pv.colKeys, get,
      rowTotals: pv.rowTotals.map(x => basis === 'row' ? (x > 1e-9 ? 100 : 0) : share(x)),
      colTotals: pv.colTotals.map(x => basis === 'col' ? (x > 1e-9 ? 100 : 0) : share(x)),
      total: pv.total > 1e-9 ? 100 : 0
    };
  }

  // ---------- per-cargo analysis (a cargo = one crude layer: an import cargo or an opening-inventory layer) ----------
  function cargoFilter(R, f) {
    f = f || {};
    return R.cargoes.filter(c => (!f.bench || c.bench === f.bench) && (!f.grade || c.grade === f.grade))
      .sort((a, b) => a.pricing - b.pricing || (a.arrival || 0) - (b.arrival || 0) || a.id - b.id);
  }
  /** Cargo x production month: crude kb of each cargo run through the refinery each month. */
  function cargoByProduction(R, f, win) {
    const w = resolveWin(R, win);
    const list = cargoFilter(R, f), ids = new Set(list.map(c => c.id)), rows = [];
    R.cargoUse.forEach(u => { if (ids.has(u.cargoId)) rows.push({ cargoId: u.cargoId, col: bucket(u.month, w), vol: u.vol }); });
    R.expRows.forEach(r => { if (r.stage === 'Unconsumed crude' && ids.has(r.cargoId)) rows.push({ cargoId: r.cargoId, col: 'Not yet consumed', vol: r.vol }); });
    return { list, pv: pivot(rows, r => r.cargoId, r => r.col, { rowKeys: list.map(c => c.id), colKeys: timeKeys(R, w, ['Not yet consumed']) }) };
  }
  /** Cargo x sales month: product kb traced to each cargo, by the month that product is sold. */
  function cargoBySales(R, f, win) {
    f = f || {};
    const w = resolveWin(R, win);
    const list = cargoFilter(R, f), ids = new Set(list.map(c => c.id));
    const rows = R.expRows.filter(r => r.cargoId != null && ids.has(r.cargoId) && (!f.pbench || r.pbench === f.pbench));
    return { list, pv: pivot(rows, r => r.cargoId, r => bucket(r.sale, w), { rowKeys: list.map(c => c.id), colKeys: saleKeys(R, w, [END]) }) };
  }
  /** Production month x sales month for one cargo (cargoId) or all cargoes in the filter (cargoId == null). */
  function cargoProdSales(R, f, cargoId, win) {
    f = f || {};
    const w = resolveWin(R, win);
    const ids = new Set(cargoFilter(R, f).map(c => c.id));
    const rows = R.expRows.filter(r => r.cargoId != null && ids.has(r.cargoId) && (cargoId == null || r.cargoId === cargoId) && (!f.pbench || r.pbench === f.pbench));
    return pivot(rows, r => bucket(r.prodKey, w), r => bucket(r.sale, w), { rowKeys: timeKeys(R, w, ['Not yet consumed']), colKeys: saleKeys(R, w, [END]) });
  }

  // ---------- product layering ----------
  /** Order of product layers: chronological, as determined by the engine. */
  function layerOrder(R, labels) {
    const set = new Set(labels);
    const out = R.layerOrder.filter(l => set.has(l));
    labels.forEach(l => { if (!out.includes(l)) out.push(l); });
    return out;
  }

  /** Benchmarks, in the order their products first appear. Product analysis is reported per benchmark
   *  (e.g. Jet and Kerosene under "Jet"); physical layering stays per product, since demand is per product. */
  function benchmarks(R) {
    const out = [];
    R.products.forEach(p => { const b = R.prodBench[p] || 'Unmapped'; if (!out.includes(b)) out.push(b); });
    return out;
  }
  const productsOf = (R, bench) => R.products.filter(p => (R.prodBench[p] || 'Unmapped') === bench);

  /** Product layering: which layer is sold in which month. bench '' = all benchmarks; kind '' = all sources. */
  function productLayering(R, bench, win, kind) {
    const w = resolveWin(R, win);
    const rows = R.sales.filter(s => (!bench || s.pbench === bench) && (!kind || s.kind === kind));
    const labels = [...new Set(rows.map(r => r.layer))];
    return pivot(rows, r => r.layer, r => bucket(r.sale, w), { rowKeys: layerOrder(R, labels), colKeys: saleKeys(R, w, [END]) });
  }

  /** Month-end product inventory by layer (stock table: window months only). */
  function productInventory(R, bench, win, kind) {
    const w = resolveWin(R, win);
    const rows = R.prodInv.filter(s => (!bench || s.pbench === bench) && (!kind || s.kind === kind) && inWin(s.month, w));
    const labels = [...new Set(rows.map(r => r.layer))];
    return pivot(rows, r => r.layer, r => r.month, { rowKeys: layerOrder(R, labels), colKeys: pMonthsInWin(R, win) });
  }

  /** Month-end exposure profile (stock table). kind: '' | 'Crude inventory' | 'Product inventory'. */
  function monthEnd(R, dim, kind, f, win) {
    f = f || {};
    const w = resolveWin(R, win);
    const rows = [];
    R.snaps.forEach((s, t) => {
      if (!inWin(R.months[t], w)) return;
      s.forEach(r => { if ((!kind || r.kind === kind) && (!f.bench || r.bench === f.bench)) rows.push(Object.assign({ mo: R.months[t] }, r)); });
    });
    return pivot(rows, DIMS[dim || 'pricing'].fn, r => r.mo, { colKeys: winMonths(R, win) });
  }

  // ---------- margin (crack) exposure ----------
  // A crack is a product price against a crude price, so it only exists where the barrel came out of
  // the refinery. Purchased product (bought in the horizon or held as opening purchase stock) has no
  // crude leg and carries flat-price exposure instead, so it is excluded here.
  const crackSales = (R, w) => R.sales.filter(s => s.kind === 'Production' && inWin(s.sale, w));
  function marginByBench(R, win) {
    const w = resolveWin(R, win);
    return pivot(crackSales(R, w), r => r.pbench || 'Unmapped', r => r.sale, { rowKeys: benchmarks(R), colKeys: pMonthsInWin(R, win) });
  }
  /** Crack volume split by the production month it came from (opening production included). */
  function marginByProdMonth(R, win) {
    const w = resolveWin(R, win);
    return pivot(crackSales(R, w), r => bucket(r.prodKey, w), r => r.sale, { rowKeys: timeKeys(R, w), colKeys: pMonthsInWin(R, win) });
  }
  /** Flat-price exposure released into sales, by crude benchmark (production volume only). */
  function crudeByBench(R, win) {
    const w = resolveWin(R, win);
    return pivot(R.expRows.filter(r => r.stage === 'Sold' && r.src === 'Crude' && inWin(r.sale, w)), r => r.bench || 'Unmapped', r => r.sale, { colKeys: pMonthsInWin(R, win) });
  }

  /** Product summary table (one row per benchmark) over the window months. */
  function productSummary(R, win) {
    const w = resolveWin(R, win);
    return benchmarks(R).map(bench => {
      const ps = productsOf(R, bench);
      const b = R.prodBal.filter(x => ps.includes(x.product) && inWin(x.month, w));
      const sum = f => b.reduce((s, x) => s + f(x), 0);
      const months = [...new Set(b.map(x => x.month))].sort((a, c) => a - c);
      const first = months[0], last = months[months.length - 1];
      return {
        bench, products: ps.length,
        open: sum(x => x.month === first ? x.open : 0), production: sum(x => x.production), purchases: sum(x => x.purchases),
        sales: sum(x => x.sales), unmet: sum(x => x.unmet), close: sum(x => x.month === last ? x.close : 0)
      };
    });
  }

  const api = { DIMS, resolveWin, winMonths, pMonthsInWin, crudeLayering, crudeRows, pct, cargoFilter, cargoByProduction, cargoBySales, cargoProdSales,
    productLayering, productInventory, monthEnd, marginByBench, marginByProdMonth, crudeByBench, productSummary, layerOrder, benchmarks, productsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Views = api;
})(typeof window !== 'undefined' ? window : globalThis);
