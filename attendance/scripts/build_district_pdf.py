#!/usr/bin/env python3
"""Build a 2-page (front/back) district handout from report.json."""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data" / "report.json"
LOGO = ROOT / "public" / "img" / "logo-concord.png"
OUT_DIR = ROOT / "public" / "exports"
OUT = OUT_DIR / "district-attendance-summary.pdf"

NAVY = HexColor("#1f3a5f")
PLUM = HexColor("#6b2d5b")
INK = HexColor("#1c2430")
MUTED = HexColor("#5c6775")
LINE = HexColor("#d9d2c5")
PAPER = HexColor("#f7f4ef")
TRAD = HexColor("#2b6cb0")
CONT = HexColor("#2f855a")
KIDS = HexColor("#c05621")
ROW_ALT = HexColor("#fbfaf7")
HIGHLIGHT = HexColor("#efe8f0")


def n(v):
    if v is None:
        return "—"
    return f"{round(float(v)):,}"


def pct(v):
    if v is None:
        return "—"
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.1f}%"


def load():
    return json.loads(DATA.read_text())


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=15, textColor=NAVY, leading=18, spaceAfter=1,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, textColor=MUTED, leading=11, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=9.5, textColor=NAVY, leading=12, spaceBefore=5, spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.8, textColor=INK, leading=10,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.3, textColor=MUTED, leading=9.5,
        ),
        "hero_num": ParagraphStyle(
            "hero_num", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=30, textColor=PLUM, leading=32, alignment=TA_CENTER,
        ),
        "hero_label": ParagraphStyle(
            "hero_label", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8.5, textColor=NAVY, leading=10, alignment=TA_CENTER,
        ),
        "hero_sub": ParagraphStyle(
            "hero_sub", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, textColor=MUTED, leading=9, alignment=TA_CENTER,
        ),
        "stat_num": ParagraphStyle(
            "stat_num", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=12, textColor=NAVY, leading=14, alignment=TA_CENTER,
        ),
        "stat_label": ParagraphStyle(
            "stat_label", parent=base["Normal"], fontName="Helvetica",
            fontSize=7, textColor=MUTED, leading=8.5, alignment=TA_CENTER,
        ),
        "th": ParagraphStyle(
            "th", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=7, textColor=white, leading=8.5, alignment=TA_CENTER,
        ),
        "td": ParagraphStyle(
            "td", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, textColor=INK, leading=9, alignment=TA_CENTER,
        ),
        "td_bold": ParagraphStyle(
            "td_bold", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=7.5, textColor=INK, leading=9, alignment=TA_CENTER,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"], fontName="Helvetica",
            fontSize=7, textColor=MUTED, leading=9, alignment=TA_CENTER,
        ),
    }


def header_block(data, s):
    ov = data["overview"]
    left = [Image(str(LOGO), width=1.0 * inch, height=0.62 * inch)] if LOGO.exists() else []
    right = [
        Paragraph("Concord United Methodist Church", s["title"]),
        Paragraph(
            f"Worship Attendance Summary for District Office · "
            f"Ordinary Sunday averages · Through {ov['date_end']}",
            s["subtitle"],
        ),
    ]
    t = Table([[left, right]], colWidths=[1.15 * inch, 6.1 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -1), 1, LINE),
    ]))
    return t


def hero_block(data, s):
    ov = data["overview"]
    year = ov["current_year"]
    hero = Table([[
        [
            Paragraph(n(ov["ytd_avg_in_person"]), s["hero_num"]),
            Paragraph(f"{year} WEEKLY AVERAGE — IN PERSON", s["hero_label"]),
            Paragraph(f"{ov['ytd_sundays']} ordinary Sundays year-to-date", s["hero_sub"]),
        ]
    ]], colWidths=[7.25 * inch])
    hero.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 1, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))

    comps = Table([
        [
            Paragraph(pct(ov["vs_prior_year_pct"]), s["stat_num"]),
            Paragraph(pct(ov["change_vs_first_year_pct"]), s["stat_num"]),
            Paragraph(n(ov["prior_stretch_avg"]), s["stat_num"]),
            Paragraph(n(ov["first_year_avg"]), s["stat_num"]),
        ],
        [
            Paragraph(f"vs prior-year stretch<br/>(avg {n(ov['prior_stretch_avg'])})", s["stat_label"]),
            Paragraph(f"since {ov['first_year']}<br/>(from {n(ov['first_year_avg'])})", s["stat_label"]),
            Paragraph("prior-year stretch<br/>average", s["stat_label"]),
            Paragraph(f"{ov['first_year']} full-year<br/>average", s["stat_label"]),
        ],
    ], colWidths=[1.8125 * inch] * 4)
    comps.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return KeepTogether([hero, Spacer(1, 4), comps])


