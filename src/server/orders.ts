import type { Addon, Channel, Fulfillment, OrderDTO, OrderItemDTO, OrderStatus, PaymentMethod } from "@/lib/types";
import { brl, fold, parseJson } from "@/lib/format";
import { todayBounds } from "@/lib/time";
import { postOrderCash } from "./cash";
import { getProduct, listProducts } from "./catalog";
import { getConfig, saveConfig, storefrontState } from "./config";
import { consumeCoupon, quoteCoupon, releaseCoupon } from "./coupons";
import { addMessage, ensureConversation } from "./conversations";
import { addCashback, addPoints, refreshCustomerStats, upsertCustomer } from "./customers";
import { deliveryFeeFor, listCouriers } from "./delivery";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid, nowIso } from "./ids";
import { sendText } from "./evolution";

type OrderRow = {
  id: string; code: string; customer_id: string | null; customer_name: string; customer_phone: string;
  status: OrderStatus; channel: Channel; fulfillment: Fulfillment; address: string; table_name: string;
  payment_method: PaymentMethod; payment_status: "pending" | "paid" | "refunded";
  subtotal_cents: number; delivery_fee_cents: number; discount_cents: number; cashback_used_cents: number; total_cents: number;
  notes: string; coupon_code: string | null; courier_id: string | null; courier_name: string | null; cancel_reason: string | null;
  scheduled_at: string | null; loyalty_applied: number; loyalty_points: number; loyalty_cashback_cents: number; cash_posted: number;
  created_at: string; updated_at: string;
};

const DRAWER = new Set<PaymentMethod>(["cash", "card_delivery"]);

function mapItem(row: { id: string; product_id: string | null; name: string; qty: number; unit_price_cents: number; notes: string; addons_json: string }): OrderItemDTO {
  return { id: row.id, productId: row.product_id, name: row.name, qty: row.qty, unitPriceCents: row.unit_price_cents, notes: row.notes, addons: parseJson<Addon[]>(row.addons_json, []) };
}

function hydrate(rows: OrderRow[], withEvents = false): OrderDTO[] {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const marks = ids.map(() => "?").join(",");
  const items = getDb().prepare(`SELECT * FROM order_items WHERE order_id IN (${marks})`).all(...ids) as Array<{ id: string; order_id: string; product_id: string | null; name: string; qty: number; unit_price_cents: number; notes: string; addons_json: string }>;
  const events = withEvents
    ? getDb().prepare(`SELECT * FROM order_events WHERE order_id IN (${marks}) ORDER BY created_at`).all(...ids) as Array<{ id: string; order_id: string; message: string; created_at: string }>
    : [];
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    status: row.status,
    channel: row.channel,
    fulfillment: row.fulfillment,
    address: row.address,
    tableName: row.table_name,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    subtotalCents: row.subtotal_cents,
    deliveryFeeCents: row.delivery_fee_cents,
    discountCents: row.discount_cents,
    cashbackUsedCents: row.cashback_used_cents,
    totalCents: row.total_cents,
    notes: row.notes,
    couponCode: row.coupon_code,
    courierId: row.courier_id,
    courierName: row.courier_name,
    cancelReason: row.cancel_reason,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.filter((item) => item.order_id === row.id).map(mapItem),
    events: withEvents ? events.filter((event) => event.order_id === row.id).map((event) => ({ id: event.id, message: event.message, createdAt: event.created_at })) : undefined,
  }));
}

const ORDER_SQL = `SELECT orders.*, couriers.name AS courier_name FROM orders LEFT JOIN couriers ON couriers.id = orders.courier_id`;

export function listOrders(query = "") {
  const q = query.trim();
  const bounds = todayBounds();
  const rows = q
    ? getDb().prepare(`${ORDER_SQL} WHERE orders.code LIKE '%' || ? || '%' OR orders.customer_name LIKE '%' || ? || '%' OR orders.customer_phone LIKE '%' || ? || '%' ORDER BY orders.created_at DESC LIMIT 80`).all(q, q, q)
    : getDb().prepare(`${ORDER_SQL} WHERE orders.status IN ('analysis','preparing','ready','delivering') OR (orders.status IN ('done','cancelled') AND orders.created_at >= ? AND orders.created_at < ?) ORDER BY orders.created_at ASC`).all(bounds.start, bounds.end);
  return hydrate(rows as OrderRow[]);
}

