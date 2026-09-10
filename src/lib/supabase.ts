import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when the env vars are absent, so the form can say so plainly instead of
// crashing the page. Same idiom as the waitlist site.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = Boolean(url && anonKey);

export const SUPPORT_EMAIL = "consultants@twentysixconsulting.co.uk";

export type Role = {
  title: string;
  salary: number | null;
  level: string;
  family: string;
  location: string;
  headcount: number | null;
};

export type Submission = {
  contact_name: string;
  contact_email: string;
  contact_job_title?: string | null;
  contact_phone?: string | null;
  organisation: string;
  industry?: string | null;
  employee_count?: string | null;
  main_location?: string | null;
  roles: Role[];
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
  const fallback =
    ` Please email your details to ${SUPPORT_EMAIL} and we will pick it up from there.`;
  if (error.code === "23514") {
    // A check constraint: the email shape, or more than 500 roles.
    throw new Error(
      "Some of that did not pass our checks. Please make sure the email address is " +
        "right and that there are no more than 500 roles." + fallback,
    );
  }
  throw new Error("We could not save that just now." + fallback);
}


export const EXPERIENCE_LEVELS = [
  "Entry or Foundation",
  "Early and Developing",
  "Mid to Senior",
  "Experts, Strategists & Leaders",
] as const;

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
