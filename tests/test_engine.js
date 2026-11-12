// Run with: node tests/test_engine.js
const assert = require('assert');
const E = require('../js/engine.js');
const P = require('../js/parse.js');
const D = require('../js/demo.js');
const V = require('../js/views.js');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, m, tol = 1e-6) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); n++; };
const sum = a => a.reduce((s, x) => s + x, 0);
const k = (y, m) => y * 12 + m;

// ---------- 1. parse the multi-sheet demo ----------
const sheets = D.buildDemoSheets().map(s => ({ name: s.name, aoa: s.aoa }));
ok(sheets.length === 7, 'seven input worksheets');
const parsed = P.parseSheets(sheets);
ok(parsed.ok, 'demo parses without errors: ' + JSON.stringify(parsed.issues));
ok(parsed.issues.length === 0, 'no parse notes on the demo: ' + JSON.stringify(parsed.issues));
const inp = parsed.input;
ok(inp.months.length === 10 && inp.months[0] === k(2026, 8), 'timeline starts with the earliest crude month (Sep-26)');
ok(inp.productStart === k(2027, 0), 'product data starts Jan-27, later than crude');
ok(inp.crudes.length === 4 && inp.products.length === 6 && inp.demand.length === 6, 'row counts');
ok(inp.openCrude.length === 5, 'opening crude layers (a grade may have several pricing months)');
ok(inp.openProducts.length === 14, 'opening product rows');
ok(inp.openProducts.filter(r => r.source === 'Production').length === 12 && inp.openProducts.filter(r => r.source === 'Purchase').length === 2, 'opening product Source parsed');
ok(inp.crudeImports.length === 36 && inp.productPurchases.length === 3, 'import counts');
ok(inp.openCrude[0].pricing === P.monthKey('Jul-26'), 'opening crude pricing month parsed');
ok(inp.openProducts[0].month === P.monthKey('Oct-26'), 'opening product month parsed');
ok(inp.productPurchases.map(p => p.half).join() === '1,2,1', 'arrival half taken from the arrival date (5th, 22nd, 10th)');
ok(inp.crudeImports.every(r => r.loading === r.arrival - 1), 'loading month parsed, one month before arrival');
ok(P.monthKey(46327) === 2026 * 12 + 10, 'excel serial 46327 = Nov-26');
ok(P.monthKey('Nov 2026') === 2026 * 12 + 10 && P.monthKey('2026-11') === 2026 * 12 + 10 && P.monthKey('20-Jan-27') === 2027 * 12, 'text months');

const shuffled = sheets.slice().reverse().map(s => ({ ...s, name: s.name.toLowerCase() }));
ok(JSON.stringify(P.parseSheets(shuffled).input) === JSON.stringify(inp), 'sheet order / case do not matter');
const noDemand = P.parseSheets(sheets.filter(s => s.name !== 'Demand'));
ok(!noDemand.ok && noDemand.issues.some(i => /Demand/.test(i.msg)), 'missing Demand sheet is an error');
const noOpen = P.parseSheets(sheets.filter(s => !/^Opening/.test(s.name)));
ok(noOpen.ok && noOpen.issues.some(i => i.level === 'warn' && /Opening Crude/.test(i.msg)) && noOpen.issues.some(i => i.level === 'warn' && /Opening Product/.test(i.msg)), 'missing opening sheets warn (zero assumed)');
const noMonthCol = P.parseSheets(sheets.map(s => s.name === 'Opening Product' ? { name: s.name, aoa: s.aoa.map(r => [r[0], r[1], r[3]]) } : s));
ok(!noMonthCol.ok && noMonthCol.issues.some(i => /Month/.test(i.msg)), 'Opening Product needs a Month column');
const badSource = P.parseSheets(sheets.map(s => s.name === 'Opening Product' ? { name: s.name, aoa: s.aoa.map((r, i) => i === 1 ? [r[0], 'Mystery', r[2], r[3]] : r) } : s));
ok(!badSource.ok && badSource.issues.some(i => /Source/.test(i.msg)), 'unknown Source is an error');
const noSource = P.parseSheets(sheets.map(s => s.name === 'Opening Product' ? { name: s.name, aoa: s.aoa.map(r => [r[0], r[2], r[3]]) } : s));
ok(noSource.ok && noSource.issues.some(i => /Source/.test(i.msg)) && noSource.input.openProducts.every(r => r.source === 'Opening'), 'no Source column: warned, read as stock priced in that month');
const pp = sheets.find(s => s.name === 'Product Purchases');
const withHalf = P.parseSheets(sheets.map(s => s === pp ? { name: s.name, aoa: s.aoa.map((r, i) => i === 0 ? [...r, 'Arrival Half'] : [...r, i === 1 ? '2H' : '']) } : s));
ok(withHalf.input.productPurchases[0].half === 2 && withHalf.input.productPurchases[1].half === 2, 'Arrival Half column overrides the date');

// ---------- 2. run engine on demo ----------
const R = E.run(inp);
const s = R.summary;
ok(R.priority.join() === E.DEFAULT_PRIORITY.join(), 'default priority applied');
ok(R.months.length === 10 && R.pStart === 4 && R.productStart === k(2027, 0), 'timeline: 10 months, product horizon from index 4');
ok(R.prodBal.every(b => b.t >= R.pStart) && R.crudeBal.some(b => b.t === 0), 'product balances start with the product horizon, crude balances with the crude data');
ok(R.snaps.slice(0, R.pStart).every(sn => sn.every(r => r.kind === 'Crude inventory')), 'before the product horizon only crude is in stock');
near(s.totalConsumed, sum(inp.crudes.map(c => sum(Object.values(c.consumption)))), 'total consumption');
const supply = sum(inp.openCrude.map(c => c.volume)) + sum(inp.crudeImports.map(i => i.volume));
near(supply + s.totalShort - s.totalConsumed, s.endCrude, 'crude balance closes');
const prodSupply = sum(inp.openProducts.map(p => p.volume)) + sum(inp.productPurchases.map(p => p.volume)) + s.totalProduced;
near(prodSupply - s.totalSold, s.endProd, 'product balance closes');

