const CSV_PATH = "data/fire_history.csv";
const SEKI_BOUNDARY_GEOJSON_URL = "https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/SEKI_ParkAtlas1_4_VisitingtheParks_MASTER/FeatureServer/10/query?where=1%3D1&outFields=*&outSR=4326&f=geojson";

const state = {
  raw: [],
  filtered: [],
  minYear: null,
  maxYear: null,
  minAcre: 0,
  maxAcre: 0,
  boundaryRings: null
};
const tooltipState = new WeakMap();
let tooltipEl = null;

const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});
const oneDecimalFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const el = {
  statusText: document.getElementById("statusText"),
  startYear: document.getElementById("startYear"),
  endYear: document.getElementById("endYear"),
  startYearNumber: document.getElementById("startYearNumber"),
  endYearNumber: document.getElementById("endYearNumber"),
  responseSelect: document.getElementById("responseSelect"),
  causeSelect: document.getElementById("causeSelect"),
  nameSearch: document.getElementById("nameSearch"),
  minAcres: document.getElementById("minAcres"),
  minAcresNumber: document.getElementById("minAcresNumber"),
  maxAcres: document.getElementById("maxAcres"),
  maxAcresNumber: document.getElementById("maxAcresNumber"),
  resetBtn: document.getElementById("resetBtn"),
  exportBtn: document.getElementById("exportBtn"),
  fileFallback: document.getElementById("fileFallback"),
  fileInput: document.getElementById("fileInput"),
  totalFires: document.getElementById("totalFires"),
  totalFiresWildfire: document.getElementById("totalFiresWildfire"),
  totalFiresPrescribed: document.getElementById("totalFiresPrescribed"),
  totalAcres: document.getElementById("totalAcres"),
  totalAcresWildfire: document.getElementById("totalAcresWildfire"),
  totalAcresPrescribed: document.getElementById("totalAcresPrescribed"),
  averageAnnualFires: document.getElementById("averageAnnualFires"),
  averageAnnualWildfires: document.getElementById("averageAnnualWildfires"),
  averageAnnualPrescribed: document.getElementById("averageAnnualPrescribed"),
  averageAnnualAcres: document.getElementById("averageAnnualAcres"),
  averageAnnualAcresWildfires: document.getElementById("averageAnnualAcresWildfires"),
  averageAnnualAcresPrescribed: document.getElementById("averageAnnualAcresPrescribed"),
  managedPct: document.getElementById("managedPct"),
  sizeStatsBody: document.getElementById("sizeStatsBody"),
  sizeViolinChart: document.getElementById("sizeViolinChart"),
  wildfireFiresByYearChart: document.getElementById("wildfireFiresByYearChart"),
  wildfireAcresByYearChart: document.getElementById("wildfireAcresByYearChart"),
  wildfireMonthChart: document.getElementById("wildfireMonthChart"),
  wildfireDurationChart: document.getElementById("wildfireDurationChart"),
  wildfireMapChart: document.getElementById("wildfireMapChart"),
  wildfireCauseBars: document.getElementById("wildfireCauseBars"),
  prescribedFiresByYearChart: document.getElementById("prescribedFiresByYearChart"),
  prescribedAcresByYearChart: document.getElementById("prescribedAcresByYearChart"),
  prescribedMonthChart: document.getElementById("prescribedMonthChart"),
  prescribedDurationChart: document.getElementById("prescribedDurationChart"),
  prescribedMapChart: document.getElementById("prescribedMapChart"),
  prescribedCauseBars: document.getElementById("prescribedCauseBars"),
  largestFiresBody: document.getElementById("largestFiresBody")
};

init();

async function init() {
  ensureTooltipElement();
  bindEvents();
  loadBoundaryGeometry();

  try {
    const csvText = await loadCsv(CSV_PATH);
    ingestCsv(csvText, "Loaded");
  } catch (error) {
    el.statusText.textContent = "Auto-load failed. Choose the CSV manually below.";
    el.fileFallback.classList.remove("hidden");
  }
}

async function loadBoundaryGeometry() {
  try {
    const response = await fetch(SEKI_BOUNDARY_GEOJSON_URL);
    if (!response.ok) return;
    const geojson = await response.json();
    const rings = extractBoundaryRings(geojson);
    if (!rings.length) return;
    state.boundaryRings = rings;
    if (state.raw.length) {
      const split = splitRecords(state.filtered);
      renderSplitCharts(split);
    }
  } catch (error) {
    // If boundary fetch fails (network/CORS), map charts still render point data.
  }
}

