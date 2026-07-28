/* Interactive bits for the entry mockup only */

const sundayDate = document.getElementById("sunday-date");
const weekRange = document.getElementById("week-range");
const sundayInPersonDate = document.getElementById("sunday-in-person-date");
const ccnDate = document.getElementById("ccn-date");
const snowClosed = document.getElementById("snow-closed");
const snowToggle = document.getElementById("snow-toggle");
const snowPanel = document.getElementById("snow-panel");
const sundayServices = document.getElementById("sunday-services");
const addSpecial = document.getElementById("add-special");
const specialAddType = document.getElementById("special-add-type");
const specialList = document.getElementById("special-list");
const specialTemplate = document.getElementById("special-row-template");
const saveWeek = document.getElementById("save-week");
const saveDraft = document.getElementById("save-draft");
const saveNote = document.getElementById("save-note");

function formatDay(d) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function formatDayYear(d) {
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatWeekdayLabel(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function parseSunday() {
  const value = sundayDate.value;
  if (!value) return null;
  return new Date(value + "T12:00:00");
}

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function offsetFromSunday(sunday, days) {
  const d = new Date(sunday);
  d.setDate(d.getDate() + days);
  return d;
}

/** Default special-service date from the chosen Sunday week / year. */
function defaultDateForSpecialType(type, sunday) {
  if (!sunday) return "";
  switch (type) {
    case "Ash Wednesday":
      return toInputDate(offsetFromSunday(sunday, 3)); // Wed of this week
    case "Maundy Thursday":
      return toInputDate(offsetFromSunday(sunday, 4));
    case "Good Friday":
      return toInputDate(offsetFromSunday(sunday, 5));
    case "Christmas Eve":
      return `${sunday.getFullYear()}-12-24`;
    default:
      return toInputDate(sunday);
  }
}

function updateWeekRange() {
  const start = parseSunday();
  if (!start) {
    weekRange.textContent = "Pick a Sunday to set the week";
    sundayInPersonDate.textContent = "Pick a Sunday above";
    ccnDate.textContent = "Pick a Sunday above";
    return;
  }
  const end = offsetFromSunday(start, 6);
  const wed = offsetFromSunday(start, 3);
  const sameMonth = start.getMonth() === end.getMonth();
  const range = sameMonth
    ? `${formatDay(start)} – ${end.getDate()}, ${end.getFullYear()}`
    : `${formatDay(start)} – ${formatDayYear(end)}`;
  weekRange.textContent = `Week of ${range}`;
  sundayInPersonDate.textContent = formatWeekdayLabel(start);
  ccnDate.textContent = formatWeekdayLabel(wed);
}

function isSnowValue(raw) {
  return String(raw || "").trim().toUpperCase() === "SNOW";
}

function isSnowPrefix(raw) {
  const upper = String(raw || "").trim().toUpperCase();
  return upper.length > 0 && /^[A-Z]+$/.test(upper) && "SNOW".startsWith(upper);
}

function normalizeCountInput(input, finalize = false) {
  const raw = input.value.trim();
  if (!raw) {
    input.value = "";
    return;
  }
  if (isSnowValue(raw)) {
    input.value = "SNOW";
    return;
  }
  if (isSnowPrefix(raw)) {
    input.value = finalize ? "" : raw.toUpperCase();
    return;
  }
  input.value = raw.replace(/[^\d]/g, "");
}

function syncSnowStyles() {
  const inputs = [...sundayServices.querySelectorAll(".count-input")];
  inputs.forEach((input) => {
    const card = input.closest(".count-card");
    const snow = isSnowValue(input.value);
    card.classList.toggle("is-snow", snow);
  });
  const anySnow = inputs.some((input) => isSnowValue(input.value));
  snowClosed.checked = inputs.length > 0 && inputs.every((input) => isSnowValue(input.value));
  snowToggle.classList.toggle("has-snow", anySnow);
}

function setSnowPanelOpen(open) {
  snowPanel.hidden = !open;
  snowToggle.setAttribute("aria-expanded", open ? "true" : "false");
  snowToggle.classList.toggle("is-open", open);
}

function applyFullSnow(on) {
  sundayServices.querySelectorAll(".count-input").forEach((input) => {
    if (on) {
      input.value = "SNOW";
    } else if (isSnowValue(input.value)) {
      input.value = "";
    }
  });
  syncSnowStyles();
}

sundayDate.addEventListener("change", updateWeekRange);

snowToggle.addEventListener("click", () => {
  setSnowPanelOpen(snowPanel.hidden);
});

snowClosed.addEventListener("change", () => {
  applyFullSnow(snowClosed.checked);
  if (snowClosed.checked) setSnowPanelOpen(true);
});

sundayServices.addEventListener("input", (e) => {
  if (!e.target.classList.contains("count-input")) return;
  normalizeCountInput(e.target, false);
  syncSnowStyles();
});

sundayServices.addEventListener("blur", (e) => {
  if (!e.target.classList.contains("count-input")) return;
  normalizeCountInput(e.target, true);
  syncSnowStyles();
}, true);

function applySpecialDate(select, dateInput) {
  dateInput.value = defaultDateForSpecialType(select.value, parseSunday());
}

function addSpecialRow(type) {
  specialList.hidden = false;
  const node = specialTemplate.content.cloneNode(true);
  const row = node.querySelector(".special-row");
  const select = row.querySelector(".special-type");
  const title = row.querySelector(".special-title");
  const dateInput = row.querySelector(".special-date");
  if (type) {
    select.value = type;
    title.textContent = type;
  }
  applySpecialDate(select, dateInput);
  select.addEventListener("change", () => {
    title.textContent = select.value;
    applySpecialDate(select, dateInput);
  });
  specialList.appendChild(node);
}

addSpecial.addEventListener("click", () => {
  const type = specialAddType.value;
  if (!type) {
    specialAddType.focus();
    return;
  }
  addSpecialRow(type);
  specialAddType.value = "";
});

specialList.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-special");
  if (!btn) return;
  btn.closest(".special-row").remove();
  if (!specialList.children.length) specialList.hidden = true;
});

function flashSaved(message) {
  saveNote.hidden = false;
  saveNote.textContent = message;
}

saveDraft.addEventListener("click", () => {
  flashSaved("Draft saved (mock) — come back later for online or Wednesday counts.");
});

saveWeek.addEventListener("click", () => {
  flashSaved("Week saved (mock) — report would rebuild; Teams Excel would update.");
});

updateWeekRange();
syncSnowStyles();
