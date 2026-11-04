import type { CustomerDTO } from "@/lib/types";
import { normalizePhone } from "@/lib/format";
import { getConfig } from "./config";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid, nowIso } from "./ids";

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  tags: string;
  cashback_cents: number;
  points: number;
  blocked: number;
  no_campaign: number;
  hidden: number;
  orders_count: number;
  spent_cents: number;
  created_at: string;
  last_order_at: string | null;
};

export function mapCustomer(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    notes: row.notes,
    tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    cashbackCents: row.cashback_cents,
    points: row.points,
    blocked: row.blocked === 1,
    noCampaign: row.no_campaign === 1,
    hidden: row.hidden === 1,
    ordersCount: row.orders_count,
    spentCents: row.spent_cents,
    createdAt: row.created_at,
    lastOrderAt: row.last_order_at,
  };
}

export function listCustomers(query = "") {
  const q = query.trim();
  const rows = getDb().prepare(`SELECT * FROM customers
    WHERE hidden = 0 AND (? = '' OR name LIKE '%' || ? || '%' OR phone LIKE '%' || ? || '%' OR tags LIKE '%' || ? || '%')
    ORDER BY coalesce(last_order_at, created_at) DESC LIMIT 200`).all(q, q, q, q) as CustomerRow[];
  return rows.map(mapCustomer);
}

export function getCustomer(id: string) {
  const row = getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id) as CustomerRow | undefined;
  return row ? mapCustomer(row) : null;
}

export function getCustomerByPhone(phone: string) {
  const row = getDb().prepare("SELECT * FROM customers WHERE phone = ?").get(normalizePhone(phone)) as CustomerRow | undefined;
  return row ? mapCustomer(row) : null;
}

export function upsertCustomer(input: { name?: string; phone: string; address?: string; hidden?: boolean }) {
  const phone = normalizePhone(input.phone);
  if (phone.length < 12) throw new HttpError("Telefone inválido. Use DDD e número.");
  const existing = getCustomerByPhone(phone);
  if (!existing) {
    const id = nid("cus");
    getDb().prepare(`INSERT INTO customers (id, name, phone, address, notes, tags, cashback_cents, points, blocked, no_campaign, hidden, orders_count, spent_cents, created_at, last_order_at)
      VALUES (?, ?, ?, ?, '', '', 0, 0, 0, 0, ?, 0, 0, ?, null)`).run(id, input.name?.trim() || "Cliente", phone, input.address?.trim() ?? "", input.hidden ? 1 : 0, nowIso());
    return getCustomer(id)!;
  }
  const name = input.name?.trim();
  if (name && (existing.name === "Cliente" || existing.name === existing.phone)) {
    getDb().prepare("UPDATE customers SET name = ? WHERE id = ?").run(name, existing.id);
  } else if (name && name !== existing.name && existing.hidden) {
    getDb().prepare("UPDATE customers SET name = ? WHERE id = ?").run(name, existing.id);
  }
  if (input.address?.trim()) getDb().prepare("UPDATE customers SET address = ? WHERE id = ?").run(input.address.trim(), existing.id);
  return getCustomer(existing.id)!;
}

export function updateCustomer(id: string, patch: Partial<Pick<CustomerDTO, "name" | "address" | "notes" | "tags" | "blocked" | "noCampaign">>) {
  const current = getCustomer(id);
  if (!current) throw new HttpError("Cliente não encontrado", 404);
  getDb().prepare("UPDATE customers SET name = ?, address = ?, notes = ?, tags = ?, blocked = ?, no_campaign = ? WHERE id = ?").run(
    patch.name?.trim() || current.name,
    patch.address ?? current.address,
    patch.notes ?? current.notes,
    (patch.tags ?? current.tags).join(","),
    (patch.blocked ?? current.blocked) ? 1 : 0,
    (patch.noCampaign ?? current.noCampaign) ? 1 : 0,
    id,
  );
  return getCustomer(id)!;
}

export function refreshCustomerStats(customerId: string) {
  getDb().prepare(`UPDATE customers SET
    orders_count = (SELECT count(*) FROM orders WHERE customer_id = ? AND status != 'cancelled'),
    spent_cents = (SELECT coalesce(sum(total_cents), 0) FROM orders WHERE customer_id = ? AND status != 'cancelled'),
    last_order_at = (SELECT max(created_at) FROM orders WHERE customer_id = ? AND status != 'cancelled')
    WHERE id = ?`).run(customerId, customerId, customerId, customerId);
  const customer = getCustomer(customerId);
  if (!customer || customer.hidden) return customer;
  const tags = new Set(customer.tags);
  if (customer.ordersCount >= 5 || customer.spentCents >= 30000) tags.add("vip");
  if ([...tags].join(",") !== customer.tags.join(",")) {
    getDb().prepare("UPDATE customers SET tags = ? WHERE id = ?").run([...tags].join(","), customerId);
  }
  return getCustomer(customerId);
}

export function redeemPoints(customerId: string) {
  const config = getConfig();
  const customer = getCustomer(customerId);
  if (!customer) throw new HttpError("Cliente não encontrado", 404);
  if (!config.loyaltyEnabled) throw new HttpError("Fidelidade desligada");
  if (customer.points < config.rewardPoints) throw new HttpError(`Faltam ${config.rewardPoints - customer.points} pontos`);
  const times = Math.floor(customer.points / config.rewardPoints);
  const used = times * config.rewardPoints;
  const gained = times * config.rewardCents;
  getDb().prepare("UPDATE customers SET points = points - ?, cashback_cents = cashback_cents + ? WHERE id = ?").run(used, gained, customerId);
  return getCustomer(customerId)!;
}

export function addCashback(customerId: string, cents: number) {
  getDb().prepare("UPDATE customers SET cashback_cents = max(0, cashback_cents + ?) WHERE id = ?").run(cents, customerId);
}

export function addPoints(customerId: string, points: number) {
  getDb().prepare("UPDATE customers SET points = max(0, points + ?) WHERE id = ?").run(points, customerId);
}