function bindEvents() {
  el.startYear.addEventListener("input", () => syncYearInputs("range-start"));
  el.endYear.addEventListener("input", () => syncYearInputs("range-end"));
  el.startYearNumber.addEventListener("change", () => syncYearInputs("number-start"));
  el.endYearNumber.addEventListener("change", () => syncYearInputs("number-end"));
  [el.startYearNumber, el.endYearNumber].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });

  el.minAcres.addEventListener("input", () => syncAcreInputs("range-min"));
  el.maxAcres.addEventListener("input", () => syncAcreInputs("range-max"));
  el.minAcresNumber.addEventListener("change", () => syncAcreInputs("number-min"));
  el.maxAcresNumber.addEventListener("change", () => syncAcreInputs("number-max"));
  [el.minAcresNumber, el.maxAcresNumber].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });

  [el.responseSelect, el.causeSelect, el.nameSearch].forEach((control) => {
    control.addEventListener("input", applyFilters);
  });

  el.resetBtn.addEventListener("click", resetFilters);
  el.exportBtn.addEventListener("click", exportFilteredCsv);

  el.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    ingestCsv(text, "Loaded local file");
  });

  window.addEventListener("resize", debounce(() => {
    if (!state.raw.length) return;
    const split = splitRecords(state.filtered);
    renderSplitCharts(split);
    renderSizeViolin(split);
    hideTooltip();
  }, 100));
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function ingestCsv(csvText, verb) {
  const rows = parseCsv(csvText);
  const records = rows.map(mapRow).filter(Boolean);

  if (!records.length) {
    el.statusText.textContent = "No valid records were parsed from the CSV.";
    return;
  }

  state.raw = records;
  state.minYear = Math.min(...records.map((record) => record.year));
  state.maxYear = Math.max(...records.map((record) => record.year));

  configureControls();
  applyFilters();

  el.statusText.textContent = `${verb} ${numberFormat.format(records.length)} records (${state.minYear}-${state.maxYear}).`;
}

function configureControls() {
  [el.startYear, el.endYear, el.startYearNumber, el.endYearNumber].forEach((input) => {
    input.min = String(state.minYear);
    input.max = String(state.maxYear);
  });

  el.startYear.value = String(state.minYear);
  el.endYear.value = String(state.maxYear);
  el.startYearNumber.value = String(state.minYear);
  el.endYearNumber.value = String(state.maxYear);

  state.minAcre = 0;
  state.maxAcre = Math.max(1, Math.ceil(Math.max(...state.raw.map((row) => row.acres))));

  [el.minAcres, el.maxAcres, el.minAcresNumber, el.maxAcresNumber].forEach((input) => {
    input.min = String(state.minAcre);
    input.max = String(state.maxAcre);
    input.step = "1";
  });
  el.minAcres.value = String(state.minAcre);
  el.minAcresNumber.value = String(state.minAcre);
  el.maxAcres.value = String(state.maxAcre);
  el.maxAcresNumber.value = String(state.maxAcre);

  hydrateSelect(el.responseSelect, state.raw.map((row) => row.response));
  hydrateSelect(el.causeSelect, state.raw.map((row) => row.generalCause));
}

function hydrateSelect(selectElement, values) {
  const unique = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  selectElement.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "All";
  allOption.textContent = "All";
  selectElement.append(allOption);

  unique.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });
}

function syncYearInputs(source) {
  let start = Number(el.startYear.value);
  let end = Number(el.endYear.value);

  if (source === "number-start") {
    start = clamp(Number(el.startYearNumber.value), state.minYear, state.maxYear);
    el.startYear.value = String(start);
  }
  if (source === "number-end") {
    end = clamp(Number(el.endYearNumber.value), state.minYear, state.maxYear);
    el.endYear.value = String(end);
  }

  if (source === "range-start") {
    start = Number(el.startYear.value);
  }
  if (source === "range-end") {
    end = Number(el.endYear.value);
  }

  if (start > end) {
    if (source.includes("start")) {
      end = start;
      el.endYear.value = String(end);
    } else {
      start = end;
      el.startYear.value = String(start);
    }
  }

  el.startYearNumber.value = String(start);
  el.endYearNumber.value = String(end);

  applyFilters();
}

function syncAcreInputs(source) {
  let minAcres = Number(el.minAcres.value);
  let maxAcres = Number(el.maxAcres.value);

  if (source === "number-min") {
    minAcres = clamp(Number(el.minAcresNumber.value), state.minAcre, state.maxAcre);
    el.minAcres.value = String(minAcres);
  }
  if (source === "number-max") {
    maxAcres = clamp(Number(el.maxAcresNumber.value), state.minAcre, state.maxAcre);
    el.maxAcres.value = String(maxAcres);
  }
  if (source === "range-min") {
    minAcres = Number(el.minAcres.value);
  }
  if (source === "range-max") {
    maxAcres = Number(el.maxAcres.value);
  }

  if (minAcres > maxAcres) {
    if (source.includes("min")) {
      maxAcres = minAcres;
      el.maxAcres.value = String(maxAcres);
    } else {
      minAcres = maxAcres;
      el.minAcres.value = String(minAcres);
    }
  }

  el.minAcresNumber.value = String(Math.round(minAcres));
  el.maxAcresNumber.value = String(Math.round(maxAcres));

  applyFilters();
}

