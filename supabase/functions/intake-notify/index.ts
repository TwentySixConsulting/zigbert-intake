// Supabase Edge Function — tells the consultant a submission has landed, and
// attaches the roles as a CSV so the dashboard build can start straight away.
//
// Sends to ONE recipient only, the address below. No one else.
//
// Trigger: Database Webhook on INSERT to public.intake_submissions.
// Secrets: RESEND_API_KEY, FROM_EMAIL (optional).
// Deploy: supabase functions deploy intake-notify

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "TwentySix <onboarding@resend.dev>";

// The only address that ever receives these.
const NOTIFY_TO = "millieharrison@twentysixconsulting.co.uk";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function row(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td style="padding:4px 14px 4px 0;color:#4b5563;white-space:nowrap;">${label}</td>` +
    `<td style="padding:4px 0;color:#121c2b;font-weight:600;">${esc(value)}</td></tr>`;
}

type Role = {
  title?: string; salary?: number | null; level?: string;
  family?: string; location?: string; headcount?: number | null;
};

/** The roles as a CSV attachment, so they can go straight into the build. */
function rolesCsv(roles: Role[]): string {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Role title", "Current FTE salary", "Experience level", "Function or job family", "Location", "Headcount"];
  const lines = [head.join(",")];
  for (const r of roles) {
    lines.push([r.title, r.salary ?? "", r.level, r.family, r.location, r.headcount ?? ""].map(cell).join(","));
  }
  return lines.join("\n");
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  try {
    const payload = await req.json();
    const r = payload.record ?? payload;
    if (!r?.contact_email) return new Response("No contact_email in payload", { status: 400 });

    const roles: Role[] = Array.isArray(r.roles) ? r.roles : [];
    const noSalary = roles.filter((x) => x.salary === null || x.salary === undefined).length;
    const slug = String(r.organisation ?? "client").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "client";

    const preview = roles.slice(0, 25).map((x) =>
      `<tr><td style="padding:3px 12px 3px 0;">${esc(x.title)}</td>` +
      `<td style="padding:3px 12px 3px 0;">${x.salary ? "£" + Number(x.salary).toLocaleString() : "—"}</td>` +
      `<td style="padding:3px 0;color:#4b5563;">${esc(x.level || "—")}</td></tr>`).join("");

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#121c2b;max-width:620px;">
        <h2 style="margin:0 0 4px;font-size:18px;">New benchmarking intake</h2>
        <p style="margin:0 0 16px;color:#4b5563;font-size:13.5px;">
          ${esc(r.organisation)} · ${roles.length} role${roles.length === 1 ? "" : "s"}
          ${noSalary ? ` · <strong style="color:#b0603f;">${noSalary} with no salary</strong>` : ""}
        </p>
        <table style="border-collapse:collapse;font-size:13.5px;margin-bottom:18px;">
          ${row("Contact", r.contact_name)}
          ${row("Email", r.contact_email)}
          ${row("Job title", r.contact_job_title)}
          ${row("Phone", r.contact_phone)}
          ${row("Organisation", r.organisation)}
          ${row("Sector", r.industry)}
          ${row("Employees", r.employee_count)}
          ${row("Main location", r.main_location)}
          ${row("Entered via", r.entry_mode === "upload" ? `Uploaded file (${esc(r.uploaded_filename)})` : "Typed into the form")}
          ${row("Submitted", r.created_at)}
          ${row("Submission id", r.id)}
        </table>
        ${r.notes ? `<p style="font-size:13.5px;background:#f7f8fa;border-left:3px solid #c9785a;padding:10px 14px;margin:0 0 18px;"><strong>Notes:</strong> ${esc(r.notes)}</p>` : ""}
        <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#4b5563;margin:0 0 6px;">
          Roles${roles.length > 25 ? " (first 25, full list attached)" : ""}
        </p>
        <table style="border-collapse:collapse;font-size:13px;">${preview}</table>
        <p style="font-size:12.5px;color:#4b5563;margin-top:18px;">
          The full list is attached as ${esc(slug)}-roles.csv, ready for the dashboard build.
        </p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [NOTIFY_TO],
        reply_to: r.contact_email,
        subject: `Intake: ${r.organisation ?? "unknown"} — ${roles.length} role${roles.length === 1 ? "" : "s"}`,
        html,
        attachments: roles.length
          ? [{ filename: `${slug}-roles.csv`, content: b64(rolesCsv(roles)) }]
          : undefined,
      }),
    });
    if (!res.ok) return new Response(`Resend error: ${await res.text()}`, { status: 502 });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});
