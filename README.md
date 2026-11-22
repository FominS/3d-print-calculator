# PrintBench — your home 3D printing workbench

**English** · [Русский](README.ru.md)

PrintBench (formerly 3D Print Calculator) is a browser-based workbench for hobby 3D printing: a print cost calculator, item catalog, filament spool inventory, print log and printer maintenance in one place. No backend and no account: your data stays in your browser, in a folder on your computer or in your own Google Drive.

**Live:** https://fomins.github.io/3d-print-calculator/

Interface language: Russian. Built around a Bambu Lab P2S Combo, works with any FDM printer.

## Features

### Home dashboard
- The start page: statistics for the current month, or for another month, a year or all time.
- Prints (successful and failed), printed items, printer time, filament used by material, total cost by category, failure rate and cost of failures.
- Charts by day or month, cost structure, filament by material, the last 5 prints and spools that are running low.
- Quick actions: log a print, calculate a print, add an item.
- Built from actual print log records: grams written off the spools and the recorded print time. Catalog estimates are not used.

### Calculator
- Main fields only (material, grams, time) with the total shown instantly. The breakdown, printer, extra costs and prototypes are in expandable blocks.
- "Save as item" is a separate step.
- Cost breakdown: filament, electricity, printer depreciation, maintenance, extra costs.
- Print time as hours + minutes with a 0–48 h slider. Decimal hours (`2.5`, `2,5`) and `2:30` are accepted too.
- Printer selection and prototypes (test prints) counted separately as development cost.
- Save to the catalog in one click and continue on the item page.

### Item catalog and item page
- A tree table or cards with photos, plus search, filters (status, material) and sorting. The table shows top-level items and their parts with collapsible branches; assemblies show whole-assembly weight, time and cost. Search and filters switch to a flat list with each item's assembly path.
- The item page has two tabs: **Overview** and **Print log**. "Log a print" is the main action. The ⋯ menu has Move in hierarchy, MakerWorld description, Duplicate and Delete.
- Status (idea / in progress / done / published), tags, notes, printer, extra costs.
- Links with one-click presets for MakerWorld, Thingiverse and Printables. Titles are detected from the URL.
- **Print**: quantity, time per piece and several filaments (AMS multicolor) — one such profile per item.
- **Parts are nested items.** An assembly part is a separate item with its own filaments, time, photos and log. “+ Part” in the Composition block creates a nested item. Any depth, no cycles.
- **Prototypes**: version, date, filament, spool, time and a "what changed" note.
- Print settings, photos (stored in the selected storage, resized to 1600 px) and a cover image.
- **MakerWorld description generator** (RU/EN) built from the item, its parts and print settings, in a separate dialog.
- **“⇄ Structure” mode** on the Items page moves items in the hierarchy, like Confluence's “view in hierarchy”: drag a row onto another item or use “⇄ Move” → “↳ Here”; “⇤” moves one level up. Changes apply on Save, and Cancel restores everything. From the item page: ⋯ → Move in hierarchy.
- The item creation date can be changed on the Overview tab.
- Deleting an item keeps its print log entries (name, time, filament usage) and only drops the link. An assembly can be deleted with all nested items or alone, in which case nested items move one level up. Duplicating copies the assembly with its parts.
- On first launch of this version, items with several parts become assemblies automatically and print records for those parts move to the nested items. A data snapshot is saved before the migration (Settings → snapshot history).

### Filament spools
- Compact cards or a table, with filters by material, brand and availability. Spools that are running low are highlighted.
- The spool form shows the main fields first. Technical details (diameter, empty weight, dates, store) are in an expandable block.
- Brand, series, color, net weight, diameter, price, store, purchase / opened / dried dates.
- Remaining amount in grams and meters, a low-stock warning and spool history.
- Correct the remaining amount manually (grams or meters) or by weighing the spool. The empty spool weight is derived from a new sealed spool.
- **Spool review**: 1–5 ★ rating, pros and issues tags (stringing, wet, warping, clogs…) and a comment, plus the failed print rate for this spool from the log.
- **Libraries** in Settings:
  - brands with their filament series;
  - stores;
  - color palette with **multicolor / rainbow** colors (gradients).