function resetFilters() {
  el.startYear.value = String(state.minYear);
  el.endYear.value = String(state.maxYear);
  el.startYearNumber.value = String(state.minYear);
  el.endYearNumber.value = String(state.maxYear);
  el.responseSelect.value = "All";
  el.causeSelect.value = "All";
  el.nameSearch.value = "";
  el.minAcres.value = String(state.minAcre);
  el.minAcresNumber.value = String(state.minAcre);
  el.maxAcres.value = String(state.maxAcre);
  el.maxAcresNumber.value = String(state.maxAcre);
  applyFilters();
}

function applyFilters() {
  if (!state.raw.length) return;

  const startYear = Number(el.startYear.value);
  const endYear = Number(el.endYear.value);
  const selectedResponse = el.responseSelect.value;
  const selectedCause = el.causeSelect.value;
  const nameQuery = el.nameSearch.value.trim().toLowerCase();
  const minInput = String(el.minAcresNumber.value).trim();
  const maxInput = String(el.maxAcresNumber.value).trim();
  const minParsed = minInput.length ? Number(minInput) : state.minAcre;
  const maxParsed = maxInput.length ? Number(maxInput) : state.maxAcre;
  const minAcresRaw = Math.max(state.minAcre, Number.isFinite(minParsed) ? minParsed : state.minAcre);
  const maxAcresRaw = Math.min(state.maxAcre, Number.isFinite(maxParsed) ? maxParsed : state.maxAcre);
  const minAcres = Math.min(minAcresRaw, maxAcresRaw);
  const maxAcres = Math.max(minAcresRaw, maxAcresRaw);

  state.filtered = state.raw.filter((record) => {
    if (record.year < startYear || record.year > endYear) return false;
    if (selectedResponse !== "All" && record.response !== selectedResponse) return false;
    if (selectedCause !== "All" && record.generalCause !== selectedCause) return false;
    if (record.acres < minAcres) return false;
    if (record.acres > maxAcres) return false;
    if (nameQuery && !record.fireName.toLowerCase().includes(nameQuery)) return false;
    return true;
  });

  renderDashboard(state.filtered, state.raw.length);
}

function renderDashboard(records, rawCount) {
  const totalFires = records.length;
  const totalAcres = sum(records.map((record) => record.acres));
  const managedCount = records.filter((record) => record.fireUse === "Yes").length;
  const split = splitRecords(records);
  const wildfireAcres = sum(split.wildfires.map((record) => record.acres));
  const prescribedAcres = sum(split.prescribed.map((record) => record.acres));
  const yearSpan = Math.max(1, Number(el.endYear.value) - Number(el.startYear.value) + 1);
  const avgAnnualNumber = totalFires / yearSpan;
  const avgAnnualWildfires = split.wildfires.length / yearSpan;
  const avgAnnualPrescribed = split.prescribed.length / yearSpan;
  const avgAnnualAcres = totalAcres / yearSpan;
  const avgAnnualWildfireAcres = wildfireAcres / yearSpan;
  const avgAnnualPrescribedAcres = prescribedAcres / yearSpan;

  el.totalFires.textContent = numberFormat.format(totalFires);
  el.totalFiresWildfire.textContent = `Wildfires: ${numberFormat.format(split.wildfires.length)}`;
  el.totalFiresPrescribed.textContent = `Prescribed Fires: ${numberFormat.format(split.prescribed.length)}`;
  el.totalAcres.textContent = `${numberFormat.format(Math.round(totalAcres))} ac`;
  el.totalAcresWildfire.textContent = `Wildfires: ${numberFormat.format(Math.round(wildfireAcres))} ac`;
  el.totalAcresPrescribed.textContent = `Prescribed Fires: ${numberFormat.format(Math.round(prescribedAcres))} ac`;
  el.averageAnnualFires.textContent = `${oneDecimalFormat.format(avgAnnualNumber)} fires/yr`;
  el.averageAnnualWildfires.textContent = `Wildfires: ${oneDecimalFormat.format(avgAnnualWildfires)} fires/yr`;
  el.averageAnnualPrescribed.textContent = `Prescribed Fires: ${oneDecimalFormat.format(avgAnnualPrescribed)} fires/yr`;
  el.averageAnnualAcres.textContent = `${numberFormat.format(Math.round(avgAnnualAcres))} ac/yr`;
  el.averageAnnualAcresWildfires.textContent = `Wildfires: ${numberFormat.format(Math.round(avgAnnualWildfireAcres))} ac/yr`;
  el.averageAnnualAcresPrescribed.textContent = `Prescribed Fires: ${numberFormat.format(Math.round(avgAnnualPrescribedAcres))} ac/yr`;
  el.managedPct.textContent = totalFires ? `${Math.round((managedCount / totalFires) * 100)}%` : "0%";

  const currentStart = el.startYear.value;
  const currentEnd = el.endYear.value;
  el.statusText.textContent = `Showing ${numberFormat.format(totalFires)} of ${numberFormat.format(rawCount)} fires (${currentStart}-${currentEnd}).`;

  renderSplitCharts(split);
  renderSizeMetrics(records, split);
  renderLargestFires(records);
}

