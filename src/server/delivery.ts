import type { CourierDTO, ZoneDTO } from "@/lib/types";
import { normalizePhone } from "@/lib/format";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid } from "./ids";

export function listCouriers(): CourierDTO[] {
  const rows = getDb().prepare("SELECT * FROM couriers ORDER BY active DESC, name").all() as Array<{ id: string; name: string; phone: string; vehicle: string; active: number }>;
  return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, vehicle: row.vehicle, active: row.active === 1 }));
}

export function saveCourier(input: { id?: string; name: string; phone?: string; vehicle?: string; active?: boolean }) {
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError("Dê um nome para o motoboy");
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const vehicle = input.vehicle?.trim() || "moto";
  const active = input.active === false ? 0 : 1;
  if (input.id) {
    const result = getDb().prepare("UPDATE couriers SET name = ?, phone = ?, vehicle = ?, active = ? WHERE id = ?").run(name, phone, vehicle, active, input.id);
    if (!result.changes) throw new HttpError("Motoboy não encontrado", 404);
    return input.id;
  }
  const id = nid("k");
  getDb().prepare("INSERT INTO couriers (id, name, phone, vehicle, active) VALUES (?, ?, ?, ?, ?)").run(id, name, phone, vehicle, active);
  return id;
}

export function listZones(): ZoneDTO[] {
  const rows = getDb().prepare("SELECT * FROM zones ORDER BY name").all() as Array<{ id: string; name: string; fee_cents: number; eta_min: number; eta_max: number; active: number }>;
  return rows.map((row) => ({ id: row.id, name: row.name, feeCents: row.fee_cents, etaMin: row.eta_min, etaMax: row.eta_max, active: row.active === 1 }));
}

export function saveZone(input: { id?: string; name: string; feeCents: number; etaMin: number; etaMax: number; active?: boolean }) {
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError("Dê um nome para a área");
  if (!Number.isInteger(input.feeCents) || input.feeCents < 0) throw new HttpError("Taxa inválida");
  const active = input.active === false ? 0 : 1;
  if (input.id) {
    const result = getDb().prepare("UPDATE zones SET name = ?, fee_cents = ?, eta_min = ?, eta_max = ?, active = ? WHERE id = ?").run(name, input.feeCents, input.etaMin, input.etaMax, active, input.id);
    if (!result.changes) throw new HttpError("Área não encontrada", 404);
    return input.id;
  }
  const id = nid("z");
  getDb().prepare("INSERT INTO zones (id, name, fee_cents, eta_min, eta_max, active) VALUES (?, ?, ?, ?, ?, ?)").run(id, name, input.feeCents, input.etaMin, input.etaMax, active);
  return id;
}

export function deleteZone(id: string) {
  getDb().prepare("DELETE FROM zones WHERE id = ?").run(id);
}

export function deliveryFeeFor(zoneId?: string) {
  if (!zoneId) return null;
  const zone = listZones().find((item) => item.id === zoneId && item.active);
  if (!zone) throw new HttpError("Área de entrega inválida");
  return zone;
}