export function getOrder(id: string) {
  const row = getDb().prepare(`${ORDER_SQL} WHERE orders.id = ?`).get(id) as OrderRow | undefined;
  return row ? hydrate([row], true)[0] : null;
}

export function getOrderRow(id: string) {
  return getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
}

export function latestOrderFor(customerId: string) {
  const row = getDb().prepare(`${ORDER_SQL} WHERE orders.customer_id = ? ORDER BY orders.created_at DESC LIMIT 1`).get(customerId) as OrderRow | undefined;
  return row ? hydrate([row])[0] : null;
}

function event(orderId: string, message: string) {
  getDb().prepare("INSERT INTO order_events (id, order_id, message, created_at) VALUES (?, ?, ?, ?)").run(nid("evt"), orderId, message, nowIso());
}

function priceLines(lines: { productId: string; qty: number; notes?: string; addons?: Addon[] }[]) {
  if (!lines.length) throw new HttpError("Inclua pelo menos um item");
  return lines.map((line) => {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 30) throw new HttpError("Quantidade inválida");
    const product = getProduct(line.productId);
    if (!product || !product.available) throw new HttpError("Tem item indisponível no pedido");
    const addons = (line.addons ?? []).map((addon) => {
      const found = product.addons.find((item) => fold(item.name) === fold(addon.name));
      if (!found) throw new HttpError(`Adicional inválido em ${product.name}`);
      return found;
    });
    const unit = product.priceCents + addons.reduce((sum, addon) => sum + addon.priceCents, 0);
    return { product, qty: line.qty, unit, notes: line.notes?.trim() ?? "", addons };
  });
}

export type NewOrderInput = {
  customerName: string;
  customerPhone?: string;
  fulfillment: Fulfillment;
  channel: Channel;
  address?: string;
  tableName?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  couponCode?: string;
  cashbackCents?: number;
  zoneId?: string;
  items: { productId: string; qty: number; notes?: string; addons?: Addon[] }[];
  staff?: boolean;
  actor: string;
  silent?: boolean;
};

export async function createOrder(input: NewOrderInput) {
  const name = input.customerName.trim();
  if (name.length < 2) throw new HttpError("Informe o nome de quem pede");
  if (!["delivery", "pickup", "table", "counter"].includes(input.fulfillment)) throw new HttpError("Tipo de pedido inválido");
  if (!["pix", "cash", "card_delivery", "card_online"].includes(input.paymentMethod)) throw new HttpError("Forma de pagamento inválida");
  if (!["whatsapp", "menu", "counter", "table"].includes(input.channel)) throw new HttpError("Canal inválido");
  if (input.fulfillment === "delivery" && !input.address?.trim()) throw new HttpError("Informe o endereço de entrega");
  if (input.fulfillment === "table" && !input.tableName?.trim()) throw new HttpError("Informe a mesa");
  const state = storefrontState();
  const config = getConfig();
  const paused = config.forceClosed || (config.pausedUntil != null && new Date(config.pausedUntil).getTime() > Date.now());
  if (!input.staff && paused) throw new HttpError(state.reason || "A loja está pausada");
  if (!input.staff && !state.accepting && input.channel !== "whatsapp") throw new HttpError(state.reason || "A loja está fechada");

  const built = getDb().transaction(() => {
    const lines = priceLines(input.items);
    const subtotal = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);
    if (!input.staff && subtotal < config.minOrderCents) throw new HttpError(`Pedido mínimo de ${brl(config.minOrderCents)}`);
    const zone = input.fulfillment === "delivery" ? deliveryFeeFor(input.zoneId) : null;
    const fee = input.fulfillment === "delivery" ? (zone?.feeCents ?? config.deliveryFeeCents) : 0;
    const coupon = input.couponCode?.trim() ? quoteCoupon(input.couponCode, subtotal) : null;
    const discount = coupon?.discountCents ?? 0;
    let customerId: string | null = null;
    let phone = "";
    if (input.customerPhone?.trim()) {
      const customer = upsertCustomer({ name, phone: input.customerPhone, address: input.address });
      customerId = customer.id;
      phone = customer.phone;
      const requested = input.cashbackCents ?? 0;
      if (requested < 0 || !Number.isInteger(requested)) throw new HttpError("Cashback inválido");
      if (requested > customer.cashbackCents) throw new HttpError("Cashback maior que o saldo");
    } else if ((input.cashbackCents ?? 0) > 0) {
      throw new HttpError("Cashback pede um telefone de cliente");
    }
    const cashback = Math.min(input.cashbackCents ?? 0, Math.max(0, subtotal - discount));
    const total = Math.max(0, subtotal + fee - discount - cashback);
    if (customerId && cashback > 0) addCashback(customerId, -cashback);
    if (coupon) consumeCoupon(coupon.code);
    const fresh = getConfig();
    fresh.orderSeq += 1;
    saveConfig(fresh);
    const prefix = input.fulfillment === "table" ? "MS" : input.channel === "menu" ? "C" : input.channel === "whatsapp" ? "B" : input.fulfillment === "counter" ? "BA" : "P";
    const id = nid("ord");
    const when = nowIso();
    const scheduled = !input.staff && !state.accepting ? state.reason : null;
    getDb().prepare(`INSERT INTO orders (
      id, code, customer_id, customer_name, customer_phone, status, channel, fulfillment, address, table_name,
      payment_method, payment_status, subtotal_cents, delivery_fee_cents, discount_cents, cashback_used_cents, total_cents,
      notes, coupon_code, courier_id, cancel_reason, scheduled_at, loyalty_applied, loyalty_points, loyalty_cashback_cents,
      cash_posted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'analysis', ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, null, null, ?, 0, 0, 0, 0, ?, ?)`).run(
      id, `${prefix}-${fresh.orderSeq}`, customerId, name, phone, input.channel, input.fulfillment,
      input.address?.trim() ?? "", input.tableName?.trim() ?? "", input.paymentMethod,
      subtotal, fee, discount, cashback, total, input.notes?.trim() ?? "", coupon?.code ?? null, scheduled, when, when,
    );
    const insertItem = getDb().prepare("INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price_cents, notes, addons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const line of lines) {
      insertItem.run(nid("item"), id, line.product.id, line.product.name, line.qty, line.unit, line.notes, JSON.stringify(line.addons));
    }
    event(id, `${input.actor} lançou o pedido`);
    if (customerId) refreshCustomerStats(customerId);
    return id;
  })();

  const order = getOrder(built)!;
  if (!input.silent) await notify(order, `Recebemos seu pedido ${order.code}, no valor de ${brl(order.totalCents)}. Já está em análise.`);
  return { order };
}