function renderSplitCharts(split) {
  renderCharts(split.wildfires, {
    firesByYearCanvas: el.wildfireFiresByYearChart,
    acresByYearCanvas: el.wildfireAcresByYearChart,
    monthCanvas: el.wildfireMonthChart,
    durationCanvas: el.wildfireDurationChart,
    mapCanvas: el.wildfireMapChart
  }, {
    firesColor: "#2f6f4f",
    acresColor: "#c6672d",
    monthColor: "#1f7a87",
    mapColor: "#2f6f4f"
  });

  renderCharts(split.prescribed, {
    firesByYearCanvas: el.prescribedFiresByYearChart,
    acresByYearCanvas: el.prescribedAcresByYearChart,
    monthCanvas: el.prescribedMonthChart,
    durationCanvas: el.prescribedDurationChart,
    mapCanvas: el.prescribedMapChart
  }, {
    firesColor: "#845936",
    acresColor: "#ba5a1d",
    monthColor: "#2f8a62",
    mapColor: "#ba5a1d"
  });

  renderCauseBars(split.wildfires, el.wildfireCauseBars, "generalCause");
  renderCauseBars(split.prescribed, el.prescribedCauseBars, "specificCause");
}

function renderCharts(records, chartTargets, palette) {
  const yearRange = buildYearRange(Number(el.startYear.value), Number(el.endYear.value));
  const firesByYearMap = new Map(yearRange.map((year) => [year, 0]));
  const acresByYearMap = new Map(yearRange.map((year) => [year, 0]));

  records.forEach((record) => {
    firesByYearMap.set(record.year, (firesByYearMap.get(record.year) || 0) + 1);
    acresByYearMap.set(record.year, (acresByYearMap.get(record.year) || 0) + record.acres);
  });

  drawBarChart(chartTargets.firesByYearCanvas, yearRange.map(String), yearRange.map((year) => firesByYearMap.get(year) || 0), {
    color: palette.firesColor,
    yFormatter: (value) => compactFormat.format(value),
    tooltipFormatter: (value) => `${numberFormat.format(Math.round(value))} fires`
  });

  drawBarChart(chartTargets.acresByYearCanvas, yearRange.map(String), yearRange.map((year) => acresByYearMap.get(year) || 0), {
    color: palette.acresColor,
    yFormatter: (value) => compactFormat.format(value),
    tooltipFormatter: (value) => `${numberFormat.format(Math.round(value))} ac`
  });

  const monthlyCounts = new Array(12).fill(0);
  records.forEach((record) => {
    if (record.month >= 1 && record.month <= 12) {
      monthlyCounts[record.month - 1] += 1;
    }
  });

  drawBarChart(chartTargets.monthCanvas, monthLabels, monthlyCounts, {
    color: palette.monthColor,
    yFormatter: (value) => numberFormat.format(value),
    tooltipFormatter: (value) => `${numberFormat.format(Math.round(value))} fires`
  });

  const durationValues = records
    .map((record) => record.durationDays)
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (!durationValues.length) {
    drawBarChart(chartTargets.durationCanvas, ["No data"], [0], {
      color: "#9a9a9a",
      yFormatter: (value) => numberFormat.format(value),
      tooltipFormatter: () => "No records with valid start/out dates"
    });
    return;
  }

  const maxDuration = Math.max(...durationValues);
  const durationRange = buildYearRange(0, maxDuration);
  const durationCounts = new Array(durationRange.length).fill(0);
  durationValues.forEach((days) => {
    const idx = Math.max(0, Math.min(maxDuration, days));
    durationCounts[idx] += 1;
  });

  drawBarChart(chartTargets.durationCanvas, durationRange.map(String), durationCounts, {
    color: "#7f6a50",
    yFormatter: (value) => numberFormat.format(value),
    tooltipFormatter: (value) => `${numberFormat.format(Math.round(value))} fires`
  });

  drawMapPlot(chartTargets.mapCanvas, records, {
    pointColor: palette.mapColor,
    boundaryColor: "#5f6f66"
  });
}

