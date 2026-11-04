import { createSessionCookie, changePassword, currentUser, login, logout } from "@/server/auth";
import { confirmDraftOrder, testAttendant } from "@/server/attendant";
import { sessionSummary, closeCash, listClosedSessions, moveCash, openCash } from "@/server/cash";
import { audience, listCampaigns, saveCampaign, sendCampaign, sweepRecovery } from "@/server/campaigns";
import { deleteProduct, getPublicMenu, listCategories, saveCategory, saveProduct, setProductAvailable } from "@/server/catalog";
import { applyPause, effectiveEvolution, getConfig, getRuntime, listHours, maskSecret, saveHours, storefrontState, updateConfig } from "@/server/config";
import { getConversation, listConversations, listMessages, markRead, saveDraft, setConversationStatus } from "@/server/conversations";
import { listCoupons, saveCoupon } from "@/server/coupons";
import { getCustomer, getCustomerByPhone, listCustomers, redeemPoints, updateCustomer, upsertCustomer } from "@/server/customers";
import { deleteZone, listCouriers, listZones, saveCourier, saveZone } from "@/server/delivery";
import { fail, fromError, HttpError, ok, originOf } from "@/server/http";
import { addMessage } from "@/server/conversations";
import { advanceOrder, assignCourier, createOrder, editOrder, getOrder, latestOrders, listOrders, markPaid, markUnpaid, openOrderCount, recentReviews, setOrderStatus } from "@/server/orders";
import { unreadCount } from "@/server/conversations";
import { greeting } from "@/lib/time";
import { buildReport } from "@/server/reports";
import { connectInstance, connectionSnapshot, logoutInstance, sendText } from "@/server/evolution";
import { ingestEvolution, webhookAuthorized } from "@/server/whatsapp";
import { pixPayload } from "@/lib/pix";
import type { Addon, Channel, Draft, Fulfillment, PaymentMethod } from "@/lib/types";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = Record<string, unknown>;

async function readBody(request: Request): Promise<Body> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError("JSON inválido");
  return parsed as Body;
}

