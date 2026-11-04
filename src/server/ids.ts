import { randomBytes } from "crypto";

export function nid(prefix?: string) {
  const id = randomBytes(9).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso() {
  return new Date().toISOString();
}
