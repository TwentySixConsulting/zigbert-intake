import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Null when the env vars are absent, so the form can say so plainly instead of
// crashing the page. Same idiom as the waitlist site.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const supabaseConfigured = Boolean(url && anonKey);

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
        "consultants@twentysixconsulting.co.uk and we will pick it up from there.",
    );
  }
  const { error } = await supabase.from("intake_submissions").insert(s);
  if (error) throw new Error(error.message);
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