const soldRows = R.expRows.filter(r => r.stage === 'Sold');
// Volumes on crude-sourced rows are CRUDE barrels: each product barrel carries C/P of crude, so the
// yield loss is not netted off. Non-crude rows (purchases, untraced stock) stay in product barrels.
const prodBarrels = rr => sum(rr.filter(r => r.src !== 'Crude').map(r => r.vol)) +
  sum(rr.filter(r => r.src === 'Crude').map(r => r.vol * (R.producedByMonth[R.months.indexOf(r.prodKey)] / R.consumedByMonth[R.months.indexOf(r.prodKey)])));
near(prodBarrels(soldRows), s.totalSold, 'converted back to product barrels, traced sales == met demand', 1e-6);
near(prodBarrels(R.expRows.filter(r => r.stage === 'Unsold product')), s.endProd, 'and traced unsold == ending product', 1e-6);
// each production month carries its whole crude run, not its product output
R.months.filter(m => m >= R.productStart).forEach(m => {
  const traced = sum(R.expRows.filter(r => r.src === 'Crude' && r.prodKey === m).map(r => r.vol));
  near(traced, R.consumedByMonth[R.months.indexOf(m)], 'crude barrels traced for ' + E.fmtMonth(m) + ' == crude run', 1e-6);
});
near(sum(R.expRows.filter(r => r.stage === 'Unconsumed crude').map(r => r.vol)), s.endCrude, 'unconsumed crude rows == ending crude');
R.months.forEach((mk, t) => {
  // Month-end exposure is in crude-equivalent barrels: product in tank carries the crude behind it,
  // so the total is at least the physical stock and exceeds it by the yield loss on that product.
  const snapTotal = sum(R.snaps[t].map(r => r.vol));
  const cInv = sum(R.crudeBal.filter(b => b.t === t).map(b => b.close));
  const pInv = sum(R.prodBal.filter(b => b.t === t).map(b => b.close));
  ok(snapTotal >= cInv + pInv - 1e-6, 'month-end exposure covers the physical stock at ' + E.fmtMonth(mk));
  const crudeOnly = sum(R.snaps[t].filter(r => r.kind === 'Crude inventory').map(r => r.vol));
  near(crudeOnly, cInv, 'the crude part still equals the crude in tank at ' + E.fmtMonth(mk), 1e-6);
});
R.prodBal.forEach(b => near(b.open + b.production + b.purchases - b.sales, b.close, `prod bal ${b.product} t${b.t}`, 1e-6));
R.crudeBal.forEach(b => near(b.open + b.receipts - b.consumed, b.close, `crude bal ${b.grade} t${b.t}`, 1e-6));
const pv = E.pivot(soldRows, r => r.pricing, r => r.sale);
near(pv.total, sum(soldRows.map(r => r.vol)), 'pivot total matches its rows');
ok(pv.total > s.totalSold, 'and exceeds the product volume sold, because crude barrels include the yield loss');

// opening product: labelled by source and month
ok(R.layerOrder.includes('Prod Oct-26 (opening stock)') && R.layerOrder.includes('Opening purchase (priced Nov-26)'), 'opening layers state source and month');
ok(!R.layerOrder.includes('Opening inventory'), 'no vague "Opening inventory" label');
const openProdVol = sum(inp.openProducts.filter(r => r.source === 'Production').map(r => r.volume));
// Production from before the product data starts is NOT traced to a crude blend: most of that
// month's output was sold before the data begins, so which crude remains is unknowable.
const octRows = R.expRows.filter(r => r.layer === 'Prod Oct-26 (opening stock)' && r.product === 'Gasoline 92');
near(sum(octRows.map(r => r.vol)), 100, 'the opening layer is fully accounted for (sold + unsold)');
ok(octRows.every(r => r.pricing === E.UNTRACED), 'pre-horizon production carries the "Not traceable" pricing');
ok(octRows.every(r => r.src === 'Pre-horizon production' && r.cargoId == null), 'it is not attributed to any cargo');
ok(octRows.every(r => r.prodKey === k(2026, 9)), 'its production month is still recorded');
// ... and it is therefore excluded from every crude view
ok(V.crudeRows(R).every(r => r.src === 'Crude'), 'crude rows exclude pre-horizon production');
const clProd = V.crudeLayering(R, {}, 'pricing', 'prod');
ok(!clProd.rowKeys.includes(E.UNTRACED), 'no "Not traceable" row in the crude layering');
ok(!clProd.colKeys.some(c => typeof c === 'number' && c < R.productStart), 'no pre-horizon production columns');
near(clProd.colTotals[clProd.colKeys.indexOf(E.EARLIER)], 0, 'the "Earlier months" bucket is empty on the production axis');
// the crude-layering production column equals that month's product OUTPUT, not the crude run
R.months.filter(m => m >= R.productStart).forEach(m => {
  near(clProd.colTotals[clProd.colKeys.indexOf(m)], R.consumedByMonth[R.months.indexOf(m)], 'crude layering column = crude run for ' + E.fmtMonth(m), 1e-6);
});
// the untraced volume is measured and reported rather than silently dropped
ok(R.approxMonths.length > 0 && R.approxMonths[0] === R.productStart, 'the first product month is flagged');
near(R.inferredBySale[R.productStart].vol, sum(R.expRows.filter(x => x.stage === 'Sold' && x.sale === R.productStart && x.src === 'Pre-horizon production').map(x => x.vol)), 'the flagged volume is the untraced volume');
ok(R.checks.some(c => /excluded from the crude layering/.test(c.title)), 'the exclusion is reported in the checks');
// sales order in the first product month: older opening production first, then the priority order
const gas = R.sales.filter(x => x.product === 'Gasoline 92' && x.sale === R.productStart);
ok(gas[0].layer === 'Prod Oct-26 (opening stock)' && gas[1].layer === 'Prod Nov-26 (opening stock)' && gas[2].layer === 'Prod Dec-26 (opening stock)', 'opening production sold oldest first; Dec-26 counts as previous month production: ' + gas.map(x => x.layer).join(' > '));
soldRows.forEach(r => { if (r.pricing !== E.PRE && r.pricing !== E.UNPLANNED && r.src === 'Crude') ok(r.pricing <= r.sale, 'pricing not after sale'); });
ok(R.shortfalls.length > 0 && R.unmet.length > 0, 'demo has a shortfall and unmet demand');
ok(R.shortfalls.every(x => x.t >= R.pStart), 'demo shortfall is in the product horizon only');
ok(R.checks.some(c => /Yield does not equal crude consumption/.test(c.title)), 'the yield gap is reported');
ok(!R.checks.some(c => /cannot be traced/.test(c.title)), 'demo opening production is fully traceable');
ok(s.waAge > 0 && s.waAge < 8, 'weighted-average age plausible: ' + s.waAge);
ok(s.peakMonth >= R.productStart, 'peak exposure is within the product horizon');

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

