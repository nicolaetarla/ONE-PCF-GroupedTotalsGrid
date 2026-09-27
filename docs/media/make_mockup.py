#!/usr/bin/env python3
"""
Generates the documentation mockups for the Grouped Totals Grid.

These are illustrations of the intended rendering, drawn from the same layout
constants the control uses (row heights, column alignment, group/total row
treatment). They are NOT a substitute for the side-by-side parity screenshots
required by docs/STYLE-PARITY.md, which must be captured from a real
environment against the native grid.
"""

from xml.sax.saxutils import escape

W = 1000

LIGHT = {
    "name": "light",
    "bg": "#ffffff",
    "fg": "#242424",
    "fg_muted": "#616161",
    "divider": "#e0e0e0",
    "header_border": "#d1d1d1",
    "group_bg": "#fafafa",
    "link": "#0f6cbd",
    "shadow": "#00000014",
    "chrome": "#f5f5f5",
}

DARK = {
    "name": "dark",
    "bg": "#292929",
    "fg": "#ffffff",
    "fg_muted": "#adadad",
    "divider": "#3d3d3d",
    "header_border": "#4a4a4a",
    "group_bg": "#333333",
    "link": "#479ef5",
    "shadow": "#00000040",
    "chrome": "#1f1f1f",
}

FONT = "Segoe UI, Segoe UI Variable, -apple-system, system-ui, sans-serif"

# x, width, label, align  ("l" or "r")
COLUMNS = [
    (44, 196, "Resource", "l"),
    (240, 112, "Date", "l"),
    (352, 168, "Work Order", "l"),
    (520, 128, "Type", "l"),
    (648, 156, "Duration", "r"),
    (804, 172, "Billable Amount", "r"),
]

HEADER_H = 44
ROW_H = 40

GROUPS = [
    {
        "label": "Dana Whitfield",
        "count": "12 records",
        "duration": "37 hours 45 minutes",
        "amount": "$4,218.75",
        "expanded": True,
        "rows": [
            ("14/08/2026", "WO-01847", "Work", "2 hours 30 minutes", "$275.00"),
            ("14/08/2026", "WO-01851", "Travel", "45 minutes", "$0.00"),
            ("15/08/2026", "WO-01862", "Work", "6 hours 15 minutes", "$687.50"),
        ],
    },
    {
        "label": "Marcus Bell",
        "count": "9 records",
        "duration": "28 hours 10 minutes",
        "amount": "$3,096.25",
        "expanded": False,
        "rows": [],
    },
    {
        "label": "Priya Raman",
        "count": "14 records",
        "duration": "41 hours 20 minutes",
        "amount": "$4,546.50",
        "expanded": False,
        "rows": [],
    },
    {
        "label": "(No value)",
        "count": "2 records",
        "duration": "3 hours 0 minutes",
        "amount": "$0.00",
        "expanded": False,
        "rows": [],
    },
]

GRAND = ("Total", "110 hours 15 minutes", "$11,861.50")


def text(x, y, s, fill, size=13.5, weight="400", anchor="start", family=FONT, opacity=None):
    op = f' opacity="{opacity}"' if opacity else ""
    return (
        f'<text x="{x}" y="{y}" fill="{fill}" font-family="{family}" font-size="{size}" '
        f'font-weight="{weight}" text-anchor="{anchor}"{op}>{escape(s)}</text>'
    )


def chevron(x, y, fill, down):
    """Expand/collapse chevron, matching the native nested-grid affordance."""
    if down:
        d = f"M {x} {y - 2} l 4.5 5 l 4.5 -5"
    else:
        d = f"M {x + 1} {y - 5} l 5 5 l -5 5"
    return f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'


def checkbox(x, y, stroke):
    return (
        f'<rect x="{x}" y="{y}" width="15" height="15" rx="3" fill="none" '
        f'stroke="{stroke}" stroke-width="1.2" opacity="0.55"/>'
    )


