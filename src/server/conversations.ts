import type { ConversationDTO, Draft, MessageDTO } from "@/lib/types";
import { emptyDraft, parseJson } from "@/lib/format";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid, nowIso } from "./ids";

type ConversationRow = {
  id: string;
  customer_id: string;
  status: "bot" | "human" | "closed";
  unread: number;
  draft_json: string;
  recovery_sent: number;
  last_message_at: string;
  last_preview: string;
  customer_name: string;
  customer_phone: string;
  blocked: number;
};

function mapConversation(row: ConversationRow): ConversationDTO {
  const draft = parseJson<Draft>(row.draft_json, emptyDraft());
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    blocked: row.blocked === 1,
    status: row.status,
    unread: row.unread,
    draft: { items: draft.items ?? [], fulfillment: draft.fulfillment, address: draft.address, tableName: draft.tableName, payment: draft.payment, notes: draft.notes, couponCode: draft.couponCode },
    lastMessageAt: row.last_message_at,
    lastPreview: row.last_preview,
  };
}

export function listConversations() {
  const rows = getDb().prepare(`SELECT conversations.*, customers.name AS customer_name, customers.phone AS customer_phone, customers.blocked
    FROM conversations JOIN customers ON customers.id = conversations.customer_id
    WHERE customers.hidden = 0
    ORDER BY conversations.last_message_at DESC LIMIT 100`).all() as ConversationRow[];
  return rows.map(mapConversation);
}

export function getConversation(id: string) {
  const row = getDb().prepare(`SELECT conversations.*, customers.name AS customer_name, customers.phone AS customer_phone, customers.blocked
    FROM conversations JOIN customers ON customers.id = conversations.customer_id
    WHERE conversations.id = ?`).get(id) as ConversationRow | undefined;
  return row ? mapConversation(row) : null;
}

export function listMessages(conversationId: string): MessageDTO[] {
  const rows = getDb().prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC").all(conversationId) as Array<{
    id: string; direction: "in" | "out"; body: string; kind: string; status: string; author: string; created_at: string;
  }>;
  return rows.map((row) => ({ id: row.id, direction: row.direction, body: row.body, kind: row.kind, status: row.status, author: row.author, createdAt: row.created_at }));
}

export function ensureConversation(customerId: string) {
  const existing = getDb().prepare("SELECT id FROM conversations WHERE customer_id = ? ORDER BY last_message_at DESC LIMIT 1").get(customerId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = nid("cv");
  getDb().prepare(`INSERT INTO conversations (id, customer_id, status, unread, draft_json, recovery_sent, last_message_at, last_preview)
    VALUES (?, ?, 'bot', 0, ?, 0, ?, '')`).run(id, customerId, JSON.stringify(emptyDraft()), nowIso());
  return id;
}

export function saveDraft(conversationId: string, draft: Draft) {
  const result = getDb().prepare("UPDATE conversations SET draft_json = ? WHERE id = ?").run(JSON.stringify({ ...emptyDraft(), ...draft, items: draft.items ?? [] }), conversationId);
  if (!result.changes) throw new HttpError("Conversa não encontrada", 404);
  return getConversation(conversationId);
}

export function setConversationStatus(conversationId: string, status: "bot" | "human" | "closed") {
  const result = getDb().prepare("UPDATE conversations SET status = ? WHERE id = ?").run(status, conversationId);
  if (!result.changes) throw new HttpError("Conversa não encontrada", 404);
  return getConversation(conversationId);
}

export function markRead(conversationId: string) {
  getDb().prepare("UPDATE conversations SET unread = 0 WHERE id = ?").run(conversationId);
  return getConversation(conversationId);
}

export function addMessage(input: {
  conversationId: string;
  direction: "in" | "out";
  body: string;
  kind?: string;
  waId?: string | null;
  status?: string;
  author: string;
}) {
  if (input.waId) {
    const duplicate = getDb().prepare("SELECT id FROM messages WHERE wa_id = ?").get(input.waId) as { id: string } | undefined;
    if (duplicate) return duplicate.id;
  }
  const id = nid("msg");
  const created = nowIso();
  getDb().prepare(`INSERT INTO messages (id, conversation_id, direction, body, kind, wa_id, status, author, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.conversationId, input.direction, input.body, input.kind ?? "text", input.waId ?? null, input.status ?? "local", input.author, created,
  );
  getDb().prepare(`UPDATE conversations SET
    unread = CASE WHEN ? = 'in' THEN unread + 1 ELSE unread END,
    recovery_sent = CASE WHEN ? = 'in' THEN 0 ELSE recovery_sent END,
    last_message_at = ?,
    last_preview = ?
    WHERE id = ?`).run(input.direction, input.direction, created, input.body.slice(0, 140), input.conversationId);
  return id;
}

export function hasWaMessage(waId: string) {
  return Boolean(getDb().prepare("SELECT id FROM messages WHERE wa_id = ?").get(waId));
}

export function updateMessageStatus(waId: string, status: string) {
  getDb().prepare("UPDATE messages SET status = ? WHERE wa_id = ?").run(status, waId);
}

export function unreadCount() {
  const row = getDb().prepare("SELECT coalesce(sum(unread), 0) AS c FROM conversations").get() as { c: number };
  return row.c;
}
