#!/usr/bin/env python3
"""Build the TwentySix role intake spreadsheet.

NOT WRITTEN FROM SCRATCH. This is an adaptation of the template TwentySix has
already iterated on (~/Downloads/TwentySix-Benchmarking-Template.xlsx, Feb 2026),
which already had sheet protection, highlighted input cells, 500 role rows, and
an Experience Level dropdown whose four values match the product exactly. Three
changes:

  1. Branded TwentySix. This template goes out from the consultancy with the
     intake form at twentysixconsulting.github.io/twentysix-intake, so it carries
     the consultancy's name, not the product's.
  2. Added LOCATION. This is load-bearing and the old template omitted it:
     location is one of the four dimensions that define a comparator group
     (Methodology section 3), and PAY_META.comparatorBasis is "London and the
     South East". Without it we are guessing at regional pay.
  3. Added HEADCOUNT per role, optional. It is what lets the dashboard show a
     total pay bill and model what a pay review would cost, rather than only
     where each role sits.

Run: python3 build_template.py
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

OUT = Path(__file__).resolve().parent.parent / "public" / "TwentySix-Benchmarking-Template.xlsx"
ROWS = 500

# Brand tokens from the TwentySix palette. openpyxl wants ARGB.
INK = "FF121C2B"
CLAY = "FFC9785A"
CLAY_TINT = "FFE8D8CE"
WASH = "FFF6F7F9"
LINE = "FFDEE1E6"
MUTED = "FF4B5563"
INPUT_FILL = "FFFFFDF7"  # a faint warm tint: "fill in the highlighted cells"

# Must match lib/people.ts / the Signup wizard exactly, or a submitted sheet
# cannot be mapped onto the product's own levels without a human guessing.
LEVELS = [
    "Entry or Foundation",
    "Early and Developing",
    "Mid to Senior",
    "Experts, Strategists & Leaders",
]

# The roster is all "London/South East" today (lib/roster.ts), but a real client
# will not be, so this is a suggestion list rather than a closed dropdown.
LOCATIONS = [
    "London",
    "South East England",
    "South West England",
    "Midlands",
    "North of England",
    "Scotland",
    "Wales",
    "Northern Ireland",
    "Remote (UK)",
]

thin = Side(style="thin", color=LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def title_block(ws, text: str, sub: str, width: int) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    c = ws.cell(row=1, column=1, value=text)
    c.font = Font(name="Poppins", size=15, bold=True, color=INK)
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 30

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
    c = ws.cell(row=2, column=2 - 1, value=sub)
    c.font = Font(name="Inter", size=9.5, color=MUTED)
    ws.row_dimensions[2].height = 18

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=width)
    ws.cell(row=3, column=1).fill = PatternFill("solid", fgColor=CLAY)
    ws.row_dimensions[3].height = 3


def header_row(ws, row: int, labels: list[str]) -> None:
    for i, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font = Font(name="Inter", size=9, bold=True, color="FFFFFFFF")
        c.fill = PatternFill("solid", fgColor=INK)
        c.alignment = Alignment(vertical="center", wrap_text=True)
        c.border = BOX
    ws.row_dimensions[row].height = 26


def build() -> None:
    wb = Workbook()

    # ── Organisation ────────────────────────────────────────────────────
    org = wb.active
    org.title = "Organisation"
    title_block(org, "TwentySix benchmarking intake",
                "Fill in the highlighted cells, then add your roles on the Roles tab.", 2)
    org.column_dimensions["A"] = org.column_dimensions["A"]
    org.column_dimensions["A"].width = 34
    org.column_dimensions["B"].width = 46

    header_row(org, 5, ["Field", "Your answer"])
    fields = [
        ("Organisation name", ""),
        ("Industry", "e.g. Technology, Financial services, Charity"),
        ("Total number of employees", ""),
        ("Number of roles to benchmark", ""),
        ("Main location", "Used where a role's own location is left blank"),
        ("Contact name", ""),
        ("Contact email", ""),
    ]
    for i, (label, hint) in enumerate(fields):
        r = 6 + i
        c = org.cell(row=r, column=1, value=label)
        c.font = Font(name="Inter", size=10, color=INK)
        c.border = BOX
        c.fill = PatternFill("solid", fgColor=WASH)
        v = org.cell(row=r, column=2)
        v.border = BOX
        v.fill = PatternFill("solid", fgColor=INPUT_FILL)
        v.font = Font(name="Inter", size=10)
        if hint:
            v.value = None
            org.cell(row=r, column=3, value=hint).font = Font(
                name="Inter", size=8.5, italic=True, color=MUTED)
        org.row_dimensions[r].height = 20

    note = org.cell(row=15, column=1,
                    value="We do not need employee names, dates of birth, or any personal "
                          "detail beyond pay. Please do not include them.")
    note.font = Font(name="Inter", size=9, bold=True, color="FF7A5210")
    org.merge_cells(start_row=15, start_column=1, end_row=15, end_column=3)
    org.cell(row=15, column=1).fill = PatternFill("solid", fgColor="FFFFF3CD")
    org.row_dimensions[15].height = 30

    # ── Roles ───────────────────────────────────────────────────────────
    rs = wb.create_sheet("Roles")
    title_block(rs, "Roles to benchmark",
                "One role per row. Experience level and location are dropdowns. "
                "Headcount is optional.", 6)
    cols = [
        ("Role title", 32),
        ("Current FTE salary (£)", 20),
        ("Experience level", 26),
        ("Function or job family", 26),
        ("Location", 22),
        ("Headcount (optional)", 18),
    ]
    for i, (label, w) in enumerate(cols, start=1):
        rs.column_dimensions[get_column_letter(i)].width = w
    header_row(rs, 5, [c[0] for c in cols])

    for r in range(6, 6 + ROWS):
        for i in range(1, len(cols) + 1):
            c = rs.cell(row=r, column=i)
            c.border = BOX
            c.fill = PatternFill("solid", fgColor=INPUT_FILL)
            c.font = Font(name="Inter", size=10)
        rs.cell(row=r, column=2).number_format = "#,##0"
        rs.cell(row=r, column=6).number_format = "0"

    # ── Dropdown sources on a hidden sheet ──────────────────────────────
    # NOT an inline list. Excel splits an inline validation list on commas, so
    # "Experts, Strategists & Leaders" would silently become two options,
    # "Experts" and "Strategists & Leaders". The template this adapts had that
    # bug. A range reference is immune to it.
    opts = wb.create_sheet("_Options")
    for i, v in enumerate(LEVELS, start=1):
        opts.cell(row=i, column=1, value=v)
    for i, v in enumerate(LOCATIONS, start=1):
        opts.cell(row=i, column=2, value=v)
    opts.sheet_state = "hidden"

    # Closed list: these four values must match the product exactly.
    dv_lvl = DataValidation(
        type="list", formula1=f"=_Options!$A$1:$A${len(LEVELS)}", allow_blank=True,
        showErrorMessage=True, errorTitle="Pick one of the four levels",
        error="If a role sits between two levels, leave this blank and tell us in your email.",
    )
    rs.add_data_validation(dv_lvl)
    dv_lvl.add(f"C6:C{5 + ROWS}")

    # Open list: a suggestion, since a real client's locations will vary.
    dv_loc = DataValidation(
        type="list", formula1=f"=_Options!$B$1:$B${len(LOCATIONS)}", allow_blank=True,
        showErrorMessage=False,
    )
    rs.add_data_validation(dv_loc)
    dv_loc.add(f"E6:E{5 + ROWS}")

    rs.freeze_panes = "A6"

    # Protect the structure, not the inputs: the same approach as the template
    # this adapts. Stops a stray paste destroying the headers or the dropdowns.
    for ws in (org, rs):  # not _Options, which stays fully locked
        for row in ws.iter_rows():
            for c in row:
                if c.fill.fgColor.rgb == INPUT_FILL:
                    c.protection = Protection(locked=False)
        ws.protection.sheet = True
        ws.protection.enable()

    wb.save(OUT)
    print(f"{OUT.name}: {ROWS} role rows, {len(LEVELS)} levels, "
          f"{len(LOCATIONS)} locations, {OUT.stat().st_size:,} B")


if __name__ == "__main__":
    build()