def styled_table(headers, rows_data, s, col_widths=None, highlight_last=True):
    rows = [[Paragraph(h, s["th"]) for h in headers]]
    for i, row in enumerate(rows_data):
        st = s["td_bold"] if highlight_last and i == len(rows_data) - 1 else s["td"]
        rows.append([Paragraph(str(c), st) for c in row])
    if col_widths is None:
        col_widths = [7.25 * inch / len(headers)] * len(headers)
    t = Table(rows, colWidths=col_widths)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BOX", (0, 0), (-1, -1), 0.7, NAVY),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, ROW_ALT]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    if highlight_last and len(rows) > 1:
        cmds.append(("BACKGROUND", (0, -1), (-1, -1), HIGHLIGHT))
    t.setStyle(TableStyle(cmds))
    return t


def yearly_table(data, s):
    rows = []
    for y in data["overview"]["yearly_averages"]:
        rows.append([
            y["year"],
            n(y["avg_in_person"]),
            n(y["avg_traditional"]),
            n(y["avg_contemporary"]),
            n(y["avg_kids"]),
            n(y["avg_online"]),
            n(y["sundays"]),
        ])
    return styled_table(
        ["Year", "Avg In Person", "Traditional", "Contemporary", "Kids 11am", "Online", "Sundays"],
        rows,
        s,
        col_widths=[0.7*inch, 1.15*inch, 1.05*inch, 1.15*inch, 0.95*inch, 0.9*inch, 0.85*inch],
    )