// ---------- 3b. hand-checked: opening product from earlier production / purchase, crude earlier than product ----------
// Crude Oct..Dec-26, product from Dec-26. Crude A: open 150 priced Aug; import arriving Nov priced Oct (150).
//  Oct: 100 from Aug layer. Nov: 50 Aug + 50 Oct-priced. Dec: 100 Oct-priced.
// Opening product (start of Dec): produced Oct 40, produced Nov 60, bought (priced Sep) 20. Dec production 100. Demand Dec 80.
const kO = k(2026, 9), kN = k(2026, 10), kD = k(2026, 11);
const early = E.run({
  months: [kO, kN, kD], productStart: kD,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kO]: 100, [kN]: 100, [kD]: 100 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kD]: 100 } }],
  openCrude: [{ grade: 'A', benchmark: 'B', volume: 150, pricing: k(2026, 7) }],
  openProducts: [
    { product: 'P', benchmark: 'C', volume: 40, source: 'Production', month: kO },
    { product: 'P', benchmark: 'C', volume: 60, source: 'Production', month: kN },
    { product: 'P', benchmark: 'C', volume: 20, source: 'Purchase', month: k(2026, 8) }
  ],
  crudeImports: [{ grade: 'A', arrival: kN, pricing: kO, volume: 150, benchmark: '' }],
  productPurchases: [], demand: [{ product: 'P', demand: { [kD]: 80 } }]
});
ok(early.pStart === 2 && early.prodBal.length === 1 && early.prodBal[0].open === 120, 'product horizon starts Dec; opening stock 120 kb');
// sale order Dec: opening purchase (old), Oct production (old, d=2), then Nov production (previous month's production) -> 20 + 40 + 20
ok(early.sales.filter(x => x.sale === kD && x.vol > 1e-9).map(x => `${x.layer}=${Math.round(x.vol)}`).join('; ') === 'Opening purchase (priced Sep-26)=20; Prod Oct-26 (opening stock)=40; Prod Nov-26 (opening stock)=20',
  'early-production sale order: ' + early.sales.filter(x => x.sale === kD && x.vol > 1e-9).map(x => `${x.layer}=${Math.round(x.vol)}`).join('; '));
const ep = E.pivot(early.expRows.filter(r => r.stage === 'Sold'), r => r.pricing, r => r.sale);
// Dec sells 20 from the Sep-priced opening purchase (exact: it states its own price) and 60 from
// pre-horizon production (40 made in Oct, 20 in Nov), which has no traceable crude behind it.
near(ep.get(k(2026, 8), kD), 20, 'early: the opening purchase keeps its stated Sep-26 pricing');
near(ep.get(E.UNTRACED, kD), 60, 'early: the 60 kb from pre-horizon production is "Not traceable"');
near(ep.get(k(2026, 7), kD), 0, 'early: nothing is attributed to Aug-priced crude any more');
near(ep.get(kO, kD), 0, 'early: nor to Oct-priced crude');
// it is excluded from the crude layering, so that page shows only Dec production
const ecl = V.crudeLayering(early, {}, 'pricing', 'prod', { start: kD, end: kD });
near(ecl.total, 100, 'early: the crude layering shows only the 100 kb produced in Dec');
ok(!ecl.rowKeys.includes(E.UNTRACED), 'early: no "Not traceable" row on the crude page');
// but the volume is not lost: it is still sold, and still in the product balance
near(early.summary.totalSold, 80, 'early: 80 kb is still sold in total');
near(sum(early.sales.filter(x => x.sale === kD).map(x => x.vol)), 80, 'early: product layering still shows all 80 kb');
near(early.inferredBySale[kD].vol, 60, 'early: 60 kb is reported as untraced');
near(early.inferredBySale[kD].share, 0.75, 'early: that is 75% of the month');
// production month is still known even though the crude is not
const epd = E.pivot(early.expRows.filter(r => r.stage === 'Sold'), r => r.prodKey, r => r.sale);
near(epd.get(kO, kD), 40, 'early: sold from Oct production = 40');
near(epd.get(kN, kD), 20, 'early: sold from Nov production = 20');
near(epd.get('Purchased product', kD), 20, 'early: sold from purchased stock = 20');
ok(early.snaps[0].every(r => r.kind === 'Crude inventory') && early.snaps[1].every(r => r.kind === 'Crude inventory'), 'Oct/Nov month-ends are crude only');
// production that cannot be traced (no crude data for that month) is flagged, not silently dropped
const untraced = E.run({
  months: [kD], productStart: kD,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kD]: 100 } }], products: [{ product: 'P', benchmark: 'C', production: { [kD]: 100 } }],
  openCrude: [{ grade: 'A', benchmark: 'B', volume: 100, pricing: kN }],
  openProducts: [{ product: 'P', benchmark: 'C', volume: 30, source: 'Production', month: kN }],
  crudeImports: [], productPurchases: [], demand: [{ product: 'P', demand: { [kD]: 30 } }]
});
ok(untraced.checks.some(c => /excluded from the crude layering/.test(c.title)), 'the exclusion is reported');
ok(untraced.expRows.filter(r => r.layer === 'Prod Nov-26 (opening stock)').every(r => r.pricing === E.UNTRACED), 'pre-horizon production shows as "Not traceable"');
near(untraced.summary.totalSold, 30, 'it is still sold and still counted in the volumes');
near(V.crudeLayering(untraced, {}, 'pricing', 'prod').total, 100, 'the crude layering shows only the 100 kb the model can trace');

