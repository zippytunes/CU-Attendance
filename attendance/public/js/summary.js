/* Executive attendance summary — data only */

const COLORS = {
  inPerson: "#6b2d5b",
  traditional: "#2b6cb0",
  contemporary: "#2f855a",
  kids: "#c05621",
  online: "#718096",
  easter: "#6b2d5b",
  xmas: "#1f3a5f",
  grid: "rgba(28, 36, 48, 0.08)",
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

function fillTable(id, rows) {
  const tbody = document.querySelector(`#${id} tbody`);
  if (!tbody) return;
  tbody.innerHTML = rows
    .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
}

function barChart(canvasId, labels, values, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: color,
          borderRadius: 4,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmt(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#5c6775", font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: {
            color: "#5c6775",
            font: { size: 11 },
            callback: (v) => fmt(v),
          },
        },
      },
    },
  });
}

function lineChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: "#5c6775" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#5c6775", font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: {
            color: "#5c6775",
            font: { size: 11 },
            callback: (v) => fmt(v),
          },
        },
      },
    },
  });
}

function render(data) {
  const ov = data.overview;
  const year = ov.current_year;

  document.getElementById("header-range").textContent =
    `Ordinary Sunday averages · Through ${ov.date_end}`;

  document.getElementById("hero-avg").textContent = fmt(ov.ytd_avg_in_person);
  document.getElementById("hero-label").textContent =
    `${year} weekly average — in person`;
  document.getElementById("hero-sub").textContent =
    `${ov.ytd_sundays} ordinary Sundays year-to-date`;

  document.getElementById("hero-stats").innerHTML = [
    { num: pct(ov.vs_prior_year_pct), label: `vs prior-year stretch<br/>(avg ${fmt(ov.prior_stretch_avg)})` },
    { num: pct(ov.change_vs_first_year_pct), label: `since ${ov.first_year}<br/>(from ${fmt(ov.first_year_avg)})` },
    { num: fmt(ov.prior_stretch_avg), label: "prior-year stretch<br/>average" },
    { num: fmt(ov.first_year_avg), label: `${ov.first_year} full-year<br/>average` },
  ]
    .map(
      (s) =>
        `<div class="stat"><span class="num">${s.num}</span><span class="label">${s.label}</span></div>`
    )
    .join("");

  const yearly = ov.yearly_averages || [];
  barChart(
    "chart-yearly",
    yearly.map((y) => String(y.year)),
    yearly.map((y) => y.avg_in_person),
    COLORS.inPerson
  );

  fillTable(
    "yearly-table",
    yearly.map((y) => [
      y.year,
      fmt(y.avg_in_person),
      fmt(y.avg_traditional),
      fmt(y.avg_contemporary),
      fmt(y.avg_kids),
      fmt(y.avg_online),
      fmt(y.sundays),
    ])
  );

  const easter = data.holidays.easter || [];
  barChart(
    "chart-easter",
    easter.map((e) => String(e.year)),
    easter.map((e) => e.in_person),
    COLORS.easter
  );
  fillTable(
    "easter-table",
    easter.map((e) => [e.year, fmt(e.in_person)])
  );

  const xmas = data.holidays.christmas_eve || [];
  barChart(
    "chart-xmas",
    xmas.map((e) => String(e.year)),
    xmas.map((e) => e.in_person_total),
    COLORS.xmas
  );
  fillTable(
    "xmas-table",
    xmas.map((e) => [e.year, fmt(e.in_person_total)])
  );

  const holy = data.holidays.holy_week || [];
  fillTable(
    "holy-table",
    holy.map((e) => {
      const labels = Object.fromEntries(
        (e.services || []).map((s) => [s.service_label, s.in_person])
      );
      return [
        e.year,
        fmt(labels["Stations of the Cross"]),
        fmt(labels["Maundy Thursday"]),
        fmt(labels["Good Friday"]),
        fmt(e.in_person_total),
      ];
    })
  );

  const stream = data.streaming?.yearly || [];
  lineChart(
    "chart-online",
    stream.map((y) => String(y.year)),
    [
      {
        label: "Online",
        data: stream.map((y) => y.avg_online),
        borderColor: COLORS.online,
        backgroundColor: "transparent",
        tension: 0.25,
        pointRadius: 3,
      },
      {
        label: "Boxcast",
        data: stream.map((y) => y.avg_boxcast),
        borderColor: COLORS.traditional,
        backgroundColor: "transparent",
        tension: 0.25,
        pointRadius: 3,
      },
      {
        label: "YouTube",
        data: stream.map((y) => y.avg_youtube),
        borderColor: COLORS.contemporary,
        backgroundColor: "transparent",
        tension: 0.25,
        pointRadius: 3,
      },
    ]
  );
  fillTable(
    "online-table",
    stream.map((y) => [
      y.year,
      fmt(y.avg_online),
      fmt(y.avg_boxcast),
      fmt(y.avg_youtube),
    ])
  );

  document.getElementById("footer-meta").textContent =
    `Generated ${data.generated} · Concord United Methodist Church · ${ov.date_start} → ${ov.date_end}`;
}

async function main() {
  const res = await fetch("data/report.json");
  if (!res.ok) throw new Error(`Failed to load report.json (${res.status})`);
  render(await res.json());
}

main().catch((err) => {
  console.error(err);
  document.getElementById("hero-sub").textContent = "Could not load attendance data.";
});
