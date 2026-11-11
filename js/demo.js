/* Fictional demo / template data (not real company data): one worksheet per input.
 * Crude data starts Sep-26; product data starts Jan-27. Opening product stock (at 1 Jan 2027) was
 * produced in Sep-Dec 2026 or bought and priced in Nov/Dec 2026, so crude data must reach back that far. */
(function (root) {
  'use strict';

  const serial = (y, m, d) => Math.round(Date.UTC(y, m, d || 1) / 86400000 + 25569);
  const MMM = 'mmm-yy', DMY = 'd-mmm-yy';

  /** Returns [{ name, aoa, dateCells: [[row, col, numFmt], ...] }] */
  function buildDemoSheets() {
    // crude timeline Sep-26 .. Jun-27 (10 months); product timeline Jan-27 .. Jun-27 (last 6)
    const CM = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(i => ({ y: 2026 + Math.floor(i / 12), m: i % 12 }));
    const PM = CM.slice(4);
    const mk = (y, m) => ({ y, m });
    const sheets = [];
    const sheet = (name, header) => { const s = { name, aoa: [header], dateCells: [] }; sheets.push(s); return s; };
    const addRow = (s, row, dateCols, fmtOf) => {
      const r = s.aoa.length; s.aoa.push(row);
      (dateCols || []).forEach(c => s.dateCells.push([r, c, (fmtOf && fmtOf[c]) || MMM]));
    };
    const monthHeader = (s, months, startCol) => { months.forEach((d, i) => { s.aoa[0].push(serial(d.y, d.m)); s.dateCells.push([0, startCol + i, MMM]); }); };

    // ---- data ----
    const crudes = [
      { g: 'Arab Light',    b: 'Dubai',       c: [1000, 1100, 1000, 1100, 1100, 1100, 1000, 1100, 1100, 1000], open: [[300, mk(2026, 6)], [1000, mk(2026, 7)]] },
      { g: 'Basrah Medium', b: 'Dubai',       c: [600, 600, 700, 600, 600, 700, 600, 700, 600, 700],           open: [[600, mk(2026, 7)]] },
      { g: 'Murban',        b: 'Murban',      c: [700, 700, 800, 700, 700, 800, 800, 700, 800, 800],           open: [[500, mk(2026, 7)]] },
      { g: 'Es Sider',      b: 'Dated Brent', c: [500, 0, 500, 600, 500, 0, 600, 500, 0, 600],                 open: [[400, mk(2026, 7)]] }
    ];
    const prods = [
      { p: 'Gasoline 92', b: 'MOPS 92 RON',       y: [0.280, 0.290, 0.270, 0.280, 0.300, 0.280], d: [820, 740, 870, 850, 760, 900] },
      { p: 'Gasoil',      b: 'MOPS Gasoil 10ppm', y: [0.340, 0.330, 0.350, 0.340, 0.330, 0.340], d: [1000, 900, 1030, 1040, 830, 1080] },
      { p: 'Jet/Kero',    b: 'MOPS Jet/Kero',     y: [0.120, 0.120, 0.120, 0.130, 0.120, 0.120], d: [360, 330, 420, 430, 300, 400] },
      { p: 'Naphtha',     b: 'MOPS Naphtha',      y: [0.100, 0.100, 0.100, 0.100, 0.110, 0.100], d: [300, 250, 320, 300, 260, 340] },
      { p: 'Fuel Oil',    b: 'MOPS 380 HSFO',     y: null,                                       d: [360, 320, 380, 330, 310, 380] },
      { p: 'LPG',         b: 'Saudi CP LPG',      y: [0.040, 0.040, 0.040, 0.040, 0.040, 0.040], d: [118, 100, 140, 125, 110, 420] }
    ];
    // opening product stock at 1 Jan 2027: [product, 'Production' | 'Purchase', month, volume]
    const openProd = [
      ['Gasoline 92', 'Production', mk(2026, 9), 100], ['Gasoline 92', 'Production', mk(2026, 10), 150], ['Gasoline 92', 'Production', mk(2026, 11), 200],
      ['Gasoil', 'Production', mk(2026, 10), 250], ['Gasoil', 'Production', mk(2026, 11), 350],
      ['Jet/Kero', 'Production', mk(2026, 11), 150], ['Jet/Kero', 'Purchase', mk(2026, 10), 100],
      ['Naphtha', 'Production', mk(2026, 9), 100], ['Naphtha', 'Production', mk(2026, 11), 200],
      ['Fuel Oil', 'Production', mk(2026, 8), 100], ['Fuel Oil', 'Production', mk(2026, 9), 150], ['Fuel Oil', 'Production', mk(2026, 10), 250],
      ['LPG', 'Production', mk(2026, 11), 70], ['LPG', 'Purchase', mk(2026, 11), 50]
    ];
    const cTot = PM.map((_, i) => crudes.reduce((s, c) => s + c.c[4 + i], 0));
    const loss = [1, 1, 1, 0.99, 1, 1]; // Apr-27 has a 1% process loss -> triggers a mass-balance warning
    const vol = {};
    prods.forEach(p => { vol[p.p] = PM.map((_, i) => p.y ? +(cTot[i] * p.y[i] * loss[i]).toFixed(1) : 0); });
    PM.forEach((_, i) => { // fuel oil = remainder so volumes close on crude (before loss)
      const others = prods.filter(p => p.y).reduce((s, p) => s + vol[p.p][i], 0);
      vol['Fuel Oil'][i] = +(cTot[i] * loss[i] - others).toFixed(1);
    });

    // ---- 1. Crude Consumption (from Sep-26) ----
    let s = sheet('Crude Consumption', ['Crude Grade', 'Benchmark']); monthHeader(s, CM, 2);
    crudes.forEach(c => addRow(s, [c.g, c.b, ...c.c]));

    // ---- 2. Product Yield (volumes, from Jan-27) ----
    s = sheet('Product Yield', ['Product', 'Benchmark']); monthHeader(s, PM, 2);
    prods.forEach(p => addRow(s, [p.p, p.b, ...vol[p.p]]));

    // ---- 3. Opening Crude: stock at the start of the crude data (1 Sep 2026), one row per pricing month ----
    s = sheet('Opening Crude', ['Crude Grade', 'Pricing Month', 'Volume']);
    crudes.forEach(c => c.open.forEach(([v, pm]) => addRow(s, [c.g, serial(pm.y, pm.m), v], [1])));

    // ---- 4. Opening Product: stock at the start of the first product month, by source ----
    s = sheet('Opening Product', ['Product', 'Source', 'Month', 'Volume']);
    openProd.forEach(([p, src, mo, v]) => addRow(s, [p, src, serial(mo.y, mo.m), v], [2]));

    // ---- 5. Crude Imports (arrival month, pricing month) ----
    // Loading month is informational: the cargo lifts a month before it arrives. FIFO still uses pricing month.
    s = sheet('Crude Imports', ['Crude Grade', 'Loading Month', 'Arrival Month', 'Pricing Month', 'Volume']);
    const add = (g, ai, v, lag) => { // ai = months since Sep-26
      const am = 8 + ai, pm = am - (lag === undefined ? 1 : lag), lm = am - 1;
      const mo = x => serial(2026 + Math.floor(x / 12), ((x % 12) + 12) % 12);
      addRow(s, [g, mo(lm), mo(am), mo(pm), v], [1, 2, 3]);
    };
    [1100, 1000, 1200, 500, 1000, 1200, 1000, 1100, 1100].forEach((v, i) => add('Arab Light', i, v));
    [600, 650, 700, 450, 500, 700, 600, 700, 600, 600].forEach((v, i) => add('Basrah Medium', i, v));
    [700, 750, 800, 550, 600, 800, 800, 700, 800, 800].forEach((v, i) => add('Murban', i, v));
    add('Es Sider', 0, 500); add('Es Sider', 2, 600); add('Es Sider', 3, 400); add('Es Sider', 4, 400);
    add('Es Sider', 6, 600); add('Es Sider', 7, 400); add('Es Sider', 9, 500, 0); // Jun cargo prices in its arrival month

    // ---- 6. Product Purchases (arrival DATE: 16th or later = 2nd half of month) ----
    s = sheet('Product Purchases', ['Product', 'Arrival Date', 'Pricing Month', 'Volume']);
    [['Jet/Kero', serial(2027, 1, 5), 0, 200], ['Jet/Kero', serial(2027, 3, 22), 2, 200], ['LPG', serial(2027, 2, 10), 1, 80]].forEach(x =>
      addRow(s, [x[0], x[1], serial(2027, x[2]), x[3]], [1, 2], { 1: DMY, 2: MMM }));

    // ---- 7. Demand (from Jan-27) ----
    s = sheet('Demand', ['Product']); monthHeader(s, PM, 1);
    prods.forEach(p => addRow(s, [p.p, ...p.d]));

    return sheets;
  }

  const api = { buildDemoSheets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Demo = api;
})(typeof window !== 'undefined' ? window : globalThis);
