import type { Role } from "./supabase";

/**
 * Read roles out of the completed template.
 *
 * The file coming back is one a client has edited in Excel, so this is
 * deliberately forgiving: it finds the header row rather than assuming row 5,
 * matches columns by name rather than by position, and accepts a salary typed
 * as "£45,000", "45000.00" or "45k". What it will not do is silently invent a
 * value: anything it cannot read is reported, not guessed.
 */

export type ParseResult = {
  roles: Role[];
  warnings: string[];
  /** Which tab the rows came off, so the site can label them the same way. */
  basis: "role" | "person";
  org: Partial<{
    organisation: string;
    industry: string;
    employee_count: string;
    main_location: string;
    contact_name: string;
    contact_email: string;
  }>;
};

const norm = (v: unknown) =>
  String(v ?? "").replace(/\s+/g, " ").trim();

const key = (v: unknown) =>
  norm(v).toLowerCase().replace(/[^a-z0-9]/g, "");

/** "£45,000" / "45k" / 45000 -> 45000. Returns null when there is no number. */
export function parseSalary(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const s = norm(v).toLowerCase().replace(/[£$,\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)(k?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] === "k" ? 1000 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Aliases, because "send us the spreadsheet you already have" means the headings
// will not be ours. Longest-first within each field so "employeeid" is not eaten
// by a shorter alias.
const COLUMNS: Record<keyof Role, string[]> = {
  ref: ["employeeid", "employeeref", "employeenumber", "staffid", "payrollid", "reference", "id"],
  title: ["roletitle", "jobtitle", "role", "title", "position", "jobrole"],
  salary: ["currentftesalary", "ftesalary", "currentsalary", "basesalary", "salary", "pay"],
  level: ["joblevel", "experiencelevel", "level", "seniority", "grade", "band"],
  family: ["functionorjobfamily", "jobfamily", "function", "family", "department", "team", "directorate"],
  comment: ["commentoptional", "comment", "comments", "notes", "note"],
};

function matchColumns(header: unknown[]): Partial<Record<keyof Role, number>> {
  const found: Partial<Record<keyof Role, number>> = {};
  header.forEach((cell, i) => {
    const raw = norm(cell);
    // Headings are short. Without this a sentence of instructions that happens to
    // contain a keyword reads as a column.
    if (!raw || raw.length > 40) return;
    const k = key(cell);
    if (!k) return;
    for (const [field, aliases] of Object.entries(COLUMNS) as [keyof Role, string[]][]) {
      if (found[field] !== undefined) continue;
      // Exact, or the alias plus trailing noise like a "£" or "(optional)". NOT a bare
      // prefix in the other direction: the template's own title row says "Roles to
      // benchmark", which starts with "role" and was being read as the header.
      if (aliases.some((a) => k === a || (k.startsWith(a) && k.length - a.length <= 12))) {
        found[field] = i;
      }
    }
  });
  return found;
}

/** Rows as arrays -> roles. Shared by the xlsx and csv paths. */
function rowsToRoles(rows: unknown[][], warnings: string[]): Role[] {
  // Find the header rather than trusting a row number: clients insert rows.
  //
  // Take the BEST-matching row, not the first one that matches at all. A real header
  // row matches several columns at once; a title or instruction row matches one by
  // coincidence. Scoring beats first-hit, which locked onto the template's own
  // "Roles to benchmark" heading two rows above the actual table.
  let headerIdx = -1;
  let cols: Partial<Record<keyof Role, number>> = {};
  let best = 0;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const c = matchColumns(rows[i] ?? []);
    const score = Object.keys(c).length;
    if (c.title !== undefined && score > best) {
      best = score;
      headerIdx = i;
      cols = c;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "Could not find a column headed “Role title”. Please use the template without " +
        "renaming its column headings, or type the roles in directly instead.",
    );
  }
  for (const need of ["salary", "level"] as const) {
    if (cols[need] === undefined) {
      warnings.push(
        `No “${need === "salary" ? "Current FTE salary" : "Job level"}” column was found, ` +
          "so that field is blank for every row.",
      );
    }
  }

  const roles: Role[] = [];
  let skippedNoSalary = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const title = norm(cols.title !== undefined ? r[cols.title] : "");
    if (!title) continue; // blank template rows
    const salary = cols.salary !== undefined ? parseSalary(r[cols.salary]) : null;
    if (salary === null) skippedNoSalary++;
    roles.push({
      ref: cols.ref !== undefined ? norm(r[cols.ref]) : "",
      title,
      salary,
      level: cols.level !== undefined ? norm(r[cols.level]) : "",
      family: cols.family !== undefined ? norm(r[cols.family]) : "",
      comment: cols.comment !== undefined ? norm(r[cols.comment]) : "",
    });
  }

  if (!roles.length) {
    throw new Error(
      "The file was read but no roles were found in it. Check the Roles tab has at " +
        "least one row filled in under the headings.",
    );
  }
  if (skippedNoSalary) {
    warnings.push(
      `${skippedNoSalary} of ${roles.length} roles have no salary we could read. ` +
        "They are still included; we will follow up on those.",
    );
  }
  return roles;
}

