# Concord United — Worship Attendance Report

Self-updating attendance report for Concord United Methodist Church (2021–present).

## Quick start

```bash
# From this folder (attendance/)
python3 scripts/import_from_xlsx.py   # re-import from secretary Excel workbooks
python3 scripts/rebuild_report.py     # build public/data/report.json

# Serve locally (needed so the page can load report.json)
cd public && python3 -m http.server 8765
# then open http://localhost:8765
```

Or after the clean sheets exist, just edit CSV and rebuild:

1. Add/edit a Sunday row in `data/weekly_attendance.csv`
2. Run `python3 scripts/rebuild_report.py`
3. Refresh the browser at `http://localhost:8765`

## Data files

| File | Purpose |
|------|---------|
| `data/weekly_attendance.csv` | One row per Sunday — **edit this going forward** |
| `data/special_events.csv` | Easter, Christmas Eve, Holy Week (facts only) |

### Weekly CSV columns

`date, year, month, trad_9, cont_9, kids_11, trad_11, cont_11, boxcast_9, youtube_9, facebook_9, boxcast_11, youtube_11, facebook_11, in_person, online, total, is_snow, is_easter, is_christmas_eve, exclude_from_averages, notes`

- **Averages** exclude rows where `exclude_from_averages` is `true` (snow closures, Christmas Eve, Christmas Day on Sunday). Easter and the Sunday after Christmas stay in.
- Charts still show those Sundays; excluded points use gaps (`null`) so lines do not cliff to zero at the end of available data.

## Source workbooks

Default import paths (Dropbox):

- `../ATTENDANCE PROJECT DATA/RAW DATA/Attendance - Worship.xlsx`
- `../ATTENDANCE PROJECT DATA/RAW DATA/Christmas Eve Attendance.xlsx`

## Requirements

```bash
python3 -m pip install --user openpyxl
```
