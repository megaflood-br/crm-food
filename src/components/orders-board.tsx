"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@/lib/client";
import { brl, statusLabel, timeAgo } from "@/lib/format";
import type { CategoryDTO, CourierDTO, Fulfillment, OrderDTO, PaymentMethod } from "@/lib/types";
import { Banner, Button, control, Empty, Field, Modal, PageHeader } from "./ui";

const COLUMNS: Array<{ id: OrderDTO["status"]; title: string }> = [
  { id: "analysis", title: "Em análise" },
  { id: "preparing", title: "Em preparo" },
  { id: "ready", title: "Pronto" },
  { id: "delivering", title: "Em entrega" },
  { id: "done", title: "Finalizados" },
];

type Payload = { orders: OrderDTO[]; couriers: CourierDTO[]; catalog: CategoryDTO[] };

export function OrdersBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function reload(q = query) {
    const next = await api<Payload>(`/api/orders?q=${encodeURIComponent(q)}`);
    setData(next);
    setError("");
  }

  useEffect(() => {
    void reload().catch((err) => setError(err.message));
    const id = setInterval(() => { void reload().catch(() => undefined); }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orders = useMemo(() => (data?.orders ?? []).filter((order) => filter === "all" || order.fulfillment === filter || (filter === "cancelled" && order.status === "cancelled")), [data, filter]);
  const current = data?.orders.find((order) => order.id === selected) ?? null;

  async function act(id: string, body: object) {
    const result = await api<{ warning?: string }>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setToast(result.warning ?? "");
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Gestor" title="Pedidos na chapa">
        <input className={`${control} w-48`} placeholder="Código, nome, telefone" value={query} onChange={(event) => { setQuery(event.target.value); void reload(event.target.value).catch((err) => setError(err.message)); }} />
        <Button onClick={() => setCreating(true)}>Novo pedido</Button>
      </PageHeader>
      {error && <Banner tone="bad">{error}</Banner>}
      {toast && <div className="mb-3"><Banner>{toast}</Banner></div>}
      <div className="mb-4 flex flex-wrap gap-2">
        {[["all", "Todos"], ["delivery", "Entrega"], ["pickup", "Retirada"], ["table", "Mesa"], ["counter", "Balcão"], ["cancelled", "Cancelados"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`rounded-full px-3 py-1 text-sm ${filter === id ? "bg-ink text-white" : "bg-white"}`}>{label}</button>
        ))}
      </div>
      <div className="kanban">
        {COLUMNS.map((column) => (
          <section key={column.id} className="rounded-3xl bg-[#efe7de] p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl">{column.title}</h2>
              <span className="text-sm text-[#7a685c]">{orders.filter((order) => order.status === column.id).length}</span>
            </header>
            <div className="space-y-3">
              {orders.filter((order) => order.status === column.id).map((order) => (
                <article key={order.id} className="rounded-2xl bg-white p-3 shadow-card">
                  <button className="w-full text-left" onClick={() => setSelected(order.id)}>
                    <div className="flex items-center justify-between text-xs text-[#7a685c]">
                      <span>{order.code} · {statusLabel(order.channel)}</span>
                      <span>{timeAgo(order.createdAt)}</span>
                    </div>
                    <strong className="mt-1 block">{order.customerName}</strong>
                    <p className="text-sm text-[#5c4d44]">{order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}</p>
                    <p className="mt-2 text-sm">{brl(order.totalCents)} · {statusLabel(order.paymentMethod)} · {statusLabel(order.paymentStatus)}</p>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.status !== "done" && order.status !== "cancelled" && <Button className="px-3 py-1" onClick={() => act(order.id, { action: "advance" }).catch((err) => setError(err.message))}>{order.status === "ready" && order.fulfillment !== "delivery" ? "Finalizar" : order.status === "analysis" ? "Aceitar" : "Avançar"}</Button>}
                    {order.paymentStatus !== "paid" && order.status !== "cancelled" && <Button tone="ghost" className="px-3 py-1" onClick={() => act(order.id, { action: "pay" }).catch((err) => setError(err.message))}>Pago</Button>}
                    <a className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm" href={`/imprimir/${order.id}`}><Printer size={14} /> Imprimir</a>
                  </div>
                </article>
              ))}
              {!orders.filter((order) => order.status === column.id).length && <Empty>Nada nesta coluna.</Empty>}
            </div>
          </section>
        ))}
      </div>
      {current && <OrderDrawer order={current} couriers={data?.couriers ?? []} onClose={() => setSelected(null)} onAct={act} onError={setError} />}
      {creating && data && <CreateOrder catalog={data.catalog} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await reload(); }} />}
    </div>
  );
}

