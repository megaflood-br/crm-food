"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, control, Field, PageHeader, Banner } from "./ui";

type Campaign = { id: string; name: string; message: string; segment: string; status: string; sentCount: number };

export function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [preview, setPreview] = useState({ all: 0, inactive: 0, vip: 0, never: 0 });
  const [notice, setNotice] = useState("");

  async function reload() {
    const data = await api<{ campaigns: Campaign[]; preview: typeof preview }>("/api/campaigns");
    setCampaigns(data.campaigns);
    setPreview(data.preview);
  }
  useEffect(() => { void reload(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/campaigns", { method: "POST", body: JSON.stringify({ name: form.get("name"), message: form.get("message"), segment: form.get("segment") }) });
    event.currentTarget.reset();
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Recompra" title="Disparos" />
      <p className="mb-4 text-sm text-[#7a685c]">Variáveis: {"{nome}"} {"{loja}"} {"{link}"} {"{cupom}"}. Sem Evolution configurada, a mensagem fica na conversa do painel.</p>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.entries({ all: "Todos", inactive: "Sumidos 30d", vip: "VIP", never: "Nunca pediram" }).map(([key, label]) => (
          <div key={key} className="rounded-3xl bg-white p-3 shadow-card"><p className="text-xs text-[#7a685c]">{label}</p><p className="font-display text-3xl">{preview[key as keyof typeof preview]}</p></div>
        ))}
      </div>
      <form onSubmit={submit} className="mb-4 space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <Field label="Nome"><input name="name" className={control} required /></Field>
        <Field label="Público">
          <select name="segment" className={control}><option value="inactive">Sumidos</option><option value="all">Todos</option><option value="vip">VIP</option><option value="never">Nunca pediram</option></select>
        </Field>
        <Field label="Mensagem"><textarea name="message" className={control} required defaultValue="Oi, {nome}! A {loja} separou um motivo pra voltar. Cardápio: {link}" /></Field>
        <Button>Salvar rascunho</Button>
      </form>
      {notice && <div className="mb-3"><Banner tone="good">{notice}</Banner></div>}
      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <article key={campaign.id} className="rounded-3xl bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl">{campaign.name}</h2>
              <span className="text-sm">{campaign.status} · {campaign.sentCount} envios · {campaign.segment}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[#5c4d44]">{campaign.message}</p>
            {campaign.status !== "sent" && <Button className="mt-3" onClick={async () => { const result = await api<{ sent: number }>("/api/campaigns", { method: "POST", body: JSON.stringify({ action: "send", id: campaign.id }) }); setNotice(`${result.sent} mensagens registradas.`); await reload(); }}>Disparar agora</Button>}
          </article>
        ))}
      </div>
    </div>
  );
}
