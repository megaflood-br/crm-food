"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, centsToInput, reaisToCents } from "@/lib/client";
import { brl } from "@/lib/format";
import type { CustomerDTO } from "@/lib/types";
import { Button, control, Field, PageHeader } from "./ui";

type Settings = { loyaltyEnabled: boolean; cashbackPercent: number; pointsPerReal: number; rewardPoints: number; rewardCents: number };

export function LoyaltyView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  useEffect(() => {
    void api<Settings>("/api/settings").then(setSettings);
    void api<{ customers: CustomerDTO[] }>("/api/customers").then((data) => setCustomers(data.customers));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = await api<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify({
      loyaltyEnabled: form.get("enabled") === "on",
      cashbackPercent: Number(form.get("percent")),
      pointsPerReal: Number(form.get("points")),
      rewardPoints: Number(form.get("rewardPoints")),
      rewardCents: reaisToCents(String(form.get("reward"))),
    }) });
    setSettings(next);
  }

  if (!settings) return <p>Carregando fidelidade...</p>;
  const ranked = [...customers].sort((a, b) => b.points - a.points).slice(0, 8);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <PageHeader kicker="Volta" title="Fidelidade e cashback" />
        <label className="flex gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={settings.loyaltyEnabled} /> Programa ligado</label>
        <Field label="% de cashback no pedido concluído"><input name="percent" type="number" className={control} defaultValue={settings.cashbackPercent} /></Field>
        <Field label="Pontos por real"><input name="points" type="number" className={control} defaultValue={settings.pointsPerReal} /></Field>
        <Field label="Pontos para resgatar"><input name="rewardPoints" type="number" className={control} defaultValue={settings.rewardPoints} /></Field>
        <Field label="Cashback do resgate"><input name="reward" className={control} defaultValue={centsToInput(settings.rewardCents)} /></Field>
        <Button>Salvar regra</Button>
        <p className="text-sm text-[#7a685c]">O cashback entra quando o pedido é finalizado. O cliente usa o saldo no cardápio ou a equipe resgata os pontos na ficha.</p>
      </form>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <h2 className="font-display text-2xl">Quem mais pontua</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {ranked.map((customer) => <li key={customer.id} className="flex justify-between"><Link href={`/painel/clientes/${customer.id}`}>{customer.name}</Link><span>{customer.points} pts · {brl(customer.cashbackCents)}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
