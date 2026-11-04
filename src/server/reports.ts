import { addIsoDays, zonedParts, rangeFrom, todayBounds } from "@/lib/time";
import { getDb } from "./db";

type Range = "today" | "7d" | "30d";

type Row = {
  id: string; status: string; channel: string; payment_method: string; total_cents: number; created_at: string;
};

export function buildReport(range: Range) {
  const bounds = range === "today" ? todayBounds() : rangeFrom(range === "7d" ? 7 : 30);
  const rows = getDb().prepare("SELECT id, status, channel, payment_method, total_cents, created_at FROM orders WHERE created_at >= ? AND created_at < ?").all(bounds.start, bounds.end) as Row[];
  const active = rows.filter((row) => row.status !== "cancelled");
  const revenue = active.reduce((sum, row) => sum + row.total_cents, 0);
  const days = new Map<string, { date: string; revenueCents: number; orders: number }>();
  const span = range === "today" ? 1 : range === "7d" ? 7 : 30;
  for (let index = span - 1; index >= 0; index -= 1) {
    const key = addIsoDays(bounds.isoDate, -index);
    days.set(key, { date: key, revenueCents: 0, orders: 0 });
  }
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  const channels = new Map<string, { channel: string; orders: number; revenueCents: number }>();
  const payments = new Map<string, { method: string; orders: number; revenueCents: number }>();
  for (const row of active) {
    const parts = zonedParts(new Date(row.created_at));
    const bucket = days.get(parts.isoDate) ?? { date: parts.isoDate, revenueCents: 0, orders: 0 };
    bucket.revenueCents += row.total_cents;
    bucket.orders += 1;
    days.set(parts.isoDate, bucket);
    hours[parts.hour].orders += 1;
    const channel = channels.get(row.channel) ?? { channel: row.channel, orders: 0, revenueCents: 0 };
    channel.orders += 1;
    channel.revenueCents += row.total_cents;
    channels.set(row.channel, channel);
    const payment = payments.get(row.payment_method) ?? { method: row.payment_method, orders: 0, revenueCents: 0 };
    payment.orders += 1;
    payment.revenueCents += row.total_cents;
    payments.set(row.payment_method, payment);
  }
  const top = getDb().prepare(`SELECT order_items.name AS name, sum(order_items.qty) AS qty, sum(order_items.qty * order_items.unit_price_cents) AS revenue
    FROM order_items JOIN orders ON orders.id = order_items.order_id
    WHERE orders.created_at >= ? AND orders.created_at < ? AND orders.status != 'cancelled'
    GROUP BY order_items.name ORDER BY qty DESC LIMIT 6`).all(bounds.start, bounds.end) as Array<{ name: string; qty: number; revenue: number }>;
  const reviews = getDb().prepare(`SELECT avg(reviews.rating) AS avg, count(*) AS c FROM reviews
    JOIN orders ON orders.id = reviews.order_id WHERE orders.created_at >= ? AND orders.created_at < ?`).get(bounds.start, bounds.end) as { avg: number | null; c: number };
  return {
    range,
    orders: active.length,
    cancelled: rows.length - active.length,
    revenueCents: revenue,
    avgTicketCents: active.length ? Math.round(revenue / active.length) : 0,
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byHour: hours,
    byChannel: [...channels.values()],
    byPayment: [...payments.values()],
    topProducts: top.map((item) => ({ name: item.name, qty: item.qty, revenueCents: item.revenue })),
    reviewAvg: reviews.avg ? Math.round(reviews.avg * 10) / 10 : null,
    reviewCount: reviews.c,
  };
}