function OrderDrawer({ order, couriers, onClose, onAct, onError }: { order: OrderDTO; couriers: CourierDTO[]; onClose: () => void; onAct: (id: string, body: object) => Promise<void>; onError: (value: string) => void }) {
  const [items, setItems] = useState(order.items.map((item) => ({ ...item })));
  const [address, setAddress] = useState(order.address);
  const [notes, setNotes] = useState(order.notes);
  const [payment, setPayment] = useState(order.paymentMethod);
  const [reason, setReason] = useState("Cliente desistiu");
  const locked = order.status === "done" || order.status === "cancelled" || order.paymentStatus === "paid";

  useEffect(() => {
    setItems(order.items.map((item) => ({ ...item })));
    setAddress(order.address);
    setNotes(order.notes);
    setPayment(order.paymentMethod);
  }, [order]);

  return (
    <Modal title={order.code} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p><strong>{order.customerName}</strong> · {statusLabel(order.fulfillment)} · {statusLabel(order.status)}</p>
        {order.scheduledAt && <Banner>{order.scheduledAt}</Banner>}
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <span>{item.name}</span>
            <span className="flex items-center gap-2">
              <button disabled={locked} onClick={() => setItems((current) => current.map((line, i) => i === index ? { ...line, qty: Math.max(0, line.qty - 1) } : line))}>−</button>
              <span>{item.qty}</span>
              <button disabled={locked} onClick={() => setItems((current) => current.map((line, i) => i === index ? { ...line, qty: line.qty + 1 } : line))}>+</button>
              <span>{brl(item.unitPriceCents * item.qty)}</span>
            </span>
          </div>
        ))}
        <Field label="Endereço"><input className={control} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        <Field label="Pagamento">
          <select className={control} value={payment} onChange={(event) => setPayment(event.target.value as PaymentMethod)}>
            <option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_delivery">Cartão na entrega</option><option value="card_online">Cartão online</option>
          </select>
        </Field>
        <Field label="Observação"><textarea className={control} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <p>Total {brl(order.totalCents)} · {statusLabel(order.paymentStatus)}{order.couponCode ? ` · cupom ${order.couponCode}` : ""}</p>
        {order.events?.map((event) => <p key={event.id} className="text-[#7a685c]">{event.message}</p>)}
        <div className="flex flex-wrap gap-2">
          {!locked && <Button onClick={() => onAct(order.id, { action: "edit", address, notes, paymentMethod: payment, items: items.filter((item) => item.qty > 0 && item.productId).map((item) => ({ productId: item.productId, qty: item.qty, notes: item.notes, addons: item.addons })) }).catch((err) => onError(err.message))}>Salvar edição</Button>}
          {order.paymentStatus === "paid" && <Button tone="ghost" onClick={() => onAct(order.id, { action: "unpay" }).catch((err) => onError(err.message))}>Estornar</Button>}
          {order.fulfillment === "delivery" && order.status !== "cancelled" && order.status !== "done" && (
            <select className={control} defaultValue="" onChange={(event) => { if (event.target.value) void onAct(order.id, { action: "assign", courierId: event.target.value }).catch((err) => onError(err.message)); }}>
              <option value="">Motoboy</option>
              {couriers.filter((courier) => courier.active).map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
            </select>
          )}
        </div>
        {order.status !== "cancelled" && order.status !== "done" && (
          <div className="flex gap-2">
            <input className={control} value={reason} onChange={(event) => setReason(event.target.value)} />
            <Button tone="danger" onClick={() => onAct(order.id, { action: "cancel", reason }).then(onClose).catch((err) => onError(err.message))}>Cancelar</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function CreateOrder({ catalog, onClose, onCreated }: { catalog: CategoryDTO[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [lines, setLines] = useState<Array<{ productId: string; name: string; qty: number; price: number }>>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [error, setError] = useState("");

  function add(productId: string, name: string, price: number) {
    setLines((current) => {
      const found = current.find((line) => line.productId === productId);
      if (found) return current.map((line) => line.productId === productId ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { productId, name, qty: 1, price }];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.get("name"),
          customerPhone: form.get("phone"),
          fulfillment,
          channel: fulfillment === "table" ? "table" : fulfillment === "counter" ? "counter" : "counter",
          address: form.get("address"),
          tableName: form.get("tableName"),
          paymentMethod: form.get("payment"),
          notes: form.get("notes"),
          couponCode: form.get("coupon"),
          items: lines.map((line) => ({ productId: line.productId, qty: line.qty })),
        }),
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  return (
    <Modal title="Lançar pedido" onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><input name="name" className={control} required /></Field>
          <Field label="WhatsApp"><input name="phone" className={control} placeholder="11988881001" /></Field>
        </div>
        <Field label="Tipo">
          <select className={control} value={fulfillment} onChange={(event) => setFulfillment(event.target.value as Fulfillment)}>
            <option value="delivery">Entrega</option><option value="pickup">Retirada</option><option value="counter">Balcão</option><option value="table">Mesa</option>
          </select>
        </Field>
        {fulfillment === "delivery" && <Field label="Endereço"><input name="address" className={control} required /></Field>}
        {fulfillment === "table" && <Field label="Mesa"><input name="tableName" className={control} required /></Field>}
        <Field label="Pagamento">
          <select name="payment" className={control} defaultValue="pix">
            <option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_delivery">Cartão</option>
          </select>
        </Field>
        <div className="max-h-40 space-y-1 overflow-auto rounded-2xl bg-[#f6f1ea] p-2">
          {catalog.flatMap((category) => (category.products ?? []).filter((product) => product.available).map((product) => (
            <button type="button" key={product.id} className="flex w-full justify-between rounded-xl px-2 py-1 text-left text-sm hover:bg-white" onClick={() => add(product.id, product.name, product.priceCents)}>
              <span>{product.emoji} {product.name}</span><span>{brl(product.priceCents)}</span>
            </button>
          )))}
        </div>
        {lines.map((line) => <p key={line.productId} className="text-sm">{line.qty}× {line.name}</p>)}
        <p className="text-sm">Subtotal {brl(subtotal)}</p>
        <Field label="Cupom"><input name="coupon" className={control} /></Field>
        <Field label="Observação"><input name="notes" className={control} /></Field>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button className="w-full" disabled={!lines.length}>Criar pedido</Button>
      </form>
    </Modal>
  );
}
