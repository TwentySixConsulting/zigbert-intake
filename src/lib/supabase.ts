import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when the env vars are absent, so the form can say so plainly instead of
// crashing the page.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = Boolean(url && anonKey);

export const SUPPORT_EMAIL = "consultants@twentysixconsulting.co.uk";

export type Role = {
  /** Optional internal reference, person basis only. Never a name. */
  ref: string;
  title: string;
  salary: number | null;
  /** Free text. Their wording, mapped onto our four levels by us. */
  level: string;
  family: string;
  comment: string;
};

export type Submission = {
  contact_name: string;
  contact_email: string;
  contact_job_title?: string | null;
  organisation: string;
  industry: string;
  employee_count: string;
  main_location: string;
  roles: Role[];
  /** Whether the rows are one per role or one per person. */
  basis: "role" | "person";
  entry_mode: "online" | "upload";
  uploaded_filename?: string | null;
  notes?: string | null;
};

export async function submitIntake(s: Submission): Promise<void> {
  if (!supabase) {
    throw new Error(
      "This form is not connected to its database yet. Please email your details to " +
        `${SUPPORT_EMAIL} and we will pick it up from there.`,
    );
  }
  const { error } = await supabase.from("intake_submissions").insert(s);
  if (!error) return;

  // Never show a client a Postgres error. They cannot act on "relation does not
  // exist", and it reads like something they broke. Keep the detail in the console
  // for us, and give them a route that always works.
  console.error("intake insert failed", error);
  const fallback = ` Please email your details to ${SUPPORT_EMAIL} and we will pick it up from there.`;
  if (error.code === "23514") {
    throw new Error(
      "Some of that did not pass our checks. Please make sure the email address is " +
        "right and that there are no more than 500 rows." + fallback,
    );
  }
  throw new Error("We could not save that just now." + fallback);
}

/**
 * The four levels we benchmark against. No longer a closed list anywhere: a
 * client's own level names rarely match ours, and forcing a choice made them
 * guess. Shown as guidance, and we map their wording across.
 */
export const LEVEL_GUIDE: { name: string; meaning: string }[] = [
  { name: "Entry or Foundation",
    meaning: "New to the field or to the organisation. Work is closely defined and supervised." },
  { name: "Early and Developing",
    meaning: "Works independently on familiar tasks, still building depth. Passes unusual cases up." },
  { name: "Mid to Senior",
    meaning: "Fully independent and accountable for outcomes. Often leads people or owns a workstream." },
  { name: "Experts, Strategists & Leaders",
    meaning: "Sets direction, or is the recognised authority in their field. Decisions carry organisation-wide." },
];

export const EMPLOYEE_BANDS = ["0-49", "50-99", "100-249", "250-499", "500+"] as const;

export const LOCATIONS = [
  "London",
  "South East England",
  "South West England",
  "Midlands",
  "North of England",
  "Scotland",
  "Wales",
  "Northern Ireland",
  "Remote (UK)",
] as const;
