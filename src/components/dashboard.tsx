"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { brl, formatDay, statusLabel, timeAgo } from "@/lib/format";
import type { OrderDTO } from "@/lib/types";
import { Button } from "./ui";

type Dash = {
  greeting: string;
  userName: string;
  storeName: string;
  state: { accepting: boolean; reason: string | null; label: string };
  today: { orders: number; revenueCents: number; avgTicketCents: number; cancelled: number };
  week: { date: string; revenueCents: number; orders: number }[];
  openOrders: number;
  unread: number;
  cash: { open: boolean; expectedCents?: number };
  orders: OrderDTO[];
  reviews: { rating: number; comment: string; name: string | null; code: string | null }[];
  menuUrl: string;
};

export function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    try {
      setData(await api<Dash>("/api/dashboard"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  useEffect(() => { void reload(); }, []);

  async function pause(mode: string) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify({ pauseMode: mode }) });
    await reload();
  }

  if (!data) return <p className="text-sm text-[#7a685c]">{error || "Abrindo a cozinha..."}</p>;
  const max = Math.max(...data.week.map((day) => day.revenueCents), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">{data.storeName}</p>
          <h1 className="font-display text-4xl">{data.greeting}, {data.userName.split(" ")[0]}.</h1>
          <p className="mt-1 text-sm text-[#7a685c]">{data.state.accepting ? data.state.label : data.state.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.state.accepting ? (
            <>
              <Button tone="ghost" onClick={() => pause("30")}>Pausar 30 min</Button>
              <Button tone="ghost" onClick={() => pause("60")}>Pausar 1 h</Button>
              <Button tone="danger" onClick={() => pause("close")}>Fechar a loja</Button>
            </>
          ) : <Button tone="good" onClick={() => pause("open")}>Reabrir</Button>}
          <Link href="/painel/pedidos"><Button>Ver pedidos</Button></Link>
        </div>
      </div>
      {error && <p className="text-sm text-[#9f1239]">{error}</p>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Vendas de hoje", brl(data.today.revenueCents)],
          ["Pedidos", String(data.today.orders)],
          ["Ticket médio", brl(data.today.avgTicketCents)],
          ["Na fila", `${data.openOrders} pedidos · ${data.unread} msgs`],
        ].map(([label, value]) => (
          <article key={label} className="rounded-3xl bg-white p-4 shadow-card">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7a685c]">{label}</p>
            <p className="mt-2 font-display text-3xl">{value}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-2xl">Últimos 7 dias</h2>
          <div className="mt-4 flex h-40 items-end gap-2">
            {data.week.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-28 w-full items-end rounded-2xl bg-[#f6f1ea]">
                  <div className="w-full rounded-2xl bg-ember" style={{ height: `${Math.max(8, (day.revenueCents / max) * 100)}%` }} />
                </div>
                <span className="text-[11px] text-[#7a685c]">{formatDay(`${day.date}T15:00:00Z`)}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl bg-[#161311] p-4 text-white shadow-card">
          <h2 className="font-display text-2xl">Caixa e cardápio</h2>
          <p className="mt-3 text-sm text-[#e7d9cf]">{data.cash.open ? `Gaveta esperada ${brl(data.cash.expectedCents ?? 0)}` : "Caixa fechado"}</p>
          <p className="mt-2 text-sm text-[#e7d9cf]">{data.today.cancelled} pedido(s) cancelado(s) hoje.</p>
          <a className="mt-4 inline-block text-sm font-semibold text-[#ffb196]" href={data.menuUrl}>{data.menuUrl.replace(/^https?:\/\//, "")}</a>
          <div className="mt-4 flex gap-2">
            <Link href="/painel/caixa"><Button tone="ghost">Caixa</Button></Link>
            <Link href="/painel/atendimento"><Button>Atendimento</Button></Link>
          </div>
        </article>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-2xl">Pedidos recentes</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <strong>{order.code}</strong> · {order.customerName}
                  <p className="text-[#7a685c]">{statusLabel(order.status)} · {timeAgo(order.createdAt)}</p>
                </div>
                <span>{brl(order.totalCents)}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-3xl bg-white p-4 shadow-card">
          <h2 className="font-display text-2xl">Avaliações</h2>
          <ul className="mt-3 space-y-3">
            {data.reviews.map((review, index) => (
              <li key={index} className="text-sm">
                <strong>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</strong> {review.name} · {review.code}
                <p className="text-[#7a685c]">{review.comment}</p>
              </li>
            ))}
            {!data.reviews.length && <li className="text-sm text-[#7a685c]">Ainda sem notas.</li>}
          </ul>
        </article>
      </section>
    </div>
  );
}
