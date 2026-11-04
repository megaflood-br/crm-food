"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, reaisToCents } from "@/lib/client";
import { brl, formatDateTime } from "@/lib/format";
import { Banner, Button, control, Field, PageHeader } from "./ui";

type Session = { open: boolean; openedAt?: string; openingCents?: number; expectedCents?: number; salesCents?: number; entriesCents?: number; exitsCents?: number; userName?: string; movements?: Array<{ id: string; kind: string; amountCents: number; description: string; createdAt: string }> };
type History = { id: string; openedAt: string; closedAt: string; openingCents: number; closingCents: number; userName: string; notes: string };

export function CashView() {
  const [session, setSession] = useState<Session>({ open: false });
  const [history, setHistory] = useState<History[]>([]);
  const [notice, setNotice] = useState("");

  async function reload() {
    const data = await api<{ session: Session; history: History[] }>("/api/cash");
    setSession(data.session);
    setHistory(data.history);
  }
  useEffect(() => { void reload(); }, []);

  async function act(body: object) {
    const result = await api<{ differenceCents?: number }>("/api/cash", { method: "POST", body: JSON.stringify(body) });
    if (typeof result.differenceCents === "number") setNotice(`Diferença de ${brl(result.differenceCents)} no fechamento.`);
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Gaveta" title="Caixa" />
      {notice && <div className="mb-3"><Banner tone="good">{notice}</Banner></div>}
      {!session.open ? (
        <form className="max-w-md space-y-3 rounded-3xl bg-white p-4 shadow-card" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: "open", amountCents: reaisToCents(String(form.get("amount"))), notes: form.get("notes") }); }}>
          <Field label="Fundo de troco"><input name="amount" className={control} defaultValue="150,00" required /></Field>
          <Field label="Observação"><input name="notes" className={control} /></Field>
          <Button>Abrir caixa</Button>
        </form>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-sm text-[#7a685c]">Aberto em {formatDateTime(session.openedAt!)} por {session.userName}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Abertura", session.openingCents], ["Vendas", session.salesCents], ["Entradas", session.entriesCents], ["Saídas", session.exitsCents]].map(([label, value]) => (
                <div key={String(label)}><p className="text-xs text-[#7a685c]">{label}</p><p className="font-display text-2xl">{brl(Number(value ?? 0))}</p></div>
              ))}
            </div>
            <p className="mt-4 font-display text-3xl">Esperado {brl(session.expectedCents ?? 0)}</p>
            <ul className="mt-4 divide-y divide-line text-sm">
              {session.movements?.map((movement) => <li key={movement.id} className="flex justify-between py-2"><span>{movement.description}</span><span>{movement.kind === "out" ? "−" : "+"}{brl(movement.amountCents)}</span></li>)}
            </ul>
          </div>
          <div className="space-y-3">
            <form className="space-y-2 rounded-3xl bg-white p-4 shadow-card" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: form.get("kind"), amountCents: reaisToCents(String(form.get("amount"))), description: form.get("description") }); event.currentTarget.reset(); }}>
              <select name="kind" className={control}><option value="in">Entrada</option><option value="out">Saída</option></select>
              <input name="amount" className={control} placeholder="Valor" required />
              <input name="description" className={control} placeholder="Descrição" required />
              <Button className="w-full">Lançar</Button>
            </form>
            <form className="space-y-2 rounded-3xl bg-[#161311] p-4 text-white" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: "close", amountCents: reaisToCents(String(form.get("amount"))), notes: form.get("notes") }); }}>
              <Field label="Valor contado"><input name="amount" className={control} required /></Field>
              <Field label="Notas"><input name="notes" className={control} /></Field>
              <Button>Fechar caixa</Button>
            </form>
          </div>
        </div>
      )}
      <h2 className="mb-2 mt-8 font-display text-2xl">Fechamentos</h2>
      <ul className="space-y-2 text-sm">
        {history.map((item) => <li key={item.id} className="rounded-2xl bg-white px-3 py-2">{formatDateTime(item.closedAt)} · abriu {brl(item.openingCents)} · contou {brl(item.closingCents)} · {item.userName}</li>)}
      </ul>
    </div>
  );
}
