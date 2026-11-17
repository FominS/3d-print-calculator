# 3D Print Calculator

A lightweight, browser-based 3D printing cost calculator and print tracking tool. Calculate the actual cost of your 3D prints, manage materials, and keep a record of printed models.

Designed for hobbyists, makers, and small-scale 3D printing enthusiasts.

## Features

- **Cost Calculator** — Calculate printing costs based on filament consumption, electricity usage, printer depreciation, and maintenance.
- **Print Catalog** — Save, edit, search, and manage printed models.
- **Filament Management** — Configure different filament types and their prices per kilogram.
- **Printer Settings** — Customize printer price, expected lifespan, annual printing hours, and power consumption.
- **Cost Breakdown** — View detailed expenses for each print.
- **Local Data Storage** — Keep your data in the browser without requiring an account.
- **Import & Export** — Back up and restore your data using JSON files.
- **CSV Export** — Export your print catalog for further analysis.
- **No Backend Required** — Runs entirely in the browser.

## Cost Calculation

The total printing cost is calculated using:

\[
C = \frac{M \times P}{1000} + T \times W \times E + T \times A + T \times R
\]

Where:

| Variable | Description |
|---|---|
| C | Total printing cost |
| M | Filament consumption (g) |
| P | Filament price per kilogram |
| T | Printing time (hours) |
| W | Average printer power consumption (kW) |
| E | Electricity price per kWh |
| A | Printer depreciation cost per hour |
| R | Maintenance cost per hour |

Printer depreciation is calculated as:

\[
A = \frac{\text{Printer Price}}{\text{Expected Lifespan (Years)} \times \text{Annual Printing Hours}}
\]

## Getting Started

### Online

Open the application using GitHub Pages once deployed.

### Local Installation

1. Clone the repository:

   `git clone https://github.com/YOUR_USERNAME/3d-print-calculator.git`

2. Open `index.html` in your browser.

3. Configure your printer, materials, and electricity costs.

4. Start calculating and saving your prints.

No installation, server, or additional dependencies are required.

## Data Storage

The application stores data locally in your browser.

- Data is automatically saved between sessions.
- Export your data to JSON for backup.
- Import previously exported data.
- Export your print catalog to CSV.

**Important:** Browser storage is device-specific. Data is not automatically synchronized between devices. Regular JSON backups are recommended.

## Compatibility

The calculator works with most FDM/FFF 3D printers, including:

- Bambu Lab
- Prusa
- Creality
- Anycubic
- Elegoo
- Other FDM printers

Originally developed with the Bambu Lab P2S Combo in mind.

## Planned Features

- [ ] Detailed print history and statistics
- [ ] Filament spool inventory and remaining weight tracking
- [ ] Import printing data from Bambu Studio
- [ ] Support for multiple printers
- [ ] Print photos and model attachments
- [ ] Cloud synchronization
- [ ] User authentication
- [ ] Advanced cost analytics

## Technology

- HTML
- CSS
- JavaScript
- Browser Local Storage
- GitHub Pages

## License

No license has been specified yet.

---

Made for makers who want to understand and track the real cost of 3D printing.
