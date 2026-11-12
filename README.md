# Exposure Layering

A browser-only tool that traces a refinery's commodity exposure from **crude pricing month** through to **product sales month**.

- **Crude inventory exposure** - from the month crude is priced until the product made from it is sold.
- **Margin exposure** - the product crack during the sales month (volume sold per month).

Volumes are in thousand barrels (kb).

## Privacy

- 100% client-side static site: no backend, no analytics, no cookies, no `localStorage`.
- A Content-Security-Policy (`connect-src 'none'`) stops the page making any network request, so inputs cannot be sent anywhere.
- Inputs must be loaded each session; everything is gone on refresh. Use **Export** to save results locally.
- `.gitignore` blocks `*.xlsx` / `*.csv` so real data files are not committed (and therefore not published).
- SheetJS and Chart.js are bundled in `vendor/` (no CDN requests).

## Input layout (one worksheet per input)

Use **Data Input -> Download template** for a ready example. Sheet names are matched by keyword:

| Worksheet | Columns |
|---|---|
| Crude Consumption | Crude Grade, Benchmark, one column per month - **starts earlier than the product data** |
| Product Yield | Product, Benchmark, one column per production month (volumes, not %) - first month = first product month |
| Opening Crude | Crude Grade, **Pricing Month**, Volume - crude stock at the **start of the crude data** (one row per pricing month) |
| Opening Product | Product, **Source** (Production or Purchase), **Month**, Volume - stock at the start of the first product month. Month = production month for Production, pricing month for Purchase |
| Crude Imports | Crude Grade, **Loading Month** (optional, informational), Arrival Month, Pricing Month, Volume |
| Product Purchases (optional) | Product, Arrival **Date**, Pricing Month, Volume (optional "Arrival Half" column = 1 or 2) |
| Demand | Product, one column per sales month |

Any number of months. **Crude data should start earlier than product data**: opening product that was produced in an earlier month is traced to the crude consumed in that month, so crude consumption (and crude imports / opening crude) must reach back to the earliest production month listed in Opening Product. Example: product data from Jan-27, opening product made Sep-Dec 2026, crude data from Sep-26. Opening rows without a month are flagged and shown as "Pre-horizon"; opening production that cannot be traced (no crude data for its month) is flagged too. The older single-sheet stacked layout is still accepted.

### Names

Crude grade, product and benchmark names are matched ignoring case and extra spaces, so `ARAB  Light`, `arab light` and `Arab Light` are one grade. The first spelling in the file is the one displayed (so `SRFO 180 3.5%S` and `Jet A-1` keep their capitalisation), and every merge is listed in Data Checks.

## Settings

- **Display from / to** (default: the product horizon). Flow tables (sales and production month axes, percentages, cargo analysis) fold months outside the window into **Earlier months** / **Later months** columns so totals still tie; stock tables (month-end exposure, inventory, balances) and the margin tables show only the window. The dashboard figures and the Excel export follow the window; calculations always use the whole timeline.
- **Zero tolerance** (default 0.5 kb). A crude shortfall smaller than this is treated as rounding rather than unplanned crude, so it no longer appears as a 0 kb "Unplanned" row. Ignored gaps are still listed in Data Checks.
- **Crude consumption order** (default: arrival month). Which layer of a grade is drawn down first — physical FIFO by arrival, or oldest priced layer first. The two only differ when the pricing lag varies between cargoes, and they change the pricing x sales result, so this is the first setting to check if hand calculations disagree.
- **Loading month** show/hide in the cargo tables.

## Tables

Every analysis table has sortable column headers (click once for descending, again for ascending, then a reset button), a row filter box, and — for long tables — a sticky header row and first column inside their own scroll area. Month columns sort chronologically, not alphabetically. A value that is not zero but would round to zero shows as `<1`, never a misleading `0`.

Row labels are split into their own columns rather than packed into one string, so they can be sorted and filtered individually: cargoes by crude grade / loading / arrival / pricing month, and product layers by source / production or arrival month / half / pricing month.

## Month-end exposure

A month-end column counts a barrel only once it is both in tank and **priced**. Crude that has arrived but whose pricing month is still ahead carries no flat-price exposure yet, so it is excluded from the month-end exposure figures (and from the dashboard) rather than counted against a future month. It stays in the Balances closing stock, and the excluded volume per month is listed in Data Checks, so exposure + not-yet-priced = closing stock.

## Products and benchmarks

