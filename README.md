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
| Crude Imports | Crude Grade, Arrival Month, Pricing Month, Volume |
| Product Purchases (optional) | Product, Arrival **Date**, Pricing Month, Volume (optional "Arrival Half" column = 1 or 2) |
| Demand | Product, one column per sales month |

Any number of months. **Crude data should start earlier than product data**: opening product that was produced in an earlier month is traced to the crude consumed in that month, so crude consumption (and crude imports / opening crude) must reach back to the earliest production month listed in Opening Product. Example: product data from Jan-27, opening product made Sep-Dec 2026, crude data from Sep-26. Opening rows without a month are flagged and shown as "Pre-horizon"; opening production that cannot be traced (no crude data for its month) is flagged too. The older single-sheet stacked layout is still accepted.

## Display months (Settings)

Settings has a **Display from / to** window (default: the product horizon). Flow tables (sales and production month axes, percentages, cargo analysis) fold months outside the window into **Earlier months** / **Later months** columns so totals still tie; stock tables (month-end exposure, inventory, balances) and the margin tables show only the window. The dashboard figures and the Excel export follow the window; calculations always use the whole timeline.

## Method

1. Crude is consumed FIFO per grade (oldest pricing month first).
2. Each month's production is a pro-rata blend of the crude consumed that month (yields are not grade-specific).
3. Products are sold in a configurable **sales priority**. Stock older than the previous month (opening purchases, and production from before then) always goes first, oldest first; opening production from the month before the product data starts counts as "previous month's production". Then, by default: 1) previous month's production, 2) previous month's imports, 3) current month's imports arriving 1st-15th, 4) current month's production, 5) current month's imports arriving 16th-month end. Reorder these on the Product Layering page.
4. Each sale is traced back to the crude pricing month(s) behind it -> pricing month x sales month matrix.

### Crude Layering page extras

- **Percentage breakdown:** any row x column pairing of pricing month, production month, sales month, benchmark, grade, source or product, as % of each row, each column or the grand total (quick views for the common cases).
- **Cargo analysis:** a cargo is one import or opening-inventory crude layer. View each cargo by production month (when it is run), by sales month (when product made from it is sold), or production x sales for one cargo / all cargoes, in kb or % of cargo.

Shortfalls appear as **Unplanned** crude and **Unmet demand**; unknown pricing months as **Pre-horizon**.

## Run locally / test

```bash
node tests/serve.js 5173     # then open http://localhost:5173
node tests/test_engine.js    # engine + parser tests
```

## Deploy to GitHub Pages

Push the repo, then Settings -> Pages -> Deploy from branch -> `main` / root. No build step.
