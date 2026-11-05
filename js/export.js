/* Export + template download. Everything is generated in the browser and handed to the user as a file; nothing is sent or stored. */
(function (root) {
  'use strict';
  const E = root.Engine, V = root.Views, X = root.XLSX;
  const fm = E.fmtMonth;
  const r3 = v => Math.round(v * 1000) / 1000;
  const pricingLabel = k => fm(k);

  function matrix(title, pv, rowHeader, rowFmt, colFmt) {
    colFmt = colFmt || fm;
    const aoa = [[title], [rowHeader, ...pv.colKeys.map(colFmt), 'Total']];
    pv.rowKeys.forEach((rk, i) => aoa.push([rowFmt(rk), ...pv.colKeys.map(ck => r3(pv.get(rk, ck))), r3(pv.rowTotals[i])]));
    aoa.push(['Total', ...pv.colTotals.map(r3), r3(pv.total)]);
    aoa.push([]);
    return aoa;
  }
  const id = x => x;

  function sheet(aoa) {
    const ws = X.utils.aoa_to_sheet(aoa);
    let maxc = 0;
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return;
      if (ws[a].t === 'n') ws[a].z = '#,##0.0;[Red]-#,##0.0;"-"';
    });
    aoa.forEach(r => { maxc = Math.max(maxc, r.length); });
    ws['!cols'] = Array.from({ length: maxc }, (_, i) => ({ wch: i === 0 ? 34 : 13 }));
    return ws;
  }

  function workbook(R) {
    const wb = X.utils.book_new();
    const S = R.summary;

    // ---- Summary ----
    const sm = [
      ['Exposure Layering - results'], ['Volumes in thousand barrels (kb). Generated in the browser; nothing was stored or transmitted.'], [],
      ['Horizon', `${fm(R.months[0])} to ${fm(R.months[R.months.length - 1])} (${R.months.length} months)`],
      ['Opening exposure (crude + product inventory)', r3(S.openingExposure)],
      ['Peak month-end exposure', r3(S.peakExposure), fm(S.peakMonth)],
      ['Ending exposure (unsold at horizon end)', r3(S.endExposure)],
      ['Weighted-average exposure age (months, pricing to product sale)', S.waAge == null ? 'n/a' : r3(S.waAge)],
      ['Total crude consumed', r3(S.totalConsumed)], ['Total products produced', r3(S.totalProduced)],
      ['Total product demand', r3(S.totalDemand)], ['Demand met', r3(S.totalSold)], ['Unmet demand', r3(S.totalUnmet)],
      ['Unplanned crude (shortfall)', r3(S.totalShort)], [],
      ['Method / assumptions'],
      ['1', 'Crude is consumed FIFO per grade (oldest pricing month first); opening inventory is consumed first.'],
      ['2', 'Each month\'s production is a pro-rata blend of the crude layers consumed that month (yields are not grade-specific).'],
      ['3', 'Products are sold in this order: stock older than the previous month (incl. opening inventory) first, oldest first; then ' + R.priority.map((c, i) => (i + 1) + ') ' + E.PRIORITY_LABELS[c]).join('; ') + '.'],
      ['4', 'Crude inventory exposure runs from the crude pricing month until the product is sold. Margin (crack) exposure is the volume sold in the sales month.'],
      ['5', '"Pre-horizon" = pricing month not specified; "Unplanned" = crude needed beyond the purchase plan.']
    ];
    X.utils.book_append_sheet(wb, sheet(sm), 'Summary');

    // ---- Crude layering ----
    let a = matrix('Crude layering - all exposure: pricing month x sales month', V.crudeLayering(R, {}, 'pricing'), 'Pricing month', pricingLabel);
    a = a.concat(matrix('Crude-linked exposure only (own crude)', V.crudeLayering(R, { src: 'Crude' }, 'pricing'), 'Pricing month', pricingLabel));
    const benches = [...new Set(R.expRows.map(r => r.bench || 'Unmapped'))].sort();
    benches.forEach(b => { a = a.concat(matrix('Benchmark: ' + b, V.crudeLayering(R, { bench: b }, 'pricing'), 'Pricing month', pricingLabel)); });
    a = a.concat(matrix('By crude grade / source x sales month', V.crudeLayering(R, {}, 'grade'), 'Grade / source', id));
    a = a.concat(matrix('By benchmark x sales month', V.crudeLayering(R, {}, 'bench'), 'Benchmark', id));
    X.utils.book_append_sheet(wb, sheet(a), 'Crude Layering');

    // ---- percentages ----
    const D = V.DIMS;
    const pctDefs = [
      ['Sales mix by pricing month - each sales month = 100%', 'pricing', 'sale', 'col'],
      ['Where each pricing month is sold - each pricing month = 100%', 'pricing', 'sale', 'row'],
      ['Sales mix by production month - each sales month = 100%', 'prod', 'sale', 'col'],
      ['Where each production month is sold - each production month = 100%', 'prod', 'sale', 'row'],
      ['Pricing month to production month - each pricing month = 100%', 'pricing', 'prod', 'row'],
      ['Sales mix by benchmark - each sales month = 100%', 'bench', 'sale', 'col']
    ];
    let pa = [['All figures are percentages (%). Volumes are traced product kb (plus unconsumed crude in "Unsold at end").'], []];
    pctDefs.forEach(([t, rd, cd, b]) => { pa = pa.concat(matrix(t, V.pct(V.crudeLayering(R, {}, rd, cd), b), D[rd].label, D[rd].fmt, D[cd].fmt)); });
    X.utils.book_append_sheet(wb, sheet(pa), 'Crude Layering %');

    // ---- cargo analysis ----
    const byId = new Map(R.cargoes.map(c => [c.id, c]));
    const clab = id => { const c = byId.get(id); return c ? c.label + ' (' + r3(c.vol) + ' kb)' : String(id); };
    const monthText = x => typeof x === 'number' ? fm(x) : x;
    let ca = [['Cargo = one import or opening-inventory crude layer. Sorted by pricing month, then arrival.'], [],
      ['Cargo', 'Grade', 'Benchmark', 'Source', 'Arrival month', 'Pricing month', 'Size (kb)']];
    V.cargoFilter(R, {}).forEach(c => ca.push([c.label, c.grade, c.bench, c.src, c.arrival == null ? '' : fm(c.arrival), fm(c.pricing), r3(c.vol)]));
    ca.push([]);
    const cp = V.cargoByProduction(R, {}), cs = V.cargoBySales(R, {});
    ca = ca.concat(matrix('Crude kb by production month (when each cargo is run)', cp.pv, 'Cargo', clab, monthText));
    ca = ca.concat(matrix('Crude by production month - % of cargo', V.pct(cp.pv, 'row'), 'Cargo', clab, monthText));
    ca = ca.concat(matrix('Product kb by sales month (when product from each cargo is sold)', cs.pv, 'Cargo', clab, fm));
    ca = ca.concat(matrix('Product by sales month - % of cargo', V.pct(cs.pv, 'row'), 'Cargo', clab, fm));
    ca = ca.concat(matrix('All cargoes combined: production month x sales month (kb)', V.cargoProdSales(R, {}, null), 'Production month', D.prod.fmt, fm));
    X.utils.book_append_sheet(wb, sheet(ca), 'Cargo Analysis');
    const cd = [['Cargo', 'Grade', 'Benchmark', 'Pricing month', 'Production month', 'Sales month', 'Product', 'Stage', 'Volume (kb)']];
    R.expRows.filter(r => r.cargoId != null && r.cargoId >= 0).forEach(r => cd.push([r.cargo, r.grade, r.bench, fm(r.pricing), monthText(r.prodKey), fm(r.sale), r.product, r.stage, r3(r.vol)]));
    X.utils.book_append_sheet(wb, sheet(cd), 'Cargo Detail');

    // ---- detail ----
    const det = [['Stage', 'Product', 'Product benchmark', 'Sales month', 'Product layer', 'Production month', 'Exposure source', 'Pricing month', 'Crude grade / source', 'Cargo', 'Benchmark', 'Volume (kb)']];
    R.expRows.forEach(r => det.push([r.stage, r.product, r.pbench, fm(r.sale), r.layer, monthText(r.prodKey), r.src, fm(r.pricing), r.grade, r.cargo, r.bench, r3(r.vol)]));
    X.utils.book_append_sheet(wb, sheet(det), 'Crude Layering Detail');

    // ---- product layering ----
    let p = [['Product summary (kb)'], ['Product', 'Benchmark', 'Opening', 'Production', 'Purchases', 'Sales', 'Unmet demand', 'Closing', 'Closing cover (days of last-month demand)']];
    V.productSummary(R).forEach(x => p.push([x.product, x.bench, r3(x.open), r3(x.production), r3(x.purchases), r3(x.sales), r3(x.unmet), r3(x.close), x.coverDays == null ? 'n/a' : r3(x.coverDays)]));
    p.push([]);
    p = p.concat(matrix('All products - source layer x sales month', V.productLayering(R, ''), 'Source layer', id));
    R.products.forEach(pr => {
      p = p.concat(matrix(pr + ' - source layer x sales month', V.productLayering(R, pr), 'Source layer', id));
      p = p.concat(matrix(pr + ' - month-end inventory by layer', V.productInventory(R, pr), 'Source layer', id));
    });
    X.utils.book_append_sheet(wb, sheet(p), 'Product Layering');

    // ---- month-end ----
    let m = matrix('Month-end exposure by pricing month (crude + product inventory)', V.monthEnd(R, 'pricing', ''), 'Pricing month', pricingLabel);
    m = m.concat(matrix('Crude inventory only', V.monthEnd(R, 'pricing', 'Crude inventory'), 'Pricing month', pricingLabel));
    m = m.concat(matrix('Product inventory only (traced to crude pricing month)', V.monthEnd(R, 'pricing', 'Product inventory'), 'Pricing month', pricingLabel));
    m = m.concat(matrix('By benchmark', V.monthEnd(R, 'bench', ''), 'Benchmark', id));
    m = m.concat(matrix('By inventory type', V.monthEnd(R, 'kind', ''), 'Type', id));
    X.utils.book_append_sheet(wb, sheet(m), 'Month-End Exposure');

    // ---- margin ----
    let g = matrix('Margin (crack) exposure: product volume sold per sales month', V.marginByProduct(R), 'Product', id);
    g = g.concat(matrix('Margin exposure by product benchmark', V.marginByBench(R), 'Product benchmark', id));
    g = g.concat(matrix('Flat-price exposure released into sales - crude benchmark', V.crudeByBench(R), 'Crude benchmark', id));
    const pp = V.productPricedByBench(R);
    if (pp.total > 0) g = g.concat(matrix('Flat-price exposure released - opening / purchased product', pp, 'Benchmark (source)', id));
    X.utils.book_append_sheet(wb, sheet(g), 'Margin Exposure');

    // ---- balances ----
    const bal = [['Crude balance by grade (kb)'], ['Grade', 'Line', ...R.months.map(fm)]];
    R.grades.forEach(gr => {
      const rows = R.crudeBal.filter(x => x.grade === gr);
      [['Opening', 'open'], ['Receipts', 'receipts'], ['Consumption', 'consumed'], ['Unplanned (shortfall)', 'unplanned'], ['Closing', 'close']]
        .forEach(([l, k]) => bal.push([gr, l, ...rows.map(x => r3(x[k]))]));
    });
    bal.push([], ['Product balance (kb)'], ['Product', 'Line', ...R.months.map(fm)]);
    R.products.forEach(pr => {
      const rows = R.prodBal.filter(x => x.product === pr);
      [['Opening', 'open'], ['Production', 'production'], ['Purchases', 'purchases'], ['Sales', 'sales'], ['Unmet demand', 'unmet'], ['Closing', 'close'], ['Demand', 'demand']]
        .forEach(([l, k]) => bal.push([pr, l, ...rows.map(x => r3(x[k]))]));
    });
    X.utils.book_append_sheet(wb, sheet(bal), 'Balances');

    // ---- checks ----
    const ck = [['Level', 'Check', 'Detail']];
    R.checks.forEach(c => ck.push([c.level, c.title, c.detail]));
    const wsC = sheet(ck); wsC['!cols'] = [{ wch: 8 }, { wch: 44 }, { wch: 110 }];
    X.utils.book_append_sheet(wb, wsC, 'Checks');
    return wb;
  }

  function stamp() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }

  function downloadXlsx(R) { X.writeFile(workbook(R), `exposure-layering-${stamp()}.xlsx`); }

  /** CSV with spreadsheet-formula-injection guard on text cells. */
  function csvCell(v) {
    if (typeof v === 'number') return String(r3(v));
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(R) {
    const mt = x => typeof x === 'number' ? fm(x) : x;
    const lines = [['Stage', 'Product', 'Product benchmark', 'Sales month', 'Product layer', 'Production month', 'Exposure source', 'Pricing month', 'Crude grade / source', 'Cargo', 'Benchmark', 'Volume (kb)'].join(',')];
    R.expRows.forEach(r => lines.push([r.stage, r.product, r.pbench, fm(r.sale), r.layer, mt(r.prodKey), r.src, fm(r.pricing), r.grade, r.cargo, r.bench, r.vol].map(csvCell).join(',')));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    saveBlob(blob, `exposure-detail-${stamp()}.csv`);
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Input template (filled with fictional example data) in the exact layout the parser reads. */
  function downloadTemplate() {
    const wb = X.utils.book_new();
    const notes = [
      ['Input template - FICTIONAL example data. Replace with your own; keep the sheet names and column headers.'],
      ['Volumes are in thousand barrels (kb). Months: real Excel dates (any day in the month) or text like Jan-27.'],
      [],
      ['Worksheet', 'Columns'],
      ['Crude Consumption', 'Crude Grade | Benchmark | one column per production month (volumes)'],
      ['Product Yield', 'Product | Benchmark | one column per production month (volumes, not %)'],
      ['Opening Crude', 'Crude Grade | Pricing Month | Volume   - one row per pricing month; the same grade may repeat'],
      ['Opening Product', 'Product | Pricing Month | Volume   - one row per pricing month; the same product may repeat'],
      ['Crude Imports', 'Crude Grade | Arrival Month | Pricing Month | Volume'],
      ['Product Purchases', 'Product | Arrival Date | Pricing Month | Volume   (optional sheet; day 16 or later = 2nd half of the month; or add an "Arrival Half" column with 1 or 2)'],
      ['Demand', 'Product | one column per sales month'],
      [],
      ['Notes'],
      ['Opening inventory is the stock at the start of the first month; every opening row must say its pricing month.'],
      ['Crude arriving before the first month is treated as available from the first month.'],
      ['Sheet names are matched by keyword (e.g. "Opening Crude", "Crude Imports"), so small wording changes are fine.']
    ];
    const wn = X.utils.aoa_to_sheet(notes); wn['!cols'] = [{ wch: 22 }, { wch: 130 }];
    X.utils.book_append_sheet(wb, wn, 'Read me');
    root.Demo.buildDemoSheets().forEach(sh => {
      const ws = X.utils.aoa_to_sheet(sh.aoa);
      sh.dateCells.forEach(([r, c, f]) => { const cell = ws[X.utils.encode_cell({ r, c })]; if (cell) cell.z = f; });
      const n = sh.aoa[0].length;
      ws['!cols'] = Array.from({ length: n }, (_, i) => ({ wch: i === 0 ? 20 : 15 }));
      X.utils.book_append_sheet(wb, ws, sh.name);
    });
    X.writeFile(wb, 'exposure-layering-input-template.xlsx');
  }

  root.Export = { workbook, downloadXlsx, downloadCsv, downloadTemplate };
})(typeof window !== 'undefined' ? window : globalThis);