All product analysis is grouped by **product benchmark**, so products priced off the same index (for example Jet and Kerosene under `Jet`) are reported together. Physical layering stays per product, because demand arrives per product; only the reporting is aggregated.

## What the crude layering can and cannot trace

Product made **before the product data starts** has no traceable crude behind it. The crude run in
those months is known, but most of that output was already sold before the data begins and those
sales are not in the file, so there is no way to say which crude remains in the stock that is left.
Assigning it a pricing month would be a guess.

That volume is therefore **excluded** from the Crude Layering page, the percentage breakdown and the
cargo analysis. The affected sales months are marked `*` with a banner giving the volume and share,
and the same figures appear in Data Checks and the export. It is still counted in Product Layering,
Margin Exposure and the month-end profile, where it shows as **Not traceable** — nothing is lost,
it is simply not attributed to a pricing month. The same limitation applies to doing the layering
by hand. Later months are unaffected: on a representative file the first month is around 65-68%
untraceable, the second about 1-5%, and the rest clean.

### Crude barrels or product barrels

The two pages count different things, which is why their monthly totals differ:

- **Crude Layering** counts **product** barrels traced back to crude, so a production-month column
  equals that month's product output.
- **Cargo Analysis** (by production month) counts **crude** barrels, so it equals that month's crude run.

The gap between them is the yield loss. If October runs 5,028 kb of crude at a 92.7% yield, the
cargo analysis shows 5,028 and the crude layering shows 4,659.

## Method

1. Crude is consumed FIFO per grade, in arrival order by default (ties broken by pricing month); switchable to pricing order in Settings.
2. Each month's production is a pro-rata blend of the crude consumed that month (yields are not grade-specific).
3. Products are sold in a configurable **sales priority**. Stock older than the previous month (opening purchases, and production from before then) always goes first, oldest first; opening production from the month before the product data starts counts as "previous month's production". Then, by default: 1) previous month's production, 2) previous month's imports, 3) current month's imports arriving 1st-15th, 4) current month's production, 5) current month's imports arriving 16th-month end. Reorder these on the Product Layering page.
4. Each sale is traced back to the crude pricing month(s) behind it -> pricing month x sales month matrix.

Worked example. Crude A: 100 kb opening priced Dec-26, plus 100 kb arriving Feb-27 priced Jan-27. Consumption 60 in Jan, 100 in Feb; production equals consumption; demand 20 in Jan, 80 in Feb.

- Jan consumes 60 from the Dec-26 layer, so Jan production is 100% Dec-26-priced. Feb consumes the last 40 of Dec-26 plus 60 of Jan-27, so Feb production is 40% Dec-26 / 60% Jan-27.
- Jan sells 20 kb from Jan production (all Dec-26). Feb sells 80 kb: 40 kb from Jan production (previous month's production), then 40 kb from Feb production, which splits into 16 Dec-26 and 24 Jan-27.
- Result: Dec-26 -> Jan-27 = 20, Dec-26 -> Feb-27 = 56, Jan-27 -> Feb-27 = 24.

### Crude Layering page

Own crude only — purchased and opening-purchase product carries product flat-price exposure, not crude exposure, and is reported on Product Layering.

- **Columns:** the main table switches between **sales month** and **production month** columns, so you can see when crude was run as well as when the product left.
- **Percentage breakdown:** any row x column pairing of pricing month, production month, sales month, crude benchmark, crude grade or product benchmark, as % of each row, each column or the grand total (quick views for the common cases).
- **Cargo analysis:** a cargo is one import or opening-inventory crude layer, with crude grade, loading month, arrival month and pricing month in separate columns. View each cargo by production month (when it is run), by sales month (when product made from it is sold), or production x sales for one cargo / all cargoes, in kb or % of cargo.

### Margin Exposure page

Crack exposure counts **refinery production only** — a crack is a product price against a crude price, so purchased product (bought in the horizon, or held as opening purchase stock) has no crude leg and is excluded. Opening stock with `Source = Production` does count. Tables switch between kb and % of each sales month.

Shortfalls appear as **Unplanned** crude and **Unmet demand**; unknown pricing months as **Pre-horizon**.

## Run locally / test

```bash
node tests/serve.js 5173     # then open http://localhost:5173
node tests/test_engine.js    # engine + parser tests
```

## Deploy to GitHub Pages

Push the repo, then Settings -> Pages -> Deploy from branch -> `main` / root. No build step.
