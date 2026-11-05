// Run with: node tests/test_engine.js
const assert = require('assert');
const E = require('../js/engine.js');
const P = require('../js/parse.js');
const D = require('../js/demo.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); n++; };
const sum = a => a.reduce((s, x) => s + x, 0);
const k = (y, m) => y * 12 + m;
const serial = (y, m, d) => Math.round(Date.UTC(y, m, d || 1) / 86400000 + 25569);

// ---------- 1. parse the multi-sheet demo ----------
const sheets = D.buildDemoSheets().map(s => ({ name: s.name, aoa: s.aoa }));
ok(sheets.length === 7, 'seven input worksheets');
const parsed = P.parseSheets(sheets);
ok(parsed.ok, 'demo parses without errors: ' + JSON.stringify(parsed.issues));
ok(parsed.issues.length === 0, 'no parse notes on the demo: ' + JSON.stringify(parsed.issues));
const inp = parsed.input;
ok(inp.months.length === 6, 'six months');
ok(inp.crudes.length === 4 && inp.products.length === 6 && inp.demand.length === 6, 'row counts');
ok(inp.openCrude.length === 4 && inp.openProducts.length === 8, 'opening layers (multiple pricing months per product allowed)');
ok(inp.crudeImports.length === 21 && inp.productPurchases.length === 3, 'import counts');
ok(inp.openCrude[0].pricing === P.monthKey('Dec-26'), 'opening pricing month parsed');
ok(inp.productPurchases.map(p => p.half).join() === '1,2,1', 'arrival half taken from the arrival date (5th, 22nd, 10th)');
ok(P.monthKey(46327) === 2026 * 12 + 10, 'excel serial 46327 = Nov-26');
ok(P.monthKey('Nov 2026') === 2026 * 12 + 10 && P.monthKey('2026-11') === 2026 * 12 + 10 && P.monthKey('20-Jan-27') === 2027 * 12, 'text months');

// sheet names are matched by keyword, order does not matter
const shuffled = sheets.slice().reverse().map(s => ({ ...s, name: s.name.toLowerCase() }));
ok(JSON.stringify(P.parseSheets(shuffled).input) === JSON.stringify(inp), 'sheet order / case do not matter');
// missing sheets are reported
const noDemand = P.parseSheets(sheets.filter(s => s.name !== 'Demand'));
ok(!noDemand.ok && noDemand.issues.some(i => /Demand/.test(i.msg)), 'missing Demand sheet is an error');
const noOpen = P.parseSheets(sheets.filter(s => !/^Opening/.test(s.name)));
ok(noOpen.ok && noOpen.issues.some(i => i.level === 'warn' && /Opening Crude/.test(i.msg)), 'missing opening sheets warn (zero assumed)');
// opening sheet without a pricing month column is an error
const badOpen = P.parseSheets(sheets.map(s => s.name === 'Opening Product' ? { name: s.name, aoa: s.aoa.map(r => [r[0], r[2]]) } : s));
ok(!badOpen.ok && badOpen.issues.some(i => /Pricing Month/.test(i.msg)), 'opening sheet needs a pricing month column');
// explicit "Arrival Half" column overrides the date
const pp = sheets.find(s => s.name === 'Product Purchases');
const withHalf = P.parseSheets(sheets.map(s => s === pp ? { name: s.name, aoa: s.aoa.map((r, i) => i === 0 ? [...r, 'Arrival Half'] : [...r, i === 1 ? '2H' : '']) } : s));
ok(withHalf.input.productPurchases[0].half === 2 && withHalf.input.productPurchases[1].half === 2, 'Arrival Half column overrides the date');

// ---------- 2. run engine on demo ----------
const R = E.run(inp);
const s = R.summary;
ok(R.priority.join() === E.DEFAULT_PRIORITY.join(), 'default priority applied');
near(s.totalConsumed, sum(inp.crudes.map(c => sum(Object.values(c.consumption)))), 'total consumption');
const supply = sum(inp.openCrude.map(c => c.volume)) + sum(inp.crudeImports.map(i => i.volume));
near(supply + s.totalShort - s.totalConsumed, s.endCrude, 'crude balance closes');
const prodSupply = sum(inp.openProducts.map(p => p.volume)) + sum(inp.productPurchases.map(p => p.volume)) + s.totalProduced;
near(prodSupply - s.totalSold, s.endProd, 'product balance closes');

const soldRows = R.expRows.filter(r => r.stage === 'Sold');
near(sum(soldRows.map(r => r.vol)), s.totalSold, 'traced sold volume == met demand');
near(sum(R.expRows.filter(r => r.stage === 'Unsold product').map(r => r.vol)), s.endProd, 'traced unsold == ending product');
near(sum(R.expRows.filter(r => r.stage === 'Unconsumed crude').map(r => r.vol)), s.endCrude, 'unconsumed crude rows == ending crude');
R.months.forEach((mk, t) => {
  const snapTotal = sum(R.snaps[t].map(r => r.vol));
  const cInv = sum(R.crudeBal.filter(b => b.t === t).map(b => b.close));
  const pInv = sum(R.prodBal.filter(b => b.t === t).map(b => b.close));
  near(snapTotal, cInv + pInv, 'snapshot == inventories at ' + E.fmtMonth(mk), 1e-6);
});
R.prodBal.forEach(b => near(b.open + b.production + b.purchases - b.sales, b.close, `prod bal ${b.product} t${b.t}`, 1e-6));
R.crudeBal.forEach(b => near(b.open + b.receipts - b.consumed, b.close, `crude bal ${b.grade} t${b.t}`, 1e-6));
const pv = E.pivot(soldRows, r => r.pricing, r => r.sale);
near(pv.total, s.totalSold, 'pivot total');

// opening layers are labelled with their pricing month, oldest pricing month sold first
ok(R.layerOrder.includes('Opening inventory (priced Nov-26)') && R.layerOrder.includes('Opening inventory (priced Dec-26)'), 'opening layers state their pricing month');
ok(!R.layerOrder.some(l => l === 'Opening inventory'), 'no vague "Opening inventory" label');
const gas = R.sales.filter(x => x.product === 'Gasoline 92' && x.sale === R.months[0]);
ok(gas[0].layer === 'Opening inventory (priced Nov-26)' && gas[1].layer === 'Opening inventory (priced Dec-26)', 'opening layers sold oldest pricing month first');
soldRows.forEach(r => { if (r.pricing !== E.PRE && r.pricing !== E.UNPLANNED && r.src === 'Crude') ok(r.pricing <= r.sale, 'pricing not after sale'); });
ok(R.shortfalls.length > 0 && R.unmet.length > 0, 'demo has a shortfall and unmet demand');
ok(R.checks.some(c => /Yield does not match/.test(c.title)), 'mass-balance warning');
ok(s.waAge > 0 && s.waAge < 6, 'weighted-average age plausible: ' + s.waAge);

// ---------- 3. hand-checked mini case: crude FIFO + tracing ----------
const mini = {
  months: [k(2027, 0), k(2027, 1)],
  crudes: [{ grade: 'A', benchmark: 'Brent', consumption: { [k(2027, 0)]: 60, [k(2027, 1)]: 100 } }],
  products: [{ product: 'P', benchmark: 'Crack', production: { [k(2027, 0)]: 60, [k(2027, 1)]: 100 } }],
  openCrude: [{ grade: 'A', benchmark: 'Brent', volume: 100, pricing: k(2026, 11) }], openProducts: [],
  crudeImports: [{ grade: 'A', arrival: k(2027, 1), pricing: k(2027, 0), volume: 100, benchmark: '' }],
  productPurchases: [],
  demand: [{ product: 'P', demand: { [k(2027, 0)]: 20, [k(2027, 1)]: 80 } }]
};
const M = E.run(mini);
const mp = E.pivot(M.expRows.filter(r => r.stage === 'Sold'), r => r.pricing, r => r.sale);
near(mp.get(k(2026, 11), k(2027, 0)), 20, 'mini: Dec-priced sold in Jan');
near(mp.get(k(2026, 11), k(2027, 1)), 56, 'mini: Dec-priced sold in Feb (40 + 16)');
near(mp.get(k(2027, 0), k(2027, 1)), 24, 'mini: Jan-priced sold in Feb');
near(sum(M.expRows.filter(r => r.stage === 'Unsold product').map(r => r.vol)), 60, 'mini: unsold product at end');
near(M.summary.endCrude, 40, 'mini: 40 kb Jan-priced crude left');

// ---------- 4. sales priority ----------
// Product P, Jan..Mar. Crude is plentiful so production = consumption. Layers available in Mar:
//   Feb production 100, Feb purchase 30, Mar purchase 1st half 50, Mar purchase 2nd half 40, Mar production 100.
// Jan has no demand, so Jan production (100) is "old stock" in Mar and is always sold first.
const kJ = k(2027, 0), kF = k(2027, 1), kM = k(2027, 2);
function prioCase(demandMar, priority) {
  return E.run({
    months: [kJ, kF, kM],
    crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kJ]: 100, [kF]: 100, [kM]: 100 } }],
    products: [{ product: 'P', benchmark: 'C', production: { [kJ]: 100, [kF]: 100, [kM]: 100 } }],
    openCrude: [{ grade: 'A', benchmark: 'B', volume: 1000, pricing: k(2026, 11) }], openProducts: [],
    crudeImports: [],
    productPurchases: [
      { product: 'P', arrival: kF, pricing: k(2027, 0), volume: 30, benchmark: '', half: 1 },
      { product: 'P', arrival: kM, pricing: k(2027, 1), volume: 50, benchmark: '', half: 1 },
      { product: 'P', arrival: kM, pricing: k(2027, 1), volume: 40, benchmark: '', half: 2 }
    ],
    demand: [{ product: 'P', demand: { [kM]: demandMar } }]
  }, priority ? { priority } : undefined);
}
const marSales = r => r.sales.filter(x => x.sale === kM && x.vol > 1e-9).map(x => `${x.layer}=${Math.round(x.vol)}`).join('; ');
// total supply in Mar = 100 (Jan prod) + 100 (Feb prod) + 30 + 50 + 40 + 100 = 420
let r1 = prioCase(300);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 (1st half)=30; Purchase Mar-27 (1st half)=50; Prod Mar-27=20',
  'default order: old stock, prev production, prev imports, current 1st-half imports, current production: ' + marSales(r1));