function str(body: Body, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function num(body: Body, key: string) {
  const value = body[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function itemsOf(body: Body) {
  if (!Array.isArray(body.items)) throw new HttpError("Inclua os itens");
  return body.items.map((item) => {
    const row = item as Body;
    return {
      productId: String(row.productId ?? ""),
      qty: Number(row.qty ?? 0),
      notes: typeof row.notes === "string" ? row.notes : "",
      addons: Array.isArray(row.addons) ? row.addons as Addon[] : [],
    };
  });
}

async function guard() {
  const user = await currentUser();
  if (!user) throw new HttpError("Não autorizado", 401);
  return user;
}

function settingsView(origin: string) {
  const config = getConfig();
  const evolution = effectiveEvolution();
  const runtime = getRuntime();
  const state = storefrontState();
  return {
    name: config.name,
    slug: config.slug,
    phone: config.phone,
    address: config.address,
    city: config.city,
    description: config.description,
    pixKey: config.pixKey,
    pixHolder: config.pixHolder,
    prepMinutes: config.prepMinutes,
    minOrderCents: config.minOrderCents,
    deliveryFeeCents: config.deliveryFeeCents,
    pausedUntil: config.pausedUntil,
    forceClosed: config.forceClosed,
    accepting: state.accepting,
    closedReason: state.reason,
    attendantName: config.attendantName,
    attendantEnabled: config.attendantEnabled,
    attendantPersonality: config.attendantPersonality,
    loyaltyEnabled: config.loyaltyEnabled,
    cashbackPercent: config.cashbackPercent,
    pointsPerReal: config.pointsPerReal,
    rewardPoints: config.rewardPoints,
    rewardCents: config.rewardCents,
    recoveryEnabled: config.recoveryEnabled,
    recoveryMinutes: config.recoveryMinutes,
    recoveryMessage: config.recoveryMessage,
    evolutionUrl: config.evolutionUrl,
    evolutionInstance: config.evolutionInstance || evolution.instance,
    evolutionKeySet: Boolean(evolution.key),
    evolutionKeyHint: maskSecret(evolution.key),
    openaiKeySet: Boolean(config.openaiKey || process.env.OPENAI_API_KEY),
    evolutionState: runtime.state,
    evolutionQr: runtime.qr,
    webhookUrl: `${origin}/api/webhooks/evolution?token=${encodeURIComponent(config.webhookToken)}`,
    publicUrl: `${origin}/cardapio/${config.slug}`,
    hours: listHours(),
  };
}

async function handle(method: string, path: string[], request: Request) {
  const origin = originOf(request);
  const url = new URL(request.url);
  if (path[0] === "webhooks" && path[1] === "evolution" && method === "POST") {
    const token = url.searchParams.get("token") || request.headers.get("x-webhook-token");
    if (!webhookAuthorized(token)) return fail("Token inválido", 401);
    return ok(await ingestEvolution(await request.json().catch(() => null), origin));
  }
  if (path[0] === "public" && path[1]) {
    if (method === "GET" && path.length === 2) {
      const menu = getPublicMenu(path[1]);
      if (!menu) return fail("Cardápio não encontrado", 404);
      return ok(menu);
    }
    if (method === "POST" && path[2] === "lookup") {
      const body = await readBody(request);
      const customer = getCustomerByPhone(str(body, "phone"));
      if (!customer || customer.hidden) return ok({ found: false });
      return ok({ found: true, name: customer.name, address: customer.address, cashbackCents: customer.cashbackCents });
    }
    if (method === "POST" && path[2] === "order") {
      const menu = getPublicMenu(path[1]);
      if (!menu) return fail("Cardápio não encontrado", 404);
      const body = await readBody(request);
      const fulfillment = str(body, "fulfillment") as Fulfillment;
      const result = await createOrder({
        customerName: str(body, "name"),
        customerPhone: str(body, "phone"),
        fulfillment,
        channel: "menu",
        address: str(body, "address"),
        tableName: str(body, "tableName"),
        paymentMethod: str(body, "paymentMethod") as PaymentMethod,
        notes: str(body, "notes"),
        couponCode: str(body, "couponCode") || undefined,
        cashbackCents: num(body, "cashbackCents") ?? 0,
        zoneId: str(body, "zoneId") || undefined,
        items: itemsOf(body),
        actor: "Cardápio",
        silent: false,
      });
      let pix: string | null = null;
      let pixQr: string | null = null;
      if (result.order.paymentMethod === "pix") {
        const config = getConfig();
        pix = pixPayload({ key: config.pixKey, holder: config.pixHolder, city: config.city, amountCents: result.order.totalCents, txid: result.order.code.replace(/[^A-Za-z0-9]/g, "") });
        pixQr = await QRCode.toDataURL(pix, { margin: 1, width: 280 });
      }
      return ok({ ...result, pix, pixQr });
    }
    return fail("Rota não encontrada", 404);
  }

  if (path[0] === "auth" && path[1] === "login" && method === "POST") {
    const body = await readBody(request);
    const session = login(str(body, "email"), str(body, "password"));
    await createSessionCookie(session.token, session.expires, origin.startsWith("https://"));
    return ok({ user: session.user });
  }

  const user = await guard();
  if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
    await logout();
    return ok({ ok: true });
  }
  if (path[0] === "auth" && path[1] === "password" && method === "POST") {
    const body = await readBody(request);
    return ok(changePassword(user.id, str(body, "current"), str(body, "next")));
  }
  if (path[0] === "auth" && path[1] === "me" && method === "GET") return ok({ user });

  if (path[0] === "dashboard" && method === "GET") {
    await sweepRecovery(origin);
    const config = getConfig();
    return ok({
      greeting: greeting(),
      userName: user.name,
      storeName: config.name,
      state: storefrontState(),
      today: buildReport("today"),
      week: buildReport("7d").byDay,
      openOrders: openOrderCount(),
      unread: unreadCount(),
      cash: sessionSummary(),
      orders: latestOrders(8),
      reviews: recentReviews(),
      menuUrl: `${origin}/cardapio/${config.slug}`,
    });
  }
  if (path[0] === "notifications" && method === "GET") {
    await sweepRecovery(origin);
    const state = storefrontState();
    return ok({ unread: unreadCount(), openOrders: openOrderCount(), accepting: state.accepting, reason: state.reason });
  }
  if (path[0] === "orders" && method === "GET" && !path[1]) return ok({ orders: listOrders(url.searchParams.get("q") ?? ""), couriers: listCouriers(), catalog: listCategories(true) });
  if (path[0] === "orders" && method === "POST" && !path[1]) {
    const body = await readBody(request);
    return ok(await createOrder({
      customerName: str(body, "customerName"),
      customerPhone: str(body, "customerPhone"),
      fulfillment: str(body, "fulfillment") as Fulfillment,
      channel: (str(body, "channel") || "counter") as Channel,
      address: str(body, "address"),
      tableName: str(body, "tableName"),
      paymentMethod: str(body, "paymentMethod") as PaymentMethod,
      notes: str(body, "notes"),
      couponCode: str(body, "couponCode") || undefined,
      cashbackCents: num(body, "cashbackCents") ?? 0,
      zoneId: str(body, "zoneId") || undefined,
      items: itemsOf(body),
      staff: true,
      actor: user.name,
    }));
  }
  if (path[0] === "orders" && path[1] && method === "GET") {
    const order = getOrder(path[1]);
    if (!order) return fail("Pedido não encontrado", 404);
    return ok({ order });
  }
  if (path[0] === "orders" && path[1] && method === "PATCH") {
    const body = await readBody(request);
    const action = str(body, "action");
    const id = path[1];
    if (action === "advance") return ok(await advanceOrder(id, user.name));
    if (action === "cancel") return ok(await setOrderStatus(id, "cancelled", user.name, str(body, "reason")));
    if (action === "pay") return ok(await markPaid(id, user.name));
    if (action === "unpay") return ok(await markUnpaid(id, user.name));
    if (action === "assign") return ok(await assignCourier(id, str(body, "courierId"), user.name));
    if (action === "edit") {
      return ok(await editOrder(id, {
        address: body.address === undefined ? undefined : str(body, "address"),
        notes: body.notes === undefined ? undefined : str(body, "notes"),
        paymentMethod: body.paymentMethod ? str(body, "paymentMethod") as PaymentMethod : undefined,
        fulfillment: body.fulfillment ? str(body, "fulfillment") as Fulfillment : undefined,
        tableName: body.tableName === undefined ? undefined : str(body, "tableName"),
        items: body.items ? itemsOf(body) : undefined,
        actor: user.name,
      }));
    }
    return fail("Ação inválida");
  }
  if (path[0] === "catalog" && method === "GET") return ok({ categories: listCategories(true) });
  if (path[0] === "catalog" && method === "POST") {
    const body = await readBody(request);
    const action = str(body, "action");
    if (action === "category") return ok({ id: saveCategory({ id: str(body, "id") || undefined, name: str(body, "name") }) });
    if (action === "availability") return ok({ product: setProductAvailable(str(body, "id"), Boolean(body.available)) });
    if (action === "delete") return ok(deleteProduct(str(body, "id")));
    return ok({ product: saveProduct({
      id: str(body, "id") || undefined,
      categoryId: str(body, "categoryId"),
      name: str(body, "name"),
      description: str(body, "description"),
      priceCents: num(body, "priceCents") ?? -1,
      emoji: str(body, "emoji") || "🍽️",
      available: body.available !== false,
      featured: Boolean(body.featured),
      addons: Array.isArray(body.addons) ? body.addons as Addon[] : [],
      aliases: Array.isArray(body.aliases) ? body.aliases.map(String) : [],
    }) });
  }
  if (path[0] === "customers" && method === "GET" && !path[1]) return ok({ customers: listCustomers(url.searchParams.get("q") ?? "") });
  if (path[0] === "customers" && method === "POST" && !path[1]) {
    const body = await readBody(request);
    return ok({ customer: upsertCustomer({ name: str(body, "name"), phone: str(body, "phone"), address: str(body, "address") }) });
  }
  if (path[0] === "customers" && path[1] && method === "GET") {
    const customer = getCustomer(path[1]);
    if (!customer) return fail("Cliente não encontrado", 404);
    return ok({ customer, orders: listOrders(customer.phone) });
  }
  if (path[0] === "customers" && path[1] && path[2] === "redeem" && method === "POST") return ok({ customer: redeemPoints(path[1]) });
  if (path[0] === "customers" && path[1] && method === "PATCH") {
    const body = await readBody(request);
    return ok({ customer: updateCustomer(path[1], {
      name: body.name === undefined ? undefined : str(body, "name"),
      address: body.address === undefined ? undefined : str(body, "address"),
      notes: body.notes === undefined ? undefined : str(body, "notes"),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      blocked: typeof body.blocked === "boolean" ? body.blocked : undefined,
      noCampaign: typeof body.noCampaign === "boolean" ? body.noCampaign : undefined,
    }) });
  }
  if (path[0] === "conversations" && method === "GET" && !path[1]) {
    await sweepRecovery(origin);
    return ok({ conversations: listConversations() });
  }
  if (path[0] === "conversations" && path[1] && method === "GET") {
    const conversation = getConversation(path[1]);
    if (!conversation) return fail("Conversa não encontrada", 404);
    return ok({ conversation, messages: listMessages(path[1]), customer: getCustomer(conversation.customerId) });
  }
  if (path[0] === "conversations" && path[1] && method === "POST") {
    const body = await readBody(request);
    const action = str(body, "action");
    if (action === "read") return ok({ conversation: markRead(path[1]) });
    if (action === "status") return ok({ conversation: setConversationStatus(path[1], str(body, "status") as "bot" | "human" | "closed") });
    if (action === "draft") {
      const draft = body.draft as Draft;
      return ok({ conversation: saveDraft(path[1], draft) });
    }
    if (action === "confirm") return ok(await confirmDraftOrder(path[1], user.name, false));
    if (action === "message") {
      const conversation = getConversation(path[1]);
      if (!conversation) return fail("Conversa não encontrada", 404);
      const text = str(body, "text").trim();
      if (!text) throw new HttpError("Escreva a mensagem");
      setConversationStatus(path[1], "human");
      const sent = await sendText(conversation.customerPhone, text);
      addMessage({ conversationId: path[1], direction: "out", body: text, author: "agent", status: sent.delivered ? "sent" : sent.error ? "failed" : "local" });
      markRead(path[1]);
      return ok({ conversation: getConversation(path[1]), messages: listMessages(path[1]), delivery: sent.error ?? null });
    }
    return fail("Ação inválida");
  }
  if (path[0] === "coupons" && method === "GET") return ok({ coupons: listCoupons() });
  if (path[0] === "coupons" && method === "POST") {
    const body = await readBody(request);
    return ok({ id: saveCoupon({
      id: str(body, "id") || undefined,
      code: str(body, "code"),
      description: str(body, "description"),
      kind: str(body, "kind") === "fixed" ? "fixed" : "percent",
      value: num(body, "value") ?? 0,
      minCents: num(body, "minCents") ?? 0,
      maxUses: body.maxUses == null || body.maxUses === "" ? null : num(body, "maxUses"),
      active: body.active !== false,
      recovery: Boolean(body.recovery),
      expiresAt: str(body, "expiresAt") || null,
    }) });
  }
  if (path[0] === "campaigns" && method === "GET") return ok({ campaigns: listCampaigns(), preview: { all: audience("all").length, inactive: audience("inactive").length, vip: audience("vip").length, never: audience("never").length } });
  if (path[0] === "campaigns" && method === "POST") {
    const body = await readBody(request);
    if (str(body, "action") === "send") return ok(await sendCampaign(str(body, "id"), origin));
    return ok({ id: saveCampaign({ name: str(body, "name"), message: str(body, "message"), segment: str(body, "segment") || "all" }) });
  }
  if (path[0] === "cash" && method === "GET") return ok({ session: sessionSummary(), history: listClosedSessions() });
  if (path[0] === "cash" && method === "POST") {
    const body = await readBody(request);
    const action = str(body, "action");
    if (action === "open") return ok(openCash(num(body, "amountCents") ?? 0, user.name, str(body, "notes")));
    if (action === "in" || action === "out") return ok(moveCash(action, num(body, "amountCents") ?? 0, str(body, "description")));
    if (action === "close") return ok(closeCash(num(body, "amountCents") ?? 0, str(body, "notes")));
    return fail("Ação inválida");
  }
  if (path[0] === "delivery" && method === "GET") return ok({ couriers: listCouriers(), zones: listZones(), orders: listOrders().filter((order) => order.fulfillment === "delivery" && order.status !== "cancelled" && order.status !== "done") });
  if (path[0] === "delivery" && method === "POST") {
    const body = await readBody(request);
    if (str(body, "entity") === "zone") {
      if (str(body, "action") === "delete") { deleteZone(str(body, "id")); return ok({ ok: true }); }
      return ok({ id: saveZone({ id: str(body, "id") || undefined, name: str(body, "name"), feeCents: num(body, "feeCents") ?? 0, etaMin: num(body, "etaMin") ?? 30, etaMax: num(body, "etaMax") ?? 60, active: body.active !== false }) });
    }
    return ok({ id: saveCourier({ id: str(body, "id") || undefined, name: str(body, "name"), phone: str(body, "phone"), vehicle: str(body, "vehicle"), active: body.active !== false }) });
  }
  if (path[0] === "reports" && method === "GET") {
    const range = url.searchParams.get("range");
    return ok(buildReport(range === "30d" || range === "today" ? range : "7d"));
  }
  if (path[0] === "settings" && method === "GET") return ok(settingsView(origin));
  if (path[0] === "settings" && method === "PATCH") {
    const body = await readBody(request);
    if (typeof body.pauseMode === "string") return ok(applyPause(body.pauseMode as "30" | "60" | "tomorrow" | "close" | "open"));
    if (Array.isArray(body.hours)) {
      saveHours(body.hours as { weekday: number; open: string; close: string; closed: boolean }[]);
    }
    const config = getConfig();
    const textKeys = ["name", "slug", "phone", "address", "city", "description", "pixKey", "pixHolder", "attendantName", "attendantPersonality", "recoveryMessage", "evolutionUrl", "evolutionInstance"] as const;
    for (const key of textKeys) if (typeof body[key] === "string") (config[key] as string) = str(body, key).trim();
    if (config.slug) config.slug = config.slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!config.name.trim() || !config.slug) throw new HttpError("Nome e link da loja são obrigatórios");
    config.cashbackPercent = Math.min(50, Math.max(0, config.cashbackPercent));
    config.prepMinutes = Math.min(180, Math.max(5, config.prepMinutes));
    const numberKeys = ["prepMinutes", "minOrderCents", "deliveryFeeCents", "cashbackPercent", "pointsPerReal", "rewardPoints", "rewardCents", "recoveryMinutes"] as const;
    for (const key of numberKeys) if (typeof body[key] === "number") config[key] = num(body, key) ?? config[key];
    const boolKeys = ["attendantEnabled", "loyaltyEnabled", "recoveryEnabled"] as const;
    for (const key of boolKeys) if (typeof body[key] === "boolean") config[key] = Boolean(body[key]);
    if (body.clearEvolutionKey === true) config.evolutionKey = "";
    else if (str(body, "evolutionKey")) config.evolutionKey = str(body, "evolutionKey").trim();
    if (body.clearOpenaiKey === true) config.openaiKey = "";
    else if (str(body, "openaiKey")) config.openaiKey = str(body, "openaiKey").trim();
    updateConfig(config);
    return ok(settingsView(origin));
  }
  if (path[0] === "whatsapp" && method === "GET") return ok(await connectionSnapshot());
  if (path[0] === "whatsapp" && method === "POST") {
    const body = await readBody(request);
    if (str(body, "action") === "logout") return ok(await logoutInstance());
    if (str(body, "action") === "status") return ok(await connectionSnapshot());
    return ok(await connectInstance(origin));
  }
  if (path[0] === "attendant" && path[1] === "test" && method === "POST") {
    const body = await readBody(request);
    return ok(await testAttendant(str(body, "text"), origin));
  }
  return fail("Rota não encontrada", 404);
}

async function dispatch(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    return await handle(request.method, path, request);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