// ---------- 4. sales priority ----------
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
let r1 = prioCase(300);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 1st half (priced Jan-27)=30; Purchase Mar-27 1st half (priced Feb-27)=50; Prod Mar-27=20',
  'default order: old stock, prev production, prev imports, current 1st-half imports, current production: ' + marSales(r1));
r1 = prioCase(400);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 1st half (priced Jan-27)=30; Purchase Mar-27 1st half (priced Feb-27)=50; Prod Mar-27=100; Purchase Mar-27 2nd half (priced Feb-27)=20',
  'default order: 2nd-half imports come last: ' + marSales(r1));
r1 = prioCase(300, ['prevProd', 'prevImp', 'curProd', 'curImp1', 'curImp2']);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 1st half (priced Jan-27)=30; Prod Mar-27=70',
  '4 before 3: current production sold before current 1st-half imports: ' + marSales(r1));
r1 = prioCase(400, ['prevProd', 'prevImp', 'curImp1', 'curImp2', 'curProd']);
ok(marSales(r1) === 'Prod Jan-27=100; Prod Feb-27=100; Purchase Feb-27 1st half (priced Jan-27)=30; Purchase Mar-27 1st half (priced Feb-27)=50; Purchase Mar-27 2nd half (priced Feb-27)=40; Prod Mar-27=80',
  '5 before 4: ' + marSales(r1));
r1 = prioCase(150, ['prevImp', 'prevProd', 'curImp1', 'curProd', 'curImp2']);
ok(marSales(r1) === 'Prod Jan-27=100; Purchase Feb-27 1st half (priced Jan-27)=30; Prod Feb-27=20', '2 before 1 (old stock still first): ' + marSales(r1));
ok(prioCase(10, ['x']).priority.join() === E.DEFAULT_PRIORITY.join(), 'invalid priority ignored');
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
ok(legacy.input.openCrude.length === 1 && legacy.input.openProducts.length === 1 && legacy.input.openProducts[0].source === 'Opening', 'legacy beginning-inventory columns become opening layers');
ok(legacy.issues.some(i => /Pricing Month/.test(i.msg)), 'legacy beginning inventory without pricing month is flagged');
const LR = E.run(legacy.input);
ok(LR.checks.some(c => c.level === 'warn' && /Opening product without pricing month/.test(c.title)), 'opening without pricing month is a warning');
ok(LR.layerOrder.includes('Opening inventory (pricing month not specified)'), 'unspecified pricing month is stated in the label');
ok(LR.checks.some(c => /Import without pricing month/.test(c.title)), 'missing import pricing month flagged and defaulted');
near(LR.summary.totalConsumed, 10, 'legacy consumption');

// ---------- 5b. cargo tracing + percentages ----------
R.cargoes.forEach(c => {
  const used = sum(R.cargoUse.filter(u => u.cargoId === c.id).map(u => u.vol));
  const left = sum(R.expRows.filter(r => r.stage === 'Unconsumed crude' && r.cargoId === c.id).map(r => r.vol));
  near(used + left, c.vol, 'cargo conserved: ' + c.label, 1e-6);
});
ok(R.cargoes.length === inp.openCrude.length + inp.crudeImports.length + R.shortfalls.length, 'one cargo per layer + one per shortfall');
ok(new Set(R.cargoes.map(c => c.label)).size === R.cargoes.length, 'cargo labels are unique');
// crude-linked product rows = production in the horizon + traced opening production
near(sum(R.expRows.filter(r => r.cargoId != null && r.cargoId >= 0 && (r.stage === 'Sold' || r.stage === 'Unsold product')).map(r => r.vol)), sum(R.months.filter(m => m >= R.productStart).map(m => R.consumedByMonth[R.months.indexOf(m)])), 'cargo-traced crude == crude run in the product horizon', 1e-6);
const cp = V.cargoByProduction(R, {}), cs = V.cargoBySales(R, {});
near(cp.pv.total, s.totalConsumed + s.endCrude, 'cargo x production total (consumed + not yet consumed)');
// By production month the cargo view covers every month of crude data; by sales month it can only
// cover crude run inside the product horizon, since earlier output is untraced.
const inHorizonRun = sum(R.months.filter(m => m >= R.productStart).map(m => R.consumedByMonth[R.months.indexOf(m)]));
near(cs.pv.total, inHorizonRun + s.endCrude, 'cargo x sales = crude run in the product horizon + crude still in tank', 1e-6);
near(cp.pv.total, s.totalConsumed + s.endCrude, 'cargo x production = all crude run + crude still in tank', 1e-6);
cs.list.forEach((c, i) => near(V.cargoProdSales(R, {}, c.id).total, cs.pv.rowTotals[i], 'per-cargo prod x sales == its sales row: ' + c.label, 1e-6));
ok(V.cargoFilter(R, { bench: 'Dubai' }).every(c => c.bench === 'Dubai'), 'cargo benchmark filter');
const pvv = V.crudeLayering(R, {}, 'pricing');
const prow = V.pct(pvv, 'row'), pcol = V.pct(pvv, 'col'), ptot = V.pct(pvv, 'total');
prow.rowKeys.forEach((rk, i) => { if (pvv.rowTotals[i] > 1e-9) near(sum(prow.colKeys.map(ck => prow.get(rk, ck))), 100, 'row % sums to 100', 1e-6); });
pcol.colKeys.forEach((ck, j) => { if (pvv.colTotals[j] > 1e-9) near(sum(pcol.rowKeys.map(rk => pcol.get(rk, ck))), 100, 'col % sums to 100', 1e-6); });
near(sum(ptot.rowKeys.flatMap(rk => ptot.colKeys.map(ck => ptot.get(rk, ck)))), 100, 'grand % sums to 100', 1e-6);
const pdim = V.crudeLayering(R, {}, 'prod', 'sale');
near(pdim.total, pvv.total, 'prod x sale total == pricing x sale total');
ok(pdim.rowKeys.includes('Purchased product') && pdim.rowKeys.includes(R.productStart) && pdim.rowKeys.includes(E.EARLIER), 'production-month rows: months, earlier-months bucket, purchased product');
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

