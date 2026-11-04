"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { brl, formatPhone, timeAgo } from "@/lib/format";
import type { CustomerDTO, OrderDTO } from "@/lib/types";
import { Banner, Button, control, Field, PageHeader } from "./ui";

export function CustomersView() {
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function reload(q = query) {
    const data = await api<{ customers: CustomerDTO[] }>(`/api/customers?q=${encodeURIComponent(q)}`);
    setCustomers(data.customers);
  }
  useEffect(() => { void reload().catch((err) => setError(err.message)); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/customers", { method: "POST", body: JSON.stringify({ name: form.get("name"), phone: form.get("phone"), address: form.get("address") }) });
    event.currentTarget.reset();
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Relacionamento" title="Clientes">
        <input className={`${control} w-56`} placeholder="Buscar" value={query} onChange={(event) => { setQuery(event.target.value); void reload(event.target.value); }} />
      </PageHeader>
      {error && <Banner tone="bad">{error}</Banner>}
      <form onSubmit={create} className="mb-4 grid gap-2 rounded-3xl bg-white p-4 shadow-card md:grid-cols-4">
        <input name="name" className={control} placeholder="Nome" required />
        <input name="phone" className={control} placeholder="WhatsApp" required />
        <input name="address" className={control} placeholder="Endereço" />
        <Button>Cadastrar</Button>
      </form>
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="text-[#7a685c]"><tr><th className="p-3">Cliente</th><th>Pedidos</th><th>Gasto</th><th>Cashback</th><th>Último</th></tr></thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-line">
                <td className="p-3"><Link className="font-semibold" href={`/painel/clientes/${customer.id}`}>{customer.name}</Link><div className="text-[#7a685c]">{formatPhone(customer.phone)} {customer.tags.includes("vip") && "· VIP"} {customer.blocked && "· bloqueado"}</div></td>
                <td>{customer.ordersCount}</td>
                <td>{brl(customer.spentCents)}</td>
                <td>{brl(customer.cashbackCents)}</td>
                <td>{customer.lastOrderAt ? timeAgo(customer.lastOrderAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [error, setError] = useState("");

  async function reload() {
    const data = await api<{ customer: CustomerDTO; orders: OrderDTO[] }>(`/api/customers/${id}`);
    setCustomer(data.customer);
    setOrders(data.orders);
  }
  useEffect(() => { void reload().catch((err) => setError(err.message)); }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    const form = new FormData(event.currentTarget);
    await api(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify({
      name: form.get("name"), address: form.get("address"), notes: form.get("notes"),
      blocked: form.get("blocked") === "on", noCampaign: form.get("noCampaign") === "on",
      tags: String(form.get("tags") || "").split(",").map((item) => item.trim()).filter(Boolean),
    }) });
    await reload();
  }

  if (!customer) return <p>{error || "Carregando ficha..."}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <form onSubmit={save} className="space-y-3 rounded-3xl bg-white p-4 shadow-card">
        <PageHeader kicker={formatPhone(customer.phone)} title={customer.name} />
        <Field label="Nome"><input name="name" className={control} defaultValue={customer.name} /></Field>
        <Field label="Endereço"><input name="address" className={control} defaultValue={customer.address} /></Field>
        <Field label="Notas"><textarea name="notes" className={control} defaultValue={customer.notes} /></Field>
        <Field label="Tags"><input name="tags" className={control} defaultValue={customer.tags.join(", ")} /></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="blocked" defaultChecked={customer.blocked} /> Bloquear atendimento</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="noCampaign" defaultChecked={customer.noCampaign} /> Não enviar disparos</label>
        <p>{customer.points} pontos · {brl(customer.cashbackCents)} de cashback · {brl(customer.spentCents)} em {customer.ordersCount} pedidos</p>
        <div className="flex gap-2">
          <Button>Salvar</Button>
          <Button type="button" tone="ghost" onClick={async () => { await api(`/api/customers/${id}/redeem`, { method: "POST" }); await reload(); }}>Resgatar pontos</Button>
        </div>
        {error && <Banner tone="bad">{error}</Banner>}
      </form>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <h2 className="font-display text-2xl">Histórico</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {orders.map((order) => <li key={order.id}>{order.code} · {order.status} · {brl(order.totalCents)}</li>)}
          {!orders.length && <li>Sem pedidos.</li>}
        </ul>
      </div>
    </div>
  );
}