async function notify(order: OrderDTO, text: string) {
  if (!order.customerId || !order.customerPhone || order.channel === "counter") return;
  const conversationId = ensureConversation(order.customerId);
  const sent = await sendText(order.customerPhone, text);
  addMessage({ conversationId, direction: "out", body: text, author: "bot", status: sent.delivered ? "sent" : sent.error ? "failed" : "local", waId: sent.waId });
}

function statusText(order: OrderDTO) {
  const prep = getConfig().prepMinutes;
  if (order.status === "preparing") return `Pedido ${order.code} aceito. Já foi pra chapa — por volta de ${prep} min.`;
  if (order.status === "ready" && order.fulfillment === "delivery") return `Pedido ${order.code} pronto. Já já sai pra entrega.`;
  if (order.status === "ready") return `Pedido ${order.code} está pronto pra retirada.`;
  if (order.status === "delivering") return `Pedido ${order.code} saiu para entrega${order.courierName ? ` com ${order.courierName}` : ""}.`;
  if (order.status === "done") return `Pedido ${order.code} finalizado. Se quiser, me manda uma nota de 1 a 5.`;
  if (order.status === "cancelled") return `Pedido ${order.code} foi cancelado${order.cancelReason ? `: ${order.cancelReason}` : "."}`;
  return `Pedido ${order.code} atualizado.`;
}

function applyLoyalty(orderId: string) {
  const row = getOrderRow(orderId);
  if (!row || row.loyalty_applied || !row.customer_id) return;
  const config = getConfig();
  if (!config.loyaltyEnabled) return;
  const points = Math.floor(row.total_cents / 100) * config.pointsPerReal;
  const cashback = Math.round(row.total_cents * config.cashbackPercent / 100);
  addPoints(row.customer_id, points);
  addCashback(row.customer_id, cashback);
  getDb().prepare("UPDATE orders SET loyalty_applied = 1, loyalty_points = ?, loyalty_cashback_cents = ? WHERE id = ?").run(points, cashback, orderId);
}

function reverseLoyalty(row: OrderRow) {
  if (!row.loyalty_applied || !row.customer_id) return;
  addPoints(row.customer_id, -row.loyalty_points);
  addCashback(row.customer_id, -row.loyalty_cashback_cents);
  getDb().prepare("UPDATE orders SET loyalty_applied = 0, loyalty_points = 0, loyalty_cashback_cents = 0 WHERE id = ?").run(row.id);
}

