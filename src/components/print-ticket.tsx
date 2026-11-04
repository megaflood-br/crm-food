"use client";

import { useEffect } from "react";
import { brl, formatDateTime, statusLabel } from "@/lib/format";
import type { OrderDTO } from "@/lib/types";

export function PrintTicket({ order, store }: { order: OrderDTO; store: string }) {
  useEffect(() => { const id = setTimeout(() => window.print(), 300); return () => clearTimeout(id); }, []);
  return (
    <main className="mx-auto max-w-sm bg-white p-6 text-sm">
      <h1 className="font-display text-3xl">{store}</h1>
      <p>{order.code} · {formatDateTime(order.createdAt)}</p>
      <p>{order.customerName} · {statusLabel(order.fulfillment)}</p>
      {order.address && <p>{order.address}</p>}
      {order.tableName && <p>Mesa {order.tableName}</p>}
      <ul className="my-3 border-y border-dashed border-black py-2">
        {order.items.map((item) => <li key={item.id} className="flex justify-between"><span>{item.qty}× {item.name}</span><span>{brl(item.unitPriceCents * item.qty)}</span></li>)}
      </ul>
      <p>Entrega {brl(order.deliveryFeeCents)}</p>
      <p>Desconto {brl(order.discountCents)}</p>
      <p className="text-lg font-semibold">Total {brl(order.totalCents)}</p>
      <p>{statusLabel(order.paymentMethod)} · {statusLabel(order.paymentStatus)}</p>
      {order.notes && <p>Obs: {order.notes}</p>}
    </main>
  );
}
