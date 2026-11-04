"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { brl, formatDay, statusLabel } from "@/lib/format";
import { PageHeader } from "./ui";

type Report = {
  range: string; orders: number; cancelled: number; revenueCents: number; avgTicketCents: number;
  byDay: { date: string; revenueCents: number; orders: number }[];
  byHour: { hour: number; orders: number }[];
  byChannel: { channel: string; orders: number; revenueCents: number }[];
  byPayment: { method: string; orders: number; revenueCents: number }[];
  topProducts: { name: string; qty: number; revenueCents: number }[];
  reviewAvg: number | null; reviewCount: number;
};

export function ReportsView() {
  const [range, setRange] = useState("7d");
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { void api<Report>(`/api/reports?range=${range}`).then(setReport); }, [range]);
  if (!report) return <p>Somando os pedidos...</p>;
  const max = Math.max(...report.byDay.map((day) => day.revenueCents), 1);
  const hourMax = Math.max(...report.byHour.map((hour) => hour.orders), 1);
  return (
    <div>
      <PageHeader kicker="Números" title="Relatórios">
        {["today", "7d", "30d"].map((item) => <button key={item} className={`rounded-full px-3 py-1 text-sm ${range === item ? "bg-ink text-white" : "bg-white"}`} onClick={() => setRange(item)}>{item === "today" ? "Hoje" : item === "7d" ? "7 dias" : "30 dias"}</button>)}
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-4">
        {[[brl(report.revenueCents), "Faturamento"], [String(report.orders), "Pedidos"], [brl(report.avgTicketCents), "Ticket"], [report.reviewAvg ? `${report.reviewAvg} ★` : "—", "Avaliação"]].map(([value, label]) => (
          <article key={label} className="rounded-3xl bg-white p-4 shadow-card"><p className="text-xs text-[#7a685c]">{label}</p><p className="font-display text-3xl">{value}</p></article>
        ))}
      </div>
      <div className="mt-4 flex h-44 items-end gap-1 rounded-3xl bg-white p-4 shadow-card">
        {report.byDay.map((day) => <div key={day.date} className="flex flex-1 flex-col items-center gap-1"><div className="flex h-28 w-full items-end"><div className="w-full rounded-t-xl bg-ember" style={{ height: `${(day.revenueCents / max) * 100}%` }} /></div><span className="text-[10px] text-[#7a685c]">{formatDay(`${day.date}T15:00:00Z`)}</span></div>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-xl">Por hora</h2>
          <div className="mt-3 flex h-24 items-end gap-px">{report.byHour.map((hour) => <div key={hour.hour} title={`${hour.hour}h`} className="flex-1 rounded-t bg-[#1c1410]" style={{ height: `${(hour.orders / hourMax) * 100}%` }} />)}</div>
        </article>
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-xl">Canais</h2>
          {report.byChannel.map((item) => <p key={item.channel} className="mt-2 text-sm">{statusLabel(item.channel)} · {item.orders} · {brl(item.revenueCents)}</p>)}
          <h2 className="mt-4 font-display text-xl">Pagamento</h2>
          {report.byPayment.map((item) => <p key={item.method} className="mt-2 text-sm">{statusLabel(item.method)} · {brl(item.revenueCents)}</p>)}
        </article>
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-xl">Mais pedidos</h2>
          {report.topProducts.map((item) => <p key={item.name} className="mt-2 text-sm">{item.qty}× {item.name} · {brl(item.revenueCents)}</p>)}
          <p className="mt-4 text-sm text-[#7a685c]">{report.cancelled} cancelados · {report.reviewCount} avaliações</p>
        </article>
      </div>
    </div>
  );
}