def hour_table(data, s):
    y = str(data["overview"]["current_year"])
    h = data["years"][y]["hour_averages"]
    rows = [[
        Paragraph("9am Trad", s["th"]),
        Paragraph("9am Cont", s["th"]),
        Paragraph("11am Trad", s["th"]),
        Paragraph("11am Cont", s["th"]),
        Paragraph("Kids 11am", s["th"]),
    ], [
        Paragraph(n(h["trad_9"]), s["td_bold"]),
        Paragraph(n(h["cont_9"]), s["td_bold"]),
        Paragraph(n(h["trad_11"]), s["td_bold"]),
        Paragraph(n(h["cont_11"]), s["td_bold"]),
        Paragraph(n(h["kids_11"]), s["td_bold"]),
    ]]
    t = Table(rows, colWidths=[1.45 * inch] * 5)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), TRAD),
        ("BACKGROUND", (1, 0), (1, 0), CONT),
        ("BACKGROUND", (2, 0), (2, 0), TRAD),
        ("BACKGROUND", (3, 0), (3, 0), CONT),
        ("BACKGROUND", (4, 0), (4, 0), KIDS),
        ("BACKGROUND", (0, 1), (-1, 1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def build_page1(data, s):
    return [
        header_block(data, s),
        Spacer(1, 5),
        Paragraph("1. Weekly Average Attendance — the number that matters most", s["h2"]),
        Paragraph(
            "Ordinary Sunday <b>in-person</b> average for district comparison. "
            "Snow closures and Christmas Eve/Day Sundays are left out so one cancelled week does not distort the average.",
            s["body"],
        ),
        Spacer(1, 4),
        hero_block(data, s),
        Spacer(1, 5),
        Paragraph("Ordinary Sunday averages by year", s["h2"]),
        Paragraph(
            "In person = all services that Sunday. Traditional / Contemporary / Kids are parts of that total. Online is separate.",
            s["muted"],
        ),
        Spacer(1, 2),
        yearly_table(data, s),
        Spacer(1, 5),
        Paragraph(f"{data['overview']['current_year']} average by service hour", s["h2"]),
        Paragraph("How an ordinary Sunday typically breaks across Concord’s service times.", s["muted"]),
        Spacer(1, 2),
        hour_table(data, s),
        Spacer(1, 6),
        Paragraph(
            "<b>How to read this page:</b> Start with the big weekly average. "
            "Use the year table for trend. Use the hour table only for service-level detail.",
            s["body"],
        ),
    ]


def build_page2(data, s):
    easter_rows = [[e["year"], n(e.get("in_person"))] for e in data["holidays"]["easter"]]
    xmas_rows = [[e["year"], n(e.get("in_person_total"))] for e in data["holidays"]["christmas_eve"]]
    holy_rows = []
    for e in data["holidays"]["holy_week"]:
        labels = {svc["service_label"]: svc["in_person"] for svc in e.get("services", [])}
        holy_rows.append([
            e["year"],
            n(labels.get("Stations of the Cross")),
            n(labels.get("Maundy Thursday")),
            n(labels.get("Good Friday")),
            n(e.get("in_person_total")),
        ])
    ash = data["holidays"]["ash_wednesday"]
    if ash:
        a = ash[-1]
        parts = ", ".join(f"{svc['service_label']}: {n(svc['in_person'])}" for svc in a.get("services", []))
        ash_txt = f"<b>{a['year']}</b> total: <b>{n(a['in_person_total'])}</b> ({parts}). Limited years recorded so far."
    else:
        ash_txt = "Limited Ash Wednesday coverage in the office sheet so far."

    stream_rows = [
        [y["year"], n(y.get("avg_online")), n(y.get("avg_boxcast")), n(y.get("avg_youtube"))]
        for y in data["streaming"]["yearly"]
    ]

    left_items = [
        Paragraph("Easter Sunday — in person", s["h2"]),
        styled_table(["Year", "Total"], easter_rows, s, col_widths=[1.4*inch, 2.0*inch]),
        Spacer(1, 4),
        Paragraph("Christmas Eve — in person", s["h2"]),
        styled_table(["Year", "Total"], xmas_rows, s, col_widths=[1.4*inch, 2.0*inch]),
    ]
    right_items = [
        Paragraph("Online viewing avg / Sunday", s["h2"]),
        styled_table(
            ["Year", "Online", "Boxcast", "YouTube"],
            stream_rows,
            s,
            col_widths=[0.75*inch, 0.85*inch, 0.9*inch, 0.9*inch],
        ),
        Spacer(1, 4),
        Paragraph("Ash Wednesday", s["h2"]),
        Paragraph(ash_txt, s["body"]),
    ]
    twin = Table([[left_items, right_items]], colWidths=[3.55 * inch, 3.55 * inch])
    twin.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 8),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
    ]))

    return [
        header_block(data, s),
        Spacer(1, 4),
        Paragraph("2. Special Sundays &amp; services (facts — not weekly averages)", s["h2"]),
        Paragraph(
            "Important Concord moments. <b>Not mixed into the ordinary Sunday average</b> on page 1 "
            "(except Easter, which is included in weekly averages).",
            s["body"],
        ),
        Spacer(1, 3),
        twin,
        Spacer(1, 4),
        Paragraph("Holy Week — in person", s["h2"]),
        styled_table(
            ["Year", "Stations", "Maundy Thu", "Good Friday", "Week Total"],
            holy_rows,
            s,
            col_widths=[1.1*inch, 1.4*inch, 1.5*inch, 1.5*inch, 1.25*inch],
        ),
        Spacer(1, 5),
        Paragraph("Quick notes for district review", s["h2"]),
        Paragraph(
            "• <b>Weekly average</b> = ordinary Sundays only.<br/>"
            "• <b>Left out of averages:</b> full snow closures, Christmas Eve, Christmas Day on Sunday, "
            "Ash Wednesday, Holy Week services.<br/>"
            "• <b>Kept in averages:</b> Easter Sunday and the Sunday after Christmas.<br/>"
            "• Kids Worship (11am) is included in in-person totals.<br/>"
            "• Full interactive report: digitaldogfood.com/CU/Attendance/",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            f"Generated {data['generated']} · Concord United Methodist Church · "
            f"Office records {data['overview']['date_start']} → {data['overview']['date_end']}",
            s["footer"],
        ),
    ]


def main():
    data = load()
    s = styles()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.4 * inch,
        bottomMargin=0.4 * inch,
        title="Concord UMC — District Attendance Summary",
        author="Concord United Methodist Church",
    )
    story = []
    story.extend(build_page1(data, s))
    story.append(PageBreak())
    story.extend(build_page2(data, s))
    doc.build(story)

    from pypdf import PdfReader
    pages = len(PdfReader(str(OUT)).pages)
    print(f"Wrote {OUT} ({pages} pages)")
    if pages != 2:
        raise SystemExit(f"Expected 2 pages, got {pages}")


if __name__ == "__main__":
    main()
