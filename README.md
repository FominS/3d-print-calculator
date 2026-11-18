# 3D Print Calculator

**English** · [Русский](README.ru.md)

A browser-based 3D printing cost calculator and print tracker for hobbyists. Calculate the real cost of a print, keep a catalog of your models, track filament spools and log every print. No backend and no account: your data stays in your browser, in a folder on your computer or in your own Google Drive.

**Live:** https://fomins.github.io/3d-print-calculator/

Interface language: Russian. Built around a Bambu Lab P2S Combo, works with any FDM printer.

## Features

### Calculator
- Cost breakdown: filament, electricity, printer depreciation, maintenance, extra costs.
- Print time as hours + minutes with a 0–48 h slider. Decimal hours (`2.5`, `2,5`) and `2:30` are accepted too.
- Printer selection and prototypes (test prints) counted separately as development cost.
- Save to the catalog in one click and continue on the item page.

### Item catalog and item page
- Status (idea / in progress / done / published), tags, notes, printer, extra costs.
- Links with one-click presets for MakerWorld, Thingiverse and Printables. Titles are detected from the URL.
- **Parts**: quantity, print time and several filaments per part (AMS multicolor). Cost is shown per part and for the whole item.
- **Prototypes**: version, date, filament, spool, time and a "what changed" note.
- Print settings, photos (stored in the selected storage, resized to 1600 px) and a cover image.
- **MakerWorld description generator** (RU/EN) built from parts and print settings.

### Filament spools
- Brand, series, color, net weight, diameter, price, store, purchase / opened / dried dates.
- Remaining amount in grams and meters, a low-stock warning and spool history.
- Correct the remaining amount manually (grams or meters) or by weighing the spool. The empty spool weight is derived from a new sealed spool.
- **Libraries** in Settings:
  - brands with their filament series;
  - stores;
  - color palette with **multicolor / rainbow** colors (gradients).
- Quick picks in the spool form. New values are remembered automatically, and renaming a library entry updates the spools that use it.

### Print log
- "Log a print" from the item page deducts filament from the chosen spools. Failed prints are recorded too.
- View by month, by year or as a flat list, with totals per period: prints, sets, failures, filament, cost.

### Statistics
- Totals and averages, cost structure, by material, by month.
- Prototype costs, filament in stock and printer wear by depreciation hours, per printer.

### Printers
- Several printers, each with price, lifespan, hours per year, power and maintenance cost. Bambu Lab P2S is the default.
- The printer is chosen per item and per print.

### Storage and sync

| Storage | Where | Devices | Photos |
|---|---|---|---|
| Browser | IndexedDB of the current browser | this browser only | — |
| Folder | `3d-print-data.json`, `photos/`, `backups/` in a folder you pick | Chrome / Edge on desktop | ✓ |
| Google Drive | `3D Print Calculator/` folder in your Drive | any browser, including phones | ✓ |

- The browser copy is always kept. The chosen storage is saved automatically, or manually with `Ctrl+S`.
- Before overwriting a data file, the previous version goes to `backups/`.
- Google Drive: changes from another device are picked up when you return to the tab, but never while you are typing. Real conflicts are detected by file content (MD5). You choose which version to keep, and the other one is backed up.
- A warning is shown if the app is open in several tabs.

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
js/config.js               settings: Google Client ID
js/gdrive.js               Google Drive storage
js/app.js                  application
docs/google-drive-setup.md Google Drive setup guide (RU)
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
