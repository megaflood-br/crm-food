"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, reaisToCents } from "@/lib/client";
import { brl, formatPhone, statusLabel } from "@/lib/format";
import type { CourierDTO, OrderDTO, ZoneDTO } from "@/lib/types";
import { Button, control, PageHeader } from "./ui";

export function DeliveryView() {
  const [couriers, setCouriers] = useState<CourierDTO[]>([]);
  const [zones, setZones] = useState<ZoneDTO[]>([]);
  const [orders, setOrders] = useState<OrderDTO[]>([]);

  async function reload() {
    const data = await api<{ couriers: CourierDTO[]; zones: ZoneDTO[]; orders: OrderDTO[] }>("/api/delivery");
    setCouriers(data.couriers); setZones(data.zones); setOrders(data.orders);
  }
  useEffect(() => { void reload(); const id = setInterval(() => void reload(), 6000); return () => clearInterval(id); }, []);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Rua" title="Entregas" />
      <section className="grid gap-3 md:grid-cols-2">
        {orders.map((order) => (
          <article key={order.id} className="rounded-3xl bg-white p-4 shadow-card">
            <strong>{order.code}</strong> · {statusLabel(order.status)}
            <p>{order.customerName} · {order.address}</p>
            <p className="text-sm text-[#7a685c]">{order.courierName ? `Com ${order.courierName}` : "Sem motoboy"} · {brl(order.totalCents)}</p>
            <select className={`${control} mt-2`} defaultValue="" onChange={async (event) => { if (!event.target.value) return; await api(`/api/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ action: "assign", courierId: event.target.value }) }); await reload(); }}>
              <option value="">Atribuir</option>
              {couriers.filter((courier) => courier.active).map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
            </select>
          </article>
        ))}
        {!orders.length && <p className="text-sm text-[#7a685c]">Nenhuma entrega em aberto.</p>}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-display text-2xl">Motoboys</h2>
          {couriers.map((courier) => <p key={courier.id} className="mb-1 text-sm">{courier.name} · {formatPhone(courier.phone)} · {courier.vehicle} {!courier.active && "· inativo"}</p>)}
          <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api("/api/delivery", { method: "POST", body: JSON.stringify({ entity: "courier", name: form.get("name"), phone: form.get("phone"), vehicle: form.get("vehicle") }) }); event.currentTarget.reset(); await reload(); }}>
            <input name="name" className={control} placeholder="Nome" required />
            <input name="phone" className={control} placeholder="Telefone" />
            <select name="vehicle" className={control}><option value="moto">Moto</option><option value="bike">Bike</option><option value="carro">Carro</option></select>
            <Button>Adicionar</Button>
          </form>
        </div>
        <div>
          <h2 className="mb-2 font-display text-2xl">Áreas e taxas</h2>
          {zones.map((zone) => (
            <div key={zone.id} className="mb-2 flex items-center justify-between text-sm">
              <span>{zone.name} · {brl(zone.feeCents)} · {zone.etaMin}–{zone.etaMax} min</span>
              <button className="text-[#9f1239]" onClick={async () => { await api("/api/delivery", { method: "POST", body: JSON.stringify({ entity: "zone", action: "delete", id: zone.id }) }); await reload(); }}>Remover</button>
            </div>
          ))}
          <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api("/api/delivery", { method: "POST", body: JSON.stringify({ entity: "zone", name: form.get("name"), feeCents: reaisToCents(String(form.get("fee"))), etaMin: Number(form.get("min")), etaMax: Number(form.get("max")) }) }); event.currentTarget.reset(); await reload(); }}>
            <input name="name" className={control} placeholder="Bairro" required />
            <input name="fee" className={control} placeholder="Taxa 9,00" required />
            <input name="min" className={control} placeholder="Min" defaultValue="30" />
            <input name="max" className={control} placeholder="Máx" defaultValue="50" />
            <Button className="col-span-2">Salvar área</Button>
          </form>
        </div>
      </section>
    </div>
  );
}
