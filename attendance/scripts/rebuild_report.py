#!/usr/bin/env python3
"""Rebuild public/data/report.json from clean CSVs."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "public" / "data" / "report.json"

MONTH_NAMES = [
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
]


def parse_bool(v: str) -> bool:
    return str(v).strip().lower() in {"1", "true", "yes", "y"}


def parse_int(v):
    if v is None or str(v).strip() == "":
        return None
    try:
        return int(float(str(v).replace(",", "")))
    except ValueError:
        return None


def should_exclude_from_averages(d: date, is_snow: bool, in_person) -> bool:
    """Weekly averages exclude snow closures, Christmas Eve, and Christmas Day on Sunday.
    Easter and the Sunday after Christmas remain in averages.
    """
    if is_snow and (in_person is None or in_person == 0):
        return True
    if d.month == 12 and d.day == 24:
        return True
    if d.month == 12 and d.day == 25 and d.weekday() == 6:
        return True
    return False


def load_weekly() -> list[dict]:
    path = DATA / "weekly_attendance.csv"
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            d = date.fromisoformat(r["date"])
            is_snow = parse_bool(r.get("is_snow", ""))
            in_person = parse_int(r.get("in_person"))
            row = {
                "date": r["date"],
                "year": d.year,
                "month": d.month,
                "trad_9": parse_int(r.get("trad_9")),
                "cont_9": parse_int(r.get("cont_9")),
                "kids_11": parse_int(r.get("kids_11")),
                "trad_11": parse_int(r.get("trad_11")),
                "cont_11": parse_int(r.get("cont_11")),
                "boxcast_9": parse_int(r.get("boxcast_9")),
                "youtube_9": parse_int(r.get("youtube_9")),
                "facebook_9": parse_int(r.get("facebook_9")),
                "boxcast_11": parse_int(r.get("boxcast_11")),
                "youtube_11": parse_int(r.get("youtube_11")),
                "facebook_11": parse_int(r.get("facebook_11")),
                "in_person": in_person,
                "online": parse_int(r.get("online")),
                "total": parse_int(r.get("total")),
                "is_snow": is_snow,
                "is_easter": parse_bool(r.get("is_easter", "")),
                "is_christmas_eve": d.month == 12 and d.day == 24,
                "is_christmas_day": d.month == 12 and d.day == 25,
                "exclude_from_averages": should_exclude_from_averages(d, is_snow, in_person),
                "notes": (r.get("notes") or "").strip(),
            }
            # Recompute side totals for convenience
            trad = [row["trad_9"], row["trad_11"]]
            cont = [row["cont_9"], row["cont_11"]]
            row["traditional"] = sum(x for x in trad if x is not None) or None
            row["contemporary"] = sum(x for x in cont if x is not None) or None
            if row["traditional"] == 0 and all(x is None for x in trad):
                row["traditional"] = None
            if row["contemporary"] == 0 and all(x is None for x in cont):
                row["contemporary"] = None
            rows.append(row)
    rows.sort(key=lambda x: x["date"])
    return rows


def load_specials() -> list[dict]:
    path = DATA / "special_events.csv"
    if not path.exists():
        return []
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(
                {
                    "date": r.get("date") or "",
                    "year": parse_int(r.get("year")),
                    "event_type": r.get("event_type") or "",
                    "service_label": r.get("service_label") or "",
                    "in_person": parse_int(r.get("in_person")),
                    "online": parse_int(r.get("online")),
                    "boxcast": parse_int(r.get("boxcast")),
                    "youtube": parse_int(r.get("youtube")),
                    "facebook": parse_int(r.get("facebook")),
                    "notes": (r.get("notes") or "").strip(),
                }
            )
    return rows


def avg(vals):
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    return round(mean(vals), 1)


def ordinary(rows: list[dict]) -> list[dict]:
    return [r for r in rows if not r["exclude_from_averages"] and r["in_person"] is not None]


def series_with_nulls(rows: list[dict], field: str, include_excluded_as_null=False):
    """Build chart series. Trailing weeks with no data are omitted entirely.
    Excluded Sundays (snow/easter/xmas) appear as null gaps when include_excluded_as_null.
    Missing mid-series values are null (not zero).
    """
    # Trim trailing rows that have no in_person and no online (empty future columns)
    trimmed = list(rows)
    while trimmed:
        last = trimmed[-1]
        if last["in_person"] is None and last["online"] is None and not last["is_snow"]:
            trimmed.pop()
        else:
            break

    labels = []
    values = []
    meta = []
    for r in trimmed:
        labels.append(r["date"])
        if r["exclude_from_averages"] and include_excluded_as_null:
            # Still plot Easter spikes optionally via separate field; for avg charts use null
            if field == "in_person" and r["is_easter"] and r["in_person"] is not None:
                values.append(r["in_person"])  # show Easter spike on weekly overview
            elif r["is_snow"] and (r["in_person"] is None or r["in_person"] == 0):
                values.append(None)
            else:
                values.append(r.get(field))
        else:
            values.append(r.get(field))
        meta.append(
            {
                "is_snow": r["is_snow"],
                "is_easter": r["is_easter"],
                "is_christmas_eve": r["is_christmas_eve"],
                "is_christmas_day": r.get("is_christmas_day", False),
                "exclude_from_averages": r["exclude_from_averages"],
                "notes": r["notes"],
            }
        )
    # Remove trailing nulls so the line ends at last real point (no cliff)
    while values and values[-1] is None and not (
        meta and (meta[-1]["is_snow"] or meta[-1]["is_easter"])
    ):
        # Keep intentional snow/easter nulls in the middle; only trim empty tail
        if meta[-1]["is_snow"] or meta[-1]["is_easter"]:
            break
        values.pop()
        labels.pop()
        meta.pop()
    return {"labels": labels, "values": values, "meta": meta}


def build_overview(rows: list[dict]) -> dict:
    years = sorted({r["year"] for r in rows})
    current_year = max(years) if years else date.today().year
    ord_all = ordinary(rows)
    by_year = defaultdict(list)
    for r in ord_all:
        by_year[r["year"]].append(r["in_person"])

    yearly = []
    for y in years:
        yr_ord = [r for r in ord_all if r["year"] == y]
        yearly.append(
            {
                "year": y,
                "avg_in_person": avg([r["in_person"] for r in yr_ord]),
                "avg_traditional": avg(
                    [r["traditional"] for r in yr_ord if r.get("traditional") is not None]
                ),
                "avg_contemporary": avg(
                    [r["contemporary"] for r in yr_ord if r.get("contemporary") is not None]
                ),
                "avg_kids": avg([r["kids_11"] for r in yr_ord if r.get("kids_11") is not None]),
                "avg_online": avg(
                    [r["online"] for r in yr_ord if r.get("online") is not None]
                ),
                "avg_combined": avg(
                    [
                        (r["in_person"] or 0) + (r["online"] or 0)
                        for r in yr_ord
                        if r.get("in_person") is not None or r.get("online") is not None
                    ]
                ),
                "sundays": len(yr_ord),
            }
        )

    ytd = [r for r in ord_all if r["year"] == current_year]
    prior = [r for r in ord_all if r["year"] == current_year - 1]
    # Same stretch comparison: through same month-day as latest YTD Sunday
    if ytd:
        last = date.fromisoformat(ytd[-1]["date"])
        prior_stretch = [
            r
            for r in prior
            if (r["month"], date.fromisoformat(r["date"]).day)
            <= (last.month, last.day)
            or r["month"] < last.month
        ]
        # simpler: month <= last.month
        prior_stretch = [r for r in prior if r["month"] < last.month or (
            r["month"] == last.month and date.fromisoformat(r["date"]).day <= last.day
        )]
    else:
        prior_stretch = []

    first_year = min(years) if years else current_year
    first_avg = avg(by_year.get(first_year, []))
    ytd_avg = avg([r["in_person"] for r in ytd])
    change_vs_first = None
    if first_avg and ytd_avg:
        change_vs_first = round(((ytd_avg - first_avg) / first_avg) * 100, 1)

    vs_prior = None
    prior_avg = avg([r["in_person"] for r in prior_stretch])
    if ytd_avg and prior_avg:
        vs_prior = round(((ytd_avg - prior_avg) / prior_avg) * 100, 1)

    # Weekly overview series — include Easter as values, snow as null
    weekly = series_with_nulls(rows, "in_person", include_excluded_as_null=True)
    for i, m in enumerate(weekly["meta"]):
        if m["is_snow"] and (weekly["values"][i] == 0 or weekly["values"][i] is None):
            weekly["values"][i] = None

    while weekly["values"] and weekly["values"][-1] is None:
        weekly["values"].pop()
        weekly["labels"].pop()
        weekly["meta"].pop()

    # Align companion series to the same label window (no independent trimming)
    label_set = set(weekly["labels"])
    aligned_rows = [r for r in rows if r["date"] in label_set]

    def aligned_field(field):
        vals = []
        for r in aligned_rows:
            if r["is_snow"] and (r["in_person"] in (0, None)):
                vals.append(None)
            else:
                vals.append(r.get(field))
        return {"labels": weekly["labels"], "values": vals, "meta": weekly["meta"]}

    return {
        "current_year": current_year,
        "date_start": rows[0]["date"] if rows else None,
        "date_end": rows[-1]["date"] if rows else None,
        "sundays_recorded": len(rows),
        "ytd_avg_in_person": ytd_avg,
        "ytd_avg_online": avg([r["online"] for r in ytd if r.get("online") is not None]),
        "ytd_sundays": len(ytd),
        "vs_prior_year_pct": vs_prior,
        "prior_stretch_avg": prior_avg,
        "change_vs_first_year_pct": change_vs_first,
        "first_year": first_year,
        "first_year_avg": first_avg,
        "yearly_averages": yearly,
        "weekly_in_person": weekly,
        "weekly_traditional": aligned_field("traditional"),
        "weekly_contemporary": aligned_field("contemporary"),
        "weekly_kids": aligned_field("kids_11"),
        "weekly_online": aligned_field("online"),
    }


def build_years(rows: list[dict]) -> dict:
    out = {}
    years = sorted({r["year"] for r in rows})
    for y in years:
        yr = [r for r in rows if r["year"] == y]
        # drop empty trailing
        while yr and yr[-1]["in_person"] is None and yr[-1]["online"] is None and not yr[-1]["is_snow"]:
            yr.pop()
        ord_y = ordinary(yr)
        hour_avgs = {
            "trad_9": avg([r["trad_9"] for r in ord_y]),
            "cont_9": avg([r["cont_9"] for r in ord_y]),
            "trad_11": avg([r["trad_11"] for r in ord_y]),
            "cont_11": avg([r["cont_11"] for r in ord_y]),
            "kids_11": avg([r["kids_11"] for r in ord_y]),
        }
        out[str(y)] = {
            "year": y,
            "avg_in_person": avg([r["in_person"] for r in ord_y]),
            "avg_online": avg([r["online"] for r in ord_y if r["online"] is not None]),
            "avg_traditional": avg([r["traditional"] for r in ord_y if r["traditional"] is not None]),
            "avg_contemporary": avg([r["contemporary"] for r in ord_y if r["contemporary"] is not None]),
            "sundays": len(ord_y),
            "hour_averages": hour_avgs,
            "weeks": yr,
            "series_in_person": [r["in_person"] if not (r["is_snow"] and (r["in_person"] in (0, None))) else None for r in yr],
            "series_online": [r["online"] for r in yr],
            "series_traditional": [r["traditional"] for r in yr],
            "series_contemporary": [r["contemporary"] for r in yr],
            "series_kids": [r["kids_11"] for r in yr],
            "labels": [r["date"] for r in yr],
            "meta": [
                {
                    "is_snow": r["is_snow"],
                    "is_easter": r["is_easter"],
                    "exclude_from_averages": r["exclude_from_averages"],
                    "notes": r["notes"],
                }
                for r in yr
            ],
        }
    return out


def build_months(rows: list[dict]) -> dict:
    """Keyed by YYYY-MM for explore-a-month."""
    out = {}
    by_key = defaultdict(list)
    for r in rows:
        key = f"{r['year']}-{r['month']:02d}"
        by_key[key].append(r)
    for key, yr in sorted(by_key.items()):
        ord_m = ordinary(yr)
        out[key] = {
            "key": key,
            "year": yr[0]["year"],
            "month": yr[0]["month"],
            "month_name": MONTH_NAMES[yr[0]["month"]],
            "avg_in_person": avg([r["in_person"] for r in ord_m]),
            "avg_online": avg([r["online"] for r in ord_m if r["online"] is not None]),
            "sundays": len(ord_m),
            "weeks": yr,
            "labels": [r["date"] for r in yr],
            "series_in_person": [
                None if (r["is_snow"] and (r["in_person"] in (0, None))) else r["in_person"]
                for r in yr
            ],
            "series_traditional": [r["traditional"] for r in yr],
            "series_contemporary": [r["contemporary"] for r in yr],
            "series_kids": [r["kids_11"] for r in yr],
            "series_online": [r["online"] for r in yr],
            "hour_averages": {
                "trad_9": avg([r["trad_9"] for r in ord_m]),
                "cont_9": avg([r["cont_9"] for r in ord_m]),
                "trad_11": avg([r["trad_11"] for r in ord_m]),
                "cont_11": avg([r["cont_11"] for r in ord_m]),
                "kids_11": avg([r["kids_11"] for r in ord_m]),
            },
        }
    return out


def build_rhythm(rows: list[dict]) -> dict:
    """Monthly averages per year (ordinary Sundays only), by service focus."""
    years = sorted({r["year"] for r in rows})
    fields = {
        "in_person": "in_person",
        "traditional": "traditional",
        "contemporary": "contemporary",
        "kids": "kids_11",
        "online": "online",
    }
    by_service = {}
    for key, field in fields.items():
        series = {}
        for y in years:
            vals = []
            for m in range(1, 13):
                ord_m = [
                    r
                    for r in rows
                    if r["year"] == y
                    and r["month"] == m
                    and not r["exclude_from_averages"]
                    and r.get(field) is not None
                ]
                if not ord_m:
                    has_any = any(
                        r["year"] == y
                        and r["month"] == m
                        and (r["in_person"] is not None or r["is_snow"])
                        for r in rows
                    )
                    vals.append(None if not has_any else None)
                else:
                    vals.append(avg([r[field] for r in ord_m]))
            series[str(y)] = vals
        by_service[key] = series
    return {
        "labels": MONTH_NAMES[1:],
        "by_year": by_service["in_person"],  # backward compat
        "by_service": by_service,
        "note": "Monthly averages exclude snow closures, Christmas Eve, and Christmas Day on Sunday. Easter and the Sunday after Christmas stay in.",
    }


def _normalize_holy_label(label: str) -> str:
    s = (label or "").strip()
    low = s.lower().replace("fo the", "of the")
    if "station" in low:
        return "Stations of the Cross"
    if "maundy" in low or "holy thursday" in low:
        return "Maundy Thursday"
    if "good friday" in low:
        return "Good Friday"
    return s


def _is_core_holy_service(label: str) -> bool:
    return _normalize_holy_label(label) in {
        "Stations of the Cross",
        "Maundy Thursday",
        "Good Friday",
    }


def build_holidays(specials: list[dict], weeks: list[dict]) -> dict:
    easter = []
    by_year_easter = defaultdict(list)
    for s in specials:
        if s["event_type"] == "easter":
            by_year_easter[s["year"]].append(s)

    for y in sorted(k for k in by_year_easter if k):
        items = by_year_easter[y]
        total = next((i for i in items if i["service_label"] == "TOTAL_IN_PERSON"), None)
        services = [i for i in items if i["service_label"] != "TOTAL_IN_PERSON"]
        easter.append(
            {
                "year": y,
                "date": total["date"] if total else services[0]["date"],
                "in_person": total["in_person"] if total else None,
                "online": total["online"] if total else None,
                "services": services,
            }
        )

    xmas = []
    by_year_x = defaultdict(list)
    for s in specials:
        if s["event_type"] == "christmas_eve":
            by_year_x[s["year"]].append(s)
    for y in sorted((k for k in by_year_x if k), reverse=False):
        items = by_year_x[y]
        total = next((i for i in items if i["service_label"] == "TOTAL_IN_PERSON"), None)
        in_person_services = [
            i
            for i in items
            if i["service_label"] != "TOTAL_IN_PERSON"
            and i.get("notes") not in {"youtube", "boxcast", "facebook"}
            and i.get("in_person") is not None
        ]
        online_services = [
            i for i in items if i.get("notes") in {"youtube", "boxcast", "facebook"}
        ]
        # Prefer sum of labeled in-person services; sheet TOTALS often includes online
        services_sum = sum(i["in_person"] for i in in_person_services if i["in_person"])
        sheet_total = total["in_person"] if total else None
        in_person_total = services_sum or sheet_total
        online_vals = [i["online"] for i in online_services if i.get("online") is not None]
        online_total = sum(online_vals) if online_vals else None
        xmas.append(
            {
                "year": y,
                "date": f"{y}-12-24",
                "in_person_total": in_person_total,
                "online_total": online_total,
                "services": in_person_services,
                "online_services": online_services,
            }
        )

    ash = []
    by_year_ash = defaultdict(list)
    for s in specials:
        if s["event_type"] == "ash_wednesday":
            by_year_ash[s["year"]].append(s)
    for y in sorted(k for k in by_year_ash if k):
        services = by_year_ash[y]
        vals = [i["in_person"] for i in services if i.get("in_person") is not None]
        ash.append(
            {
                "year": y,
                "date": services[0]["date"],
                "in_person_total": sum(vals) if vals else None,
                "services": services,
            }
        )

    holy = []
    by_year_holy = defaultdict(list)
    for s in specials:
        if s["event_type"] == "holy_week" and _is_core_holy_service(s.get("service_label") or ""):
            row = dict(s)
            row["service_label"] = _normalize_holy_label(s["service_label"])
            by_year_holy[s["year"]].append(row)
    service_order = ["Stations of the Cross", "Maundy Thursday", "Good Friday"]
    for y in sorted(k for k in by_year_holy if k):
        items = by_year_holy[y]
        by_label = {i["service_label"]: i for i in items}
        services = []
        for lab in service_order:
            if lab in by_label:
                services.append(by_label[lab])
        for i in items:
            if i["service_label"] not in service_order:
                services.append(i)
        vals = [i["in_person"] for i in services if i.get("in_person") is not None]
        holy.append(
            {
                "year": y,
                "services": services,
                "in_person_total": sum(vals) if vals else None,
            }
        )

    return {
        "ash_wednesday": ash,
        "holy_week": holy,
        "easter": easter,
        "christmas_eve": xmas,
    }


def build_streaming(rows: list[dict]) -> dict:
    years = sorted({r["year"] for r in rows})
    yearly = []
    for y in years:
        ord_y = ordinary([r for r in rows if r["year"] == y])
        box = avg(
            [
                (r["boxcast_9"] or 0) + (r["boxcast_11"] or 0)
                for r in ord_y
                if r["boxcast_9"] is not None or r["boxcast_11"] is not None
            ]
        )
        yt = avg(
            [
                (r["youtube_9"] or 0) + (r["youtube_11"] or 0)
                for r in ord_y
                if r["youtube_9"] is not None or r["youtube_11"] is not None
            ]
        )
        fb = avg(
            [
                (r["facebook_9"] or 0) + (r["facebook_11"] or 0)
                for r in ord_y
                if r["facebook_9"] is not None or r["facebook_11"] is not None
            ]
        )
        yearly.append(
            {
                "year": y,
                "avg_online": avg([r["online"] for r in ord_y if r["online"] is not None]),
                "avg_boxcast": box,
                "avg_youtube": yt,
                "avg_facebook": fb,
            }
        )
    return {"yearly": yearly}


def main():
    weeks = load_weekly()
    specials = load_specials()
    if not weeks:
        raise SystemExit("No weekly data. Run scripts/import_from_xlsx.py first.")

    report = {
        "generated": date.today().isoformat(),
        "church": "Concord United Methodist Church",
        "title": "Worship Attendance Report",
        "rules": {
            "averages_exclude": [
                "weather cancellations (full snow closures)",
                "Christmas Eve (even when it falls on Sunday)",
                "Christmas Day when it falls on Sunday",
                "Ash Wednesday",
                "Holy Week services (Stations, Maundy Thursday, Good Friday)",
            ],
            "averages_include": [
                "Easter Sunday",
                "Sunday after Christmas",
            ],
            "charts": "Lines end at the last recorded Sunday; snow closures are bridged and marked, never a drop to zero at the end of the series.",
        },
        "overview": build_overview(weeks),
        "years": build_years(weeks),
        "months": build_months(weeks),
        "rhythm": build_rhythm(weeks),
        "holidays": build_holidays(specials, weeks),
        "streaming": build_streaming(weeks),
        "data_notes": [
            "Source: church secretary Attendance - Worship.xlsx (canonical) and Christmas Eve Attendance.xlsx.",
            "Ordinary-Sunday averages exclude full snow closures, Christmas Eve, and Christmas Day when it falls on Sunday.",
            "Ash Wednesday and Holy Week (Stations of the Cross, Maundy Thursday, Good Friday) are shown as facts only — not included in Sunday averages.",
            "Easter Sunday and the Sunday after Christmas are included in weekly averages.",
            "Kids Worship (11 AM) is included in in-person totals.",
            "Jan–Feb 2021 used a COVID-era service schedule; side-by-side 9/11 comparisons start March 2021.",
            "Online figures are office-recorded Boxcast / YouTube / Facebook counts from the weekly sheet.",
            "Date header typos repaired on import where known (e.g. 1/18/25/26 → Jan 18 2026).",
            "Holy Week / Ash Wednesday coverage is incomplete in the office sheet (Ash Wednesday currently recorded for 2025 only; 2021 lists Maundy/Good Friday without Stations).",
            "Edit data/weekly_attendance.csv then run python3 scripts/rebuild_report.py to refresh this report.",
            "Christmas Eve in-person totals are summed from labeled service rows (not the sheet TOTALS row, which can include online).",
        ],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    ov = report["overview"]
    print(
        f"YTD {ov['current_year']} avg in-person: {ov['ytd_avg_in_person']} "
        f"(n={ov['ytd_sundays']}, vs prior stretch {ov['vs_prior_year_pct']}%)"
    )


if __name__ == "__main__":
    main()
