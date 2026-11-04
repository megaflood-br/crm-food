import type { CustomerDTO } from "@/lib/types";
import { getConfig } from "./config";
import { addMessage, ensureConversation } from "./conversations";
import { recoveryCoupon } from "./coupons";
import { getCustomer, listCustomers } from "./customers";
import { getDb } from "./db";
import { sendText } from "./evolution";
import { HttpError } from "./http";
import { nid, nowIso } from "./ids";

export type CampaignDTO = {
  id: string;
  name: string;
  message: string;
  segment: string;
  status: string;
  sentCount: number;
  createdAt: string;
  sentAt: string | null;
};

function map(row: { id: string; name: string; message: string; segment: string; status: string; sent_count: number; created_at: string; sent_at: string | null }): CampaignDTO {
  return { id: row.id, name: row.name, message: row.message, segment: row.segment, status: row.status, sentCount: row.sent_count, createdAt: row.created_at, sentAt: row.sent_at };
}

export function listCampaigns() {
  return (getDb().prepare("SELECT * FROM campaigns ORDER BY created_at DESC").all() as Array<{ id: string; name: string; message: string; segment: string; status: string; sent_count: number; created_at: string; sent_at: string | null }>).map(map);
}

export function saveCampaign(input: { name: string; message: string; segment: string }) {
  const name = input.name.trim();
  const message = input.message.trim();
  if (name.length < 2 || message.length < 5) throw new HttpError("Dê nome e texto ao disparo");
  const segment = ["all", "inactive", "vip", "never"].includes(input.segment) ? input.segment : "all";
  const id = nid("cmp");
  getDb().prepare("INSERT INTO campaigns (id, name, message, segment, status, sent_count, created_at, sent_at) VALUES (?, ?, ?, ?, 'draft', 0, ?, null)").run(id, name, message, segment, nowIso());
  return id;
}

export function audience(segment: string) {
  const now = Date.now();
  return listCustomers().filter((customer) => {
    if (customer.blocked || customer.noCampaign || customer.hidden) return false;
    if (segment === "vip") return customer.tags.includes("vip");
    if (segment === "never") return customer.ordersCount === 0;
    if (segment === "inactive") {
      if (!customer.lastOrderAt) return true;
      return now - new Date(customer.lastOrderAt).getTime() > 30 * 24 * 3600 * 1000;
    }
    return true;
  });
}

function render(template: string, customer: CustomerDTO, origin: string, coupon = "") {
  const config = getConfig();
  return template
    .replaceAll("{nome}", customer.name.split(" ")[0] || customer.name)
    .replaceAll("{loja}", config.name)
    .replaceAll("{cupom}", coupon)
    .replaceAll("{link}", `${origin}/cardapio/${config.slug}`);
}

async function push(customer: CustomerDTO, text: string, author: string) {
  const conversationId = ensureConversation(customer.id);
  const sent = await sendText(customer.phone, text);
  addMessage({ conversationId, direction: "out", body: text, author, status: sent.delivered ? "sent" : sent.error ? "failed" : "local" });
  return sent.delivered;
}

export async function sendCampaign(id: string, origin: string) {
  const campaign = listCampaigns().find((item) => item.id === id);
  if (!campaign) throw new HttpError("Disparo não encontrado", 404);
  if (campaign.status === "sent") throw new HttpError("Esse disparo já foi enviado");
  const coupon = recoveryCoupon();
  const people = audience(campaign.segment);
  let sent = 0;
  for (const customer of people) {
    await push(customer, render(campaign.message, customer, origin, coupon?.code ?? ""), "campaign");
    sent += 1;
  }
  getDb().prepare("UPDATE campaigns SET status = 'sent', sent_count = ?, sent_at = ? WHERE id = ?").run(sent, nowIso(), id);
  return { sent, simulated: !getConfig().evolutionUrl && !process.env.EVOLUTION_URL };
}

export async function sweepRecovery(origin: string) {
  const config = getConfig();
  if (!config.recoveryEnabled) return { sent: 0 };
  const cutoff = new Date(Date.now() - config.recoveryMinutes * 60 * 1000).toISOString();
  const rows = getDb().prepare(`SELECT conversations.id, customers.id AS customer_id
    FROM conversations JOIN customers ON customers.id = conversations.customer_id
    WHERE conversations.status = 'bot' AND conversations.recovery_sent = 0 AND conversations.last_message_at < ?
      AND customers.hidden = 0 AND customers.blocked = 0 AND customers.no_campaign = 0`).all(cutoff) as Array<{ id: string; customer_id: string }>;
  const coupon = recoveryCoupon();
  let sent = 0;
  for (const row of rows) {
    const last = getDb().prepare("SELECT author FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(row.id) as { author: string } | undefined;
    if (last?.author !== "bot") continue;
    const recent = getDb().prepare("SELECT id FROM orders WHERE customer_id = ? AND created_at >= ? AND status != 'cancelled'").get(row.customer_id, cutoff);
    if (recent) continue;
    const claim = getDb().prepare("UPDATE conversations SET recovery_sent = 1 WHERE id = ? AND recovery_sent = 0").run(row.id);
    if (!claim.changes) continue;
    const customer = getCustomer(row.customer_id);
    if (!customer || customer.hidden || customer.blocked || customer.noCampaign) continue;
    await push(customer, render(config.recoveryMessage, customer, origin, coupon?.code ?? "VOLTA15"), "bot");
    sent += 1;
  }
  return { sent };
}
