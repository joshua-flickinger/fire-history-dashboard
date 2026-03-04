# Sequoia + Kings Canyon Fire History Dashboard

This project is a lightweight, dependency-free web dashboard for exploring `data/fire_history.csv`.

## What it includes

- Year range filters
- Response and cause filters
- Name filter + year and acre min/max sliders
- Summary stats cards
- Fires-by-year and acres-by-year charts for wildfires and prescribed fires
- Monthly seasonality chart
- Wildfire general-cause and prescribed specific-cause breakdowns
- Separate chart sets for prescribed fire activity vs wildfires
- Fire-size metrics section (average, standard deviation, max)
- Violin-style fire-size distribution chart (log scale)
- Largest fires table
- Export of filtered records as CSV

## Run locally

Use any static file server from this folder. Example with Python:

```bash
python -m http.server 8000
```

Then open: `http://localhost:8000`

## Files

- `index.html`: dashboard markup
- `styles.css`: styles and responsive layout
- `app.js`: CSV parsing, filtering, stats, chart rendering
- `data/fire_history.csv`: source data