r1 = prioCase(400);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 (1st half)=30; Purchase Mar-27 (1st half)=50; Prod Mar-27=100; Purchase Mar-27 (2nd half)=20',
  'default order: 2nd-half imports come last: ' + marSales(r1));
// swap current production ahead of 1st-half imports (4 vs 3)
r1 = prioCase(300, ['prevProd', 'prevImp', 'curProd', 'curImp1', 'curImp2']);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 (1st half)=30; Prod Mar-27=70',
  '4 before 3: current production sold before current 1st-half imports: ' + marSales(r1));
// second-half imports ahead of current production (5 vs 4)
r1 = prioCase(400, ['prevProd', 'prevImp', 'curImp1', 'curImp2', 'curProd']);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 (1st half)=30; Purchase Mar-27 (1st half)=50; Purchase Mar-27 (2nd half)=40; Prod Mar-27=80',
  '5 before 4: ' + marSales(r1));
// previous imports ahead of previous production (2 vs 1)
r1 = prioCase(150, ['prevImp', 'prevProd', 'curImp1', 'curProd', 'curImp2']);
ok(marSales(r1) === 'Prod Jan-27=100; Purchase Feb-27 (1st half)=30; Prod Feb-27=20', '2 before 1 (old stock still first): ' + marSales(r1));
// invalid priority falls back to default
ok(prioCase(10, ['x']).priority.join() === E.DEFAULT_PRIORITY.join(), 'invalid priority ignored');
// priority only changes WHICH layer is sold, never the totals
const a1 = prioCase(300), a2 = prioCase(300, ['curImp2', 'curProd', 'curImp1', 'prevImp', 'prevProd']);
near(a1.summary.totalSold, a2.summary.totalSold, 'priority does not change total sold');
near(a1.summary.endProd, a2.summary.endProd, 'priority does not change ending stock');

