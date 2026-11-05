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
| Crude Consumption | Crude Grade, Benchmark, one column per production month |
| Product Yield | Product, Benchmark, one column per production month (volumes, not %) |
| Opening Crude | Crude Grade, **Pricing Month**, Volume (one row per pricing month; a grade may repeat) |
| Opening Product | Product, **Pricing Month**, Volume (one row per pricing month; a product may repeat) |
| Crude Imports | Crude Grade, Arrival Month, Pricing Month, Volume |
| Product Purchases (optional) | Product, Arrival **Date**, Pricing Month, Volume (optional "Arrival Half" column = 1 or 2) |
| Demand | Product, one column per sales month |

Any number of months. Every opening row must state its pricing month (missing ones are flagged and shown as "Pre-horizon"). The older single-sheet stacked layout is still accepted.

## Method

1. Crude is consumed FIFO per grade (oldest pricing month first).
2. Each month's production is a pro-rata blend of the crude consumed that month (yields are not grade-specific).
3. Products are sold in a configurable **sales priority**. Stock older than the previous month (incl. opening inventory) always goes first, oldest first. Then, by default: 1) previous month's production, 2) previous month's imports, 3) current month's imports arriving 1st-15th, 4) current month's production, 5) current month's imports arriving 16th-month end. Reorder these on the Product Layering page.
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