export async function setOrderStatus(id: string, status: OrderStatus, actor: string, reason?: string) {
  const current = getOrderRow(id);
  if (!current) throw new HttpError("Pedido não encontrado", 404);
  if (current.status === status) return { order: getOrder(id)! };
  if (current.status === "cancelled" || (current.status === "done" && status !== "cancelled")) throw new HttpError("Pedido encerrado");
  let warning: string | undefined;
  getDb().transaction(() => {
    const row = getOrderRow(id)!;
    if (status === "cancelled") {
      if (!reason?.trim()) throw new HttpError("Informe o motivo do cancelamento");
      if (row.coupon_code) releaseCoupon(row.coupon_code);
      if (row.customer_id && row.cashback_used_cents) addCashback(row.customer_id, row.cashback_used_cents);
      reverseLoyalty(row);
      if (row.cash_posted && DRAWER.has(row.payment_method)) {
        postOrderCash(id, row.total_cents, `Estorno ${row.code}`, "out");
      }
      getDb().prepare("UPDATE orders SET status = 'cancelled', cancel_reason = ?, payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END, cash_posted = 0, updated_at = ? WHERE id = ?").run(reason.trim(), nowIso(), id);
      event(id, `${actor} cancelou: ${reason.trim()}`);
    } else {
      if (status === "done") applyLoyalty(id);
      getDb().prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
      event(id, `${actor} marcou como ${status}`);
    }
    if (row.customer_id) refreshCustomerStats(row.customer_id);
  })();
  const order = getOrder(id)!;
  await notify(order, statusText(order));
  return { order, warning };
}

export async function advanceOrder(id: string, actor: string) {
  const order = getOrder(id);
  if (!order) throw new HttpError("Pedido não encontrado", 404);
  const next: Partial<Record<OrderStatus, OrderStatus>> = { analysis: "preparing", preparing: "ready", ready: order.fulfillment === "delivery" ? "delivering" : "done", delivering: "done" };
  const status = next[order.status];
  if (!status) throw new HttpError("Pedido encerrado");
  return setOrderStatus(id, status, actor);
}

export async function markPaid(id: string, actor: string) {
  const row = getOrderRow(id);
  if (!row) throw new HttpError("Pedido não encontrado", 404);
  if (row.payment_status === "paid") return { order: getOrder(id)! };
  let warning: string | undefined;
  getDb().transaction(() => {
    let posted = row.cash_posted;
    if (DRAWER.has(row.payment_method) && !posted) {
      const ok = postOrderCash(id, row.total_cents, `Recebimento ${row.code}`, "sale");
      if (ok) posted = 1;
      else warning = "Caixa fechado: o pagamento foi registrado, mas não entrou na gaveta.";
    }
    getDb().prepare("UPDATE orders SET payment_status = 'paid', cash_posted = ?, updated_at = ? WHERE id = ?").run(posted, nowIso(), id);
    event(id, `${actor} marcou como pago`);
  })();
  return { order: getOrder(id)!, warning };
}

export async function markUnpaid(id: string, actor: string) {
  const row = getOrderRow(id);
  if (!row) throw new HttpError("Pedido não encontrado", 404);
  if (row.payment_status !== "paid") return { order: getOrder(id)! };
  getDb().transaction(() => {
    if (row.cash_posted) postOrderCash(id, row.total_cents, `Estorno ${row.code}`, "out");
    getDb().prepare("UPDATE orders SET payment_status = 'pending', cash_posted = 0, updated_at = ? WHERE id = ?").run(nowIso(), id);
    event(id, `${actor} reabriu o pagamento`);
  })();
  return { order: getOrder(id)! };
}

export async function assignCourier(id: string, courierId: string, actor: string) {
  const courier = listCouriers().find((item) => item.id === courierId);
  if (!courier || !courier.active) throw new HttpError("Motoboy indisponível");
  const order = getOrder(id);
  if (!order) throw new HttpError("Pedido não encontrado", 404);
  getDb().prepare("UPDATE orders SET courier_id = ?, updated_at = ? WHERE id = ?").run(courierId, nowIso(), id);
  event(id, `${actor} atribuiu ${courier.name}`);
  if (order.status === "ready" || order.status === "preparing") return setOrderStatus(id, "delivering", actor);
  return { order: getOrder(id)! };
}