// ---------- 5. legacy single-sheet layout still loads ----------
const s1 = 46327, s2 = 46357; // Nov-26, Dec-26
const legacy = P.parseAoa([
  ['', 'Crude Consumption Plan'], ['', '', '', 'Production Month'],
  ['', 'Crude Grade', 'Beginning Inventory', s1, s2], ['', 'C1', 10, 5, 5], ['', 'Total', 10, 5, 5], [],
  ['', 'Production Yield'], ['', 'Product', 'Beginning Inventory', s1, s2], ['', 'P1', 4, 5, 5], ['', 'Total', 4, 5, 5], [],
  ['', 'Crude Imports'], ['', 'Crude Grade', 'Arrival Month', 'Volume'], ['', 'C1', s2, 3], [],
  ['', 'Demand Per Product'], ['', 'Product', s1, s2], ['', 'P1', 2, 2]
]);
ok(legacy.ok, 'legacy layout parses: ' + JSON.stringify(legacy.issues));
ok(legacy.input.months.length === 2 && legacy.input.crudes.length === 1 && legacy.input.demand.length === 1, 'legacy shapes');
ok(legacy.input.openCrude.length === 1 && legacy.input.openProducts.length === 1, 'legacy beginning-inventory columns become opening layers');
ok(legacy.issues.some(i => /Pricing Month/.test(i.msg)), 'legacy beginning inventory without pricing month is flagged');
const LR = E.run(legacy.input);
ok(LR.checks.some(c => c.level === 'warn' && /Opening product without pricing month/.test(c.title)), 'opening without pricing month is a warning');
ok(LR.layerOrder.includes('Opening inventory (pricing month not specified)'), 'unspecified pricing month is stated in the label');
ok(LR.checks.some(c => /Import without pricing month/.test(c.title)), 'missing import pricing month flagged and defaulted');
near(LR.summary.totalConsumed, 10, 'legacy consumption');

