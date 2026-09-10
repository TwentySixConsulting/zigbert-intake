// Node test of the spreadsheet parser, run against the REAL template a client downloads.
// The parser is the part that meets whatever a client actually sends back, so it is tested
// against a filled-in copy of the template rather than a fixture written to suit it.
import ExcelJS from "exceljs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";

let pass = 0, fail = 0;
const check = (ok, msg) => { ok ? (pass++, console.log("  ok  ", msg)) : (fail++, console.log("  FAIL", msg)); };

// Fill the real template the way a client would, then read it back.
const TEMPLATE = "public/TwentySix-Benchmarking-Template.xlsx";
const ROLES = [
  ["Chief Executive", 95000, "Experts, Strategists & Leaders", "Leadership", "London", 1],
  ["Head of Finance", "£62,500", "Mid to Senior", "Finance", "London", 1],
  ["Grants Manager", "48k", "Mid to Senior", "Programmes", "Remote (UK)", 3],
  ["Programme Officer", 34000, "Early and Developing", "Programmes", "Midlands", 4],
  ["Administrator", "", "Entry or Foundation", "Operations", "", 2],
];

async function makeFilled(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const org = wb.worksheets.find((w) => /organisation/i.test(w.name));
  const rows = { "Organisation name": "Hollow Oak Trust", "Industry": "Charity",
    "Total number of employees": "40", "Main location": "London",
    "Contact name": "Dana Whitfield", "Contact email": "dana@hollowoak.example" };
  org.eachRow((row) => {
    const label = String(row.getCell(1).value ?? "").trim();
    if (rows[label] !== undefined) row.getCell(2).value = rows[label];
  });
  const rs = wb.worksheets.find((w) => /^roles$/i.test(w.name));
  ROLES.forEach((r, i) => r.forEach((v, c) => { if (v !== "") rs.getCell(6 + i, c + 1).value = v; }));
  await wb.xlsx.writeFile(path);
}

// The browser parser takes a File; give it the same shape from Node.
function asFile(path, name) {
  const buf = readFileSync(path);
  return { name, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
           text: async () => buf.toString("utf8") };
}

// Transpile the real module with esbuild (already present via Vite) rather than
// regex-stripping the types, which silently mangles generics.
import { build } from "esbuild";
const bundled = await build({
  entryPoints: ["src/lib/parseRoles.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  external: ["exceljs"],
  // parseRoles imports its constants from supabase.ts, which pulls in the browser
  // client. Stub that module so the test loads the parser and nothing else.
  plugins: [{
    name: "stub-supabase",
    setup(b) {
      b.onResolve({ filter: /\.\/supabase$/ }, () => ({ path: "supabase-stub", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: `export const EXPERIENCE_LEVELS=["Entry or Foundation","Early and Developing","Mid to Senior","Experts, Strategists & Leaders"];
                   export const LOCATIONS=["London","South East England","South West England","Midlands","North of England","Scotland","Wales","Northern Ireland","Remote (UK)"];`,
        loader: "js",
      }));
    },
  }],
});
// Written to disk rather than imported as a data: URL, because a data: module
// cannot resolve the bare "exceljs" specifier against node_modules.
const genPath = new URL("./.parseRoles.gen.mjs", import.meta.url);
writeFileSync(genPath, bundled.outputFiles[0].text);
const mod = await import(genPath.href);

console.log("Parser against the real template");
await makeFilled("/tmp/filled.xlsx");
const r = await mod.parseFile(asFile("/tmp/filled.xlsx", "filled.xlsx"));
check(r.roles.length === 5, `reads all 5 roles (got ${r.roles.length})`);
check(r.roles[0].title === "Chief Executive", "reads the role title");
check(r.roles[0].salary === 95000, `plain number salary (${r.roles[0].salary})`);
check(r.roles[1].salary === 62500, `"£62,500" -> 62500 (${r.roles[1].salary})`);
check(r.roles[2].salary === 48000, `"48k" -> 48000 (${r.roles[2].salary})`);
check(r.roles[4].salary === null, "a blank salary is null, not 0");
check(r.roles[0].level === "Experts, Strategists & Leaders", "keeps the dropdown level");
check(r.roles[2].headcount === 3, "reads headcount");
check(r.roles[4].headcount === 2, "reads headcount when salary is blank");
check(r.warnings.some((w) => w.includes("1 of 5")), `warns about the missing salary (${r.warnings[0] ?? "none"})`);
check(r.org.organisation === "Hollow Oak Trust", `reads org name (${r.org.organisation})`);
check(r.org.contact_email === "dana@hollowoak.example", "reads contact email");

console.log("\nTolerates what clients actually send");
check(mod.parseSalary("£1,234") === 1234 && mod.parseSalary("55K") === 55000 &&
      mod.parseSalary("") === null && mod.parseSalary("n/a") === null, "salary parsing edge cases");
const csv = "Job Title,Salary,Seniority\nCaseworker,29000,Early and Developing\n\"Smith, Jane role\",31000,Mid to Senior\n";
writeFileSync("/tmp/roles.csv", csv);
const c = await mod.parseFile(asFile("/tmp/roles.csv", "roles.csv"));
check(c.roles.length === 2, `csv with renamed headers still reads (${c.roles.length})`);
check(c.roles[0].title === "Caseworker", "matches columns by name, not position");
check(c.roles[1].title === "Smith, Jane role", "handles a quoted comma");
check(c.roles[0].level === "Early and Developing", "maps a free-typed level onto the list");

console.log("\nFails loudly rather than silently");
writeFileSync("/tmp/junk.csv", "colour,size\nred,large\n");
await mod.parseFile(asFile("/tmp/junk.csv", "junk.csv"))
  .then(() => check(false, "rejects a file with no role column"))
  .catch((e) => check(/Role title/i.test(e.message), "rejects a file with no role column, and says why"));
writeFileSync("/tmp/empty.csv", "Role title,Salary\n");
await mod.parseFile(asFile("/tmp/empty.csv", "empty.csv"))
  .then(() => check(false, "rejects a template with no rows filled in"))
  .catch((e) => check(/no roles were found/i.test(e.message), "rejects a template with no rows filled in"));
await mod.parseFile(asFile("/tmp/roles.csv", "notes.txt"))
  .then(() => check(false, "rejects an unsupported file type"))
  .catch((e) => check(/not supported/i.test(e.message), "rejects an unsupported file type"));

rmSync(genPath, { force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
