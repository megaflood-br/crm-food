import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomBytes, scryptSync } from "crypto";
import type { StoreConfig } from "@/lib/types";
import { addIsoDays, todayBounds, zonedTimeToUtc } from "@/lib/time";
import { nid, nowIso } from "./ids";

const globalForDb = globalThis as unknown as { brasaDb?: Database.Database };

const SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner'
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE hours (
  weekday INTEGER PRIMARY KEY,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🍽️',
  available INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  addons_json TEXT NOT NULL DEFAULT '[]',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  cashback_cents INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  no_campaign INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  spent_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_order_at TEXT
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'bot',
  unread INTEGER NOT NULL DEFAULT 0,
  draft_json TEXT NOT NULL DEFAULT '{"items":[]}',
  recovery_sent INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  last_preview TEXT NOT NULL DEFAULT ''
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  wa_id TEXT,
  status TEXT NOT NULL DEFAULT 'local',
  author TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX messages_wa_id ON messages(wa_id) WHERE wa_id IS NOT NULL;
CREATE TABLE couriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle TEXT NOT NULL DEFAULT 'moto',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fee_cents INTEGER NOT NULL,
  eta_min INTEGER NOT NULL,
  eta_max INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  min_cents INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  recovery INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  table_name TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  cashback_used_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  coupon_code TEXT,
  courier_id TEXT,
  cancel_reason TEXT,
  scheduled_at TEXT,
  loyalty_applied INTEGER NOT NULL DEFAULT 0,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  loyalty_cashback_cents INTEGER NOT NULL DEFAULT 0,
  cash_posted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  addons_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  segment TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  opening_cents INTEGER NOT NULL,
  closing_cents INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL
);
CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  order_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  customer_id TEXT,
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX orders_status ON orders(status, created_at);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);
`;

export function defaultConfig(): StoreConfig {
  return {
    name: "Brasa & Cia",
    slug: "brasa",
    phone: "5511988880000",
    address: "Rua Harmonia, 890 — Vila Madalena, São Paulo",
    city: "SAO PAULO",
    description: "Hambúrguer no fogo, chopp gelado e entrega na região. Sem marketplace no meio.",
    pixKey: "financeiro@brasaecia.com.br",
    pixHolder: "BRASA E CIA",
    prepMinutes: 35,
    minOrderCents: 2500,
    deliveryFeeCents: 700,
    pausedUntil: null,
    forceClosed: false,
    attendantName: "Lia",
    attendantEnabled: true,
    attendantPersonality: "Fala curto, perto, como quem atende no balcão. Sem texto longo e sem inventar item.",
    loyaltyEnabled: true,
    cashbackPercent: 5,
    pointsPerReal: 1,
    rewardPoints: 100,
    rewardCents: 1000,
    recoveryEnabled: true,
    recoveryMinutes: 30,
    recoveryMessage: "Oi, {nome}! Você parou no meio do pedido na {loja}. O cupom {cupom} ainda vale: {link}",
    evolutionUrl: "",
    evolutionKey: "",
    evolutionInstance: "brasa",
    openaiKey: "",
    webhookToken: randomBytes(16).toString("hex"),
    orderSeq: 980,
  };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function seed(db: Database.Database) {
  const config = defaultConfig();
  const created = nowIso();
  const insertUser = db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')");
  insertUser.run("user_ana", "Ana Ribeiro", "ana@brasa.local", hashPassword("brasa1234"));

  const hour = db.prepare("INSERT INTO hours (weekday, open_time, close_time, closed) VALUES (?, ?, ?, ?)");
  const weekly: Array<[number, string, string, number]> = [
    [0, "12:00", "23:00", 1],
    [1, "18:00", "23:00", 0],
    [2, "18:00", "23:00", 0],
    [3, "18:00", "23:00", 0],
    [4, "18:00", "23:30", 0],
    [5, "18:00", "00:00", 0],
    [6, "12:00", "00:00", 0],
  ];
  for (const row of weekly) hour.run(...row);

  const category = db.prepare("INSERT INTO categories (id, name, sort, active) VALUES (?, ?, ?, 1)");
  category.run("cat_burgers", "Burgers", 0);
  category.run("cat_sides", "Acompanhamentos", 1);
  category.run("cat_drinks", "Bebidas", 2);
  category.run("cat_sweet", "Sobremesas", 3);

  const product = db.prepare(`INSERT INTO products
    (id, category_id, name, description, price_cents, emoji, available, featured, addons_json, aliases_json, sort)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`);
  const bacon = JSON.stringify([{ name: "Bacon extra", priceCents: 600 }, { name: "Ovo", priceCents: 300 }, { name: "Queijo extra", priceCents: 400 }]);
  const cheddar = JSON.stringify([{ name: "Cheddar", priceCents: 500 }]);
  const rows: Array<[string, string, string, string, number, string, number, string, string, number]> = [
    ["p_classico", "cat_burgers", "Brasa Clássico", "Blend 160g, queijo, picles e molho da casa.", 3490, "🍔", 1, bacon, JSON.stringify(["classico", "hamburguer", "hamburger"]), 0],
    ["p_bacon", "cat_burgers", "X-Bacon Defumado", "Blend, bacon crocante e queijo meia-cura.", 3990, "🥓", 1, bacon, JSON.stringify(["bacon", "xbacon", "x-bacon"]), 1],
    ["p_duplo", "cat_burgers", "Duplo da Casa", "Dois blends, cebola caramelizada e pão brioche.", 4690, "🔥", 1, bacon, JSON.stringify(["duplo"]), 2],
    ["p_veg", "cat_burgers", "Vegetariano do Fogo", "Grão-de-bico grelhado, coalhada e rúcula.", 3790, "🥬", 0, bacon, JSON.stringify(["vegetariano", "veggie"]), 3],
    ["p_batata", "cat_sides", "Batata rústica", "Com alecrim e sal grosso.", 1890, "🍟", 1, cheddar, JSON.stringify(["batata", "fritas"]), 0],
    ["p_onion", "cat_sides", "Onion rings", "Anéis crocantes com maionese defumada.", 1690, "🧅", 0, "[]", JSON.stringify(["onion", "aneis"]), 1],
    ["p_refri", "cat_drinks", "Refrigerante lata", "Cola, guaraná ou laranja.", 800, "🥤", 0, "[]", JSON.stringify(["refri", "coca", "refrigerante", "lata"]), 0],
    ["p_suco", "cat_drinks", "Suco de laranja", "Feito na hora, 400 ml.", 1200, "🍊", 0, "[]", JSON.stringify(["suco", "laranja"]), 1],
    ["p_chopp", "cat_drinks", "Chopp 500 ml", "Pilsen gelado, tirado na hora.", 1600, "🍺", 1, "[]", JSON.stringify(["chopp", "chope", "cerveja"]), 2],
    ["p_brownie", "cat_sweet", "Brownie", "Meio amargo, com flor de sal.", 1490, "🍫", 0, "[]", JSON.stringify(["brownie"]), 0],
    ["p_petit", "cat_sweet", "Petit gâteau", "Chocolate e sorvete de creme.", 1890, "🍮", 0, "[]", JSON.stringify(["petit", "gateau", "bolo"]), 1],
  ];
  for (const row of rows) product.run(...row);

  const customer = db.prepare(`INSERT INTO customers
    (id, name, phone, address, notes, tags, cashback_cents, points, blocked, no_campaign, hidden, orders_count, spent_cents, created_at, last_order_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`);
  const people: Array<[string, string, string, string, string, string, number, number, number, number, number, string, string | null]> = [
    ["c_marina", "Marina Costa", "5511988881001", "Rua Aspicuelta, 320", "Sem cebola.", "vip", 1250, 240, 0, 0, 0, created, created],
    ["c_lucas", "Lucas Almeida", "5511988881002", "Rua Wisard, 88", "", "", 0, 20, 0, 0, 0, created, null],
    ["c_helena", "Helena Dias", "5511988881003", "Rua Harmonia, 45", "Retira no balcão.", "", 400, 80, 0, 0, 0, created, created],
    ["c_caio", "Caio Mendes", "5511988881004", "Rua Mourato Coelho, 1200", "", "", 0, 60, 0, 0, 0, created, created],
    ["c_rita", "Rita Nogueira", "5511988881005", "Rua Original, 210", "", "vip", 800, 180, 0, 0, 0, created, created],
    ["c_pedro", "Pedro Lima", "5511988881006", "Rua Fidalga, 90", "Não mandar disparo.", "", 200, 40, 0, 1, 0, created, created],
    ["c_joao", "João Victor", "5511988881007", "Rua Harmonia, 120", "", "", 0, 0, 0, 0, 0, created, created],
    ["c_bia", "Bia Fernandes", "5511988881008", "Rua Girassol, 500", "", "", 0, 15, 0, 0, 0, created, null],
    ["c_teste", "Teste do painel", "5500000000001", "", "Conversa interna da Lia.", "teste", 0, 0, 0, 1, 1, created, null],
  ];
  for (const row of people) customer.run(...row);

  const courier = db.prepare("INSERT INTO couriers (id, name, phone, vehicle, active) VALUES (?, ?, ?, ?, 1)");
  courier.run("k_diego", "Diego Ramos", "5511977771001", "moto");
  courier.run("k_lucia", "Lúcia Pires", "5511977771002", "bike");

  const zone = db.prepare("INSERT INTO zones (id, name, fee_cents, eta_min, eta_max, active) VALUES (?, ?, ?, ?, ?, 1)");
  zone.run("z_centro", "Centro", 700, 30, 45);
  zone.run("z_vila", "Vila Madalena", 900, 35, 55);
  zone.run("z_pinheiros", "Pinheiros", 900, 40, 60);
  zone.run("z_perdizes", "Perdizes", 1100, 45, 70);

  const coupon = db.prepare(`INSERT INTO coupons (id, code, description, kind, value, min_cents, max_uses, used, active, recovery, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, null)`);
  coupon.run("cp_bem", "BEMVINDO10", "10% na primeira compra acima de R$ 30", "percent", 10, 3000, 200, 0);
  coupon.run("cp_volta", "VOLTA15", "15% para quem sumiu no meio da conversa", "percent", 15, 4000, 500, 1);
  coupon.run("cp_brasa", "BRASA5", "R$ 5 no pedido acima de R$ 25", "fixed", 500, 2500, null, 0);

  let seq = 980;
  const nextCode = (prefix: string) => {
    seq += 1;
    return `${prefix}-${seq}`;
  };
  const insertOrder = db.prepare(`INSERT INTO orders (
    id, code, customer_id, customer_name, customer_phone, status, channel, fulfillment, address, table_name,
    payment_method, payment_status, subtotal_cents, delivery_fee_cents, discount_cents, cashback_used_cents, total_cents,
    notes, coupon_code, courier_id, cancel_reason, scheduled_at, loyalty_applied, loyalty_points, loyalty_cashback_cents,
    cash_posted, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, 0, 0, ?, ?, null, ?, null, null, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price_cents, notes, addons_json)
    VALUES (?, ?, ?, ?, ?, ?, '', '[]')`);
  const insertEvent = db.prepare("INSERT INTO order_events (id, order_id, message, created_at) VALUES (?, ?, ?, ?)");

  const catalog = [
    { id: "p_classico", name: "Brasa Clássico", price: 3490 },
    { id: "p_bacon", name: "X-Bacon Defumado", price: 3990 },
    { id: "p_duplo", name: "Duplo da Casa", price: 4690 },
    { id: "p_batata", name: "Batata rústica", price: 1890 },
    { id: "p_onion", name: "Onion rings", price: 1690 },
    { id: "p_refri", name: "Refrigerante lata", price: 800 },
    { id: "p_chopp", name: "Chopp 500 ml", price: 1600 },
    { id: "p_brownie", name: "Brownie", price: 1490 },
  ];
  const buyers = [
    ["c_marina", "Marina Costa", "5511988881001", "Rua Aspicuelta, 320"],
    ["c_rita", "Rita Nogueira", "5511988881005", "Rua Original, 210"],
    ["c_pedro", "Pedro Lima", "5511988881006", "Rua Fidalga, 90"],
    ["c_helena", "Helena Dias", "5511988881003", "Rua Harmonia, 45"],
    ["c_caio", "Caio Mendes", "5511988881004", "Rua Mourato Coelho, 1200"],
    ["c_bia", "Bia Fernandes", "5511988881008", "Rua Girassol, 500"],
  ] as const;
  const bounds = todayBounds();
  for (let day = 6; day >= 1; day -= 1) {
    const date = addIsoDays(bounds.isoDate, -day);
    for (let n = 0; n < 4; n += 1) {
      const buyer = buyers[(day + n) % buyers.length];
      const first = catalog[(day + n) % 3];
      const second = catalog[5 + (n % 3)];
      const subtotal = first.price + second.price;
      const fee = n % 2 === 0 ? 900 : 0;
      const total = subtotal + fee;
      const when = zonedTimeToUtc(date, 19, 10 + n * 18).toISOString();
      const id = nid("ord");
      const paid = n === 3 ? "pending" : "paid";
      const drawer = paid === "paid" && fee === 0 ? 0 : 0;
      insertOrder.run(
        id, nextCode("B"), buyer[0], buyer[1], buyer[2], "done", "whatsapp", fee ? "delivery" : "pickup",
        fee ? buyer[3] : "", paid === "pending" ? "pix" : n % 2 ? "cash" : "pix", paid,
        subtotal, fee, total, "", null, 1, Math.floor(total / 100), Math.round(total * 0.05), drawer, when, when,
      );
      insertItem.run(nid("item"), id, first.id, first.name, 1, first.price);
      insertItem.run(nid("item"), id, second.id, second.name, 1, second.price);
      insertEvent.run(nid("evt"), id, "Pedido finalizado", when);
    }
  }

  const live = (input: {
    id: string; customerId: string; name: string; phone: string; status: string; channel: string; fulfillment: string;
    address: string; payment: string; paid: string; items: Array<[string, string, number, number]>; fee: number;
    notes: string; courier: string | null; minutesAgo: number; loyalty?: boolean; cash?: boolean;
  }) => {
    const subtotal = input.items.reduce((sum, item) => sum + item[2] * item[3], 0);
    const total = subtotal + input.fee;
    const when = new Date(Date.now() - input.minutesAgo * 60000).toISOString();
    const prefix = input.channel === "menu" ? "C" : input.fulfillment === "counter" ? "BA" : input.fulfillment === "table" ? "MS" : "B";
    insertOrder.run(
      input.id, nextCode(prefix), input.customerId, input.name, input.phone, input.status, input.channel, input.fulfillment,
      input.address, input.payment, input.paid, subtotal, input.fee, total, input.notes, input.courier,
      input.loyalty ? 1 : 0, input.loyalty ? Math.floor(total / 100) : 0, input.loyalty ? Math.round(total * 0.05) : 0,
      input.cash ? 1 : 0, when, when,
    );
    for (const item of input.items) insertItem.run(nid("item"), input.id, item[0], item[1], item[2], item[3]);
    insertEvent.run(nid("evt"), input.id, "Pedido entrou no gestor", when);
  };

  live({
    id: "ord_rita", customerId: "c_rita", name: "Rita Nogueira", phone: "5511988881005", status: "done", channel: "menu",
    fulfillment: "delivery", address: "Rua Original, 210", payment: "pix", paid: "paid", fee: 900, notes: "",
    courier: "k_diego", minutesAgo: 80, loyalty: true, cash: false,
    items: [["p_classico", "Brasa Clássico", 1, 3490], ["p_chopp", "Chopp 500 ml", 2, 1600]],
  });
  live({
    id: "ord_pedro", customerId: "c_pedro", name: "Pedro Lima", phone: "5511988881006", status: "done", channel: "counter",
    fulfillment: "counter", address: "", payment: "cash", paid: "paid", fee: 0, notes: "Balcão",
    courier: null, minutesAgo: 50, loyalty: true, cash: true,
    items: [["p_bacon", "X-Bacon Defumado", 1, 3990], ["p_batata", "Batata rústica", 1, 1890]],
  });
  live({
    id: "ord_bia", customerId: "c_bia", name: "Bia Fernandes", phone: "5511988881008", status: "cancelled", channel: "whatsapp",
    fulfillment: "delivery", address: "Rua Girassol, 500", payment: "pix", paid: "pending", fee: 900, notes: "",
    courier: null, minutesAgo: 140,
    items: [["p_duplo", "Duplo da Casa", 1, 4690]],
  });
  db.prepare("UPDATE orders SET cancel_reason = ? WHERE id = ?").run("Cliente desistiu", "ord_bia");
  live({
    id: "ord_joao", customerId: "c_joao", name: "João Victor", phone: "5511988881007", status: "analysis", channel: "whatsapp",
    fulfillment: "delivery", address: "Rua Harmonia, 120", payment: "pix", paid: "pending", fee: 900, notes: "",
    courier: null, minutesAgo: 6,
    items: [["p_bacon", "X-Bacon Defumado", 1, 3990]],
  });
  live({
    id: "ord_marina", customerId: "c_marina", name: "Marina Costa", phone: "5511988881001", status: "preparing", channel: "whatsapp",
    fulfillment: "delivery", address: "Rua Aspicuelta, 320", payment: "pix", paid: "paid", fee: 900, notes: "Sem cebola.",
    courier: null, minutesAgo: 18,
    items: [["p_duplo", "Duplo da Casa", 1, 4690], ["p_batata", "Batata rústica", 1, 1890], ["p_chopp", "Chopp 500 ml", 1, 1600]],
  });
  live({
    id: "ord_helena", customerId: "c_helena", name: "Helena Dias", phone: "5511988881003", status: "ready", channel: "menu",
    fulfillment: "pickup", address: "", payment: "card_delivery", paid: "pending", fee: 0, notes: "",
    courier: null, minutesAgo: 12,
    items: [["p_veg", "Vegetariano do Fogo", 1, 3790], ["p_suco", "Suco de laranja", 1, 1200]],
  });
  live({
    id: "ord_caio", customerId: "c_caio", name: "Caio Mendes", phone: "5511988881004", status: "delivering", channel: "whatsapp",
    fulfillment: "delivery", address: "Rua Mourato Coelho, 1200", payment: "cash", paid: "pending", fee: 900, notes: "Troco para R$ 100",
    courier: "k_diego", minutesAgo: 9,
    items: [["p_classico", "Brasa Clássico", 2, 3490], ["p_onion", "Onion rings", 1, 1690]],
  });

  const refresh = db.prepare(`UPDATE customers SET
    orders_count = (SELECT count(*) FROM orders WHERE customer_id = customers.id AND status != 'cancelled'),
    spent_cents = (SELECT coalesce(sum(total_cents), 0) FROM orders WHERE customer_id = customers.id AND status != 'cancelled'),
    last_order_at = (SELECT max(created_at) FROM orders WHERE customer_id = customers.id AND status != 'cancelled')`);
  refresh.run();

  const message = db.prepare(`INSERT INTO messages (id, conversation_id, direction, body, kind, wa_id, status, author, created_at)
    VALUES (?, ?, ?, ?, 'text', null, 'local', ?, ?)`);
  const conversation = db.prepare(`INSERT INTO conversations (id, customer_id, status, unread, draft_json, recovery_sent, last_message_at, last_preview)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
  conversation.run("cv_joao", "c_joao", "bot", 0, JSON.stringify({ items: [] }), 0, ago(6), "Anotei o X-Bacon. Já foi pra análise.");
  message.run(nid("msg"), "cv_joao", "in", "Oi, quero um x-bacon pra entrega na Rua Harmonia, 120, no pix", "customer", ago(8));
  message.run(nid("msg"), "cv_joao", "out", "Anotei 1× X-Bacon Defumado para a Rua Harmonia, 120, no Pix. O pedido já está em análise na cozinha.", "bot", ago(6));
  conversation.run("cv_lucas", "c_lucas", "bot", 0, JSON.stringify({ items: [] }), 0, ago(50), "O Duplo da Casa é R$ 46,90. Quer que eu monte?");
  message.run(nid("msg"), "cv_lucas", "in", "quanto fica o duplo?", "customer", ago(52));
  message.run(nid("msg"), "cv_lucas", "out", "O Duplo da Casa é R$ 46,90. Quer que eu monte o pedido?", "bot", ago(50));
  conversation.run("cv_marina", "c_marina", "human", 1, JSON.stringify({ items: [] }), 1, ago(4), "Troca a batata por onion rings?");
  message.run(nid("msg"), "cv_marina", "in", "Consegue trocar a batata por onion rings?", "customer", ago(4));

  const review = db.prepare("INSERT INTO reviews (id, order_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  review.run(nid("rev"), "ord_rita", "c_rita", 5, "Chegou quente e o chopp veio lacrado.", ago(40));
  review.run(nid("rev"), "ord_pedro", "c_pedro", 4, "Bacon no ponto. Demorou um pouco no balcão.", ago(20));

  const sessionId = "cash_open";
  const opened = zonedTimeToUtc(bounds.isoDate, 17, 0).toISOString();
  db.prepare("INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cents, closing_cents, notes, user_name) VALUES (?, ?, null, ?, null, '', ?)")
    .run(sessionId, opened, 20000, "Ana Ribeiro");
  db.prepare("INSERT INTO cash_movements (id, session_id, kind, amount_cents, description, order_id, created_at) VALUES (?, ?, 'sale', ?, ?, ?, ?)")
    .run(nid("mov"), sessionId, 5880, "Pedido balcão Pedro Lima", "ord_pedro", ago(50));

  db.prepare("INSERT INTO campaigns (id, name, message, segment, status, sent_count, created_at, sent_at) VALUES (?, ?, ?, ?, 'draft', 0, ?, null)")
    .run("cmp_sexta", "Sexta do chopp", "Oi, {nome}! Sexta na {loja} combina com chopp. Cardápio: {link}", "inactive", created);

  config.orderSeq = seq;
  db.prepare("INSERT INTO settings (key, value) VALUES ('config', ?)").run(JSON.stringify(config));
  db.prepare("INSERT INTO settings (key, value) VALUES ('evolution_runtime', ?)").run(JSON.stringify({ state: "disconnected", qr: null, updatedAt: null }));
}

export function getDb() {
  if (!globalForDb.brasaDb) {
    const file = process.env.BRASA_DB || path.join(process.cwd(), "data", "crm.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    globalForDb.brasaDb = db;
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version < 1) {
      const init = db.transaction(() => {
        db.exec(SCHEMA);
        seed(db);
      });
      init();
      db.pragma("user_version = 1");
    }
  }
  return globalForDb.brasaDb;
}
