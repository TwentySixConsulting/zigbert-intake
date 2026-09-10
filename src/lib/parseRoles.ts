import type { Role } from "./supabase";
import { EXPERIENCE_LEVELS, LOCATIONS } from "./supabase";

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

function parseCount(v: unknown): number | null {
  const n = parseInt(norm(v).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Match a free-typed level or location back to the list, else keep what they wrote. */
function closest(value: string, options: readonly string[]): string {
  const v = key(value);
  if (!v) return "";
  const exact = options.find((o) => key(o) === v);
  if (exact) return exact;
  const partial = options.find((o) => key(o).includes(v) || v.includes(key(o)));
  return partial ?? value;
}

const COLUMNS: Record<keyof Omit<Role, never>, string[]> = {
  title: ["roletitle", "role", "jobtitle", "title", "position"],
  salary: ["currentftesalary", "currentftesalary£", "salary", "ftesalary", "currentsalary", "basesalary"],
  level: ["experiencelevel", "level", "seniority", "grade"],
  family: ["functionorjobfamily", "function", "jobfamily", "family", "department", "team"],
  location: ["location", "region", "office", "basedin"],
  headcount: ["headcountoptional", "headcount", "numberofpeople", "fte", "count"],
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
        `No “${need === "salary" ? "Current FTE salary" : "Experience level"}” column was found, ` +
          "so that field is blank for every role.",
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
      title,
      salary,
      level: cols.level !== undefined ? closest(norm(r[cols.level]), EXPERIENCE_LEVELS) : "",
      family: cols.family !== undefined ? norm(r[cols.family]) : "",
      location: cols.location !== undefined ? closest(norm(r[cols.location]), LOCATIONS) : "",
      headcount: cols.headcount !== undefined ? parseCount(r[cols.headcount]) : null,
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

  const rolesSheet =
    wb.worksheets.find((w) => /role/i.test(w.name)) ?? wb.worksheets[0];
  if (!rolesSheet) throw new Error("That file has no worksheets in it.");
  const roles = rowsToRoles(toRows(rolesSheet), warnings);

  const orgSheet = wb.worksheets.find((w) => /organisation|organization|info/i.test(w.name));
  const org = orgSheet ? sheetToOrg(toRows(orgSheet)) : {};

  return { roles, warnings, org };
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
  return { roles, warnings, org: {} };
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return parseWorkbook(file);
  throw new Error(
    "That file type is not supported. Please upload the .xlsx template, or a .csv.",
  );
}
