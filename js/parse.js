/* Parses input worksheets (arrays-of-arrays) into the engine's input model.
 * Preferred layout: one worksheet per input (matched by sheet name).
 * Also accepted: the older single-sheet layout with stacked blocks (matched by block title).
 * Pure functions: no DOM, no storage, no network. */
(function (root) {
  'use strict';

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const serialToDate = v => new Date(Math.round((v - 25569) * 86400000));

  /** Cell value -> month key (year*12+month) or null. Accepts Excel serials, Date, "Nov-26", "Nov 2026", "2026-11", "11/2026", "20-Jan-27". */
  function monthKey(v) {
    if (v instanceof Date) return v.getUTCFullYear() * 12 + v.getUTCMonth();
    if (typeof v === 'number') {
      if (v >= 20000 && v < 80000) { const d = serialToDate(v); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
      return null;
    }
    if (typeof v === 'string') {
      const s = v.trim();
      let m;
      if ((m = s.match(/^([A-Za-z]{3,9})[\s\-\/,']*(\d{2}|\d{4})$/))) {
        const mi = MONTHS[m[1].slice(0, 3).toLowerCase()];
        if (mi === undefined) return null;
        return (m[2].length === 2 ? 2000 + +m[2] : +m[2]) * 12 + mi;
      }
      if ((m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,']*(\d{2}|\d{4})$/))) {
        const mi = MONTHS[m[2].slice(0, 3).toLowerCase()];
        if (mi === undefined) return null;
        return (m[3].length === 2 ? 2000 + +m[3] : +m[3]) * 12 + mi;
      }
      if ((m = s.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/]\d{1,2})?$/))) return +m[1] * 12 + (+m[2] - 1);
      if ((m = s.match(/^(\d{1,2})[-\/](\d{4})$/))) return +m[2] * 12 + (+m[1] - 1);
    }
    return null;
  }

  /** Day of month of a date-like cell, or null when only a month is given. */
  function dayOf(v) {
    if (v instanceof Date) return v.getUTCDate();
    if (typeof v === 'number' && v >= 20000 && v < 80000) return serialToDate(v).getUTCDate();
    if (typeof v === 'string') {
      const s = v.trim(); let m;
      if ((m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/))) return +m[3];
      if ((m = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/,']*(\d{2}|\d{4})$/))) return +m[1];
    }
    return null;
  }
  /** Explicit half-month text -> 1 | 2 | null. */
  function halfText(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim().toLowerCase();
    if (/^(1|1h|h1|1st|first)/.test(s)) return 1;
    if (/^(2|2h|h2|2nd|second)/.test(s)) return 2;
    return null;
  }

  function isBlank(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }
  function str(v) { return isBlank(v) ? '' : String(v).trim(); }

  // Order matters: more specific names first.
  const TITLES = [
    { id: 'openCrude', re: /(opening|beginning|begin|open)\W*(crude)|crude\W*(opening|beginning)/i },
    { id: 'openProd', re: /(opening|beginning|begin|open)\W*(product)|product\W*(opening|beginning)/i },
    { id: 'crudeImports', re: /crude\s*(import|purchase|arrival|supply)/i },
    { id: 'prodPurch', re: /product\s*(import|purchase|supply)|local\s*purchase/i },
    { id: 'crude', re: /crude\s*(consumption|run|slate)/i },
    { id: 'yield', re: /(production|product)\s*yield|^yield/i },
    { id: 'demand', re: /demand|sales\s*plan/i }
  ];
  const BLOCK_NAMES = { openCrude: 'Opening Crude', openProd: 'Opening Product', crudeImports: 'Crude Imports', prodPurch: 'Product Purchases', crude: 'Crude Consumption', yield: 'Product Yield', demand: 'Demand' };

  function roleOf(header) {
    if (typeof header === 'string') {
      const h = header.trim().toLowerCase();
      if (/^(source|origin)/.test(h)) return 'source';
      if (/^(month|date)$/.test(h)) return 'monthcol';
      if (/benchmark|price\s*ref|index/.test(h)) return 'benchmark';
      if (/half|\b[12]h\b/.test(h)) return 'half';
      if (/pric/.test(h)) return 'pricing';
      if (/arriv|receipt|deliver/.test(h)) return 'arrival';
      if (/begin|opening|open\b/.test(h)) return 'open';
      if (/vol|qty|quantity|kb/.test(h)) return 'volume';
      if (/month|date/.test(h)) return 'monthcol';
    }
    return monthKey(header) !== null ? 'month' : null;
  }

  const nonEmpty = row => { const o = []; (row || []).forEach((v, i) => { if (!isBlank(v)) o.push(i); }); return o; };

  /** Build a block from a header row index. Rows continue to a blank row (stacked) or the end of the sheet (own sheet). */
  function makeBlock(aoa, h, untilBlank) {
    const hn = nonEmpty(aoa[h]);
    const labelCol = hn[0];
    const cols = hn.slice(1).map(c => ({ c, role: roleOf(aoa[h][c]), raw: aoa[h][c] }));
    const rows = [];
    for (let q = h + 1; q < aoa.length; q++) {
      const rn = nonEmpty(aoa[q]);
      if (rn.length === 0) { if (untilBlank) break; continue; }
      const label = str(aoa[q][labelCol]);
      if (!label || /^total/i.test(label)) continue;
      if (untilBlank && rn.length === 1 && TITLES.some(x => x.re.test(label))) break;
      rows.push({ label, row: aoa[q], line: q + 1 });
    }
    return { cols, rows, labelCol, headerLine: h + 1 };
  }

  /** Legacy single-sheet layout: blocks introduced by a title row. */
  function findStackedBlocks(aoa) {
    const blocks = {};
    for (let r = 0; r < aoa.length; r++) {
      const ne = nonEmpty(aoa[r]);
      if (ne.length !== 1) continue;
      const v = aoa[r][ne[0]];
      if (typeof v !== 'string') continue;
      const t = TITLES.find(x => x.re.test(v.trim()));
      if (!t || blocks[t.id]) continue;
      let h = r + 1;
      while (h < aoa.length && nonEmpty(aoa[h]).length < 2) { if (nonEmpty(aoa[h]).length === 0 && h > r + 3) break; h++; }
      if (h >= aoa.length || nonEmpty(aoa[h]).length < 2) continue;
      blocks[t.id] = makeBlock(aoa, h, true);
    }
    return blocks;
  }

  /** sheets: [{name, aoa}] -> { input, issues, ok } */
  function parseSheets(sheets) {
    const issues = [];
    const err = m => issues.push({ level: 'error', msg: m });
    const warn = m => issues.push({ level: 'warn', msg: m });

    // --- locate blocks: sheet name first, then stacked titles inside the sheet ---
    const blocks = {};
    const origin = {};
    sheets.forEach(sh => {
      const t = TITLES.find(x => x.re.test(sh.name));
      if (t && !blocks[t.id]) {
        let h = 0; while (h < sh.aoa.length && nonEmpty(sh.aoa[h]).length < 2) h++;
        if (h < sh.aoa.length) { blocks[t.id] = makeBlock(sh.aoa, h, false); origin[t.id] = sh.name; return; }
      }
      const st = findStackedBlocks(sh.aoa);
      Object.keys(st).forEach(id => { if (!blocks[id]) { blocks[id] = st[id]; origin[id] = sh.name; } });
    });

    const where = id => (origin[id] ? `"${origin[id]}"` : BLOCK_NAMES[id]);
    const num = (v, ctx) => {
      if (isBlank(v)) return 0;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
      if (!isFinite(n)) { warn(`${ctx}: "${v}" is not a number - treated as 0.`); return 0; }
      if (n < 0) err(`${ctx}: negative value ${n}.`);
      return n;
    };
    const colBy = (b, role) => b.cols.find(c => c.role === role);
    const monthCols = b => b.cols.filter(c => c.role === 'month').map(c => ({ c: c.c, k: monthKey(c.raw) }));
    const need = (id, required) => {
      if (blocks[id]) return true;
      if (required) err(`Worksheet "${BLOCK_NAMES[id]}" not found (sheet names are matched by name, e.g. "${BLOCK_NAMES[id]}").`);
      return false;
    };
    const pricingCell = (b, r, ctx) => {
      const pr = colBy(b, 'pricing');
      if (!pr || isBlank(r.row[pr.c])) return null;
      const k = monthKey(r.row[pr.c]);
      if (k === null) warn(`${ctx}: pricing month "${r.row[pr.c]}" not recognised.`);
      return k;
    };

    const input = { months: [], productStart: null, crudes: [], products: [], openCrude: [], openProducts: [], crudeImports: [], productPurchases: [], demand: [] };
    // Crude data may start earlier than product data (opening product can come from older production months).
    const crudeMonths = new Set(), productMonths = new Set();

    // --- consumption / yield: month grid (+ legacy beginning-inventory columns) ---
    const grid = (id, title, key, nameKey, valKey, openKey, listKey) => {
      if (!need(id, true)) return;
      const b = blocks[id], bm = colBy(b, 'benchmark'), op = colBy(b, 'open'), mc = monthCols(b);
      if (!mc.length) err(`${where(id)}: no month columns found in the header row.`);
      mc.forEach(m => (id === 'crude' ? crudeMonths : productMonths).add(m.k));
      if (op && !colBy(b, 'pricing')) warn(`${where(id)}: has a beginning-inventory column but no "Pricing Month" column. Use the separate opening-inventory worksheet, which states the pricing month of each opening layer.`);
      b.rows.forEach(r => {
        const vals = {};
        mc.forEach(m => { const v = num(r.row[m.c], `${where(id)}, ${r.label}, ${fmtKey(m.k)}`); if (v) vals[m.k] = v; });
        const bench = bm ? str(r.row[bm.c]) : '';
        input[key].push({ [nameKey]: r.label, benchmark: bench, [valKey]: vals });
        if (op) {
          const ov = num(r.row[op.c], `${where(id)}, ${r.label}, beginning inventory`);
          if (ov > 0) {
            const pk = pricingCell(b, r, `${where(id)}, ${r.label}`);
            input[listKey].push(listKey === 'openProducts'
              ? { product: r.label, benchmark: bench, volume: ov, source: 'Opening', month: pk }
              : { [nameKey]: r.label, benchmark: bench, volume: ov, pricing: pk });
          }
        }
      });
    };
    grid('crude', 'Crude Consumption', 'crudes', 'grade', 'consumption', 'open', 'openCrude');
    grid('yield', 'Product Yield', 'products', 'product', 'production', 'open', 'openProducts');

    // --- opening inventory sheets ---
    // Opening crude: stock at the start of the crude data, one row per pricing month.
    if (!need('openCrude', false)) warn(`No "Opening Crude" worksheet found - opening crude inventory assumed to be zero.`);
    else {
      const id = 'openCrude', b = blocks[id], bm = colBy(b, 'benchmark'), vo = colBy(b, 'volume') || colBy(b, 'open');
      if (!vo) err(`${where(id)}: needs a "Volume" column.`);
      else {
        if (!colBy(b, 'pricing')) err(`${where(id)}: needs a "Pricing Month" column - every opening layer must state its pricing month.`);
        b.rows.forEach(r => {
          const v = num(r.row[vo.c], `${where(id)}, ${r.label}, volume`);
          if (v > 0) input.openCrude.push({ grade: r.label, benchmark: bm ? str(r.row[bm.c]) : '', volume: v, pricing: pricingCell(b, r, `${where(id)}, ${r.label}`) });
        });
      }
    }
    // Opening product: stock at the start of the first product month. Source = Production (month = production month)
    // or Purchase (month = pricing month). Without a Source column each row is read as stock priced in that month.
    if (!need('openProd', false)) warn(`No "Opening Product" worksheet found - opening product inventory assumed to be zero.`);
    else {
      const id = 'openProd', b = blocks[id], bm = colBy(b, 'benchmark'), vo = colBy(b, 'volume') || colBy(b, 'open'), so = colBy(b, 'source');
      const mcol = colBy(b, 'monthcol') || colBy(b, 'pricing');
      if (!vo) err(`${where(id)}: needs a "Volume" column.`);
      else if (!mcol) err(`${where(id)}: needs a "Month" column (production month for Production rows, pricing month for Purchase rows).`);
      else {
        if (!so) warn(`${where(id)}: no "Source" column - rows are read as stock priced in the given month. Add Source = Purchase or Production.`);
        b.rows.forEach(r => {
          const v = num(r.row[vo.c], `${where(id)}, ${r.label}, volume`);
          if (!(v > 0)) return;
          let source = 'Opening';
          if (so) {
            const s = str(r.row[so.c]).toLowerCase();
            if (/^purch|^import|^buy|^bought/.test(s)) source = 'Purchase';
            else if (/^prod|^refin|^made/.test(s)) source = 'Production';
            else { err(`${where(id)}, ${r.label}: Source "${r.row[so.c]}" not recognised - use Purchase or Production.`); return; }
          }
          let month = null;
          if (!isBlank(r.row[mcol.c])) { month = monthKey(r.row[mcol.c]); if (month === null) warn(`${where(id)}, ${r.label}: month "${r.row[mcol.c]}" not recognised.`); }
          input.openProducts.push({ product: r.label, benchmark: bm ? str(r.row[bm.c]) : '', volume: v, source, month });
        });
      }
    }

    // --- demand ---
    if (need('demand', true)) {
      const b = blocks.demand, mc = monthCols(b);
      if (!mc.length) err(`${where('demand')}: no month columns found in the header row.`);
      mc.forEach(m => productMonths.add(m.k));
      b.rows.forEach(r => {
        const d = {};
        mc.forEach(m => { const v = num(r.row[m.c], `${where('demand')}, ${r.label}, ${fmtKey(m.k)}`); if (v) d[m.k] = v; });
        input.demand.push({ product: r.label, demand: d });
      });
    }

    // --- imports / purchases ---
    const flows = (id, nameKey, listKey, withHalf) => {
      if (!need(id, false)) return;
      const b = blocks[id], ar = colBy(b, 'arrival'), vo = colBy(b, 'volume'), bm = colBy(b, 'benchmark'), hf = colBy(b, 'half');
      if (!ar || !vo) { err(`${where(id)}: needs "Arrival" and "Volume" columns.`); return; }
      if (!colBy(b, 'pricing')) warn(`${where(id)}: no "Pricing Month" column - pricing month will be assumed to be the month before arrival.`);
      b.rows.forEach(r => {
        const a = monthKey(r.row[ar.c]);
        if (a === null) { err(`${where(id)}, ${r.label}: arrival "${r.row[ar.c]}" not recognised.`); return; }
        const vol = num(r.row[vo.c], `${where(id)}, ${r.label}, volume`);
        if (!(vol > 0)) return;
        const rec = { [nameKey]: r.label, arrival: a, pricing: pricingCell(b, r, `${where(id)}, ${r.label}`), volume: vol, benchmark: bm ? str(r.row[bm.c]) : '' };
        if (withHalf) {
          let half = hf ? halfText(r.row[hf.c]) : null;
          if (half === null) { const d = dayOf(r.row[ar.c]); half = d !== null && d > 15 ? 2 : 1; }
          rec.half = half;
        }
        input[listKey].push(rec);
      });
    };
    flows('crudeImports', 'grade', 'crudeImports', false);
    flows('prodPurch', 'product', 'productPurchases', true);

    // --- timeline: earliest crude month .. last month, no gaps; product data starts at its own first month ---
    const allMonths = new Set([...crudeMonths, ...productMonths]);
    if (allMonths.size) {
      const ks = [...allMonths].sort((a, b) => a - b);
      for (let k = ks[0]; k <= ks[ks.length - 1]; k++) input.months.push(k);
      if (input.months.length !== ks.length) warn('Month columns have gaps; missing months are included in the timeline with zero values.');
    }
    if (productMonths.size) {
      input.productStart = Math.min(...productMonths);
      if (crudeMonths.size && Math.min(...crudeMonths) > input.productStart) warn(`Crude data starts ${fmtKey(Math.min(...crudeMonths))}, after the first product month (${fmtKey(input.productStart)}). Opening product made before the crude data cannot be traced to crude pricing months.`);
    }

    const dup = (arr, key, what) => {
      const seen = new Set();
      arr.forEach(x => { if (seen.has(x[key])) warn(`${what} "${x[key]}" appears more than once; volumes are summed.`); seen.add(x[key]); });
    };
    dup(input.crudes, 'grade', 'Crude grade');
    dup(input.products, 'product', 'Product');
    dup(input.demand, 'product', 'Demand row for');

    return { input, issues, ok: !issues.some(i => i.level === 'error') };
  }
  function fmtKey(k) { return MON3[k % 12] + '-' + String(Math.floor(k / 12) % 100).padStart(2, '0'); }
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Single array-of-arrays (legacy stacked layout). */
  function parseAoa(aoa) { return parseSheets([{ name: 'Inputs', aoa }]); }

  const api = { parseSheets, parseAoa, monthKey, dayOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parse = api;
})(typeof window !== 'undefined' ? window : globalThis);