function renderCauseBars(records, containerEl, fieldName) {
  const counts = new Map();
  records.forEach((record) => {
    const key = normalize(record[fieldName]);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const topCauses = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  containerEl.innerHTML = "";
  if (!topCauses.length) {
    containerEl.textContent = "No data in current filter.";
    return;
  }

  const maxCount = topCauses.length ? topCauses[0][1] : 1;
  topCauses.forEach(([cause, count]) => {
    const row = document.createElement("div");
    row.className = "cause-row";

    const top = document.createElement("div");
    top.className = "cause-top";

    const left = document.createElement("span");
    left.textContent = cause;

    const right = document.createElement("span");
    const pct = records.length ? Math.round((count / records.length) * 100) : 0;
    right.textContent = `${numberFormat.format(count)} (${pct}%)`;

    top.append(left, right);

    const track = document.createElement("div");
    track.className = "cause-track";
    const fill = document.createElement("div");
    fill.className = "cause-fill";
    fill.style.width = `${Math.max(2, (count / maxCount) * 100)}%`;

    track.append(fill);
    row.append(top, track);
    containerEl.append(row);
  });
}

function renderSizeMetrics(records, split) {
  const allAcres = records.map((record) => record.acres);
  const wildfireAcres = split.wildfires.map((record) => record.acres);
  const prescribedAcres = split.prescribed.map((record) => record.acres);

  const rows = [
    { label: "All Fires", values: allAcres },
    { label: "Wildfires", values: wildfireAcres },
    { label: "Prescribed Fires", values: prescribedAcres }
  ];

  el.sizeStatsBody.innerHTML = "";
  rows.forEach((row) => {
    const stats = computeSizeStats(row.values);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.label}</td>
      <td>${numberFormat.format(Math.round(stats.average))} ac</td>
      <td>${numberFormat.format(Math.round(stats.stdDev))} ac</td>
      <td>${numberFormat.format(Math.round(stats.min))} ac</td>
      <td>${numberFormat.format(Math.round(stats.median))} ac</td>
      <td>${numberFormat.format(Math.round(stats.max))} ac</td>
    `;
    el.sizeStatsBody.append(tr);
  });

  renderSizeViolin(split);
}

function renderSizeViolin(split) {
  drawViolinPlot(el.sizeViolinChart, [
    {
      label: "Wildfires",
      color: "#2f6f4f",
      values: split.wildfires.map((record) => record.acres)
    },
    {
      label: "Prescribed",
      color: "#ba5a1d",
      values: split.prescribed.map((record) => record.acres)
    }
  ]);
}

function renderLargestFires(records) {
  const topRows = [...records]
    .sort((a, b) => b.acres - a.acres)
    .slice(0, 20);

  el.largestFiresBody.innerHTML = "";

  topRows.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${record.year}</td>
      <td>${escapeHtml(record.fireName)}</td>
      <td>${numberFormat.format(Math.round(record.acres))}</td>
      <td>${escapeHtml(record.response)}</td>
      <td>${escapeHtml(record.generalCause)}</td>
      <td>${record.startDate ? dateFormat.format(record.startDate) : "Unknown"}</td>
    `;
    el.largestFiresBody.append(tr);
  });
}

function exportFilteredCsv() {
  if (!state.filtered.length) return;

  const headers = ["year", "fire_name", "fire_type", "prescribed_group", "acres", "response", "general_cause", "specific_cause", "fire_use", "start_date", "latitude", "longitude"];
  const lines = [headers.join(",")];

  state.filtered.forEach((record) => {
    const row = [
      record.year,
      record.fireName,
      record.fireType,
      isPrescribedRecord(record) ? "Prescribed" : "Wildfire",
      record.acres,
      record.response,
      record.generalCause,
      record.specificCause,
      record.fireUse,
      record.startDate ? record.startDate.toISOString().slice(0, 10) : "",
      Number.isFinite(record.lat) ? record.lat : "",
      Number.isFinite(record.lon) ? record.lon : ""
    ].map(csvCell);

    lines.push(row.join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const start = el.startYear.value;
  const end = el.endYear.value;
  link.href = url;
  link.download = `seki_fire_history_${start}_${end}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function drawBarChart(canvas, labels, values, options) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 250;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = 46;
  const right = 10;
  const top = 10;
  const bottom = 28;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(1, ...values);
  const barGap = 1;
  const barWidth = Math.max(1, chartWidth / Math.max(1, values.length) - barGap);
  const tooltipFormatter = options.tooltipFormatter || ((value) => numberFormat.format(Math.round(value)));

  ctx.strokeStyle = "#cfc2ab";
  ctx.lineWidth = 1;

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i += 1) {
    const y = top + (chartHeight / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    const v = maxValue * (1 - i / yTicks);
    ctx.fillStyle = "#5f6f66";
    ctx.font = "11px 'Avenir Next', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(options.yFormatter(v), left - 6, y + 3);
  }

  ctx.fillStyle = options.color;
  values.forEach((value, idx) => {
    const x = left + idx * (barWidth + barGap);
    const h = (value / maxValue) * chartHeight;
    const y = top + chartHeight - h;
    ctx.fillRect(x, y, barWidth, h);
  });

  ctx.strokeStyle = "#5f6f66";
  ctx.beginPath();
  ctx.moveTo(left, top + chartHeight);
  ctx.lineTo(width - right, top + chartHeight);
  ctx.stroke();

  const xTickCount = Math.min(labels.length, 6);
  for (let i = 0; i < xTickCount; i += 1) {
    const idx = Math.round((labels.length - 1) * (i / Math.max(1, xTickCount - 1)));
    const x = left + idx * (barWidth + barGap);

    ctx.fillStyle = "#5f6f66";
    ctx.font = "11px 'Avenir Next', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[idx], x + barWidth / 2, height - 8);
  }

  registerTooltip(canvas, {
    type: "bar",
    labels,
    values,
    left,
    top,
    chartHeight,
    barWidth,
    barGap,
    formatter: tooltipFormatter
  });
}

function drawViolinPlot(canvas, groups) {
  if (!canvas) return;
  const validGroups = groups.filter((group) => group.values.length > 0);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 285;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!validGroups.length) {
    ctx.fillStyle = "#5f6f66";
    ctx.font = "13px 'Avenir Next', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No fire-size data in current filter.", width / 2, height / 2);
    registerTooltip(canvas, null);
    return;
  }

  const allValues = validGroups.flatMap((group) => group.values);
  const maxAcre = Math.max(1, ...allValues);
  const minLog = 0;
  const maxLog = Math.max(1, Math.log10(maxAcre + 1));

  const left = 55;
  const right = 18;
  const top = 16;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const groupStep = plotWidth / validGroups.length;
  const bins = 36;

  ctx.strokeStyle = "#e2d6be";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const y = top + plotHeight - ratio * plotHeight;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    const acres = Math.pow(10, ratio * maxLog) - 1;
    ctx.fillStyle = "#5f6f66";
    ctx.font = "11px 'Avenir Next', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${compactFormat.format(acres)} ac`, left - 7, y + 3);
  }

  const hoverRegions = [];
  validGroups.forEach((group, groupIdx) => {
    const centerX = left + groupStep * (groupIdx + 0.5);
    const maxHalfWidth = Math.min(80, groupStep * 0.36);
    const histogram = new Array(bins).fill(0);

    group.values.forEach((value) => {
      const logValue = Math.log10(Math.max(0, value) + 1);
      const norm = (logValue - minLog) / (maxLog - minLog || 1);
      const bin = Math.max(0, Math.min(bins - 1, Math.floor(norm * bins)));
      histogram[bin] += 1;
    });

    const smoothed = histogram.map((_, idx) => {
      const a = histogram[Math.max(0, idx - 2)];
      const b = histogram[Math.max(0, idx - 1)];
      const c = histogram[idx];
      const d = histogram[Math.min(bins - 1, idx + 1)];
      const e = histogram[Math.min(bins - 1, idx + 2)];
      return (a + b + c + d + e) / 5;
    });
    const maxDensity = Math.max(1, ...smoothed);

    ctx.beginPath();
    for (let i = 0; i < bins; i += 1) {
      const ratio = (i + 0.5) / bins;
      const y = top + plotHeight - ratio * plotHeight;
      const halfWidth = (smoothed[i] / maxDensity) * maxHalfWidth;
      const x = centerX + halfWidth;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    for (let i = bins - 1; i >= 0; i -= 1) {
      const ratio = (i + 0.5) / bins;
      const y = top + plotHeight - ratio * plotHeight;
      const halfWidth = (smoothed[i] / maxDensity) * maxHalfWidth;
      const x = centerX - halfWidth;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = withAlpha(group.color, 0.42);
    ctx.strokeStyle = group.color;
    ctx.lineWidth = 1.3;
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#3f4f47";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, top + plotHeight);
    ctx.stroke();

    ctx.fillStyle = "#1e3028";
    ctx.font = "12px 'Avenir Next', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(group.label, centerX, height - 11);

    const groupStats = computeSizeStats(group.values);
    hoverRegions.push({
      label: group.label,
      centerX,
      radius: maxHalfWidth + 8,
      top,
      bottom: top + plotHeight,
      count: group.values.length,
      stats: groupStats
    });
  });

  registerTooltip(canvas, {
    type: "violin",
    regions: hoverRegions
  });
}

function drawMapPlot(canvas, records, options) {
  if (!canvas) return;
  const points = records
    .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lon))
    .map((record) => ({ lat: record.lat, lon: record.lon }));

  const rings = state.boundaryRings || [];
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 250;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!points.length && !rings.length) {
    ctx.fillStyle = "#5f6f66";
    ctx.font = "13px 'Avenir Next', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No coordinate data in current filter.", width / 2, height / 2);
    registerTooltip(canvas, null);
    return;
  }

  const allLons = [];
  const allLats = [];
  points.forEach((point) => {
    allLons.push(point.lon);
    allLats.push(point.lat);
  });
  rings.forEach((ring) => {
    ring.forEach(([lon, lat]) => {
      allLons.push(lon);
      allLats.push(lat);
    });
  });

  let minLon = Math.min(...allLons);
  let maxLon = Math.max(...allLons);
  let minLat = Math.min(...allLats);
  let maxLat = Math.max(...allLats);

  if (minLon === maxLon) {
    minLon -= 0.01;
    maxLon += 0.01;
  }
  if (minLat === maxLat) {
    minLat -= 0.01;
    maxLat += 0.01;
  }

  const lonPad = (maxLon - minLon) * 0.06;
  const latPad = (maxLat - minLat) * 0.06;
  minLon -= lonPad;
  maxLon += lonPad;
  minLat -= latPad;
  maxLat += latPad;

  const left = 44;
  const right = 10;
  const top = 12;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const project = (lon, lat) => {
    const x = left + ((lon - minLon) / (maxLon - minLon)) * plotWidth;
    const y = top + ((maxLat - lat) / (maxLat - minLat)) * plotHeight;
    return { x, y };
  };

  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(left, top, plotWidth, plotHeight);
  ctx.strokeStyle = "#d4c7ae";
  ctx.strokeRect(left, top, plotWidth, plotHeight);

  if (rings.length) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.boundaryColor || "#5f6f66";
    ctx.fillStyle = "rgba(95, 111, 102, 0.12)";
    rings.forEach((ring) => {
      if (ring.length < 3) return;
      ctx.beginPath();
      ring.forEach(([lon, lat], idx) => {
        const p = project(lon, lat);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  ctx.fillStyle = withAlpha(options.pointColor || "#2f6f4f", 0.6);
  points.forEach((point) => {
    const p = project(point.lon, point.lat);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#5f6f66";
  ctx.font = "11px 'Avenir Next', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Lon ${minLon.toFixed(2)} to ${maxLon.toFixed(2)}`, left, height - 9);
  ctx.textAlign = "right";
  ctx.fillText(`Lat ${minLat.toFixed(2)} to ${maxLat.toFixed(2)}`, width - right, height - 9);

  registerTooltip(canvas, {
    type: "map",
    left,
    top,
    right: width - right,
    bottom: top + plotHeight,
    points
  });
}

function extractBoundaryRings(geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return [];
  const rings = [];
  geojson.features.forEach((feature) => {
    const geom = feature?.geometry;
    if (!geom) return;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((ring) => {
        if (Array.isArray(ring) && ring.length > 2) rings.push(ring);
      });
    }
    if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((polygon) => {
        if (!Array.isArray(polygon)) return;
        polygon.forEach((ring) => {
          if (Array.isArray(ring) && ring.length > 2) rings.push(ring);
        });
      });
    }
  });
  return rings;
}

function registerTooltip(canvas, config) {
  if (!canvas) return;
  if (!config) {
    tooltipState.delete(canvas);
    detachTooltipListeners(canvas);
    return;
  }
  tooltipState.set(canvas, config);
  attachTooltipListeners(canvas);
}

function attachTooltipListeners(canvas) {
  if (canvas.dataset.tooltipBound === "true") return;
  canvas.addEventListener("mousemove", handleTooltipMove);
  canvas.addEventListener("mouseleave", hideTooltip);
  canvas.dataset.tooltipBound = "true";
}

function detachTooltipListeners(canvas) {
  if (canvas.dataset.tooltipBound !== "true") return;
  canvas.removeEventListener("mousemove", handleTooltipMove);
  canvas.removeEventListener("mouseleave", hideTooltip);
  delete canvas.dataset.tooltipBound;
}

function handleTooltipMove(event) {
  const canvas = event.currentTarget;
  const config = tooltipState.get(canvas);
  if (!config) {
    hideTooltip();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (config.type === "bar") {
    const idx = Math.floor((x - config.left) / (config.barWidth + config.barGap));
    if (idx < 0 || idx >= config.values.length || y < config.top || y > config.top + config.chartHeight) {
      hideTooltip();
      return;
    }
    const label = config.labels[idx];
    const value = config.values[idx];
    showTooltip(`${label}\n${config.formatter(value)}`, event.clientX, event.clientY);
    return;
  }

  if (config.type === "violin") {
    let match = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    config.regions.forEach((region) => {
      if (y < region.top || y > region.bottom) return;
      const distance = Math.abs(x - region.centerX);
      if (distance <= region.radius && distance < bestDistance) {
        match = region;
        bestDistance = distance;
      }
    });

    if (!match) {
      hideTooltip();
      return;
    }

    showTooltip(
      `${match.label}
Count: ${numberFormat.format(match.count)}
Avg: ${numberFormat.format(Math.round(match.stats.average))} ac
Median: ${numberFormat.format(Math.round(match.stats.median))} ac
Min-Max: ${numberFormat.format(Math.round(match.stats.min))} - ${numberFormat.format(Math.round(match.stats.max))} ac`,
      event.clientX,
      event.clientY
    );
  }

  if (config.type === "map") {
    if (x < config.left || x > config.right || y < config.top || y > config.bottom) {
      hideTooltip();
      return;
    }
    showTooltip(`Mapped fires in filter: ${numberFormat.format(config.points.length)}`, event.clientX, event.clientY);
  }
}

function ensureTooltipElement() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "chart-tooltip";
  document.body.append(tooltipEl);
  return tooltipEl;
}

function showTooltip(text, clientX, clientY) {
  const tip = ensureTooltipElement();
  tip.textContent = text;
  tip.style.display = "block";
  const margin = 14;
  const maxLeft = window.innerWidth - tip.offsetWidth - 8;
  const maxTop = window.innerHeight - tip.offsetHeight - 8;
  tip.style.left = `${Math.max(8, Math.min(maxLeft, clientX + margin))}px`;
  tip.style.top = `${Math.max(8, Math.min(maxTop, clientY + margin))}px`;
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.style.display = "none";
  }
}

function mapRow(row) {
  const year = Number.parseInt(String(row.YEARNO), 10);
  if (!Number.isFinite(year)) return null;

  const date = parseDate(row.StartDate);
  const outDate = parseDate(row.OutDate);
  let durationDays = null;
  if (date && outDate) {
    const msDiff = outDate.getTime() - date.getTime();
    if (msDiff >= 0) {
      durationDays = Math.round(msDiff / 86400000);
    }
  }
  return {
    year,
    fireName: normalize(row.FireName),
    fireType: normalize(row.FireType).toUpperCase(),
    response: normalize(row.Response),
    generalCause: normalize(row.GeneralCause),
    specificCause: normalize(row.SpecificCause),
    fireUse: normalize(row.FireUse),
    acres: Number.isFinite(Number.parseFloat(row.GIS_Acres)) ? Number.parseFloat(row.GIS_Acres) : 0,
    startDate: date,
    outDate,
    durationDays,
    month: date ? date.getMonth() + 1 : null,
    lat: Number.parseFloat(row.LatNAD83),
    lon: Number.parseFloat(row.LongNAD83)
  };
}

function parseDate(value) {
  if (!value) return null;
  const [datePart] = value.split(" ");
  const segments = datePart.split("/").map((segment) => Number.parseInt(segment, 10));
  if (segments.length !== 3 || segments.some((segment) => Number.isNaN(segment))) {
    return null;
  }
  const [month, day, year] = segments;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCsv(text) {
  const sanitized = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < sanitized.length; i += 1) {
    const char = sanitized[i];
    const next = sanitized[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((entry) => entry.some((cell) => cell !== ""))
    .map((entry) => {
      const mapped = {};
      headers.forEach((header, index) => {
        mapped[header] = entry[index] || "";
      });
      return mapped;
    });
}

function buildYearRange(start, end) {
  const years = [];
  for (let year = start; year <= end; year += 1) {
    years.push(year);
  }
  return years;
}

function splitRecords(records) {
  const prescribed = [];
  const wildfires = [];

  records.forEach((record) => {
    if (isPrescribedRecord(record)) {
      prescribed.push(record);
    } else {
      wildfires.push(record);
    }
  });

  return { prescribed, wildfires };
}

function isPrescribedRecord(record) {
  const generalCause = record.generalCause.toLowerCase();
  const specificCause = record.specificCause.toLowerCase();
  return record.fireType === "RX" || generalCause.includes("prescribed") || specificCause.includes("prescribed");
}

function computeSizeStats(values) {
  if (!values.length) {
    return { average: 0, stdDev: 0, min: 0, median: 0, max: 0 };
  }
  const average = sum(values) / values.length;
  const variance = values.reduce((acc, value) => {
    const diff = value - average;
    return acc + diff * diff;
  }, 0) / values.length;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const min = Math.min(...values);
  const median = computeMedian(values);
  const max = Math.max(...values);
  return { average, stdDev, min, median, max };
}

function computeMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function normalize(value) {
  const trimmed = String(value || "").trim();
  return trimmed.length ? trimmed : "Unknown";
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function csvCell(value) {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withAlpha(hex, alpha) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function debounce(fn, waitMs) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), waitMs);
  };
}