- Quick picks in the spool form. New values are remembered automatically, and renaming a library entry updates the spools that use it.

### Print log
- Timeline, by month, by year or as a table, with filters by result and item.
- Each record stores the print time. Success or failure is set with one button, and ↻ repeats a print with the same spools, grams and time.
- "Log a print" from the item page deducts filament from the chosen spools. Failed prints are recorded too.
- Any record can be edited (✎): date, result, sets, time, printer, note and spool usage. Spool levels are recalculated automatically.
- When logging a print of an assembly you can pick “This item only” or “Whole assembly”, which counts time and filament for all nested items.
- Any record can be linked to a catalog item (⛓): the item itself, the whole assembly or one nested part (plate), or turned into a new part or a new item using the print's grams and time. An assembly counts as printed when all its parts are done.
- Bambu Cloud task images in the log; Items → ⇣ Models from Bambu Cloud creates items from print history: model with image, several plates become an assembly with one nested item per plate, MakerWorld link.
- View by month, by year or as a flat list, with totals per period: prints, sets, failures, filament, cost.
- **Import from Bambu Lab Cloud** (P2S, P1S, X1, A1): your printer's print history is pulled into the log with real print time, result and per-AMS-slot filament usage. Items and spools are matched automatically by model name, filament type and color. Works through a free Cloudflare Worker, see [docs/bambu-cloud-setup.md](docs/bambu-cloud-setup.md).
- **Spool sync with Bambu Cloud** (Spools → ⇣ Sync with Bambu Cloud): remaining weight of Bambu Lab RFID spools as reported by the AMS is recorded as a "set remaining" entry, and missing spools are created automatically.

### Printer
- Runtime from the print log and prototypes (plus hours before tracking), daily load, success rate, depreciation resource, monthly stats.
- **P2S maintenance schedule** based on Bambu Lab recommendations: X/Y/Z lubrication with usage-based intervals, idler pulleys, air filter, filament cutter, camera and on-condition tasks. Mark tasks done, set custom intervals, see warnings on the dashboard and in the menu.
- From Bambu Cloud: online status, current print, firmware and available updates, tasks not yet imported.

### Statistics
- Totals and averages, cost structure, by material, by month.
- Prototype costs, filament in stock and printer wear by depreciation hours, per printer.
- **Brands and filaments**: average spool rating per brand × material, failed print rate, price per kg, common tags and the best brand per material.

### Printers
- Several printers, each with price, lifespan, hours per year, power and maintenance cost. Bambu Lab P2S is the default.
- The printer is chosen per item and per print.

### Storage and sync

| Storage | Where | Devices | Photos |
|---|---|---|---|
| Browser | IndexedDB of the current browser | this browser only | — |
| Folder | `3d-print-data.json`, `photos/`, `backups/` in a folder you pick | Chrome / Edge on desktop | ✓ |
| Google Drive | `3D Print Calculator/` folder in your Drive (the folder keeps its original name) | any browser, including phones | ✓ |

- The browser copy is always kept. The chosen storage is saved automatically, or manually with `Ctrl+S`.
- Before overwriting a data file, the previous version goes to `backups/`.
- Google Drive: changes from another device are picked up when you return to the tab, but never while you are typing. Real conflicts are detected by file content (MD5). You choose which version to keep, and the other one is backed up.
- A warning is shown if the app is open in several tabs.

### Navigation
- Main sections: Home, Calculator, Items, Print log, Filament. Statistics and Settings are secondary.
- On phones, a bottom tab bar is used. The save/sync status is in the top right corner.

### Other
- Light and dark themes, or follow the system setting.
- JSON backup / import, CSV export.
- Installable as an app (web manifest).

## Cost formula

```
C = M × P / 1000 + T × W / 1000 × E + T × A + T × R + X
A = Printer price / (Lifespan in years × Printing hours per year)
```