/** Organisation Info tab: two columns, label then answer. */
function sheetToOrg(rows: unknown[][]): ParseResult["org"] {
  const want: Record<string, keyof ParseResult["org"]> = {
    organisationname: "organisation",
    industry: "industry",
    totalnumberofemployees: "employee_count",
    numberofemployees: "employee_count",
    mainlocation: "main_location",
    contactname: "contact_name",
    contactemail: "contact_email",
  };
  const org: ParseResult["org"] = {};
  for (const r of rows) {
    const k = key(r?.[0]);
    const field = want[k];
    const val = norm(r?.[1]);
    // The template ships hint text in some answer cells; ignore anything that
    // still looks like the hint rather than an answer.
    if (field && val && !val.startsWith("e.g.") && !val.startsWith("Used where")) {
      org[field] = val;
    }
  }
  return org;
}

export async function parseWorkbook(file: File): Promise<ParseResult> {
  // exceljs is CommonJS. Bundlers usually smooth this over, but under plain ESM the
  // namespace object holds the library on .default, so take whichever is real.
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const warnings: string[] = [];
  const toRows = (ws: import("exceljs").Worksheet): unknown[][] => {
    const out: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value as unknown;
        // A formula cell carries { formula, result }; take what it evaluated to.
        vals[col - 1] =
          v && typeof v === "object" && "result" in (v as object)
            ? (v as { result: unknown }).result
            : v && typeof v === "object" && "text" in (v as object)
              ? (v as { text: unknown }).text
              : v;
      });
      out.push(vals);
    });
    return out;
  };

  // A client fills in one tab or the other. Prefer whichever actually has rows,
  // rather than assuming: an empty "By role" tab in front of a filled-in
  // "By person" tab would otherwise read as an empty submission.
  const byPerson = wb.worksheets.find((w) => /person/i.test(w.name));
  const byRole = wb.worksheets.find((w) => /role/i.test(w.name));
  const candidates = [byRole, byPerson, ...wb.worksheets].filter(Boolean) as typeof wb.worksheets;
  if (!candidates.length) throw new Error("That file has no worksheets in it.");

  let roles: Role[] = [];
  let basis: "role" | "person" = "role";
  let lastErr: unknown = null;
  for (const ws of candidates) {
    try {
      const got = rowsToRoles(toRows(ws), warnings);
      if (got.length) {
        roles = got;
        basis = ws === byPerson ? "person" : "role";
        break;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (!roles.length) throw (lastErr ?? new Error("No rows were found in that file."));
  if (byRole && byPerson) {
    const other = basis === "person" ? byRole : byPerson;
    let otherCount = 0;
    try { otherCount = rowsToRoles(toRows(other), []).length; } catch { /* empty is fine */ }
    if (otherCount) {
      warnings.push(
        `Both tabs have rows. We have used the “${basis === "person" ? "By person" : "By role"}” ` +
          `tab (${roles.length}) and ignored the other (${otherCount}). Tell us if that is the wrong way round.`,
      );
    }
  }

  const orgSheet = wb.worksheets.find((w) => /organisation|organization|info/i.test(w.name));
  const org = orgSheet ? sheetToOrg(toRows(orgSheet)) : {};

  return { roles, warnings, basis, org };
}

/** Minimal RFC4180-ish reader: handles quoted fields and embedded commas. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function parseCsv(file: File): Promise<ParseResult> {
  const warnings: string[] = [];
  const roles = rowsToRoles(parseCsvText(await file.text()), warnings);
  // A csv is a flat list, so infer the basis from whether it carries a reference.
  const basis = roles.some((r) => r.ref) ? "person" : "role";
  return { roles, warnings, basis, org: {} };
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return parseWorkbook(file);
  throw new Error(
    "That file type is not supported. Please upload the .xlsx template, or a .csv.",
  );
}
