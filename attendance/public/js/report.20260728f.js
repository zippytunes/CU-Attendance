/* Concord attendance report */

const COLORS = {
  in_person: "#6b2d5b",
  traditional: "#2b6cb0",
  contemporary: "#2f855a",
  kids: "#c05621",
  online: "#718096",
  snow: "#8a6a2f",
  easter: "#c9a84c",
  christmas: "#b91c1c",
  ash: "#8a8680",
  holyStations: "#b8a4d4",
  holyMaundy: "#7d5fad",
  holyFriday: "#4a2f73",
  // Distinct year hues — avoid Traditional blue / Contemporary green
  years: ["#e11d48", "#c026d3", "#ea580c", "#ca8a04", "#7c3aed", "#db2777", "#9333ea", "#f97316"],
};

const state = {
  data: null,
  year: null,
  monthKey: null,
  monthHourKey: null,
  overviewSeries: "in_person",
  yearlySeries: "in_person",
  yearSeries: "in_person",
  monthService: "in_person",
  rhythmService: "in_person",
  rhythmHidden: new Set(),
  easterYear: null,
  ashYear: null,
  xmasYear: null,
  addOnline: {
    overview: false,
    year: false,
    month: false,
    rhythm: false,
    easter: false,
    christmas: false,
  },
  charts: {},
};

function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function pct(n) {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmt(n, 1)}%`;
}

function shortDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function monthYearLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function canvasEl(id) {
  return document.getElementById(id);
}

function makeChart(stateKey, canvasId, config) {
  const el = canvasEl(canvasId);
  if (!el) {
    console.warn(`Missing canvas #${canvasId}`);
    return null;
  }
  if (typeof Chart === "undefined") {
    throw new Error("Chart.js failed to load. Check that js/chart.umd.min.js is reachable.");
  }
  destroyChart(stateKey);
  config.options = config.options || {};
  config.options.animation = false;
  state.charts[stateKey] = new Chart(el, config);
  return state.charts[stateKey];
}

function setScopeTag(id, withOnline) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = withOnline ? "In person + online" : "In person only";
  el.classList.toggle("with-online", !!withOnline);
  el.setAttribute("aria-pressed", withOnline ? "true" : "false");
}