| Variable | Description |
|---|---|
| M | Filament used, g (including supports and waste) |
| P | Filament price per kg |
| T | Print time, h |
| W | Average printer power, W |
| E | Electricity price per kWh |
| A | Depreciation per print hour (per printer) |
| R | Maintenance per print hour (per printer) |
| X | Extra costs |

Prototypes use the same formula and are shown separately. Labor and profit are not included.

## Getting started

1. Open https://fomins.github.io/3d-print-calculator/.
2. **Settings**: set filament prices, your printer(s) and the electricity rate.
3. Choose a storage: a **folder** on your computer or **Google Drive**.
4. Add spools under **Spools**, items through the **Calculator**, and log prints from the item page.

> Browser data is tied to the site address. If you used the calculator from a local file before, open **Settings → Folder** and pick the folder with your `3d-print-data.json`.

## Google Drive setup

Google needs an OAuth Client ID for the site. This is done once by the site owner.

**Step-by-step guide (in Russian) with troubleshooting: [docs/google-drive-setup.md](docs/google-drive-setup.md).**

Short version:

1. [Google Cloud Console](https://console.cloud.google.com/): create a project and enable **Google Drive API**.
2. **Google Auth Platform**: audience *External*, add yourself to **Test users**.
3. **Clients → Create client → Web application**, *Authorized JavaScript origins*: `https://fomins.github.io` (and `http://localhost:8000` for local testing).
4. Put the Client ID into `js/config.js`, then commit and push.

The app uses the `drive.file` scope, so it only sees files it created and has no access to the rest of your Drive. The Client ID is public by design. Sign-in lasts about an hour, and reconnecting takes one click. Changes made in the meantime are kept in the browser.

## Bambu Lab Cloud import

Print history lives in Bambu Lab's cloud. Browsers cannot call it directly (no CORS), so requests go through your own Cloudflare Worker ([`worker/bambu-proxy.js`](worker/bambu-proxy.js), free plan).

**Step-by-step guide (in Russian): [docs/bambu-cloud-setup.md](docs/bambu-cloud-setup.md).**

1. Cloudflare → Workers & Pages → Create Worker, paste `worker/bambu-proxy.js`, Deploy.
2. Put the Worker URL into `js/config.js` (`bambuProxy`) or into Settings → Bambu Lab Cloud.
3. Sign in with your Bambu Lab email and password plus the emailed code.
4. Print log → ⇣ From Bambu Cloud for print history; Spools → ⇣ Sync with Bambu Cloud for Bambu Lab RFID spool levels.

The password is never stored. The token (~3 months) stays in the browser only and is not written to the data file. The Bambu Lab API is unofficial.

## Running locally

Google sign-in does not work from `file://`, so serve the folder over HTTP:

```
python -m http.server 8000
```

Then open http://localhost:8000. GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

## Project structure

```
index.html                 markup
css/style.css              styles, light and dark themes (CSS variables)
js/config.js               settings: Google Client ID, Bambu proxy URL
js/gdrive.js               Google Drive storage
js/bambu.js                Bambu Lab Cloud: sign-in and print history
worker/bambu-proxy.js      Cloudflare Worker: CORS proxy to Bambu Cloud
js/app.js                  application
docs/google-drive-setup.md Google Drive setup guide (RU)
docs/bambu-cloud-setup.md  Bambu Lab Cloud import guide (RU)
manifest.webmanifest       install as an app
```

Plain HTML, CSS and JavaScript, with no build step and no dependencies. Personal data files (`3d-print-data*.json`, `photos/`, `backups/`) are listed in `.gitignore`.

## Planned

- [ ] Import grams and print time from Bambu Studio `.gcode.3mf`
- [ ] Hardware / consumables catalog (screws, magnets, inserts) with prices
- [ ] Printer maintenance schedule by print hours
- [ ] Failure rate allowance and "price for friends" markup
- [ ] Spool labels with QR codes, Spoolman import / export

## License

See [LICENSE](LICENSE).