// ---------- 5c. display window ----------
const def = V.resolveWin(R, undefined);
ok(def.start === R.productStart && def.end === R.months[9], 'default window = product horizon');
const full = { start: R.months[0], end: R.months[9] }, mid = { start: k(2027, 2), end: k(2027, 4) };
// flow tables: months outside the window fold into Earlier / Later, totals never change
['sale', 'prod'].forEach(cd => {
  const a = V.crudeLayering(R, {}, 'pricing', cd, full), b = V.crudeLayering(R, {}, 'pricing', cd, mid), c = V.crudeLayering(R, {}, 'pricing', cd);
  near(a.total, b.total, `window does not change the ${cd}-axis total (full vs narrow)`); near(a.total, c.total, `... nor default`);
});
const nb = V.crudeLayering(R, {}, 'pricing', 'sale', mid);
ok(nb.colKeys.filter(c => typeof c === 'number').join() === [k(2027, 2), k(2027, 3), k(2027, 4)].join(), 'narrow window shows only its months');
const crudeSold = soldRows.filter(r => r.src === 'Crude');   // the crude page excludes purchased product
near(nb.colTotals[nb.colKeys.indexOf(E.EARLIER)], sum(crudeSold.filter(r => r.sale < k(2027, 2)).map(r => r.vol)), 'Earlier-months bucket = sales before the window');
near(nb.colTotals[nb.colKeys.indexOf(E.LATER)], sum(crudeSold.filter(r => r.sale > k(2027, 4)).map(r => r.vol)), 'Later-months bucket = sales after the window');
const wideProd = V.crudeLayering(R, {}, 'pricing', 'prod', full);
ok(wideProd.colKeys.filter(c => typeof c === 'number').length === 10, 'full window offers every production month as a column');
near(wideProd.colTotals[wideProd.colKeys.indexOf(k(2026, 9))], 0, 'but pre-horizon production months are empty: that stock is untraced');
const defProd = V.crudeLayering(R, {}, 'pricing', 'prod');
near(defProd.colTotals[defProd.colKeys.indexOf(E.EARLIER)], 0, 'nothing lands in Earlier months on the production axis');
// stock tables: months outside the window are hidden
ok(V.monthEnd(R, 'pricing', '', {}, mid).colKeys.join() === [k(2027, 2), k(2027, 3), k(2027, 4)].join(), 'month-end table shows only window months');
ok(V.monthEnd(R, 'pricing', '', {}, full).colKeys.length === 10, 'month-end table can show the crude-only months');
ok(V.marginByBench(R, mid).colKeys.length === 3 && V.marginByBench(R, mid).total < V.marginByBench(R).total, 'margin table respects the window');
near(V.marginByBench(R).total, s.totalSold - sum(R.sales.filter(x => x.kind !== 'Production' && x.sale !== E.END).map(x => x.vol)), 'margin over the default window == production sold');
ok(V.productSummary(R, mid)[0].open > 0 || V.productSummary(R, mid).some(x => x.open > 0), 'product summary uses the first window month as opening');
// export builds with any window
const win0 = V.resolveWin(R, mid); ok(win0.start === mid.start && win0.end === mid.end, 'resolveWin keeps a valid window');
ok(V.resolveWin(R, { start: mid.end, end: mid.start }).start === mid.start, 'resolveWin swaps a reversed window');

