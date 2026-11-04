import type { CouponDTO } from "@/lib/types";
import { brl } from "@/lib/format";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid } from "./ids";

type CouponRow = {
  id: string; code: string; description: string; kind: "percent" | "fixed"; value: number; min_cents: number;
  max_uses: number | null; used: number; active: number; recovery: number; expires_at: string | null;
};

function mapCoupon(row: CouponRow): CouponDTO {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    value: row.value,
    minCents: row.min_cents,
    maxUses: row.max_uses,
    used: row.used,
    active: row.active === 1,
    recovery: row.recovery === 1,
    expiresAt: row.expires_at,
  };
}

export function listCoupons() {
  return (getDb().prepare("SELECT * FROM coupons ORDER BY active DESC, code").all() as CouponRow[]).map(mapCoupon);
}

export function getCouponByCode(code: string) {
  const row = getDb().prepare("SELECT * FROM coupons WHERE upper(code) = upper(?)").get(code.trim()) as CouponRow | undefined;
  return row ? mapCoupon(row) : null;
}

export function quoteCoupon(code: string, subtotalCents: number) {
  const coupon = getCouponByCode(code);
  if (!coupon || !coupon.active) throw new HttpError("Cupom inválido");
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) throw new HttpError("Cupom vencido");
  if (coupon.maxUses != null && coupon.used >= coupon.maxUses) throw new HttpError("Cupom esgotado");
  if (subtotalCents < coupon.minCents) throw new HttpError(`Cupom válido a partir de ${brl(coupon.minCents)}`);
  const discountCents = coupon.kind === "percent" ? Math.round(subtotalCents * coupon.value / 100) : Math.min(coupon.value, subtotalCents);
  return { code: coupon.code, discountCents };
}

export function consumeCoupon(code: string) {
  getDb().prepare("UPDATE coupons SET used = used + 1 WHERE upper(code) = upper(?)").run(code);
}

export function releaseCoupon(code: string) {
  getDb().prepare("UPDATE coupons SET used = max(0, used - 1) WHERE upper(code) = upper(?)").run(code);
}

export function saveCoupon(input: {
  id?: string; code: string; description?: string; kind: "percent" | "fixed"; value: number; minCents?: number;
  maxUses?: number | null; active?: boolean; recovery?: boolean; expiresAt?: string | null;
}) {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new HttpError("Código do cupom: 3 a 20 letras ou números");
  if (input.kind === "percent" && (input.value < 1 || input.value > 90)) throw new HttpError("Percentual entre 1 e 90");
  if (input.kind === "fixed" && input.value < 1) throw new HttpError("Valor do cupom inválido");
  const fields = [code, input.description?.trim() ?? "", input.kind, input.value, input.minCents ?? 0, input.maxUses ?? null, input.active === false ? 0 : 1, input.recovery ? 1 : 0, input.expiresAt || null];
  if (input.id) {
    getDb().prepare("UPDATE coupons SET code = ?, description = ?, kind = ?, value = ?, min_cents = ?, max_uses = ?, active = ?, recovery = ?, expires_at = ? WHERE id = ?").run(...fields, input.id);
    return input.id;
  }
  const id = nid("cp");
  getDb().prepare("INSERT INTO coupons (id, code, description, kind, value, min_cents, max_uses, used, active, recovery, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)").run(id, ...fields);
  return id;
}

export function recoveryCoupon() {
  const row = getDb().prepare("SELECT * FROM coupons WHERE recovery = 1 AND active = 1 ORDER BY used ASC LIMIT 1").get() as CouponRow | undefined;
  return row ? mapCoupon(row) : null;
}