// ---------- 5b. cargo tracing + percentages ----------
const V = require('../js/views.js');
// every cargo: consumed (by production month) + not yet consumed == cargo size
R.cargoes.forEach(c => {
  const used = sum(R.cargoUse.filter(u => u.cargoId === c.id).map(u => u.vol));
  const left = sum(R.expRows.filter(r => r.stage === 'Unconsumed crude' && r.cargoId === c.id).map(r => r.vol));
  near(used + left, c.vol, 'cargo conserved: ' + c.label, 1e-6);
});
ok(R.cargoes.length === inp.openCrude.length + inp.crudeImports.length + R.shortfalls.length, 'one cargo per layer + one per shortfall');
ok(new Set(R.cargoes.map(c => c.label)).size === R.cargoes.length, 'cargo labels are unique');
// crude-linked product rows (sold + unsold) add up to total production
near(sum(R.expRows.filter(r => r.cargoId != null && r.cargoId >= 0 && (r.stage === 'Sold' || r.stage === 'Unsold product')).map(r => r.vol)), s.totalProduced, 'cargo-traced product == production', 1e-6);
// cargo x production, cargo x sales and the cargo's own production x sales matrix all agree
const cp = V.cargoByProduction(R, {}), cs = V.cargoBySales(R, {});
near(cp.pv.total, s.totalConsumed + sum(R.expRows.filter(r => r.stage === 'Unconsumed crude').map(r => r.vol)), 'cargo x production total');
near(cs.pv.total, s.totalProduced + s.endCrude, 'cargo x sales total (product + unconsumed crude)', 1e-6);
cs.list.forEach((c, i) => near(V.cargoProdSales(R, {}, c.id).total, cs.pv.rowTotals[i], 'per-cargo prod x sales == its sales row: ' + c.label, 1e-6));
// filters
ok(V.cargoFilter(R, { bench: 'Dubai' }).every(c => c.bench === 'Dubai'), 'cargo benchmark filter');
// percentages
const pvv = V.crudeLayering(R, {}, 'pricing');
const prow = V.pct(pvv, 'row'), pcol = V.pct(pvv, 'col'), ptot = V.pct(pvv, 'total');
prow.rowKeys.forEach((rk, i) => { if (pvv.rowTotals[i] > 1e-9) near(sum(prow.colKeys.map(ck => prow.get(rk, ck))), 100, 'row % sums to 100', 1e-6); });
pcol.colKeys.forEach((ck, j) => { if (pvv.colTotals[j] > 1e-9) near(sum(pcol.rowKeys.map(rk => pcol.get(rk, ck))), 100, 'col % sums to 100', 1e-6); });
near(sum(ptot.rowKeys.flatMap(rk => ptot.colKeys.map(ck => ptot.get(rk, ck)))), 100, 'grand % sums to 100', 1e-6);
// production-month dimension
const pdim = V.crudeLayering(R, {}, 'prod', 'sale');
near(pdim.total, pvv.total, 'prod x sale total == pricing x sale total');
ok(pdim.rowKeys.includes('Opening stock') && pdim.rowKeys.includes(R.months[0]), 'production-month rows include opening stock and months');
// hand-checked cargo case (reuses the mini scenario)
const cg = M.cargoes.find(c => c.src === 'Opening'), ci = M.cargoes.find(c => c.src === 'Import');
const op = V.cargoProdSales(M, {}, cg.id), im2 = V.cargoProdSales(M, {}, ci.id);
near(op.get(k(2027, 0), k(2027, 0)), 20, 'cargo A(opening): produced Jan, sold Jan = 20');
near(op.get(k(2027, 0), k(2027, 1)), 40, 'cargo A(opening): produced Jan, sold Feb = 40');
near(op.get(k(2027, 1), k(2027, 1)), 16, 'cargo A(opening): produced Feb, sold Feb = 16');
near(op.get(k(2027, 1), E.END), 24, 'cargo A(opening): produced Feb, unsold = 24');
near(im2.get(k(2027, 1), k(2027, 1)), 24, 'import cargo: produced Feb, sold Feb = 24');
near(im2.get(k(2027, 1), E.END), 36, 'import cargo: produced Feb, unsold = 36');
const mcp = V.cargoByProduction(M, {});
near(mcp.pv.get(ci.id, 'Not yet consumed'), 40, 'import cargo: 40 not yet consumed');
near(mcp.pv.get(cg.id, k(2027, 0)), 60, 'opening cargo: 60 consumed in Jan');

// ---------- 6. robustness ----------
const bad = P.parseAoa([['', 'Crude Consumption Plan'], ['', 'Crude Grade', 'Nov-26'], ['', 'X', 10]]);
ok(!bad.ok, 'missing sheets flagged as error');

console.log(`OK - ${n} assertions passed`);
console.log('Summary:', JSON.stringify({ ...s, monthTotals: s.monthTotals.map(x => Math.round(x)) }));
R.checks.forEach(c => console.log(`[${c.level}] ${c.title}: ${c.detail}`));
