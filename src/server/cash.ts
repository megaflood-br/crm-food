import { brl } from "@/lib/format";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid, nowIso } from "./ids";

export function openSession() {
  return getDb().prepare("SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1").get() as {
    id: string; opened_at: string; opening_cents: number; notes: string; user_name: string;
  } | undefined;
}

export function listMovements(sessionId: string) {
  return getDb().prepare("SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at DESC").all(sessionId) as Array<{
    id: string; kind: string; amount_cents: number; description: string; order_id: string | null; created_at: string;
  }>;
}

export function sessionSummary() {
  const session = openSession();
  if (!session) return { open: false as const };
  const movements = listMovements(session.id);
  const sales = movements.filter((item) => item.kind === "sale").reduce((sum, item) => sum + item.amount_cents, 0);
  const entries = movements.filter((item) => item.kind === "in").reduce((sum, item) => sum + item.amount_cents, 0);
  const exits = movements.filter((item) => item.kind === "out").reduce((sum, item) => sum + item.amount_cents, 0);
  return {
    open: true as const,
    id: session.id,
    openedAt: session.opened_at,
    openingCents: session.opening_cents,
    userName: session.user_name,
    salesCents: sales,
    entriesCents: entries,
    exitsCents: exits,
    expectedCents: session.opening_cents + sales + entries - exits,
    movements: movements.map((item) => ({
      id: item.id,
      kind: item.kind,
      amountCents: item.amount_cents,
      description: item.description,
      orderId: item.order_id,
      createdAt: item.created_at,
    })),
  };
}

export function listClosedSessions() {
  const rows = getDb().prepare("SELECT * FROM cash_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 20").all() as Array<{
    id: string; opened_at: string; closed_at: string; opening_cents: number; closing_cents: number; notes: string; user_name: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCents: row.opening_cents,
    closingCents: row.closing_cents,
    notes: row.notes,
    userName: row.user_name,
  }));
}

export function openCash(amountCents: number, userName: string, notes = "") {
  if (openSession()) throw new HttpError("Já existe um caixa aberto");
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new HttpError("Valor de abertura inválido");
  const id = nid("cash");
  getDb().prepare("INSERT INTO cash_sessions (id, opened_at, closed_at, opening_cents, closing_cents, notes, user_name) VALUES (?, ?, null, ?, null, ?, ?)").run(id, nowIso(), amountCents, notes, userName);
  return sessionSummary();
}

export function moveCash(kind: "in" | "out", amountCents: number, description: string) {
  const session = openSession();
  if (!session) throw new HttpError("Abra o caixa antes de lançar");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpError("Valor inválido");
  if (!description.trim()) throw new HttpError("Descreva o lançamento");
  getDb().prepare("INSERT INTO cash_movements (id, session_id, kind, amount_cents, description, order_id, created_at) VALUES (?, ?, ?, ?, ?, null, ?)").run(nid("mov"), session.id, kind, amountCents, description.trim(), nowIso());
  return sessionSummary();
}

export function closeCash(countedCents: number, notes = "") {
  const session = openSession();
  if (!session) throw new HttpError("Não há caixa aberto");
  if (!Number.isInteger(countedCents) || countedCents < 0) throw new HttpError("Valor contado inválido");
  const summary = sessionSummary();
  getDb().prepare("UPDATE cash_sessions SET closed_at = ?, closing_cents = ?, notes = ? WHERE id = ?").run(nowIso(), countedCents, notes, session.id);
  return { countedCents, expectedCents: summary.open ? summary.expectedCents : 0, differenceCents: countedCents - (summary.open ? summary.expectedCents : 0) };
}

export function postOrderCash(orderId: string, amountCents: number, description: string, kind: "sale" | "out" = "sale") {
  const session = openSession();
  if (!session || amountCents <= 0) return false;
  const existing = getDb().prepare("SELECT id FROM cash_movements WHERE order_id = ? AND kind = ? AND session_id = ?").get(orderId, kind, session.id);
  if (existing && kind === "sale") return false;
  getDb().prepare("INSERT INTO cash_movements (id, session_id, kind, amount_cents, description, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    nid("mov"), session.id, kind, amountCents, description, orderId, nowIso(),
  );
  return true;
}

export function moneyLabel(cents: number) {
  return brl(cents);
}
