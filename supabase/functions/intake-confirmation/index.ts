// Supabase Edge Function — confirms to the CLIENT that we have their roles.
//
// Trigger: Database Webhook (Database -> Webhooks) on INSERT to
// public.intake_submissions, pointing at this function. Supabase posts
// { type, table, record, ... }.
//
// Secrets required (supabase secrets set ...):
//   RESEND_API_KEY  — Resend API key
//   FROM_EMAIL      — verified sender, e.g. "TwentySix <hello@twentysixconsulting.co.uk>"
//
// Deploy: supabase functions deploy intake-confirmation

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ??
  "Zigbert <hello@twentysixconsulting.co.uk>";
const REPLY_TO = "consultants@twentysixconsulting.co.uk";

const INK = "#121c2b", CLAY = "#c9785a", SLATE = "#5e7191", LINE = "#dee1e6", MUTED = "#4b5563";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function html(firstName: string, org: string, count: number) {
  return `<!doctype html>
<html><body style="margin:0;background:#f7f8fa;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:${INK};">
  <div style="max-width:540px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
      <div style="background:${SLATE};padding:20px 26px;color:#fff;">
        <div style="font-size:19px;font-weight:700;letter-spacing:-0.02em;">Zigbert</div>
        <div style="font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;opacity:.85;margin-top:3px;">Pay &amp; Benefits Intelligence</div>
      </div>
      <div style="padding:26px;">
        <h1 style="font-size:20px;margin:0 0 14px;">We have your roles</h1>
        <p style="font-size:14.5px;line-height:1.65;color:${MUTED};margin:0 0 14px;">
          Hi ${esc(firstName)}, thanks for sending these over. We have received
          <strong style="color:${INK};">${count} role${count === 1 ? "" : "s"}</strong> for
          <strong style="color:${INK};">${esc(org)}</strong>.
        </p>
        <p style="font-size:14.5px;line-height:1.65;color:${MUTED};margin:0 0 8px;">What happens next:</p>
        <ol style="font-size:14px;line-height:1.7;color:${MUTED};margin:0 0 18px;padding-left:20px;">
          <li>We check the roles and come back on anything ambiguous.</li>
          <li>We agree the comparator group with you, so the benchmark is against organisations like yours.</li>
          <li>We build your dashboard and send you a link and a login.</li>
        </ol>
        <p style="font-size:14.5px;line-height:1.65;color:${MUTED};margin:0 0 18px;">
          Need to change anything, or send more roles? Just reply to this email.
        </p>
        <div style="border-top:1px solid ${LINE};padding-top:14px;font-size:12.5px;color:${MUTED};line-height:1.6;">
          Salary information you send us is confidential. It is stored securely, used only to
          build your benchmarking, and never shared with another client.
        </div>
      </div>
    </div>
    <p style="text-align:center;font-size:11.5px;color:${MUTED};margin:14px 0 0;">
      Zigbert is a reward intelligence platform from TwentySix Consulting · <a href="mailto:${REPLY_TO}" style="color:${CLAY};">${REPLY_TO}</a>
    </p>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  try {
    const payload = await req.json();
    const r = payload.record ?? payload;
    const to: string | undefined = r?.contact_email;
    if (!to) return new Response("No contact_email in payload", { status: 400 });

    const first = String(r.contact_name ?? "").trim().split(/\s+/)[0] || "there";
    const count = Array.isArray(r.roles) ? r.roles.length : (r.role_count ?? 0);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        reply_to: REPLY_TO,
        subject: `We have your roles — ${r.organisation ?? "benchmarking"}`,
        html: html(first, r.organisation ?? "your organisation", count),
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