// ---------- 5d. name normalisation ----------
// The canonical spelling stays in Crude Consumption / Product Yield; the later sheets are messy.
const MESSY_SHEETS = ['Opening Crude', 'Crude Imports', 'Demand', 'Opening Product', 'Product Purchases'];
const messy = D.buildDemoSheets().map(s => ({
  name: s.name,
  aoa: !MESSY_SHEETS.includes(s.name) ? s.aoa : s.aoa.map((row, i) => i === 0 ? row : row.map((v, j) => {
    if (j !== 0 || typeof v !== 'string') return v;
    if (v === 'Arab Light') return '  ARAB   Light ';          // case + leading/inner/trailing spaces
    if (v === 'Gasoline 92') return 'gasoline 92';             // case only
    return v;
  }))
}));
const mp2 = P.parseSheets(messy);
ok(mp2.ok, 'messy names still parse');
ok(mp2.input.crudes.some(c => c.grade === 'Arab Light') && !mp2.input.crudes.some(c => /ARAB/.test(c.grade)), 'ARAB   Light folds into Arab Light');
ok(mp2.input.products.some(c => c.product === 'Gasoline 92'), 'gasoline 92 folds into Gasoline 92');
ok(mp2.input.crudes.length === inp.crudes.length && mp2.input.products.length === inp.products.length, 'folding does not create extra rows');
const MR = E.run(mp2.input);
ok(MR.grades.length === R.grades.length && MR.products.length === R.products.length, 'engine sees the same universe');
near(MR.summary.totalSold, s.totalSold, 'folded names give the same result');
ok(mp2.issues.some(i => /also written as/.test(i.msg)), 'merges are reported');
ok(!mp2.issues.some(i => i.level === 'error'), 'merges are warnings, not errors');
// benchmark names fold too (so "Jet " and "jet" are one benchmark)
const bmess = D.buildDemoSheets().map(s => ({ name: s.name, aoa: s.aoa.map((row, i) => i === 0 || s.name !== 'Product Yield' ? row : row.map((v, j) => j === 1 && v === 'MOPS Jet/Kero' ? '  mops   jet/kero ' : v)) }));
const BR = E.run(P.parseSheets(bmess).input);
ok(BR.prodBench['Jet/Kero'] === 'mops jet/kero', 'benchmark text is trimmed and inner spaces collapsed');
ok(V.benchmarks(BR).length === V.benchmarks(R).length, 'no extra benchmark is created by the respacing');
// two products written with different spellings of one benchmark end up in a single group
const jmess = D.buildDemoSheets().map(s => ({ name: s.name, aoa: s.aoa.map((row, i) => i === 0 || s.name !== 'Product Yield' ? row : row.map((v, j) => j === 1 && v === 'MOPS Naphtha' ? ' mops   JET/KERO ' : v)) }));
const JR = E.run(P.parseSheets(jmess).input);
ok(JR.prodBench['Naphtha'] === JR.prodBench['Jet/Kero'], 'Naphtha and Jet/Kero now share one benchmark');
ok(V.benchmarks(JR).length === V.benchmarks(R).length - 1, 'the two products report as one benchmark group');
ok(V.productSummary(JR).find(x => x.bench === 'MOPS Jet/Kero').products === 2, 'the benchmark group covers both products');

// ---------- 5e. zero tolerance ----------
const kA = k(2027, 0);
const gapCase = tol => E.run({
  months: [kA], productStart: kA,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kA]: 100 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kA]: 100 } }],
  openCrude: [{ grade: 'A', benchmark: 'B', volume: 99.7, pricing: k(2026, 11) }], openProducts: [],
  crudeImports: [], productPurchases: [], demand: [{ product: 'P', demand: { [kA]: 50 } }]
}, tol == null ? undefined : { tolerance: tol });
const gTol = gapCase();          // default 0.5 kb: a 0.3 kb gap is rounding
const gRaw = gapCase(0);         // no tolerance: the old behaviour
ok(!gTol.cargoes.some(c => c.src === 'Unplanned'), 'sub-tolerance gap creates no unplanned cargo');
ok(gTol.shortfalls.length === 0 && gTol.tinyGaps.length === 1, 'sub-tolerance gap is recorded as a tiny gap');
ok(gTol.checks.some(c => /Tiny crude gaps ignored/.test(c.title)), 'ignored gap is still reported in the checks');
ok(!gTol.expRows.some(r => r.pricing === E.UNPLANNED), 'no Unplanned pricing row that would print as 0 kb');
ok(gRaw.cargoes.some(c => c.src === 'Unplanned'), 'with tolerance 0 the tiny gap does become an unplanned cargo');
near(gRaw.shortfalls[0].vol, 0.3, 'and it is the 0.3 kb that was missing', 1e-9);
near(gTol.summary.endCrude, 0, 'tolerance case still closes the crude balance');
gTol.crudeBal.forEach(b => near(b.open + b.receipts - b.consumed, b.close, 'crude balance closes under tolerance'));
ok(R.shortfalls.length === 1 && R.shortfalls[0].vol === 100, 'the demo 100 kb shortfall is well above tolerance and still reported');

// ---------- 5f. crude page excludes purchased product ----------
ok(V.crudeRows(R).every(r => r.src === 'Crude'), 'crude rows are own crude only');
const withPurch = R.expRows.filter(r => r.src !== 'Crude');
ok(withPurch.length > 0, 'the demo does have purchased/opening product exposure');
near(V.crudeLayering(R, {}, 'pricing').total, sum(V.crudeRows(R).map(r => r.vol)), 'crude layering total excludes purchased product');
ok(!V.crudeLayering(R, {}, 'grade').rowKeys.includes('Purchased product'), 'no "Purchased product" row on the crude page');

// ---------- 5g. margin exposure = refinery production only ----------
const mb2 = V.marginByBench(R);
const prodSold = sum(R.sales.filter(x => x.kind === 'Production' && x.sale !== E.END).map(x => x.vol));
const purchSold = sum(R.sales.filter(x => x.kind !== 'Production' && x.sale !== E.END).map(x => x.vol));
near(mb2.total, prodSold, 'crack exposure counts production volume only');
ok(purchSold > 0, 'the demo sells purchased product too');
near(s.totalSold - mb2.total, purchSold, 'the excluded volume is exactly the purchased product');
ok(mb2.rowKeys.every(b => V.benchmarks(R).includes(b)), 'margin rows are product benchmarks');
near(V.marginByProdMonth(R).total, mb2.total, 'crack by production month ties to crack by benchmark');
// opening stock that was produced counts as production; opening purchases do not
const openProdSold = sum(R.sales.filter(x => x.opening && x.kind === 'Production' && x.sale !== E.END).map(x => x.vol));
ok(openProdSold > 0, 'opening production is sold in the demo');
ok(sum(R.sales.filter(x => x.opening && x.kind === 'Purchase' && x.sale !== E.END).map(x => x.vol)) > 0, 'opening purchases are sold too');
near(V.pct(mb2, 'col').colTotals.filter(x => x > 0).length, V.pct(mb2, 'col').colTotals.filter(x => x > 0).length, 'percentage view builds');

