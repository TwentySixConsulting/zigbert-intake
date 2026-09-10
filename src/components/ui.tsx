import type { ReactNode } from "react";

export function Field({
  label, hint, required, children, error,
}: {
  label: string; hint?: string; required?: boolean; children: ReactNode; error?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink mb-1.5">
        {label}
        {required && <span className="text-clay ml-0.5" aria-hidden="true">*</span>}
        {!required && <span className="ml-2 text-[11px] font-normal text-ink-soft">optional</span>}
      </span>
      {hint && <span className="block text-[12px] text-ink-soft mb-1.5 leading-relaxed">{hint}</span>}
      {children}
      {error && <span role="alert" className="block text-[12px] text-clay-deep mt-1.5 font-medium">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[14px] text-ink " +
  "placeholder:text-ink-soft/60 outline-none transition " +
  "focus:border-clay focus:ring-2 focus:ring-clay/20 disabled:bg-slate-wash disabled:text-ink-soft";

export function Button({
  children, variant = "primary", ...rest
}: { children: ReactNode; variant?: "primary" | "ghost" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[14px] " +
    "font-semibold transition disabled:opacity-55 disabled:cursor-not-allowed";
  const look =
    variant === "primary"
      ? "bg-clay text-white hover:bg-clay-deep"
      : "border border-line bg-white text-ink hover:border-clay hover:text-clay-deep";
  return <button className={`${base} ${look}`} {...rest}>{children}</button>;
}

export function Steps({ step }: { step: number }) {
  const names = ["Your details", "Your organisation", "Your roles"];
  return (
    <ol className="flex items-center gap-2 mb-7" aria-label="Progress">
      {names.map((n, i) => {
        const num = i + 1;
        const state = num < step ? "done" : num === step ? "now" : "todo";
        return (
          <li key={n} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              aria-current={state === "now" ? "step" : undefined}
              className={
                "flex-none w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold " +
                (state === "done"
                  ? "bg-slate2 text-white"
                  : state === "now"
                    ? "bg-clay text-white"
                    : "bg-slate-wash text-ink-soft")
              }
            >
              {state === "done" ? "✓" : num}
            </span>
            <span className={"text-[12px] truncate " + (state === "now" ? "font-semibold text-ink" : "text-ink-soft")}>
              {n}
            </span>
            {i < names.length - 1 && <span className="flex-1 h-px bg-line-soft" />}
          </li>
        );
      })}
    </ol>
  );
}
