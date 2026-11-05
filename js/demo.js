/* Fictional demo / template data (not real company data): one worksheet per input. */
(function (root) {
  'use strict';

  const serial = (y, m, d) => Math.round(Date.UTC(y, m, d || 1) / 86400000 + 25569);
  const MMM = 'mmm-yy', DMY = 'd-mmm-yy';

  /** Returns [{ name, aoa, dateCells: [[row, col, numFmt], ...] }] */
  function buildDemoSheets() {
    const M = [0, 1, 2, 3, 4, 5].map(i => ({ y: 2027, m: i })); // Jan-27 .. Jun-27
    const mk = (y, m) => ({ y, m });
    const sheets = [];
    const sheet = (name, header, widths) => { const s = { name, aoa: [header], dateCells: [], widths }; sheets.push(s); return s; };
    const addRow = (s, row, dateCols, fmtOf) => {
      const r = s.aoa.length; s.aoa.push(row);
      (dateCols || []).forEach(c => s.dateCells.push([r, c, (fmtOf && fmtOf[c]) || MMM]));
    };
    const monthHeader = (s, startCol) => { M.forEach((d, i) => { s.aoa[0].push(serial(d.y, d.m)); s.dateCells.push([0, startCol + i, MMM]); }); };

    // ---- data ----
    const crudes = [
      { g: 'Arab Light',    b: 'Dubai',       c: [1100, 1100, 1000, 1100, 1100, 1000], open: [[900, mk(2026, 11)]] },
      { g: 'Basrah Medium', b: 'Dubai',       c: [600, 700, 600, 700, 600, 700],       open: [[500, mk(2026, 11)]] },
      { g: 'Murban',        b: 'Murban',      c: [700, 800, 800, 700, 800, 800],       open: [[400, mk(2026, 11)]] },
      { g: 'Es Sider',      b: 'Dated Brent', c: [500, 0, 600, 500, 0, 600],          open: [[300, mk(2026, 10)]] }
    ];
    const prods = [
      { p: 'Gasoline 92', b: 'MOPS 92 RON',       y: [0.280, 0.290, 0.270, 0.280, 0.300, 0.280], d: [820, 740, 870, 850, 760, 900],     open: [[300, mk(2026, 10)], [150, mk(2026, 11)]] },
      { p: 'Gasoil',      b: 'MOPS Gasoil 10ppm', y: [0.340, 0.330, 0.350, 0.340, 0.330, 0.340], d: [1000, 900, 1030, 1040, 830, 1080], open: [[600, mk(2026, 11)]] },
      { p: 'Jet/Kero',    b: 'MOPS Jet/Kero',     y: [0.120, 0.120, 0.120, 0.130, 0.120, 0.120], d: [360, 330, 420, 430, 300, 400],     open: [[250, mk(2026, 11)]] },
      { p: 'Naphtha',     b: 'MOPS Naphtha',      y: [0.100, 0.100, 0.100, 0.100, 0.110, 0.100], d: [300, 250, 320, 300, 260, 340],     open: [[300, mk(2026, 11)]] },
      { p: 'Fuel Oil',    b: 'MOPS 380 HSFO',     y: null,                                       d: [360, 320, 380, 330, 310, 380],     open: [[300, mk(2026, 9)], [200, mk(2026, 10)]] },
      { p: 'LPG',         b: 'Saudi CP LPG',      y: [0.040, 0.040, 0.040, 0.040, 0.040, 0.040], d: [118, 100, 140, 125, 110, 420],     open: [[120, mk(2026, 11)]] }
    ];
    const cTot = M.map((_, i) => crudes.reduce((s, c) => s + c.c[i], 0));
    const loss = [1, 1, 1, 0.99, 1, 1]; // Apr-27 has a 1% process loss -> triggers a mass-balance warning
    const vol = {};
    prods.forEach(p => { vol[p.p] = M.map((_, i) => p.y ? +(cTot[i] * p.y[i] * loss[i]).toFixed(1) : 0); });
    M.forEach((_, i) => { // fuel oil = remainder so volumes close on crude (before loss)
      const others = prods.filter(p => p.y).reduce((s, p) => s + vol[p.p][i], 0);
      vol['Fuel Oil'][i] = +(cTot[i] * loss[i] - others).toFixed(1);
    });

    // ---- 1. Crude Consumption ----
    let s = sheet('Crude Consumption', ['Crude Grade', 'Benchmark']); monthHeader(s, 2);
    crudes.forEach(c => addRow(s, [c.g, c.b, ...c.c]));

    // ---- 2. Product Yield (volumes) ----
    s = sheet('Product Yield', ['Product', 'Benchmark']); monthHeader(s, 2);
    prods.forEach(p => addRow(s, [p.p, p.b, ...vol[p.p]]));

    // ---- 3. Opening Crude (one row per pricing month) ----
    s = sheet('Opening Crude', ['Crude Grade', 'Pricing Month', 'Volume']);
    crudes.forEach(c => c.open.forEach(([v, pm]) => addRow(s, [c.g, serial(pm.y, pm.m), v], [1])));

    // ---- 4. Opening Product ----
    s = sheet('Opening Product', ['Product', 'Pricing Month', 'Volume']);
    prods.forEach(p => p.open.forEach(([v, pm]) => addRow(s, [p.p, serial(pm.y, pm.m), v], [1])));

    // ---- 5. Crude Imports (arrival month, pricing month) ----
    s = sheet('Crude Imports', ['Crude Grade', 'Arrival Month', 'Pricing Month', 'Volume']);
    const add = (g, ai, v, lag) => {
      const pm = ai - (lag === undefined ? 1 : lag);
      addRow(s, [g, serial(2027, ai), serial(2027 + Math.floor(pm / 12), ((pm % 12) + 12) % 12), v], [1, 2]);
    };
    [1000, 1200, 1000, 1100, 1100].forEach((v, i) => add('Arab Light', i, v));
    [500, 700, 600, 700, 600, 600].forEach((v, i) => add('Basrah Medium', i, v));
    [600, 800, 800, 700, 800, 800].forEach((v, i) => add('Murban', i, v));
    add('Es Sider', 0, 400); add('Es Sider', 2, 600); add('Es Sider', 3, 400); add('Es Sider', 5, 500, 0); // Jun cargo prices in its arrival month

    // ---- 6. Product Purchases (arrival DATE: 16th or later = 2nd half of month) ----
    s = sheet('Product Purchases', ['Product', 'Arrival Date', 'Pricing Month', 'Volume']);
    [['Jet/Kero', serial(2027, 1, 5), 0, 200], ['Jet/Kero', serial(2027, 3, 22), 2, 200], ['LPG', serial(2027, 2, 10), 1, 80]].forEach(x =>
      addRow(s, [x[0], x[1], serial(2027, x[2]), x[3]], [1, 2], { 1: DMY, 2: MMM }));

    // ---- 7. Demand ----
    s = sheet('Demand', ['Product']); monthHeader(s, 1);
    prods.forEach(p => addRow(s, [p.p, ...p.d]));

    return sheets;
  }

  const api = { buildDemoSheets };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Demo = api;
})(typeof window !== 'undefined' ? window : globalThis);
