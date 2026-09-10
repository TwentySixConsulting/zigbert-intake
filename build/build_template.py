#!/usr/bin/env python3
"""Build the Zigbert role intake spreadsheet.

Descended from the template TwentySix had already iterated on (sheet protection,
highlighted input cells, 500 rows). Changed since:

  0. No sheet protection. It guarded the headers, but it is the client who has to
     fill this in, and a locked sheet blocks pasting a block, inserting a row and
     sorting. The parser tolerates a mangled sheet, so the trade was the wrong way
     round.
  1. No dropdowns. Job level is free text, because a client's own level names
     rarely match ours and forcing a choice made them guess. Mapping their
     wording onto our four levels is our job, not theirs, so the sheet carries a
     guide instead of a closed list.
  2. Location and headcount removed from the role rows. Location is asked once,
     on the Organisation tab, and headcount was noise for a benchmarking intake.
  3. "Experience level" renamed "Job level".
  4. A Comment column on both role tabs, so anything odd about a role travels
     with the role rather than in a separate email.
  5. A "By person" tab. Some clients hold pay per person rather than per role,
     and asking them to collapse it loses the spread. Anonymous by design: an
     optional internal reference, never a name.

Run: python3 build/build_template.py   (or npm run template)
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT = Path(__file__).resolve().parent.parent / "public" / "Zigbert-Benchmarking-Template.xlsx"
ROWS = 500

# Zigbert brand tokens. openpyxl wants ARGB.
INK = "FF121C2B"
CLAY = "FFC9785A"
SLATE = "FF5E7191"
WASH = "FFF6F7F9"
LINE = "FFDEE1E6"
MUTED = "FF4B5563"
INPUT_FILL = "FFFFFDF7"   # faint warm tint: "fill in the highlighted cells"
GUIDE_FILL = "FFEEF1F6"

# The four levels we benchmark against. No longer enforced in the sheet; shown as
# a guide so a client can either use our wording or their own.
LEVEL_GUIDE = [
    ("Entry or Foundation",
     "New to the field or to the organisation. Work is closely defined and supervised."),
    ("Early and Developing",
     "Works independently on familiar tasks, still building depth. Passes unusual cases up."),
    ("Mid to Senior",
     "Fully independent and accountable for outcomes. Often leads people or owns a workstream."),
    ("Experts, Strategists & Leaders",
     "Sets direction, or is the recognised authority in their field. Decisions carry organisation-wide."),
]

EMPLOYEE_BANDS = ["0-49", "50-99", "100-249", "250-499", "500+"]

thin = Side(style="thin", color=LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)


def title_block(ws, text: str, sub: str, width: int) -> None:
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=width)
    c = ws.cell(row=1, column=1, value=text)
    c.font = Font(name="Poppins", size=15, bold=True, color=INK)
    c.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 30

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=width)
    c = ws.cell(row=2, column=1, value=sub)
    c.font = Font(name="Inter", size=9.5, color=MUTED)
    c.alignment = Alignment(vertical="center", wrap_text=True)
    ws.row_dimensions[2].height = 30

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


def level_guide(ws, start_row: int, first_col: int, width: int) -> int:
    """The job level guide. Returns the row after it."""
    col = get_column_letter(first_col)
    end = get_column_letter(first_col + width - 1)

    ws.merge_cells(f"{col}{start_row}:{end}{start_row}")
    c = ws.cell(row=start_row, column=first_col, value="Your job levels may look like this")
    c.font = Font(name="Poppins", size=11, bold=True, color=INK)
    ws.row_dimensions[start_row].height = 22

    ws.merge_cells(f"{col}{start_row + 1}:{end}{start_row + 1}")
    c = ws.cell(row=start_row + 1, column=first_col,
                value="These are the four levels we benchmark against. Use your own wording if that "
                      "is easier, and we will map it across. If a role sits between two, say so in "
                      "the Comment column.")
    c.font = Font(name="Inter", size=9, color=MUTED)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[start_row + 1].height = 28

    header_row(ws, start_row + 2, ["Job level", "What it usually means"])
    for i, (name, meaning) in enumerate(LEVEL_GUIDE):
        r = start_row + 3 + i
        a = ws.cell(row=r, column=first_col, value=name)
        a.font = Font(name="Inter", size=9.5, bold=True, color=INK)
        a.fill = PatternFill("solid", fgColor=GUIDE_FILL)
        a.border = BOX
        a.alignment = Alignment(vertical="top", wrap_text=True)
        b = ws.cell(row=r, column=first_col + 1, value=meaning)
        b.font = Font(name="Inter", size=9.5, color=MUTED)
        b.fill = PatternFill("solid", fgColor=GUIDE_FILL)
        b.border = BOX
        b.alignment = Alignment(vertical="top", wrap_text=True)
        ws.row_dimensions[r].height = 28
    return start_row + 3 + len(LEVEL_GUIDE)


def role_sheet(wb, name: str, title: str, sub: str, cols: list[tuple[str, int]]):
    ws = wb.create_sheet(name)
    title_block(ws, title, sub, len(cols))
    for i, (label, w) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    header_row(ws, 5, [c[0] for c in cols])

    salary_col = next(i for i, (l, _) in enumerate(cols, start=1) if l.startswith("Current FTE"))
    for r in range(6, 6 + ROWS):
        for i in range(1, len(cols) + 1):
            c = ws.cell(row=r, column=i)
            c.border = BOX
            c.fill = PatternFill("solid", fgColor=INPUT_FILL)
            c.font = Font(name="Inter", size=10)
        ws.cell(row=r, column=salary_col).number_format = "#,##0"
    ws.freeze_panes = "A6"

    return ws


def build() -> None:
    wb = Workbook()

    # ── Organisation ────────────────────────────────────────────────────
    org = wb.active
    org.title = "Organisation"
    title_block(org, "Zigbert benchmarking intake",
                "Fill in the highlighted cells, then add your roles on either the By role "
                "tab or the By person tab. You only need one of them.", 3)
    org.column_dimensions["A"].width = 34
    org.column_dimensions["B"].width = 46
    org.column_dimensions["C"].width = 42

    header_row(org, 5, ["Field", "Your answer", ""])
    fields = [
        ("Organisation name", ""),
        ("Industry", "e.g. Technology, Financial services, Charity"),
        ("Total number of employees", " / ".join(EMPLOYEE_BANDS)),
        ("Number of roles to benchmark", ""),
        ("Main location", "Where most of your people are based"),
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
            org.cell(row=r, column=3, value=hint).font = Font(
                name="Inter", size=8.5, italic=True, color=MUTED)
        org.row_dimensions[r].height = 20

    note = org.cell(row=14, column=1,
                    value="We do not need employee names, dates of birth, or any personal detail "
                          "beyond pay. Please do not include them.")
    note.font = Font(name="Inter", size=9, bold=True, color="FF7A5210")
    org.merge_cells(start_row=14, start_column=1, end_row=14, end_column=3)
    org.cell(row=14, column=1).fill = PatternFill("solid", fgColor="FFFFF3CD")
    org.cell(row=14, column=1).alignment = Alignment(wrap_text=True, vertical="center")
    org.row_dimensions[14].height = 30

    already = org.cell(row=16, column=1,
                       value="Already have this in a spreadsheet of your own? Send us that "
                             "instead. As long as it has a row per role and a column for the "
                             "title and the salary, we will sort out the rest.")
    already.font = Font(name="Inter", size=9.5, color=INK)
    org.merge_cells(start_row=16, start_column=1, end_row=16, end_column=3)
    org.cell(row=16, column=1).fill = PatternFill("solid", fgColor=GUIDE_FILL)
    org.cell(row=16, column=1).alignment = Alignment(wrap_text=True, vertical="center")
    org.row_dimensions[16].height = 32

    level_guide(org, 18, 1, 2)

    # ── By role ─────────────────────────────────────────────────────────
    role_sheet(
        wb, "By role", "Roles to benchmark",
        "One row per role. Only the title and the salary are needed; everything else helps us "
        "place it. Job level is free text, and there is a guide on the Organisation tab.",
        [("Role title", 32), ("Current FTE salary (£)", 20), ("Job level", 26),
         ("Function or job family", 26), ("Comment (optional)", 46)],
    )

    # ── By person ───────────────────────────────────────────────────────
    role_sheet(
        wb, "By person", "People to benchmark",
        "Use this instead of By role if you hold pay per person. Keep it anonymous: number "
        "people who share a title, for example Data Analyst 1 and Data Analyst 2. Employee ID "
        "is optional and should be your own internal reference, never a name.",
        [("Employee ID (optional)", 22), ("Role title", 32), ("Current FTE salary (£)", 20),
         ("Job level", 26), ("Function or job family", 26), ("Comment (optional)", 46)],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f"{OUT.name}: {ROWS} rows per tab, {len(LEVEL_GUIDE)} levels in the guide, "
          f"{OUT.stat().st_size:,} B")


if __name__ == "__main__":
    build()