function wireScopeToggle(id, key, rerender) {
  const el = document.getElementById(id);
  if (!el || el.tagName !== "BUTTON") return;
  el.addEventListener("click", () => {
    state.addOnline[key] = !state.addOnline[key];
    rerender();
  });
}

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(ctx) {
            const v = ctx.parsed.y;
            if (v === null || v === undefined) return `${ctx.dataset.label}: (no data)`;
            return `${ctx.dataset.label}: ${fmt(v)}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(28,36,48,0.06)" },
      },
    },
    ...extra,
  };
}

function lineDataset(label, values, color, filled = false) {
  return {
    label,
    data: values,
    borderColor: color,
    backgroundColor: filled ? color + "33" : "transparent",
    fill: filled,
    tension: 0.25,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2.25,
    spanGaps: true,
  };
}

function bridgeSnowGaps(values, meta) {
  const out = values.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) continue;
    if (!meta[i] || !meta[i].is_snow) continue;
    let p = i - 1;
    let n = i + 1;
    while (p >= 0 && values[p] == null) p -= 1;
    while (n < values.length && values[n] == null) n += 1;
    const left = p >= 0 ? values[p] : null;
    const right = n < values.length ? values[n] : null;
    if (left != null && right != null) {
      out[i] = Math.round(left + ((right - left) * (i - p)) / (n - p));
    } else if (left != null) {
      out[i] = left;
    } else if (right != null) {
      out[i] = right;
    }
  }
  return out;
}

function isFullSnowClosure(metaItem, originalValue) {
  if (!metaItem || !metaItem.is_snow) return false;
  if (metaItem.exclude_from_averages) return true;
  return originalValue == null || originalValue === 0;
}

function snowMarkerDataset(bridged, meta, originalValues) {
  return {
    label: "Snow closure",
    data: bridged.map((v, i) =>
      isFullSnowClosure(meta[i], originalValues[i]) ? v : null
    ),
    borderColor: COLORS.snow,
    backgroundColor: "#e8d5a3",
    pointStyle: "rectRot",
    pointRadius: 7,
    pointHoverRadius: 9,
    pointBorderWidth: 2,
    pointBorderColor: COLORS.snow,
    showLine: false,
    order: 0,
  };
}

function hasSnowMarkers(meta, originalValues) {
  return meta.some((m, i) => isFullSnowClosure(m, originalValues[i]));
}

function snowBandPlugin(meta, originalValues) {
  return {
    id: "snowBands",
    beforeDatasetsDraw(chart) {
      const xScale = chart.scales.x;
      const { top, bottom } = chart.chartArea;
      if (!xScale || !meta) return;
      const ctx = chart.ctx;
      meta.forEach((m, i) => {
        if (!isFullSnowClosure(m, originalValues ? originalValues[i] : null)) return;
        const left = xScale.getPixelForValue(i - 0.45);
        const right = xScale.getPixelForValue(i + 0.45);
        const width = Math.max(right - left, 6);
        ctx.save();
        ctx.fillStyle = "rgba(176, 120, 48, 0.18)";
        ctx.fillRect(left, top, width, bottom - top);
        ctx.fillStyle = "#8a6a2f";
        ctx.font = "600 10px 'Source Sans 3', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("Snow", left + width / 2, top + 4);
        ctx.restore();
      });
    },
  };
}

function combineSeries(a, b) {
  const len = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av == null && bv == null) out.push(null);
    else out.push((av || 0) + (bv || 0));
  }
  return out;
}

function niceAxisMax(values) {
  const nums = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  if (!nums.length) return undefined;
  const peak = Math.max(...nums, 0);
  if (peak <= 0) return 10;
  const padded = peak * 1.1;
  const mag = Math.pow(10, Math.floor(Math.log10(padded)));
  const step = mag / (padded / mag < 2 ? 2 : 1);
  return Math.ceil(padded / step) * step;
}

function lockedYScale(values) {
  const max = niceAxisMax(values);
  return {
    x: {
      ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
      grid: { display: false },
    },
    y: {
      beginAtZero: true,
      max,
      grid: { color: "rgba(28,36,48,0.06)" },
    },
  };
}

function ensureInPersonDefaults() {
  state.overviewSeries = "in_person";
  state.yearlySeries = "in_person";
  state.yearSeries = "in_person";
  state.monthService = "in_person";
  state.rhythmService = "in_person";
  state.addOnline.overview = false;
  state.addOnline.year = false;
  state.addOnline.month = false;
  state.addOnline.rhythm = false;
  state.addOnline.easter = false;
  state.addOnline.christmas = false;

  document.querySelectorAll("#overview-toggles .chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.series === "in_person");
  });
  document.querySelectorAll("#yearly-toggles .chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.yearly === "in_person");
  });
  document.querySelectorAll("#year-series-toggles .chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.yseries === "in_person");
  });
  const monthService = document.getElementById("month-service");
  if (monthService) monthService.value = "in_person";
  const rhythmService = document.getElementById("rhythm-service");
  if (rhythmService) rhythmService.value = "in_person";
}

function serviceColor(key) {
  return COLORS[key] || COLORS.in_person;
}

function serviceLabel(key) {
  return (
    {
      in_person: "In person",
      traditional: "Traditional",
      contemporary: "Contemporary",
      kids: "Kids 11am",
      online: "Online",
      combined: "In person + online",
    }[key] || key
  );
}

function xmasServiceColor(label) {
  const s = (label || "").toUpperCase();
  if (s.includes(" - C") || s.endsWith("- C") || /\bC\b/.test(s) && !s.includes("T")) {
    if (s.includes("- C") || s.includes(" C") || s.endsWith("C")) return COLORS.contemporary;
  }
  if (s.includes("- T") || s.includes(" T") || s.endsWith("T") || s.includes("TRAD")) {
    return COLORS.traditional;
  }
  if (s.includes("- C") || s.includes("CONT")) return COLORS.contemporary;
  // Heuristic: C after time
  if (/C\b/.test(s) && !/T\b/.test(s)) return COLORS.contemporary;
  if (/T\b/.test(s)) return COLORS.traditional;
  return COLORS.in_person;
}

function easterServiceColor(label) {
  const s = (label || "").toLowerCase();
  if (s.includes("traditional")) return COLORS.traditional;
  if (s.includes("contemporary")) return COLORS.contemporary;
  if (s.includes("kids")) return COLORS.kids;
  return COLORS.in_person;
}

async function loadData() {
  const res = await fetch("data/report.json?v=20260727d", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load data/report.json. Run scripts/rebuild_report.py first.");
  return res.json();
}

function renderTopline(data) {
  const ov = data.overview;
  document.getElementById("topline-stats").innerHTML = `
    <div class="stat">
      <span class="label">${ov.current_year} YTD avg</span>
      <span class="value">${fmt(ov.ytd_avg_in_person, 0)}</span>
      <span class="sub">in person · ${ov.ytd_sundays} ordinary Sundays</span>
    </div>
    <div class="stat">
      <span class="label">vs prior-year stretch</span>
      <span class="value">${pct(ov.vs_prior_year_pct)}</span>
      <span class="sub">prior stretch avg ${fmt(ov.prior_stretch_avg, 0)}</span>
    </div>
    <div class="stat">
      <span class="label">since ${ov.first_year}</span>
      <span class="value">${pct(ov.change_vs_first_year_pct)}</span>
      <span class="sub">from ${fmt(ov.first_year_avg, 0)} to ~${fmt(ov.ytd_avg_in_person, 0)}</span>
    </div>
    <div class="stat">
      <span class="label">Sundays recorded</span>
      <span class="value">${fmt(ov.sundays_recorded)}</span>
      <span class="sub">${ov.date_start} → ${ov.date_end}</span>
    </div>
  `;
  const startLabel = monthYearLabel(ov.date_start);
  document.getElementById("header-range").textContent =
    `Sunday attendance ${ov.date_start} through ${ov.date_end}. Weekly averages exclude snow closures, Christmas Eve, and Christmas Day on Sunday.`;
  document.getElementById("weekly-chart-title").textContent =
    `Sunday attendance, week by week · ${startLabel} to current`;
  document.getElementById("footer-meta").textContent =
    `Generated ${data.generated} · ${data.church} · ${data.title}`;
}

function overviewSeriesRaw(ov, key) {
  const map = {
    in_person: ov.weekly_in_person,
    traditional: ov.weekly_traditional,
    contemporary: ov.weekly_contemporary,
    kids: ov.weekly_kids,
    online: ov.weekly_online,
  };
  return map[key];
}

function renderOverviewCharts(data) {
  const ov = data.overview;
  const primary = overviewSeriesRaw(ov, state.overviewSeries);
  const meta = ov.weekly_in_person.meta;
  let values = primary.values.slice();
  if (state.addOnline.overview) {
    values = combineSeries(values, ov.weekly_online.values);
  }
  const bridged = bridgeSnowGaps(values, meta);
  const showSnow = hasSnowMarkers(meta, primary.values);
  setScopeTag("overview-scope-tag", state.addOnline.overview);

  makeChart("weekly", "chart-weekly", {
    type: "line",
    data: {
      labels: primary.labels.map(shortDate),
      datasets: [
        lineDataset(
          state.addOnline.overview
            ? `${serviceLabel(state.overviewSeries)} + online`
            : serviceLabel(state.overviewSeries),
          bridged,
          serviceColor(state.overviewSeries),
          true
        ),
        ...(showSnow ? [snowMarkerDataset(bridged, meta, primary.values)] : []),
      ],
    },
    options: baseOptions({
      plugins: {
        legend: {
          display: showSnow,
          position: "bottom",
          labels: {
            filter: (item) => item.text === "Snow closure",
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            title(items) {
              return primary.labels[items[0].dataIndex];
            },
            label(ctx) {
              if (ctx.dataset.label === "Snow closure") {
                return "Snow closure — building closed; excluded from averages";
              }
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return `${ctx.dataset.label}: (no data)`;
              return `${ctx.dataset.label}: ${fmt(v)}`;
            },
          },
        },
      },
    }),
    plugins: showSnow ? [snowBandPlugin(meta, primary.values)] : [],
  });

  const yearlyKey = state.yearlySeries;
  const yearlyField = {
    in_person: "avg_in_person",
    traditional: "avg_traditional",
    contemporary: "avg_contemporary",
    kids: "avg_kids",
  }[yearlyKey];
  let yearlyVals = ov.yearly_averages.map((y) => y[yearlyField]);
  if (state.addOnline.overview) {
    yearlyVals = ov.yearly_averages.map((y) => {
      const base = y[yearlyField];
      const online = y.avg_online;
      if (base == null && online == null) return null;
      return (base || 0) + (online || 0);
    });
  }
  setScopeTag("yearly-scope-tag", state.addOnline.overview);

  makeChart("yearly", "chart-yearly", {
    type: "bar",
    data: {
      labels: ov.yearly_averages.map((y) => String(y.year)),
      datasets: [
        {
          label: serviceLabel(yearlyKey),
          data: yearlyVals,
          backgroundColor: serviceColor(yearlyKey),
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function wireOverview(data) {
  document.querySelectorAll("#overview-toggles .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#overview-toggles .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.overviewSeries = btn.dataset.series;
      renderOverviewCharts(data);
    });
  });
  document.querySelectorAll("#yearly-toggles .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#yearly-toggles .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.yearlySeries = btn.dataset.yearly;
      renderOverviewCharts(data);
    });
  });
  const rerender = () => renderOverviewCharts(data);
  wireScopeToggle("overview-scope-tag", "overview", rerender);
  wireScopeToggle("yearly-scope-tag", "overview", rerender);
}

function renderYearTabs(containerId, selected, onPick) {
  const years = Object.keys(state.data.years).sort();
  const el = document.getElementById(containerId);
  el.innerHTML = years
    .map(
      (y) =>
        `<button type="button" class="chip ${y === selected ? "active" : ""}" data-year="${y}">${y}</button>`
    )
    .join("");
  el.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => onPick(btn.dataset.year));
  });
}

function renderYearExplorer(data) {
  const years = Object.keys(data.years).sort();
  if (!state.year) state.year = years[years.length - 1];

  renderYearTabs("year-tabs", state.year, (y) => {
    state.year = y;
    renderYearExplorer(data);
  });
  renderYearTabs("year-hour-tabs", state.year, (y) => {
    state.year = y;
    renderYearExplorer(data);
  });

  const y = data.years[state.year];
  document.getElementById("year-stats").innerHTML = `
    <div class="stat"><span class="label">Avg in person</span><span class="value">${fmt(y.avg_in_person, 0)}</span><span class="sub">${y.sundays} ordinary Sundays</span></div>
    <div class="stat"><span class="label">Avg Traditional</span><span class="value">${fmt(y.avg_traditional, 0)}</span><span class="sub">both hours</span></div>
    <div class="stat"><span class="label">Avg Contemporary</span><span class="value">${fmt(y.avg_contemporary, 0)}</span><span class="sub">both hours</span></div>
    <div class="stat"><span class="label">Avg online</span><span class="value">${fmt(y.avg_online, 0)}</span><span class="sub">streams</span></div>
  `;
  document.getElementById("year-weekly-title").textContent = `Weekly attendance — ${state.year}`;
  document.getElementById("year-hour-title").textContent =
    `Sunday Annual Average By Service — ${state.year}`;
  setScopeTag("year-scope-tag", state.addOnline.year);

  const seriesLookup = {
    in_person: y.series_in_person,
    traditional: y.series_traditional,
    contemporary: y.series_contemporary,
    kids: y.series_kids,
    online: y.series_online,
  };
  let raw = seriesLookup[state.yearSeries].slice();
  if (state.addOnline.year) raw = combineSeries(raw, y.series_online);
  const yearMeta = y.meta || [];
  const bridged = bridgeSnowGaps(raw, yearMeta);
  const showSnow = hasSnowMarkers(yearMeta, seriesLookup[state.yearSeries]);

  makeChart("yearWeekly", "chart-year-weekly", {
    type: "line",
    data: {
      labels: y.labels.map(shortDate),
      datasets: [
        lineDataset(serviceLabel(state.yearSeries), bridged, serviceColor(state.yearSeries), true),
        ...(showSnow ? [snowMarkerDataset(bridged, yearMeta, seriesLookup[state.yearSeries])] : []),
      ],
    },
    options: baseOptions({
      plugins: {
        legend: {
          display: showSnow,
          position: "bottom",
          labels: { filter: (item) => item.text === "Snow closure", usePointStyle: true },
        },
      },
    }),
    plugins: showSnow ? [snowBandPlugin(yearMeta, seriesLookup[state.yearSeries])] : [],
  });

  const hours = y.hour_averages;
  makeChart("yearHours", "chart-year-hours", {
    type: "bar",
    data: {
      labels: [
        "9 AM Traditional",
        "9 AM Contemporary",
        "11 AM Traditional",
        "11 AM Contemporary",
        "Kids 11am",
      ],
      datasets: [
        {
          label: "Average",
          data: [hours.trad_9, hours.cont_9, hours.trad_11, hours.cont_11, hours.kids_11],
          backgroundColor: [
            COLORS.traditional,
            COLORS.contemporary,
            COLORS.traditional,
            COLORS.contemporary,
            COLORS.kids,
          ],
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function wireYear(data) {
  document.querySelectorAll("#year-series-toggles .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#year-series-toggles .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.yearSeries = btn.dataset.yseries;
      renderYearExplorer(data);
    });
  });
  wireScopeToggle("year-scope-tag", "year", () => renderYearExplorer(data));
}

function syncMonthSelects(sourceYearId, sourceMonthId, targetYearId, targetMonthId) {
  const y = document.getElementById(sourceYearId).value;
  const m = document.getElementById(sourceMonthId).value;
  const ty = document.getElementById(targetYearId);
  const tm = document.getElementById(targetMonthId);
  if (ty && ty.value !== y) ty.value = y;
  populateMonthOptionsFor(targetMonthId, y);
  if (tm) tm.value = m;
}

function populateMonthOptionsFor(selectId, year) {
  const monthSel = document.getElementById(selectId);
  if (!monthSel) return;
  const months = Object.keys(state.data.months)
    .filter((k) => k.startsWith(year + "-"))
    .map((k) => k.slice(5))
    .sort();
  const names = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const current = monthSel.value;
  monthSel.innerHTML = months
    .map((m) => `<option value="${m}">${names[Number(m)]}</option>`)
    .join("");
  monthSel.value = months.includes(current) ? current : months[months.length - 1];
}

function fillYearSelect(selectId) {
  const years = [...new Set(Object.keys(state.data.months).map((k) => k.slice(0, 4)))];
  const sel = document.getElementById(selectId);
  sel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
  sel.value = years[years.length - 1];
}

function renderMonthExplorer(data) {
  const yearSel = document.getElementById("month-year");
  const monthSel = document.getElementById("month-month");
  const serviceSel = document.getElementById("month-service");
  if (!yearSel.options.length) {
    fillYearSelect("month-year");
    fillYearSelect("month-hour-year");
    populateMonthOptionsFor("month-month", yearSel.value);
    populateMonthOptionsFor("month-hour-month", yearSel.value);
    yearSel.addEventListener("change", () => {
      populateMonthOptionsFor("month-month", yearSel.value);
      document.getElementById("month-hour-year").value = yearSel.value;
      populateMonthOptionsFor("month-hour-month", yearSel.value);
      document.getElementById("month-hour-month").value = monthSel.value;
      renderMonthExplorer(data);
    });
    monthSel.addEventListener("change", () => {
      document.getElementById("month-hour-year").value = yearSel.value;
      populateMonthOptionsFor("month-hour-month", yearSel.value);
      document.getElementById("month-hour-month").value = monthSel.value;
      renderMonthExplorer(data);
    });
    serviceSel.addEventListener("change", () => {
      state.monthService = serviceSel.value;
      renderMonthExplorer(data);
    });
    document.getElementById("month-hour-year").addEventListener("change", () => {
      populateMonthOptionsFor("month-hour-month", document.getElementById("month-hour-year").value);
      yearSel.value = document.getElementById("month-hour-year").value;
      populateMonthOptionsFor("month-month", yearSel.value);
      monthSel.value = document.getElementById("month-hour-month").value;
      renderMonthExplorer(data);
    });
    document.getElementById("month-hour-month").addEventListener("change", () => {
      monthSel.value = document.getElementById("month-hour-month").value;
      yearSel.value = document.getElementById("month-hour-year").value;
      renderMonthExplorer(data);
    });
    wireScopeToggle("month-scope-tag", "month", () => renderMonthExplorer(data));
  }

  state.monthService = serviceSel.value;
  state.monthKey = `${yearSel.value}-${monthSel.value}`;
  state.monthHourKey = `${document.getElementById("month-hour-year").value}-${document.getElementById("month-hour-month").value}`;

  const m = data.months[state.monthKey];
  const mh = data.months[state.monthHourKey] || m;
  if (!m) return;

  document.getElementById("month-stats").innerHTML = `
    <div class="stat"><span class="label">${m.month_name} ${m.year}</span><span class="value">${fmt(m.avg_in_person, 0)}</span><span class="sub">avg in person</span></div>
    <div class="stat"><span class="label">Ordinary Sundays</span><span class="value">${fmt(m.sundays)}</span><span class="sub">in averages</span></div>
    <div class="stat"><span class="label">Avg online</span><span class="value">${fmt(m.avg_online, 0)}</span><span class="sub">streams</span></div>
    <div class="stat"><span class="label">Sundays shown</span><span class="value">${fmt(m.labels.length)}</span><span class="sub">including special days</span></div>
  `;
  document.getElementById("month-weekly-title").textContent =
    `Attendance: Sundays - ${m.month_name} ${m.year}`;
  document.getElementById("month-hour-title").textContent =
    `Average Sunday Attendance By Service — ${mh.month_name} ${mh.year}`;
  setScopeTag("month-scope-tag", state.addOnline.month);

  const seriesMap = {
    in_person: m.series_in_person,
    traditional: m.series_traditional,
    contemporary: m.series_contemporary,
    kids: m.series_kids,
  };
  let primary = (seriesMap[state.monthService] || m.series_in_person).slice();
  const datasets = [
    {
      label: serviceLabel(state.monthService),
      data: primary,
      backgroundColor: serviceColor(state.monthService),
      borderRadius: 6,
    },
  ];
  if (state.addOnline.month) {
    datasets.push({
      label: "Online",
      data: m.series_online,
      backgroundColor: COLORS.online,
      borderRadius: 6,
    });
  }

  // Keep Y-axis locked to in-person range so Trad/Cont/Kids compare honestly
  let axisBasis = m.series_in_person.slice();
  if (state.addOnline.month) {
    axisBasis = combineSeries(m.series_in_person, m.series_online);
  }

  makeChart("monthWeekly", "chart-month-weekly", {
    type: "bar",
    data: { labels: m.labels.map(shortDate), datasets },
    options: baseOptions({
      plugins: { legend: { display: state.addOnline.month, position: "bottom" } },
      scales: lockedYScale(axisBasis),
    }),
  });

  const hours = mh.hour_averages;
  makeChart("monthHours", "chart-month-hours", {
    type: "bar",
    data: {
      labels: ["9 AM Traditional", "9 AM Contemporary", "11 AM Traditional", "11 AM Contemporary", "Kids 11am"],
      datasets: [
        {
          label: "Average",
          data: [hours.trad_9, hours.cont_9, hours.trad_11, hours.cont_11, hours.kids_11],
          backgroundColor: [
            COLORS.traditional,
            COLORS.contemporary,
            COLORS.traditional,
            COLORS.contemporary,
            COLORS.kids,
          ],
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function renderRhythm(data) {
  const byService = (data.rhythm.by_service && data.rhythm.by_service[state.rhythmService]) || data.rhythm.by_year;
  const onlineByYear = (data.rhythm.by_service && data.rhythm.by_service.online) || {};
  const years = Object.keys(byService).sort();
  setScopeTag("rhythm-scope-tag", state.addOnline.rhythm);
  const toggles = document.getElementById("rhythm-year-toggles");
  toggles.innerHTML =
    `<span class="hint-inline">Click a year to show/hide:</span>` +
    years
      .map((y, i) => {
        const on = !state.rhythmHidden.has(y);
        return `<button type="button" class="chip ${on ? "active" : "year-off"}" data-ryear="${y}" style="${on ? `border-color:${COLORS.years[i % COLORS.years.length]};` : ""}">${y}</button>`;
      })
      .join("");
  toggles.querySelectorAll("button.chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const y = btn.dataset.ryear;
      if (state.rhythmHidden.has(y)) state.rhythmHidden.delete(y);
      else state.rhythmHidden.add(y);
      renderRhythm(data);
    });
  });

  const scopeLabel = state.addOnline.rhythm
    ? `${serviceLabel(state.rhythmService).toLowerCase()} + online`
    : serviceLabel(state.rhythmService).toLowerCase();
  document.getElementById("rhythm-title").textContent =
    `Average ${scopeLabel} attendance by month`;

  const datasets = years
    .filter((y) => !state.rhythmHidden.has(y))
    .map((y) => {
      const i = years.indexOf(y);
      const color = COLORS.years[i % COLORS.years.length];
      let values = byService[y];
      if (state.addOnline.rhythm) {
        values = combineSeries(values, onlineByYear[y] || []);
      }
      return {
        label: y,
        data: values,
        borderColor: color,
        backgroundColor: color + "22",
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.75,
        spanGaps: false,
      };
    });

  makeChart("rhythm", "chart-rhythm", {
    type: "line",
    data: { labels: data.rhythm.labels, datasets },
    options: baseOptions({
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 10 },
        },
      },
    }),
  });
}

function wireRhythm(data) {
  document.getElementById("rhythm-service").addEventListener("change", (e) => {
    state.rhythmService = e.target.value;
    renderRhythm(data);
  });
}

function renderAshWednesday(data) {
  const ash = data.holidays.ash_wednesday || [];
  makeChart("ash", "chart-ash", {
    type: "bar",
    data: {
      labels: ash.map((a) => String(a.year)),
      datasets: [
        {
          label: "In person total",
          data: ash.map((a) => a.in_person_total),
          backgroundColor: COLORS.ash,
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });

  if (!state.ashYear && ash.length) state.ashYear = String(ash[ash.length - 1].year);
  const tabs = document.getElementById("ash-year-tabs");
  if (tabs) {
    tabs.innerHTML = ash
      .map(
        (a) =>
          `<button type="button" class="chip ${String(a.year) === state.ashYear ? "active" : ""}" data-ay="${a.year}">${a.year}</button>`
      )
      .join("");
    tabs.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.ashYear = btn.dataset.ay;
        renderAshWednesday(data);
      });
    });
  }

  const current = ash.find((a) => String(a.year) === state.ashYear);
  const services = (current && current.services) || [];
  makeChart("ashServices", "chart-ash-services", {
    type: "bar",
    data: {
      labels: services.map((s) => s.service_label),
      datasets: [
        {
          label: "In person",
          data: services.map((s) => s.in_person),
          backgroundColor: COLORS.ash,
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function renderHolyWeek(data) {
  const holy = data.holidays.holy_week || [];
  const labels = holy.map((h) => String(h.year));
  const seriesDefs = [
    { key: "Stations of the Cross", color: COLORS.holyStations },
    { key: "Maundy Thursday", color: COLORS.holyMaundy },
    { key: "Good Friday", color: COLORS.holyFriday },
  ];
  const datasets = seriesDefs.map((def) => ({
    label: def.key,
    data: holy.map((h) => {
      const hit = (h.services || []).find((s) => s.service_label === def.key);
      return hit ? hit.in_person : null;
    }),
    backgroundColor: def.color,
    borderRadius: 6,
  }));

  makeChart("holyWeek", "chart-holy-week", {
    type: "bar",
    data: { labels, datasets },
    options: baseOptions({
      plugins: { legend: { display: true, position: "bottom" } },
    }),
  });
}

function renderEaster(data) {
  const easter = data.holidays.easter || [];
  setScopeTag("easter-scope-tag", state.addOnline.easter);
  const datasets = [
    {
      label: "In person",
      data: easter.map((e) => e.in_person),
      backgroundColor: COLORS.easter,
      borderRadius: 6,
    },
  ];
  if (state.addOnline.easter) {
    datasets.push({
      label: "Online",
      data: easter.map((e) => e.online),
      backgroundColor: COLORS.online,
      borderRadius: 6,
    });
  }
  makeChart("easter", "chart-easter", {
    type: "bar",
    data: { labels: easter.map((e) => String(e.year)), datasets },
    options: baseOptions({
      plugins: { legend: { display: state.addOnline.easter, position: "bottom" } },
    }),
  });

  if (!state.easterYear && easter.length) state.easterYear = String(easter[easter.length - 1].year);
  const tabs = document.getElementById("easter-year-tabs");
  if (tabs) {
    tabs.innerHTML = easter
      .map(
        (e) =>
          `<button type="button" class="chip ${String(e.year) === state.easterYear ? "active" : ""}" data-ey="${e.year}">${e.year}</button>`
      )
      .join("");
    tabs.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.easterYear = btn.dataset.ey;
        renderEaster(data);
      });
    });
  }

  const current = easter.find((e) => String(e.year) === state.easterYear);
  const services = (current && current.services) || [];
  makeChart("easterServices", "chart-easter-services", {
    type: "bar",
    data: {
      labels: services.map((s) => s.service_label.replace("Kids Worship 11AM", "Kids 11am")),
      datasets: [
        {
          label: "In person",
          data: services.map((s) => s.in_person),
          backgroundColor: services.map((s) => easterServiceColor(s.service_label)),
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function renderChristmas(data) {
  const xmas = data.holidays.christmas_eve || [];
  setScopeTag("xmas-scope-tag", state.addOnline.christmas);
  const datasets = [
    {
      label: "In person total",
      data: xmas.map((x) => x.in_person_total),
      backgroundColor: COLORS.christmas,
      borderRadius: 6,
    },
  ];
  if (state.addOnline.christmas) {
    datasets.push({
      label: "Online",
      data: xmas.map((x) => x.online_total),
      backgroundColor: COLORS.online,
      borderRadius: 6,
    });
  }
  makeChart("xmasTotals", "chart-xmas-totals", {
    type: "bar",
    data: {
      labels: xmas.map((x) => String(x.year)),
      datasets,
    },
    options: baseOptions({
      plugins: { legend: { display: state.addOnline.christmas, position: "bottom" } },
    }),
  });

  if (!state.xmasYear && xmas.length) state.xmasYear = String(xmas[xmas.length - 1].year);
  const tabs = document.getElementById("xmas-year-tabs");
  tabs.innerHTML = xmas
    .map(
      (x) =>
        `<button type="button" class="chip ${String(x.year) === state.xmasYear ? "active" : ""}" data-xy="${x.year}">${x.year}</button>`
    )
    .join("");
  tabs.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.xmasYear = btn.dataset.xy;
      renderChristmas(data);
    });
  });

  const current = xmas.find((x) => String(x.year) === state.xmasYear);
  const services = (current && current.services) || [];
  makeChart("xmasServices", "chart-xmas-services", {
    type: "bar",
    data: {
      labels: services.map((s) => s.service_label),
      datasets: [
        {
          label: "In person",
          data: services.map((s) => s.in_person),
          backgroundColor: services.map((s) => xmasServiceColor(s.service_label)),
          borderRadius: 6,
        },
      ],
    },
    options: baseOptions(),
  });
}

function renderStreaming(data) {
  const yearly = data.streaming.yearly || [];
  makeChart("streaming", "chart-streaming", {
    type: "bar",
    data: {
      labels: yearly.map((y) => String(y.year)),
      datasets: [
        { label: "Boxcast", data: yearly.map((y) => y.avg_boxcast), backgroundColor: "#4a5568", borderRadius: 4 },
        { label: "YouTube", data: yearly.map((y) => y.avg_youtube), backgroundColor: COLORS.online, borderRadius: 4 },
        { label: "Facebook", data: yearly.map((y) => y.avg_facebook), backgroundColor: "#a0aec0", borderRadius: 4 },
      ],
    },
    options: baseOptions({
      plugins: { legend: { display: true, position: "bottom" } },
    }),
  });
}

function renderNotes(data) {
  document.getElementById("notes-list").innerHTML = (data.data_notes || [])
    .map((n) => `<li>${n}</li>`)
    .join("");
}

async function main() {
  try {
    if (typeof Chart === "undefined") {
      throw new Error("Chart.js did not load (js/chart.umd.min.js).");
    }
    const data = await loadData();
    state.data = data;
    ensureInPersonDefaults();
    renderTopline(data);
    const steps = [
      ["overview", () => { wireOverview(data); renderOverviewCharts(data); }],
      ["year", () => { wireYear(data); renderYearExplorer(data); }],
      ["month", () => renderMonthExplorer(data)],
      ["rhythm", () => { wireRhythm(data); renderRhythm(data); wireScopeToggle("rhythm-scope-tag", "rhythm", () => renderRhythm(data)); }],
      ["ash", () => renderAshWednesday(data)],
      ["holy", () => renderHolyWeek(data)],
      ["easter", () => { wireScopeToggle("easter-scope-tag", "easter", () => renderEaster(data)); renderEaster(data); }],
      ["christmas", () => { wireScopeToggle("xmas-scope-tag", "christmas", () => renderChristmas(data)); renderChristmas(data); }],
      ["streaming", () => renderStreaming(data)],
      ["notes", () => renderNotes(data)],
    ];
    const failures = [];
    for (const [name, fn] of steps) {
      try {
        fn();
      } catch (err) {
        console.error(`Section failed: ${name}`, err);
        failures.push(`${name}: ${err.message}`);
      }
    }
    if (failures.length) {
      document.querySelector("main").insertAdjacentHTML(
        "afterbegin",
        `<div class="panel"><h2>Some charts failed to render</h2><p>${failures.join("<br>")}</p></div>`
      );
    }
  } catch (err) {
    document.querySelector("main").insertAdjacentHTML(
      "afterbegin",
      `<div class="panel"><h2>Could not load report data</h2><p>${err.message}</p></div>`
    );
    console.error(err);
  }
}

main();
