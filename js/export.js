/* Export + template download. Everything is generated in the browser and handed to the user as a file; nothing is sent or stored. */
(function (root) {
  'use strict';
  const E = root.Engine, V = root.Views, X = root.XLSX;
  const fm = E.fmtMonth;
  const r3 = v => Math.round(v * 1000) / 1000;
  const pricingLabel = k => fm(k);

  /** rowHeader may be a string (one label column) or an array of {label, get(rowKey)} leading columns. */
  function matrix(title, pv, rowHeader, rowFmt, colFmt) {
    colFmt = colFmt || fm;
    const lead = Array.isArray(rowHeader) ? rowHeader : [{ label: rowHeader, get: rk => (rowFmt || (x => x))(rk) }];
    // string columns (Earlier / Later months, Unsold at end, ...) that carry nothing are dropped; month columns always stay
    const cols = pv.colKeys.map((ck, j) => [ck, j]).filter(([ck, j]) => typeof ck === 'number' || pv.colTotals[j] > 1e-9);
    const aoa = [[title], [...lead.map(c => c.label), ...cols.map(([ck]) => colFmt(ck)), 'Total']];
    pv.rowKeys.forEach((rk, i) => aoa.push([...lead.map(c => c.get(rk)), ...cols.map(([ck]) => r3(pv.get(rk, ck))), r3(pv.rowTotals[i])]));
    aoa.push(['Total', ...Array(lead.length - 1).fill(''), ...cols.map(([, j]) => r3(pv.colTotals[j])), r3(pv.total)]);
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

  /** win: optional display window {start, end}; defaults to the product horizon. */
  function workbook(R, win0) {
    const wb = X.utils.book_new();
    const S = R.summary;
    const win = V.resolveWin(R, win0);
    // views bound to the display window
    const CL = (f, d, c) => V.crudeLayering(R, f, d, c, win);

    // ---- Summary ----
    const sm = [
      ['Exposure Layering - results'], ['Volumes in thousand barrels (kb). Generated in the browser; nothing was stored or transmitted.'], [],
      ['Model timeline', `${fm(R.months[0])} to ${fm(R.months[R.months.length - 1])} (${R.months.length} months); product data from ${fm(R.productStart)}`],
      ['Display window used in this export', `${fm(win.start)} to ${fm(win.end)}. Flow tables fold months outside it into "Earlier months" / "Later months"; stock tables hide them.`],
      ['Exposure at start of product horizon (crude in tanks + opening product)', r3(S.openingExposure)],
      ['Peak month-end exposure (product horizon)', r3(S.peakExposure), fm(S.peakMonth)],
      ['Ending exposure (unsold at horizon end)', r3(S.endExposure)],
      ['Weighted-average exposure age (months, pricing to product sale)', S.waAge == null ? 'n/a' : r3(S.waAge)],
      ['Total crude consumed (whole timeline)', r3(S.totalConsumed)], ['Total products produced', r3(S.totalProduced)],
      ['Total product demand', r3(S.totalDemand)], ['Demand met', r3(S.totalSold)], ['Unmet demand', r3(S.totalUnmet)],
      ['Unplanned crude (shortfall)', r3(S.totalShort)], [],
      ['Method / assumptions'],
      ['1', R.crudeOrder === 'pricing'
        ? 'Crude is consumed per grade in pricing-month order (oldest priced layer first), starting from the first crude month.'
        : 'Crude is consumed FIFO per grade in arrival order (what arrived first is run first; ties broken by pricing month), starting from the first crude month.'],
      ['2', 'Each month\'s production is a pro-rata blend of the crude layers consumed that month (yields are not grade-specific). Opening product that was produced in an earlier month carries the crude blend of that month.'],
      ['3', 'Products are sold in this order: stock older than the previous month (incl. opening purchases) first, oldest first; then ' + R.priority.map((c, i) => (i + 1) + ') ' + E.PRIORITY_LABELS[c]).join('; ') + '.'],
      ['4', 'Crude inventory exposure runs from the crude pricing month until the product is sold. Margin (crack) exposure is the volume sold in the sales month.'],
      ['5', '"Pre-horizon" = pricing month not specified; "Unplanned" = crude needed beyond the purchase plan. Shortfalls below the ' + R.tolerance + ' kb tolerance are treated as rounding and ignored.'],
      ['5b', '"Not yet priced" = in tank at that month-end but its pricing month has not arrived, so it carries no price exposure yet. Month-end exposure never counts a future pricing month.'],
      ['6', 'Crude grade, product and benchmark names are matched ignoring case and extra spaces, so "ARAB  Light" and "Arab Light" are one grade.'],
      ['7', 'Product analysis is grouped by product benchmark: products priced off the same index (e.g. Jet and Kerosene) are reported together. Physical layering stays per product.']
    ];
    X.utils.book_append_sheet(wb, sheet(sm), 'Summary');

    // ---- Crude layering (own crude only; purchased product is product exposure, see Product Layering) ----
    let a = [['Own crude only. Purchased and opening-purchase product carries product flat-price exposure and is reported on the Product Layering sheet.'], []];
    a = a.concat(matrix('Crude layering: pricing month x sales month', CL({}, 'pricing'), 'Pricing month', pricingLabel));
    const benches = [...new Set(V.crudeRows(R).map(r => r.bench || 'Unmapped'))].sort();
    benches.forEach(b => { a = a.concat(matrix('Crude benchmark: ' + b, CL({ bench: b }, 'pricing'), 'Pricing month', pricingLabel)); });
    a = a.concat(matrix('By crude grade x sales month', CL({}, 'grade'), 'Crude grade', id));
    a = a.concat(matrix('By crude benchmark x sales month', CL({}, 'bench'), 'Crude benchmark', id));
    a = a.concat(matrix('By product benchmark sold x sales month', CL({}, 'pbench'), 'Product benchmark', id));
    X.utils.book_append_sheet(wb, sheet(a), 'Crude Layering');

    // ---- percentages ----
    const D = V.DIMS;
    const pctDefs = [
      ['Sales mix by pricing month - each sales month = 100%', 'pricing', 'sale', 'col'],
      ['Where each pricing month is sold - each pricing month = 100%', 'pricing', 'sale', 'row'],
      ['Sales mix by production month - each sales month = 100%', 'prod', 'sale', 'col'],
      ['Where each production month is sold - each production month = 100%', 'prod', 'sale', 'row'],
      ['Pricing month to production month - each pricing month = 100%', 'pricing', 'prod', 'row'],
      ['Sales mix by crude benchmark - each sales month = 100%', 'bench', 'sale', 'col'],
      ['Sales mix by product benchmark - each sales month = 100%', 'pbench', 'sale', 'col']
    ];
    let pa = [['All figures are percentages (%). Volumes are traced product kb (plus unconsumed crude in "Unsold at end").'], []];
    pctDefs.forEach(([t, rd, cd, b]) => { pa = pa.concat(matrix(t, V.pct(CL({}, rd, cd), b), D[rd].label, D[rd].fmt, D[cd].fmt)); });
    X.utils.book_append_sheet(wb, sheet(pa), 'Crude Layering %');

    // ---- cargo analysis ----
    const byId = new Map(R.cargoes.map(c => [c.id, c]));
    const cg = cid => byId.get(cid) || {};
    // grade / loading / arrival / pricing each get their own column so the table can be sorted and filtered
    const cargoLead = [
      { label: 'Crude grade', get: cid => cg(cid).grade || String(cid) },
      { label: 'Loading month', get: cid => cg(cid).loading != null ? fm(cg(cid).loading) : '' },
      { label: 'Arrival month', get: cid => { const c = cg(cid); return c.arrival == null ? (c.src === 'Opening' ? 'Opening stock' : 'Unplanned') : fm(c.arrival); } },
      { label: 'Pricing month', get: cid => { const c = cg(cid); return fm(c.pricing) + (c.seq > 1 ? ' #' + c.seq : ''); } },
      { label: 'Cargo size (kb)', get: cid => r3(cg(cid).vol || 0) }
    ];
    let ca = [['Cargo = one import or opening-inventory crude layer. Sorted by pricing month, then arrival. Loading month is informational: availability and FIFO follow arrival and pricing month.'], [],
      ['Crude grade', 'Benchmark', 'Source', 'Loading month', 'Arrival month', 'Pricing month', 'Size (kb)']];
    V.cargoFilter(R, {}).forEach(c => ca.push([c.grade, c.bench, c.src, c.loading == null ? '' : fm(c.loading), c.arrival == null ? '' : fm(c.arrival), fm(c.pricing), r3(c.vol)]));
    ca.push([]);
    const cp = V.cargoByProduction(R, {}, win), cs = V.cargoBySales(R, {}, win);
    ca = ca.concat(matrix('Crude kb by production month (when each cargo is run)', cp.pv, cargoLead));
    ca = ca.concat(matrix('Crude by production month - % of cargo', V.pct(cp.pv, 'row'), cargoLead));
    ca = ca.concat(matrix('Product kb by sales month (when product from each cargo is sold)', cs.pv, cargoLead));
    ca = ca.concat(matrix('Product by sales month - % of cargo', V.pct(cs.pv, 'row'), cargoLead));
    ca = ca.concat(matrix('All cargoes combined: production month x sales month (kb)', V.cargoProdSales(R, {}, null, win), 'Production month', D.prod.fmt));
    X.utils.book_append_sheet(wb, sheet(ca), 'Cargo Analysis');
    const cd = [['Crude grade', 'Benchmark', 'Loading month', 'Arrival month', 'Pricing month', 'Production month', 'Sales month', 'Product', 'Product benchmark', 'Stage', 'Volume (kb)']];
    R.expRows.filter(r => r.cargoId != null && r.cargoId >= 0).forEach(r => {
      const c = cg(r.cargoId);
      cd.push([r.grade, r.bench, c.loading == null ? '' : fm(c.loading), c.arrival == null ? '' : fm(c.arrival), fm(r.pricing), fm(r.prodKey), fm(r.sale), r.product, r.pbench, r.stage, r3(r.vol)]);
    });
    X.utils.book_append_sheet(wb, sheet(cd), 'Cargo Detail');

    // ---- detail (all rows, not windowed) ----
    const det = [['Stage', 'Product', 'Product benchmark', 'Layer source', 'Sales month', 'Product layer', 'Production month', 'Exposure source', 'Pricing month', 'Crude grade / source', 'Cargo', 'Benchmark', 'Volume (kb)']];
    R.expRows.forEach(r => det.push([r.stage, r.product, r.pbench, r.kind, fm(r.sale), r.layer, fm(r.prodKey), r.src, fm(r.pricing), r.grade, r.cargo, r.bench, r3(r.vol)]));
    X.utils.book_append_sheet(wb, sheet(det), 'Crude Layering Detail');

    // ---- product layering (grouped by product benchmark) ----
    const linf = l => R.layerInfo[l] || {};
    const lead = [
      { label: 'Source', get: l => (linf(l).kind || '') + (linf(l).opening ? ' (opening stock)' : '') },
      { label: 'Production / arrival month', get: l => linf(l).month != null ? fm(linf(l).month) : '' },
      { label: 'Half', get: l => linf(l).half === 2 ? '2nd' : linf(l).half === 1 ? '1st' : '' },
      { label: 'Pricing month', get: l => linf(l).pricing != null ? fm(linf(l).pricing) : 'Crude blend' }
    ];
    let p = [['Product summary (kb), display window. Products that share a benchmark (e.g. Jet and Kerosene) are reported together.'], [],
      ['Product benchmark', 'Products', 'Opening', 'Production', 'Purchases', 'Sales', 'Unmet demand', 'Closing']];
    V.productSummary(R, win).forEach(x => p.push([x.bench, x.products, r3(x.open), r3(x.production), r3(x.purchases), r3(x.sales), r3(x.unmet), r3(x.close)]));
    p.push([]);
    p = p.concat(matrix('All benchmarks - source layer x sales month', V.productLayering(R, '', win), lead));
    p = p.concat(matrix('Production layers only', V.productLayering(R, '', win, 'Production'), lead));
    p = p.concat(matrix('Purchase layers only (product flat-price exposure)', V.productLayering(R, '', win, 'Purchase'), lead));
    V.benchmarks(R).forEach(b => {
      p = p.concat(matrix(b + ' - source layer x sales month', V.productLayering(R, b, win), lead));
      p = p.concat(matrix(b + ' - month-end inventory by layer', V.productInventory(R, b, win), lead));
    });
    X.utils.book_append_sheet(wb, sheet(p), 'Product Layering');

    // ---- month-end ----
    let m = matrix('Month-end exposure by pricing month (crude + product inventory)', V.monthEnd(R, 'pricing', '', {}, win), 'Pricing month', pricingLabel);
    m = m.concat(matrix('Crude inventory only', V.monthEnd(R, 'pricing', 'Crude inventory', {}, win), 'Pricing month', pricingLabel));
    m = m.concat(matrix('Product inventory only (traced to crude pricing month)', V.monthEnd(R, 'pricing', 'Product inventory', {}, win), 'Pricing month', pricingLabel));
    m = m.concat(matrix('By benchmark', V.monthEnd(R, 'bench', '', {}, win), 'Benchmark', id));
    m = m.concat(matrix('By inventory type', V.monthEnd(R, 'kind', '', {}, win), 'Type', id));
    X.utils.book_append_sheet(wb, sheet(m), 'Month-End Exposure');

    // ---- margin (refinery production only: a crack needs a crude leg) ----
    let g = [['Crack exposure covers refinery production only. Purchased product has no crude leg and is excluded; its flat-price exposure is on the Product Layering sheet (purchase layers).'], []];
    const mbench = V.marginByBench(R, win), mprod = V.marginByProdMonth(R, win);
    g = g.concat(matrix('Margin (crack) exposure by product benchmark - kb sold per sales month', mbench, 'Product benchmark', id));
    g = g.concat(matrix('Margin (crack) exposure by product benchmark - % of each sales month', V.pct(mbench, 'col'), 'Product benchmark', id));
    g = g.concat(matrix('Crack exposure by production month - kb', mprod, 'Production month', D.prod.fmt));
    g = g.concat(matrix('Crack exposure by production month - % of each sales month', V.pct(mprod, 'col'), 'Production month', D.prod.fmt));
    g = g.concat(matrix('Flat-price exposure released into sales - crude benchmark', V.crudeByBench(R, win), 'Crude benchmark', id));
    X.utils.book_append_sheet(wb, sheet(g), 'Margin Exposure');

    // ---- balances (window months) ----
    const wm = V.winMonths(R, win), pm = V.pMonthsInWin(R, win);
    const bal = [['Crude balance by grade (kb)'], ['Grade', 'Line', ...wm.map(fm)]];
    R.grades.forEach(gr => {
      const rows = R.crudeBal.filter(x => x.grade === gr && wm.includes(x.month));
      [['Opening', 'open'], ['Receipts', 'receipts'], ['Consumption', 'consumed'], ['Unplanned (shortfall)', 'unplanned'], ['Closing', 'close']]
        .forEach(([l, k]) => bal.push([gr, l, ...rows.map(x => r3(x[k]))]));
    });
    bal.push([], ['Product balance (kb)'], ['Product', 'Line', ...pm.map(fm)]);
    R.products.forEach(pr => {
      const rows = R.prodBal.filter(x => x.product === pr && pm.includes(x.month));
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

  function downloadXlsx(R, win) { X.writeFile(workbook(R, win), `exposure-layering-${stamp()}.xlsx`); }

  /** CSV with spreadsheet-formula-injection guard on text cells. */
  function csvCell(v) {
    if (typeof v === 'number') return String(r3(v));
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(R) {
    const lines = [['Stage', 'Product', 'Product benchmark', 'Sales month', 'Product layer', 'Production month', 'Exposure source', 'Pricing month', 'Crude grade / source', 'Cargo', 'Benchmark', 'Volume (kb)'].join(',')];
    R.expRows.forEach(r => lines.push([r.stage, r.product, r.pbench, fm(r.sale), r.layer, fm(r.prodKey), r.src, fm(r.pricing), r.grade, r.cargo, r.bench, r.vol].map(csvCell).join(',')));
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
      ['Crude Consumption', 'Crude Grade | Benchmark | one column per month. Start EARLIER than the product data (see notes).'],
      ['Product Yield', 'Product | Benchmark | one column per production month (volumes, not %). The first month here is the first product month.'],
      ['Opening Crude', 'Crude Grade | Pricing Month | Volume   - crude stock at the START OF THE CRUDE DATA (first Crude Consumption month); one row per pricing month'],
      ['Opening Product', 'Product | Source | Month | Volume   - product stock at the start of the first product month. Source = Production (Month = production month) or Purchase (Month = pricing month)'],
      ['Crude Imports', 'Crude Grade | Loading Month (optional, informational) | Arrival Month | Pricing Month | Volume'],
      ['Product Purchases', 'Product | Arrival Date | Pricing Month | Volume   (optional sheet; day 16 or later = 2nd half of the month; or add an "Arrival Half" column with 1 or 2)'],
      ['Demand', 'Product | one column per sales month'],
      [],
      ['Notes'],
      ['Opening product made in an earlier month is traced to the crude consumed in THAT month, so Crude Consumption (and Crude Imports / Opening Crude) must reach back at least to the earliest production month listed in Opening Product.'],
      ['Example: product data starts Jan-27 and opening product was made in Sep-Dec 2026, so crude data starts Sep-26 and Opening Crude is the crude stock at 1 Sep 2026.'],
      ['Opening purchases are treated as older stock and sold before the priority order applies; opening production follows the sales priority (e.g. the month before the first product month counts as "previous month\'s production").'],
      ['Crude arriving before the first crude month is treated as available from the first crude month.'],
      ['Sheet names are matched by keyword (e.g. "Opening Crude", "Crude Imports"), so small wording changes are fine.'],
      ['Names are matched ignoring case and extra spaces: "ARAB  Light" and "Arab Light" are the same grade. The first spelling in the file is the one displayed, and every merge is listed in Data Checks.'],
      ['Loading month is shown beside arrival month in the cargo tables. Consumption order always follows the pricing month and availability follows the arrival month.']
    ];
    const wn = X.utils.aoa_to_sheet(notes); wn['!cols'] = [{ wch: 22 }, { wch: 150 }];
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
