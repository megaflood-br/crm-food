"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, centsToInput, reaisToCents } from "@/lib/client";
import { brl } from "@/lib/format";
import type { CouponDTO } from "@/lib/types";
import { Button, control, PageHeader } from "./ui";

export function CouponsView() {
  const [coupons, setCoupons] = useState<CouponDTO[]>([]);
  async function reload() {
    setCoupons((await api<{ coupons: CouponDTO[] }>("/api/coupons")).coupons);
  }
  useEffect(() => { void reload(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    await api("/api/coupons", { method: "POST", body: JSON.stringify({
      code: form.get("code"), description: form.get("description"), kind,
      value: kind === "percent" ? Number(form.get("value")) : reaisToCents(String(form.get("value"))),
      minCents: reaisToCents(String(form.get("min") || "0")),
      recovery: form.get("recovery") === "on",
    }) });
    event.currentTarget.reset();
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Promoção" title="Cupons" />
      <form onSubmit={submit} className="mb-4 grid gap-2 rounded-3xl bg-white p-4 shadow-card md:grid-cols-6">
        <input name="code" className={control} placeholder="CODIGO" required />
        <input name="description" className={control} placeholder="Descrição" />
        <select name="kind" className={control}><option value="percent">%</option><option value="fixed">R$</option></select>
        <input name="value" className={control} placeholder="10 ou 5,00" required />
        <input name="min" className={control} placeholder="Mínimo" />
        <Button>Criar</Button>
        <label className="flex items-center gap-2 text-sm md:col-span-6"><input type="checkbox" name="recovery" /> Usar no recuperador de conversas</label>
      </form>
      <div className="grid gap-3 md:grid-cols-3">
        {coupons.map((coupon) => (
          <article key={coupon.id} className="rounded-3xl bg-white p-4 shadow-card">
            <h2 className="font-display text-2xl">{coupon.code}</h2>
            <p className="text-sm text-[#7a685c]">{coupon.description}</p>
            <p className="mt-2">{coupon.kind === "percent" ? `${coupon.value}%` : brl(coupon.value)} · mínimo {brl(coupon.minCents)}</p>
            <p className="text-sm">{coupon.used}{coupon.maxUses ? `/${coupon.maxUses}` : ""} usos {coupon.recovery && "· recuperador"} {!coupon.active && "· inativo"}</p>
            <Button tone="ghost" className="mt-3" onClick={async () => { await api("/api/coupons", { method: "POST", body: JSON.stringify({ ...coupon, minCents: coupon.minCents, maxUses: coupon.maxUses, active: !coupon.active }) }); await reload(); }}>{coupon.active ? "Desativar" : "Ativar"}</Button>
          </article>
        ))}
      </div>
    </div>
  );
}
