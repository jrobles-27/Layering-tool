/* View builders shared by the on-screen pages and the Excel export (single code path). */
(function (root) {
  'use strict';
  const E = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./engine.js') : root.Engine;
  const { pivot, fmtMonth, END } = E;

  const DIMS = {
    pricing: { label: 'Pricing month', fn: r => r.pricing, fmt: fmtMonth },
    bench: { label: 'Benchmark', fn: r => r.bench || 'Unmapped', fmt: x => x },
    grade: { label: 'Crude grade / source', fn: r => r.grade, fmt: x => x },
    src: { label: 'Exposure source', fn: r => r.src, fmt: x => x },
    product: { label: 'Product', fn: r => r.product || '(crude in tank)', fmt: x => x },
    kind: { label: 'Inventory type', fn: r => r.kind, fmt: x => x },
    prod: { label: 'Production month', fn: r => r.prodKey, fmt: x => typeof x === 'number' ? fmtMonth(x) : x },
    sale: { label: 'Sales month', fn: r => r.sale, fmt: fmtMonth }
  };

  /** Crude layering: <rowDim> x <colDim> (default: sales month). Filters: {bench, grade, product, src}. */
  function crudeLayering(R, f, dim, colDim) {
    f = f || {};
    colDim = colDim || 'sale';
    const rows = R.expRows.filter(r =>
      (!f.bench || r.bench === f.bench) && (!f.grade || r.grade === f.grade) &&
      (!f.product || r.product === f.product) && (!f.src || r.src === f.src));
    const o = colDim === 'sale' ? { colKeys: R.months.concat([END]) } : {};
    if (dim === 'sale') o.rowKeys = R.months.concat([END]);
    return pivot(rows, DIMS[dim || 'pricing'].fn, DIMS[colDim].fn, o);
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
  function cargoByProduction(R, f) {
    const list = cargoFilter(R, f), ids = new Set(list.map(c => c.id)), rows = [];
    R.cargoUse.forEach(u => { if (ids.has(u.cargoId)) rows.push({ cargoId: u.cargoId, col: u.month, vol: u.vol }); });
    R.expRows.forEach(r => { if (r.stage === 'Unconsumed crude' && ids.has(r.cargoId)) rows.push({ cargoId: r.cargoId, col: 'Not yet consumed', vol: r.vol }); });
    return { list, pv: pivot(rows, r => r.cargoId, r => r.col, { rowKeys: list.map(c => c.id), colKeys: R.months.concat(['Not yet consumed']) }) };
  }
  /** Cargo x sales month: product kb traced to each cargo, by the month that product is sold. */
  function cargoBySales(R, f) {
    f = f || {};
    const list = cargoFilter(R, f), ids = new Set(list.map(c => c.id));
    const rows = R.expRows.filter(r => r.cargoId != null && ids.has(r.cargoId) && (!f.product || r.product === f.product));
    return { list, pv: pivot(rows, r => r.cargoId, r => r.sale, { rowKeys: list.map(c => c.id), colKeys: R.months.concat([END]) }) };
  }
  /** Production month x sales month for one cargo (cargoId) or all cargoes in the filter (cargoId == null). */
  function cargoProdSales(R, f, cargoId) {
    f = f || {};
    const ids = new Set(cargoFilter(R, f).map(c => c.id));
    const rows = R.expRows.filter(r => r.cargoId != null && ids.has(r.cargoId) && (cargoId == null || r.cargoId === cargoId) && (!f.product || r.product === f.product));
    return pivot(rows, r => r.prodKey, r => r.sale, { colKeys: R.months.concat([END]) });
  }

  /** Order of product layers: opening first, then purchase/production by month. */
  function layerOrder(R, labels) {
    const order = R.layerOrder;
    const set = new Set(labels);
    const out = order.filter(l => set.has(l));
    labels.forEach(l => { if (!out.includes(l)) out.push(l); });
    return out;
  }

  /** Product layering: which production/purchase layer is sold in which month. product '' = all products. */
  function productLayering(R, product) {
    const rows = R.sales.filter(s => !product || s.product === product);
    const labels = [...new Set(rows.map(r => r.layer))];
    return pivot(rows, r => r.layer, r => r.sale, { rowKeys: layerOrder(R, labels), colKeys: R.months.concat([END]) });
  }

  /** Month-end product inventory by layer. */
  function productInventory(R, product) {
    const rows = R.prodInv.filter(s => !product || s.product === product);
    const labels = [...new Set(rows.map(r => r.layer))];
    return pivot(rows, r => r.layer, r => r.month, { rowKeys: layerOrder(R, labels), colKeys: R.months });
  }

  /** Month-end exposure profile. kind: '' | 'Crude inventory' | 'Product inventory'. */
  function monthEnd(R, dim, kind, f) {
    f = f || {};
    const rows = [];
    R.snaps.forEach((s, t) => s.forEach(r => {
      if ((!kind || r.kind === kind) && (!f.bench || r.bench === f.bench)) rows.push(Object.assign({ mo: R.months[t] }, r));
    }));
    return pivot(rows, DIMS[dim || 'pricing'].fn, r => r.mo, { colKeys: R.months });
  }

  /** Margin (crack) exposure: product volume sold, by product x sales month. */
  function marginByProduct(R) {
    return pivot(R.sales.filter(s => s.sale !== END), r => r.product, r => r.sale, { rowKeys: R.products, colKeys: R.months });
  }
  function marginByBench(R) {
    return pivot(R.sales.filter(s => s.sale !== END), r => R.prodBench[r.product] || 'Unmapped', r => r.sale, { colKeys: R.months });
  }
  /** Flat-price exposure released into sales, by crude benchmark. */
  function crudeByBench(R) {
    return pivot(R.expRows.filter(r => r.stage === 'Sold' && r.src === 'Crude'), r => r.bench || 'Unmapped', r => r.sale, { colKeys: R.months });
  }
  function productPricedByBench(R) {
    return pivot(R.expRows.filter(r => r.stage === 'Sold' && r.src !== 'Crude'), r => (r.bench || 'Unmapped') + ' (' + r.src + ')', r => r.sale, { colKeys: R.months });
  }

  /** Product summary table (one row per product). */
  function productSummary(R) {
    const T = R.months.length;
    return R.products.map(p => {
      const b = R.prodBal.filter(x => x.product === p);
      const sum = f => b.reduce((s, x) => s + f(x), 0);
      const last = b[T - 1];
      const dLast = last ? last.demand : 0;
      return {
        product: p, bench: R.prodBench[p] || 'Unmapped', open: b[0] ? b[0].open : 0, production: sum(x => x.production), purchases: sum(x => x.purchases),
        sales: sum(x => x.sales), unmet: sum(x => x.unmet), close: last ? last.close : 0,
        coverDays: dLast > 0 && last ? last.close / (dLast / 30) : null
      };
    });
  }

  const api = { DIMS, crudeLayering, pct, cargoFilter, cargoByProduction, cargoBySales, cargoProdSales, productLayering, productInventory, monthEnd, marginByProduct, marginByBench, crudeByBench, productPricedByBench, productSummary, layerOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Views = api;
})(typeof window !== 'undefined' ? window : globalThis);