// ---------- 5h. product layering by benchmark, purchases split by pricing month ----------
ok(V.benchmarks(R).length === R.products.length, 'demo has one product per benchmark');
const psum = V.productSummary(R);
near(sum(psum.map(x => x.sales)), s.totalSold, 'product summary sales tie to total sold');
ok(psum.every(x => !('coverDays' in x)), 'closing cover is gone');
const purchLabels = R.layerOrder.filter(l => R.layerType[l] === 'Purchase');
ok(purchLabels.every(l => /priced /.test(l)), 'every purchase layer names its pricing month: ' + purchLabels.join(' | '));
// two cargoes, same arrival half, different pricing months -> two rows
const kS = k(2027, 0), kT = k(2027, 1);
const twoBuys = E.run({
  months: [kS, kT], productStart: kS,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kS]: 10, [kT]: 10 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kS]: 10, [kT]: 10 } }],
  openCrude: [{ grade: 'A', benchmark: 'B', volume: 100, pricing: k(2026, 11) }], openProducts: [],
  crudeImports: [],
  productPurchases: [
    { product: 'P', arrival: kT, pricing: k(2026, 10), volume: 30, benchmark: '', half: 1 },
    { product: 'P', arrival: kT, pricing: k(2026, 11), volume: 40, benchmark: '', half: 1 }
  ],
  demand: [{ product: 'P', demand: { [kT]: 60 } }]
});
const buyRows = twoBuys.layerOrder.filter(l => twoBuys.layerType[l] === 'Purchase');
ok(buyRows.length === 2, 'same arrival half + different pricing months = two separate rows: ' + buyRows.join(' | '));
ok(buyRows[0].includes('Nov-26') && buyRows[1].includes('Dec-26'), 'purchase rows are ordered by pricing month');
const pl = V.productLayering(twoBuys, '', { start: kS, end: kT });
near(pl.get(buyRows[0], kT) + pl.get(buyRows[1], kT), 60 - pl.get('Prod Jan-27', kT) - pl.get('Prod Feb-27', kT), 'both purchase rows carry their own volume');
// the source filter splits the same table into production and purchase rows
const onlyProd = V.productLayering(R, '', undefined, 'Production'), onlyBuy = V.productLayering(R, '', undefined, 'Purchase');
ok(onlyProd.rowKeys.every(l => R.layerType[l] === 'Production') && onlyBuy.rowKeys.every(l => R.layerType[l] === 'Purchase'), 'source filter keeps only its own rows');
near(onlyProd.total + onlyBuy.total, V.productLayering(R, '').total, 'production + purchase rows = all rows');
// benchmark filter
const oneBench = V.productLayering(R, 'MOPS Jet/Kero');
near(oneBench.total, sum(R.sales.filter(x => x.pbench === 'MOPS Jet/Kero').map(x => x.vol)), 'benchmark filter on product layering');

// ---------- 5i. month-end never counts a future pricing month ----------
// A cargo that has arrived but is priced later is physically in tank yet carries no price exposure.
const kO2 = k(2026, 10), kN2 = k(2026, 11), kJ2 = k(2027, 0);
const lateP = E.run({
  months: [kO2, kN2, kJ2], productStart: kJ2,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kJ2]: 100 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kJ2]: 100 } }],
  openCrude: [], openProducts: [],
  crudeImports: [{ grade: 'A', arrival: kO2, pricing: kN2, volume: 500, benchmark: '' }],
  productPurchases: [], demand: [{ product: 'P', demand: { [kJ2]: 50 } }]
});
const lme = V.monthEnd(lateP, 'pricing', '', {}, { start: kO2, end: kJ2 });
near(lme.get(kN2, kO2), 0, 'the future pricing month shows nothing in the earlier month-end');
near(sum(lme.colKeys.map(ck => ck === kO2 ? lme.colTotals[lme.colKeys.indexOf(ck)] : 0)), 0, 'arrived but unpriced: no exposure at all at that month-end');
near(lme.get(kN2, kN2), 500, 'once the pricing month arrives it becomes priced exposure');
ok(lateP.unpricedAtEnd.length === 1 && lateP.checks.some(c => /not yet priced/i.test(c.title)), 'the unpriced volume is reported in the checks');
near(sum(lateP.unpricedAtEnd.map(x => x.vol)), 500, 'and the reported volume is the full cargo');
// exposure + unpriced still ties to the physical closing stock: nothing is lost, only set aside
lateP.months.forEach((mk, t) => {
  const snapTot = sum(lateP.snaps[t].map(r => r.vol));
  const unp = sum(lateP.unpricedAtEnd.filter(x => x.t === t).map(x => x.vol));
  const inv = sum(lateP.crudeBal.filter(b => b.t === t).map(b => b.close)) + sum(lateP.prodBal.filter(b => b.t === t).map(b => b.close));
  near(snapTot + unp, inv, 'exposure + unpriced = closing stock at ' + E.fmtMonth(mk));
});
// the demo prices every cargo before arrival, so nothing is ever unpriced there
ok(R.unpricedAtEnd.length === 0, 'demo has no unpriced month-end crude');
R.snaps.forEach((sn, t) => sn.forEach(r => {
  if (typeof r.pricing === 'number' && r.pricing !== E.PRE && r.pricing !== E.UNPLANNED && r.pricing !== E.UNPRICED && r.pricing !== E.UNTRACED)
    ok(r.pricing <= R.months[t], 'no future pricing month in a month-end snapshot');
}));

