"use client";

import { cx } from "@/lib/format";

export function Button({ className, tone = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "ink" | "danger" | "good" }) {
  const tones = {
    primary: "bg-ember text-white hover:bg-[#c2410c]",
    ghost: "bg-white text-ink border border-line hover:bg-[#fff7f2]",
    ink: "bg-ink text-white hover:bg-black",
    danger: "bg-white text-[#9f1239] border border-[#fecdd3] hover:bg-[#fff1f2]",
    good: "bg-leaf text-white hover:bg-[#16653e]",
  };
  return <button className={cx("inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50", tones[tone], className)} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-[#5c4d44]">{label}</span>
      {children}
    </label>
  );
}

export const control = "w-full rounded-2xl border border-line bg-white px-3 py-2 outline-none ring-ember/30 focus:ring-4";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1c1410]/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-paper p-5 shadow-card" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{title}</h2>
          <button className="rounded-full px-2 py-1 text-sm text-[#7a685c]" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Banner({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "good" | "bad" }) {
  const tones = { warn: "bg-[#fff4df] text-[#92400e]", good: "bg-[#e7f6ee] text-[#166534]", bad: "bg-[#fff1f2] text-[#9f1239]" };
  return <div className={cx("rounded-2xl px-3 py-2 text-sm", tones[tone])}>{children}</div>;
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">{kicker}</p>}
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-line bg-white/70 px-4 py-8 text-center text-sm text-[#7a685c]">{children}</div>;
}
