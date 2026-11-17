# 3D Print Calculator

A browser-based 3D printing cost calculator and print tracker for hobbyists. Calculate the real cost of a print, keep a catalog of your models, track filament spools and log every print. No backend, no account: your data stays in your browser, in a folder on your computer or in your own Google Drive.

**Live:** https://fomins.github.io/3d-print-calculator/

Interface language: Russian. Originally built for a Bambu Lab P2S Combo, works with any FDM printer.

## Features

- **Cost calculator**: filament, electricity, printer depreciation, maintenance and extra costs, with a per-factor breakdown.
- **Item catalog** with a page per item:
  - links (MakerWorld, Printables, etc.), status, tags, notes, print settings, photos;
  - **parts**: quantity, print time and several filaments per part (AMS multicolor);
  - **prototypes**: test prints are tracked separately as development cost;
  - **MakerWorld description generator** (RU/EN) built from parts and print settings.
- **Filament spools**: brand, series, color, price, remaining amount in grams and meters, low-stock warning. Correct the remaining amount manually or by weighing the spool. The empty spool weight is derived from a new sealed spool.
- **Print log**: each print deducts filament from the selected spools, and failed prints are recorded too.
- **Statistics**: totals, averages, cost structure, by material and by month.
- **Storage**: browser (always), a local folder (Chrome/Edge desktop) or Google Drive (any device, including phones).
- **Import/export**: JSON backup, CSV export.

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
| A | Depreciation per print hour |
| R | Maintenance per print hour |
| X | Extra costs |

Labor and profit are not included.

## Data storage

| Storage | Where | Devices | Photos |
|---|---|---|---|
| Browser | IndexedDB of the current browser | this browser only | — |
| Folder | `3d-print-data.json`, `photos/`, `backups/` in a folder you pick | Chrome/Edge on desktop | ✓ |
| Google Drive | `3D Print Calculator/` folder in your Drive | any browser | ✓ |

- The browser copy is always kept. The selected storage is synced automatically (can be switched to manual, `Ctrl+S`).
- Before overwriting a data file, the previous version is saved to `backups/`.
- With Google Drive, changes made on another device are picked up when you return to the tab. If both sides changed, you choose which version to keep, and the other one goes to `backups/`.
- The site never sends your data anywhere except the storage you choose.

> Browser data is tied to the site address. If you used the calculator from a local file before, open **Settings → Folder**, pick the folder with your `3d-print-data.json`, and the data will be loaded.

## Google Drive setup

Google requires an OAuth Client ID for the site that accesses Drive. It is done once.

**Detailed step-by-step guide (in Russian) with screenshots-level detail and troubleshooting: [docs/google-drive-setup.md](docs/google-drive-setup.md).**

Short version:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **OAuth consent screen**: choose *External*, fill in the app name and your email, and add yourself under **Test users**.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - *Authorized JavaScript origins*: `https://fomins.github.io` (plus `http://localhost:8000` for local testing).
5. Copy the **Client ID** into `js/config.js` (`googleClientId`), or paste it in **Settings → Google Drive → Google Client ID**.
6. In the app: **Settings → Connect Google Drive**.

The app uses the `drive.file` scope, so it can only see files it created itself and has no access to the rest of your Drive. The Client ID is public by design. Google only accepts it from the origins listed above.

Sign-in tokens last about an hour. After that, the app asks you to sign in again with one click, and your changes in the meantime are kept in the browser and synced after sign-in.

## Running

**Online:** GitHub Pages. In the repository settings, go to **Pages → Deploy from a branch → `main` / root**.

**Locally:** serve the folder over HTTP (Google sign-in does not work from `file://`):

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Project structure

```
index.html            markup
css/style.css         styles
js/config.js          settings (Google Client ID)
js/gdrive.js          Google Drive storage
js/app.js             application
manifest.webmanifest  install as an app on a phone/desktop
```

Personal data files (`3d-print-data*.json`, `photos/`, `backups/`) are listed in `.gitignore` and are never committed.

## Planned

- [ ] Import grams and print time from Bambu Studio `.gcode.3mf`
- [ ] Hardware/consumables catalog (screws, magnets, inserts) with prices
- [ ] Printer maintenance schedule by print hours
- [ ] Failure rate allowance and "price for friends" markup
- [ ] Spool labels with QR codes, Spoolman import/export
- [ ] Multiple printers

## License

See [LICENSE](LICENSE).
