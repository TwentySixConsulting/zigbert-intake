import { useMemo, useRef, useState } from "react";
import {
  Building2, CheckCircle2, Download, FileSpreadsheet, Loader2,
  Plus, Trash2, Upload, AlertTriangle, PencilLine,
} from "lucide-react";
import {
  EMPLOYEE_BANDS, LEVEL_GUIDE, LOCATIONS, SUPPORT_EMAIL,
  submitIntake, supabaseConfigured, type Role,
} from "./lib/supabase";
import { parseFile, type ParseResult } from "./lib/parseRoles";
import { Button, Field, Steps, inputClass } from "./components/ui";

const TEMPLATE = `${import.meta.env.BASE_URL}Zigbert-Benchmarking-Template.xlsx`;
const CONTACT = SUPPORT_EMAIL;

const emptyRole = (): Role => ({
  ref: "", title: "", salary: null, level: "", family: "", comment: "",
});

type Contact = {
  contact_name: string; contact_email: string; contact_job_title: string;
};
type Org = {
  organisation: string; industry: string; employee_count: string; main_location: string;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function App() {
  const [step, setStep] = useState(1);
  const [contact, setContact] = useState<Contact>({
    contact_name: "", contact_email: "", contact_job_title: "",
  });
  const [org, setOrg] = useState<Org>({
    organisation: "", industry: "", employee_count: "", main_location: "",
  });
  const [mode, setMode] = useState<"online" | "upload" | null>(null);
  // One row per role, or one per person. Mirrors the template's two tabs.
  const [basis, setBasis] = useState<"role" | "person">("role");
  const [roles, setRoles] = useState<Role[]>([emptyRole()]);
  const [upload, setUpload] = useState<{ name: string; result: ParseResult } | null>(null);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const filledRoles = useMemo(
    () => (mode === "upload" ? (upload?.result.roles ?? []) : roles.filter((r) => r.title.trim())),
    [mode, roles, upload],
  );

  const go = (n: number) => {
    setStep(n);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function validateStep1() {
    const e: Record<string, string> = {};
    if (!contact.contact_name.trim()) e.contact_name = "Please tell us who to reply to.";
    if (!contact.contact_email.trim()) e.contact_email = "We need an email to send the results to.";
    else if (!EMAIL_RE.test(contact.contact_email.trim())) e.contact_email = "That does not look like an email address.";
    setErrors(e);
    return !Object.keys(e).length;
  }
  function validateStep2() {
    const e: Record<string, string> = {};
    if (!org.organisation.trim()) e.organisation = "Please give the organisation's name.";
    // All three set the comparator group, so a benchmark without them is a
    // national average dressed up as a peer comparison.
    if (!org.industry.trim()) e.industry = "We need this to pick the right comparator group.";
    if (!org.employee_count) e.employee_count = "Please choose a size band.";
    if (!org.main_location) e.main_location = "Please choose where most of your people are.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function onFile(file: File) {
    setParseError("");
    setUpload(null);
    try {
      const result = await parseFile(file);
      setUpload({ name: file.name, result });
      // The template carries the organisation details too, so a client who filled
      // those in should not have to type them again.
      setBasis(result.basis);
      setOrg((o) => ({
        organisation: o.organisation || result.org.organisation || "",
        industry: o.industry || result.org.industry || "",
        // Only adopt a value the form can actually offer, or the select would
        // sit blank while claiming to be filled.
        employee_count: o.employee_count ||
          (EMPLOYEE_BANDS as readonly string[]).find((b) => b === result.org.employee_count) || "",
        main_location: o.main_location ||
          (LOCATIONS as readonly string[]).find((l) => l === result.org.main_location) || "",
      }));
      setContact((c) => ({
        ...c,
        contact_name: c.contact_name || result.org.contact_name || "",
        contact_email: c.contact_email || result.org.contact_email || "",
      }));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "That file could not be read.");
    }
  }

  async function send() {
    setSendError("");
    if (!filledRoles.length) {
      setSendError("Please add at least one role, or upload a completed template.");
      return;
    }
    setBusy(true);
    try {
      await submitIntake({
        ...contact,
        contact_job_title: contact.contact_job_title || null,
        ...org,
        roles: filledRoles,
        basis,
        entry_mode: mode === "upload" ? "upload" : "online",
        uploaded_filename: upload?.name ?? null,
        notes: notes || null,
      });
      setDone(true);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Something went wrong sending that.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Done name={contact.contact_name} email={contact.contact_email} count={filledRoles.length} />;

  return (
    <div className="min-h-screen">
      <Header />
      <main ref={topRef} className="max-w-3xl mx-auto px-5 py-9">
        {!supabaseConfigured && (
          <Notice tone="warn">
            This form is not connected to its database, so nothing you enter here will reach us.
            Please email <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> instead.
          </Notice>
        )}

        <div className="bg-white border border-line rounded-2xl p-7 shadow-sm">
          <Steps step={step} />

          {step === 1 && (
            <section>
              <h1 className="text-[22px] font-bold mb-1">Your details</h1>
              <p className="text-[13.5px] text-ink-soft mb-6 leading-relaxed">
                So we know who to send the benchmarking back to.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Your name" required error={errors.contact_name}>
                  <input className={inputClass} value={contact.contact_name} autoComplete="name"
                    onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} />
                </Field>
                <Field label="Work email" required error={errors.contact_email}>
                  <input className={inputClass} type="email" value={contact.contact_email} autoComplete="email"
                    onChange={(e) => setContact({ ...contact, contact_email: e.target.value })} />
                </Field>
                <Field label="Job title">
                  <input className={inputClass} value={contact.contact_job_title}
                    onChange={(e) => setContact({ ...contact, contact_job_title: e.target.value })} />
                </Field>
              </div>
              <div className="flex justify-end mt-7">
                <Button onClick={() => validateStep1() && go(2)}>Continue</Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="text-[22px] font-bold mb-1">Your organisation</h1>
              <p className="text-[13.5px] text-ink-soft mb-6 leading-relaxed">
                This sets the comparator group. Sector, size and location are what make a
                benchmark comparable rather than merely national.
              </p>
              {/* items-start, or a field showing an error stretches its neighbour
                  and the two columns stop lining up. */}
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-5 items-start">
                <Field label="Organisation name" required error={errors.organisation}
                  hint="As you would like it to appear on the report.">
                  <input className={inputClass} value={org.organisation} autoComplete="organization"
                    onChange={(e) => setOrg({ ...org, organisation: e.target.value })} />
                </Field>
                <Field label="Sector or industry" required error={errors.industry}
                  hint="For example charity, technology, housing.">
                  <input className={inputClass} value={org.industry}
                    onChange={(e) => setOrg({ ...org, industry: e.target.value })} />
                </Field>
                <Field label="Total employees" required error={errors.employee_count}
                  hint="Provision rises with size, so we compare like with like.">
                  <select className={inputClass} value={org.employee_count}
                    onChange={(e) => setOrg({ ...org, employee_count: e.target.value })}>
                    <option value="">Select…</option>
                    {EMPLOYEE_BANDS.map((b) => <option key={b} value={b}>{b} employees</option>)}
                  </select>
                </Field>
                <Field label="Main location" required error={errors.main_location}
                  hint="Where most of your people are based.">
                  <select className={inputClass} value={org.main_location}
                    onChange={(e) => setOrg({ ...org, main_location: e.target.value })}>
                    <option value="">Select…</option>
                    {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex justify-between mt-7">
                <Button variant="ghost" onClick={() => go(1)}>Back</Button>
                <Button onClick={() => validateStep2() && go(3)}>Continue</Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section>
              <h1 className="text-[22px] font-bold mb-1">Your roles</h1>
              <p className="text-[13.5px] text-ink-soft mb-6 leading-relaxed">
                Whichever is easier. Type them straight in, fill in our spreadsheet, or send us
                a spreadsheet you already have. There is no limit on how many.
              </p>

              {mode === null && <ModeChoice onPick={setMode} />}

              {mode === "online" && (
                <OnlineRoles
                  roles={roles} setRoles={setRoles} basis={basis} setBasis={setBasis}
                  onSwitch={() => { setMode("upload"); setParseError(""); }}
                />
              )}

              {mode === "upload" && (
                <UploadRoles
                  fileRef={fileRef} upload={upload} parseError={parseError}
                  onFile={onFile} onClear={() => { setUpload(null); setParseError(""); }}
                  onSwitch={() => { setMode("online"); setParseError(""); }}
                />
              )}

              {mode !== null && (
                <>
                  <div className="mt-6">
                    <Field label="Anything else we should know" hint="Job descriptions, unusual roles, a deadline you are working to.">
                      <textarea className={inputClass} rows={3} value={notes}
                        onChange={(e) => setNotes(e.target.value)} />
                    </Field>
                  </div>
                  {sendError && <div className="mt-5"><Notice tone="warn">{sendError}</Notice></div>}
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-7">
                    <Button variant="ghost" onClick={() => go(2)}>Back</Button>
                    <div className="flex items-center gap-3">
                      <span className="text-[12.5px] text-ink-soft">
                        {filledRoles.length} role{filledRoles.length === 1 ? "" : "s"} ready
                      </span>
                      <Button onClick={send} disabled={busy || !filledRoles.length}>
                        {busy ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : "Send to Zigbert"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <p className="text-[12px] text-ink-soft text-center mt-6 leading-relaxed">
          Salary information is confidential. It is stored securely, used only to build your
          benchmarking, and never shared with another client.
          <br />Questions? <a className="text-clay-deep font-medium underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}zigbert-logo.png`} alt="Zigbert" className="h-7 w-auto" />
        <span className="text-[12.5px] text-ink-soft border-l border-line pl-3">
          Pay &amp; Benefits Intelligence
        </span>
      </div>
    </header>
  );
}

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const look = tone === "warn"
    ? "bg-clay-wash border-clay/30 text-ink"
    : "bg-slate-wash border-slate2/25 text-ink";
  return (
    <div className={`flex gap-2.5 items-start rounded-xl border px-4 py-3 mb-5 text-[13px] leading-relaxed ${look}`}>
      <AlertTriangle size={16} className="flex-none mt-0.5 text-clay-deep" />
      <div>{children}</div>
    </div>
  );
}

function ModeChoice({ onPick }: { onPick: (m: "online" | "upload") => void }) {
  const card = "text-left border border-line rounded-xl p-5 bg-white hover:border-clay hover:shadow-sm transition group";
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <button type="button" className={card} onClick={() => onPick("online")}>
        <PencilLine size={20} className="text-clay mb-3" />
        <span className="block font-display font-semibold text-[15px] mb-1">Type them in here</span>
        <span className="block text-[13px] text-ink-soft leading-relaxed">
          Best for a handful of roles. Add a row at a time, nothing to download.
        </span>
      </button>
      <button type="button" className={card} onClick={() => onPick("upload")}>
        <FileSpreadsheet size={20} className="text-clay mb-3" />
        <span className="block font-display font-semibold text-[15px] mb-1">Use our spreadsheet</span>
        <span className="block text-[13px] text-ink-soft leading-relaxed">
          Best for a long list. Download ours and fill it in, or just send the spreadsheet
          you already have and we will sort it out.
        </span>
      </button>
    </div>
  );
}

function BasisToggle({ basis, onChange }: { basis: "role" | "person"; onChange: (b: "role" | "person") => void }) {
  const opt = (v: "role" | "person", label: string, sub: string) => (
    <button type="button" onClick={() => onChange(v)}
      aria-pressed={basis === v}
      className={"flex-1 text-left rounded-lg border px-4 py-3 transition " +
        (basis === v ? "border-clay bg-clay-wash" : "border-line bg-white hover:border-clay/50")}>
      <span className="block text-[13.5px] font-semibold">{label}</span>
      <span className="block text-[12px] text-ink-soft mt-0.5 leading-relaxed">{sub}</span>
    </button>
  );
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-5">
      {opt("role", "One row per role", "One line for each job, however many people hold it.")}
      {opt("person", "One row per person", "Keeps the spread when people on the same job are paid differently.")}
    </div>
  );
}

function LevelHelp() {
  return (
    <details className="mt-4 rounded-xl border border-line bg-canvas/60 p-4">
      <summary className="cursor-pointer text-[13px] font-semibold text-clay-deep">
        Your job levels may look like this
      </summary>
      <p className="text-[12.5px] text-ink-soft leading-relaxed mt-2.5 mb-3">
        These are the four levels we benchmark against. Use your own wording if that is
        easier and we will map it across. If a role sits between two, say so in the comment.
      </p>
      <dl className="space-y-2">
        {LEVEL_GUIDE.map((l) => (
          <div key={l.name} className="grid sm:grid-cols-[210px_1fr] gap-x-4 gap-y-0.5">
            <dt className="text-[12.5px] font-semibold text-ink">{l.name}</dt>
            <dd className="text-[12.5px] text-ink-soft leading-relaxed">{l.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function OnlineRoles({
  roles, setRoles, basis, setBasis, onSwitch,
}: {
  roles: Role[]; setRoles: (r: Role[]) => void;
  basis: "role" | "person"; setBasis: (b: "role" | "person") => void;
  onSwitch: () => void;
}) {
  const set = (i: number, patch: Partial<Role>) =>
    setRoles(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const noun = basis === "person" ? "Person" : "Role";
  return (
    <div>
      <BasisToggle basis={basis} onChange={setBasis} />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12.5px] text-ink-soft">
          {basis === "person"
            ? "Keep it anonymous: number people who share a title, for example Data Analyst 1 and Data Analyst 2."
            : "One row per role. Only the title and the salary are needed."}
        </span>
        <button type="button" onClick={onSwitch} className="flex-none ml-4 text-[12.5px] font-medium text-clay-deep underline">
          Use the spreadsheet instead
        </button>
      </div>
      <div className="space-y-3">
        {roles.map((r, i) => (
          <div key={i} className="border border-line rounded-xl p-4 bg-canvas/60">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{noun} {i + 1}</span>
              {roles.length > 1 && (
                <button type="button" aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`}
                  onClick={() => setRoles(roles.filter((_, j) => j !== i))}
                  className="text-ink-soft hover:text-clay-deep">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {basis === "person" && (
                <input className={inputClass} placeholder="Employee ID (optional)" value={r.ref}
                  onChange={(e) => set(i, { ref: e.target.value })} />
              )}
              <input className={inputClass}
                placeholder={basis === "person" ? "Role title, e.g. Data Analyst 1" : "Role title"}
                value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
              <input className={inputClass} placeholder="Current FTE salary (£)" inputMode="numeric"
                value={r.salary ?? ""} onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                  set(i, { salary: Number.isFinite(n) ? n : null });
                }} />
              <input className={inputClass} placeholder="Job level" value={r.level}
                onChange={(e) => set(i, { level: e.target.value })} />
              <input className={inputClass} placeholder="Function or job family" value={r.family}
                onChange={(e) => set(i, { family: e.target.value })} />
              <input className={inputClass + " sm:col-span-2"}
                placeholder="Comment (optional), anything specific we should know"
                value={r.comment} onChange={(e) => set(i, { comment: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRoles([...roles, emptyRole()])}
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-clay-deep hover:underline">
        <Plus size={15} /> Add another {noun.toLowerCase()}
      </button>
      <LevelHelp />
    </div>
  );
}

function UploadRoles({
  fileRef, upload, parseError, onFile, onClear, onSwitch,
}: {
  fileRef: React.MutableRefObject<HTMLInputElement | null>;
  upload: { name: string; result: ParseResult } | null;
  parseError: string;
  onFile: (f: File) => void;
  onClear: () => void;
  onSwitch: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12.5px] text-ink-soft">Two steps: download, then upload it back.</span>
        <button type="button" onClick={onSwitch} className="text-[12.5px] font-medium text-clay-deep underline">
          Type them in instead
        </button>
      </div>

      <div className="border border-line rounded-xl p-5 bg-canvas/60 mb-4">
        <div className="flex items-start gap-3">
          <span className="flex-none w-6 h-6 rounded-full bg-clay text-white grid place-items-center text-[11px] font-bold">1</span>
          <div className="min-w-0">
            <p className="font-semibold text-[14px] mb-1">Download the template</p>
            <p className="text-[13px] text-ink-soft leading-relaxed mb-3">
              Three tabs: your organisation details, then <b>By role</b> or <b>By person</b>,
              whichever suits how you hold the data. Fill in one of them, not both. There is a
              guide to job levels on the first tab.
            </p>
            <a href={TEMPLATE} download
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-[13.5px] font-semibold hover:border-clay hover:text-clay-deep transition">
              <Download size={15} /> Zigbert-Benchmarking-Template.xlsx
            </a>
            <p className="text-[12.5px] text-ink-soft leading-relaxed mt-3">
              <b className="text-ink">Already have this in a spreadsheet of your own?</b> Send us
              that instead. As long as there is a row per role and a column for the title and the
              salary, we will sort out the rest. It does not need to match our headings.
            </p>
          </div>
        </div>
      </div>

      <div className="border border-line rounded-xl p-5 bg-canvas/60">
        <div className="flex items-start gap-3">
          <span className="flex-none w-6 h-6 rounded-full bg-clay text-white grid place-items-center text-[11px] font-bold">2</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[14px] mb-1">Upload your completed file</p>
            <p className="text-[13px] text-ink-soft leading-relaxed mb-3">
              .xlsx or .csv.
            </p>

            {!upload ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFile(f);
                }}
                className={"rounded-xl border-2 border-dashed px-4 py-7 text-center transition " +
                  (dragging ? "border-clay bg-clay-wash" : "border-line bg-white")}
              >
                <Upload size={20} className="mx-auto text-ink-soft mb-2" />
                <p className="text-[13px] text-ink-soft mb-3">Drop the file here, or</p>
                <Button variant="ghost" onClick={() => fileRef.current?.click()}>Choose a file</Button>
                <input ref={(el) => { fileRef.current = el; }} type="file" accept=".xlsx,.xlsm,.csv" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-white p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <CheckCircle2 size={17} className="text-slate2 flex-none" />
                  <span className="font-semibold text-[13.5px] truncate">{upload.name}</span>
                  <button type="button" onClick={onClear}
                    className="ml-auto text-[12.5px] text-ink-soft hover:text-clay-deep underline flex-none">
                    Replace
                  </button>
                </div>
                <p className="text-[13px] text-ink-soft mb-3">
                  <strong className="text-ink">{upload.result.roles.length}</strong>{" "}
                  {upload.result.basis === "person" ? "people" : "roles"} read from the file
                  {upload.result.basis === "person" ? " (By person tab)" : ""}.
                </p>
                {upload.result.warnings.map((w, i) => (
                  <p key={i} className="text-[12.5px] text-clay-deep mb-1.5">• {w}</p>
                ))}
                <div className="max-h-52 overflow-auto rounded-lg border border-line-soft">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-slate-wash sticky top-0">
                      <tr>
                        {upload.result.basis === "person" && (
                          <th className="text-left font-semibold px-3 py-2">Ref</th>
                        )}
                        <th className="text-left font-semibold px-3 py-2">Role</th>
                        <th className="text-left font-semibold px-3 py-2">Salary</th>
                        <th className="text-left font-semibold px-3 py-2">Job level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upload.result.roles.slice(0, 60).map((r, i) => (
                        <tr key={i} className="border-t border-line-soft">
                          {upload.result.basis === "person" && (
                            <td className="px-3 py-1.5 text-ink-soft">{r.ref || "—"}</td>
                          )}
                          <td className="px-3 py-1.5">{r.title}</td>
                          <td className="px-3 py-1.5">{r.salary === null ? "—" : `£${r.salary.toLocaleString()}`}</td>
                          <td className="px-3 py-1.5 text-ink-soft">{r.level || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {upload.result.roles.length > 60 && (
                  <p className="text-[12px] text-ink-soft mt-2">
                    Showing the first 60 of {upload.result.roles.length}. All of them will be sent.
                  </p>
                )}
              </div>
            )}

            {parseError && <p role="alert" className="text-[13px] text-clay-deep mt-3 leading-relaxed">{parseError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Done({ name, email, count }: { name: string; email: string; count: number }) {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-xl mx-auto px-5 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-wash grid place-items-center mx-auto mb-5">
          <CheckCircle2 size={28} className="text-slate2" />
        </div>
        <h1 className="text-[24px] font-bold mb-3">Thank you{name ? `, ${name.split(" ")[0]}` : ""}</h1>
        <p className="text-[14.5px] text-ink-soft leading-relaxed mb-4">
          We have your {count} {count === 1 ? "row" : "rows"}, and they are safely with us.
        </p>
        <p className="text-[14.5px] text-ink-soft leading-relaxed mb-8">
          One of our consultants will be in touch at{" "}
          <strong className="text-ink">{email}</strong> to confirm the comparator group before
          we start. You will get your dashboard back by email once it is built.
        </p>
        <div className="border border-line rounded-xl bg-white p-5 text-left">
          <p className="flex items-center gap-2 font-semibold text-[13.5px] mb-2">
            <Building2 size={15} className="text-clay" /> What happens next
          </p>
          <ol className="text-[13px] text-ink-soft space-y-1.5 list-decimal pl-5 leading-relaxed">
            <li>We check the roles and come back on anything ambiguous.</li>
            <li>We match each one to the market and build your dashboard.</li>
            <li>You get a link and a login, and we walk you through it.</li>
          </ol>
        </div>
        <p className="text-[12.5px] text-ink-soft mt-6">
          Need to change something, or send more? Write to{" "}
          <a className="text-clay-deep underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </main>
    </div>
  );
}