def build(theme):
    t = theme
    out = []
    y = 0

    # ---- header -------------------------------------------------------
    out.append(f'<rect x="0" y="0" width="{W}" height="{HEADER_H}" fill="{t["bg"]}"/>')
    for x, w, label, align in COLUMNS:
        tx = x + 10 if align == "l" else x + w - 10
        anchor = "start" if align == "l" else "end"
        out.append(text(tx, HEADER_H / 2 + 5, label, t["fg"], 13.5, "600", anchor))
        # A single sort indicator, as the native grid shows on the sorted column.
        if label == "Date":
            sx = tx + 42
            out.append(
                f'<path d="M {sx} {HEADER_H/2 + 2} l 4 -5 l 4 5" fill="none" '
                f'stroke="{t["fg_muted"]}" stroke-width="1.3" stroke-linecap="round" '
                f'stroke-linejoin="round"/>'
            )
    out.append(
        f'<rect x="0" y="{HEADER_H - 1}" width="{W}" height="1" fill="{t["header_border"]}"/>'
    )
    y = HEADER_H

    # ---- groups -------------------------------------------------------
    for g in GROUPS:
        out.append(f'<rect x="0" y="{y}" width="{W}" height="{ROW_H}" fill="{t["group_bg"]}"/>')
        mid = y + ROW_H / 2

        out.append(chevron(52, mid, t["fg"], g["expanded"]))
        out.append(text(70, mid + 5, g["label"], t["fg"], 13.5, "600"))
        # Count sits in a fixed position so it lines up down the column rather
        # than jittering with the length of each group label.
        out.append(text(COLUMNS[1][0] + 10, mid + 5, g["count"], t["fg_muted"], 12.5, "400"))

        # totals sit under the columns they total
        dx, dw = COLUMNS[4][0], COLUMNS[4][1]
        ax, aw = COLUMNS[5][0], COLUMNS[5][1]
        out.append(text(dx + dw - 10, mid + 5, g["duration"], t["fg"], 13.5, "600", "end"))
        out.append(text(ax + aw - 10, mid + 5, g["amount"], t["fg"], 13.5, "600", "end"))
        out.append(f'<rect x="0" y="{y + ROW_H - 1}" width="{W}" height="1" fill="{t["divider"]}"/>')
        y += ROW_H

        # ---- data rows -------------------------------------------------
        for row in g["rows"]:
            date, wo, kind, dur, amt = row
            out.append(f'<rect x="0" y="{y}" width="{W}" height="{ROW_H}" fill="{t["bg"]}"/>')
            mid = y + ROW_H / 2
            out.append(checkbox(14, y + (ROW_H - 15) / 2, t["fg_muted"]))
            # primary + lookup columns render as links, as the native grid does
            out.append(text(COLUMNS[0][0] + 10, mid + 5, g["label"], t["link"], 13.5))
            out.append(text(COLUMNS[1][0] + 10, mid + 5, date, t["fg"], 13.5))
            out.append(text(COLUMNS[2][0] + 10, mid + 5, wo, t["link"], 13.5))
            out.append(text(COLUMNS[3][0] + 10, mid + 5, kind, t["fg"], 13.5))
            out.append(
                text(COLUMNS[4][0] + COLUMNS[4][1] - 10, mid + 5, dur, t["fg"], 13.5, "400", "end")
            )
            out.append(
                text(COLUMNS[5][0] + COLUMNS[5][1] - 10, mid + 5, amt, t["fg"], 13.5, "400", "end")
            )
            out.append(
                f'<rect x="0" y="{y + ROW_H - 1}" width="{W}" height="1" fill="{t["divider"]}"/>'
            )
            y += ROW_H

    # ---- grand total ---------------------------------------------------
    out.append(f'<rect x="0" y="{y}" width="{W}" height="1" fill="{t["header_border"]}"/>')
    out.append(f'<rect x="0" y="{y}" width="{W}" height="{ROW_H + 4}" fill="{t["bg"]}"/>')
    out.append(f'<rect x="0" y="{y}" width="{W}" height="1" fill="{t["header_border"]}"/>')
    mid = y + (ROW_H + 4) / 2
    out.append(text(COLUMNS[0][0] + 10, mid + 5, GRAND[0], t["fg"], 13.5, "600"))
    out.append(
        text(COLUMNS[4][0] + COLUMNS[4][1] - 10, mid + 5, GRAND[1], t["fg"], 13.5, "600", "end")
    )
    out.append(
        text(COLUMNS[5][0] + COLUMNS[5][1] - 10, mid + 5, GRAND[2], t["fg"], 13.5, "600", "end")
    )
    y += ROW_H + 4

    # ---- footer --------------------------------------------------------
    out.append(f'<rect x="0" y="{y}" width="{W}" height="30" fill="{t["bg"]}"/>')
    out.append(f'<rect x="0" y="{y}" width="{W}" height="1" fill="{t["divider"]}"/>')
    out.append(text(12, y + 19, "37 records", t["fg_muted"], 12))
    out.append(text(W - 12, y + 19, "1 - 37 of 37", t["fg_muted"], 12, "400", "end"))
    y += 30

    body = "\n  ".join(out)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {y}" width="{W}" '
        f'height="{y}" role="img" aria-label="Grouped Totals Grid, {t["name"]} theme">\n'
        f'  <rect x="0" y="0" width="{W}" height="{y}" fill="{t["bg"]}"/>\n  {body}\n</svg>\n'
    )


if __name__ == "__main__":
    for theme, filename in ((LIGHT, "control-light.svg"), (DARK, "control-dark.svg")):
        with open(filename, "w", encoding="utf-8") as handle:
            handle.write(build(theme))
        print(f"wrote {filename}")