// ---------- 5j. crude consumption order: arrival (default) vs pricing ----------
// Grade A, one consumption month. Two cargoes already in tank:
//   cargo X arrived Jan, priced Feb (short lag);  cargo Y arrived Feb, priced Jan (long lag).
// Arrival order runs X first; pricing order runs Y first. 100 kb is consumed, each cargo is 80 kb.
const kJa = k(2027, 0), kFe = k(2027, 1), kMa = k(2027, 2);
const mixIn = {
  months: [kJa, kFe, kMa], productStart: kMa,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [kMa]: 100 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kMa]: 100 } }],
  openCrude: [], openProducts: [],
  crudeImports: [
    { grade: 'A', arrival: kJa, pricing: kFe, volume: 80, benchmark: '' },   // X
    { grade: 'A', arrival: kFe, pricing: kJa, volume: 80, benchmark: '' }    // Y
  ],
  productPurchases: [], demand: [{ product: 'P', demand: { [kMa]: 100 } }]
};
const byArr = E.run(mixIn), byPrc = E.run(mixIn, { crudeOrder: 'pricing' });
ok(byArr.crudeOrder === 'arrival', 'arrival order is the default');
const pa = E.pivot(byArr.expRows.filter(r => r.stage === 'Sold'), r => r.pricing, r => r.sale);
const pp2 = E.pivot(byPrc.expRows.filter(r => r.stage === 'Sold'), r => r.pricing, r => r.sale);
// arrival order: all 80 of X (priced Feb) then 20 of Y (priced Jan)
near(pa.get(kFe, kMa), 80, 'arrival order: 80 kb of the Jan-arriving / Feb-priced cargo is sold');
near(pa.get(kJa, kMa), 20, 'arrival order: 20 kb of the Feb-arriving / Jan-priced cargo is sold');
// pricing order: all 80 of Y (priced Jan) then 20 of X (priced Feb)
near(pp2.get(kJa, kMa), 80, 'pricing order: the Jan-priced cargo goes first');
near(pp2.get(kFe, kMa), 20, 'pricing order: only 20 kb of the Feb-priced cargo');
ok(pa.get(kFe, kMa) !== pp2.get(kFe, kMa), 'the two orders really do give different pricing x sales results');
near(byArr.summary.totalSold, byPrc.summary.totalSold, 'but the same total volume is sold');
near(byArr.summary.endCrude, byPrc.summary.endCrude, 'and the same crude is left');

// ---------- 5k. layer columns (product layering rows split into fields) ----------
const li = R.layerInfo;
ok(Object.keys(li).length === R.layerOrder.length, 'every layer has its parts recorded');
const aPurch = R.layerOrder.find(l => R.layerType[l] === 'Purchase' && !li[l].opening);
ok(li[aPurch].kind === 'Purchase' && typeof li[aPurch].arrival === 'number' && typeof li[aPurch].pricing === 'number' && li[aPurch].half > 0,
  'a purchase row carries source, arrival month, half and pricing month separately');
const aProd = R.layerOrder.find(l => R.layerType[l] === 'Production' && !li[l].opening);
ok(li[aProd].kind === 'Production' && typeof li[aProd].month === 'number' && li[aProd].pricing === null, 'a production row has a production month and a blended price');
const anOpen = R.layerOrder.find(l => li[l].opening && R.layerType[l] === 'Production');
ok(anOpen && li[anOpen].opening === true && typeof li[anOpen].month === 'number', 'opening production keeps its production month');

// ---------- 5l. opening purchases follow the sales priority by their month ----------
// Product starts Dec. Opening stock: produced Nov 100, bought (priced Nov) 100, bought (priced Sep) 50.
// Priority says previous month's PRODUCTION (1) before previous month's IMPORTS (2), and anything
// older than that first. So Dec demand should draw: Sep purchase (old), then Nov production, then Nov purchase.
const kNo = k(2026, 10), kDe = k(2026, 11);
const op2 = E.run({
  months: [k(2026, 9), kNo, kDe], productStart: kDe,
  crudes: [{ grade: 'A', benchmark: 'B', consumption: { [k(2026, 9)]: 100, [kNo]: 100, [kDe]: 100 } }],
  products: [{ product: 'P', benchmark: 'C', production: { [kDe]: 100 } }],
  openCrude: [{ grade: 'A', benchmark: 'B', volume: 400, pricing: k(2026, 8) }],
  openProducts: [
    { product: 'P', benchmark: 'C', volume: 100, source: 'Production', month: kNo },
    { product: 'P', benchmark: 'C', volume: 100, source: 'Purchase', month: kNo },
    { product: 'P', benchmark: 'C', volume: 50, source: 'Purchase', month: k(2026, 8) }
  ],
  crudeImports: [], productPurchases: [], demand: [{ product: 'P', demand: { [kDe]: 200 } }]
});
const decOrder = op2.sales.filter(x => x.sale === kDe && x.vol > 1e-9).map(x => x.layer + '=' + Math.round(x.vol));
ok(decOrder.join('; ') === 'Opening purchase (priced Sep-26)=50; Prod Nov-26 (opening stock)=100; Opening purchase (priced Nov-26)=50',
  'previous-month production is sold before the previous-month opening purchase: ' + decOrder.join('; '));
ok(op2.layerType['Opening purchase (priced Nov-26)'] === 'Purchase', 'an opening purchase still reports as a purchase');
// it is opening stock, not a purchase receipt of that month
const dbal = op2.prodBal.find(b => b.month === kDe);
near(dbal.open, 250, 'all three opening layers are opening stock in the first product month');
near(dbal.purchases, 0, 'and none of them counts as a purchase receipt');
near(dbal.open + dbal.production + dbal.purchases - dbal.sales, dbal.close, 'the product balance still closes');

// ---------- 6. robustness ----------
const bad = P.parseAoa([['', 'Crude Consumption Plan'], ['', 'Crude Grade', 'Nov-26'], ['', 'X', 10]]);
ok(!bad.ok, 'missing sheets flagged as error');

console.log(`OK - ${n} assertions passed`);
console.log('Summary:', JSON.stringify({ ...s, monthTotals: s.monthTotals.map(x => Math.round(x)) }));
R.checks.forEach(c => console.log(`[${c.level}] ${c.title}: ${c.detail}`));