export async function editOrder(id: string, patch: {
  address?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  fulfillment?: Fulfillment;
  tableName?: string;
  items?: { productId: string; qty: number; notes?: string; addons?: Addon[] }[];
  actor: string;
}) {
  const row = getOrderRow(id);
  if (!row) throw new HttpError("Pedido não encontrado", 404);
  if (row.status === "done" || row.status === "cancelled") throw new HttpError("Pedido encerrado");
  if (row.payment_status === "paid" && (patch.items || patch.paymentMethod || patch.fulfillment)) {
    throw new HttpError("Estorne o pagamento antes de editar itens, entrega ou forma de pagamento");
  }
  getDb().transaction(() => {
    const current = getOrderRow(id)!;
    const fulfillment = patch.fulfillment ?? current.fulfillment;
    const address = patch.address ?? current.address;
    const tableName = patch.tableName ?? current.table_name;
    if (fulfillment === "delivery" && !address.trim()) throw new HttpError("Informe o endereço");
    let subtotal = current.subtotal_cents;
    if (patch.items) {
      const lines = priceLines(patch.items);
      subtotal = lines.reduce((sum, line) => sum + line.unit * line.qty, 0);
      getDb().prepare("DELETE FROM order_items WHERE order_id = ?").run(id);
      const insertItem = getDb().prepare("INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price_cents, notes, addons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const line of lines) insertItem.run(nid("item"), id, line.product.id, line.product.name, line.qty, line.unit, line.notes, JSON.stringify(line.addons));
    }
    const fee = fulfillment === "delivery" ? (current.delivery_fee_cents || getConfig().deliveryFeeCents) : 0;
    let discount = current.discount_cents;
    if (patch.items && current.coupon_code) discount = quoteCoupon(current.coupon_code, subtotal).discountCents;
    let cashback = current.cashback_used_cents;
    const maxCashback = Math.max(0, subtotal - discount);
    if (cashback > maxCashback && current.customer_id) {
      addCashback(current.customer_id, cashback - maxCashback);
      cashback = maxCashback;
    }
    const total = Math.max(0, subtotal + fee - discount - cashback);
    getDb().prepare(`UPDATE orders SET fulfillment = ?, address = ?, table_name = ?, notes = ?, payment_method = ?, subtotal_cents = ?, delivery_fee_cents = ?, discount_cents = ?, cashback_used_cents = ?, total_cents = ?, updated_at = ? WHERE id = ?`).run(
      fulfillment, address, tableName, patch.notes ?? current.notes, patch.paymentMethod ?? current.payment_method, subtotal, fee, discount, cashback, total, nowIso(), id,
    );
    event(id, `${patch.actor} editou o pedido`);
    if (current.customer_id) refreshCustomerStats(current.customer_id);
  })();
  return { order: getOrder(id)! };
}

export function latestOrders(limit = 6) {
  const rows = getDb().prepare(`${ORDER_SQL} ORDER BY orders.created_at DESC LIMIT ?`).all(limit) as OrderRow[];
  return hydrate(rows);
}

export function openOrderCount() {
  const row = getDb().prepare("SELECT count(*) AS c FROM orders WHERE status IN ('analysis','preparing','ready','delivering')").get() as { c: number };
  return row.c;
}

export function saveReview(orderId: string, rating: number, comment = "") {
  const order = getOrder(orderId);
  if (!order) throw new HttpError("Pedido não encontrado", 404);
  if (rating < 1 || rating > 5) throw new HttpError("Nota de 1 a 5");
  const existing = getDb().prepare("SELECT id FROM reviews WHERE order_id = ?").get(orderId);
  if (existing) return { already: true };
  getDb().prepare("INSERT INTO reviews (id, order_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(nid("rev"), orderId, order.customerId, rating, comment.slice(0, 400), nowIso());
  return { already: false };
}

export function recentReviews(limit = 5) {
  const rows = getDb().prepare(`SELECT reviews.rating, reviews.comment, reviews.created_at, customers.name, orders.code
    FROM reviews LEFT JOIN customers ON customers.id = reviews.customer_id LEFT JOIN orders ON orders.id = reviews.order_id
    ORDER BY reviews.created_at DESC LIMIT ?`).all(limit) as Array<{ rating: number; comment: string; created_at: string; name: string | null; code: string | null }>;
  return rows.map((row) => ({ rating: row.rating, comment: row.comment, createdAt: row.created_at, name: row.name, code: row.code }));
}

export function catalogSnapshot() {
  return listProducts().filter((product) => product.available);
}
