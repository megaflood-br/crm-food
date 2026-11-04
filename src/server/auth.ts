import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/constants";
import { getDb } from "./db";
import { nid, nowIso } from "./ids";
import { HttpError } from "./http";

export type SessionUser = { id: string; name: string; email: string; role: string };

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const current = Buffer.from(hash, "hex");
  if (next.length !== current.length) return false;
  return timingSafeEqual(next, current);
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb().prepare(`SELECT users.id, users.name, users.email, users.role, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?`).get(token) as
    | { id: string; name: string; email: string; role: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export function login(email: string, password: string) {
  const row = getDb().prepare("SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = lower(?)").get(email.trim()) as
    | { id: string; name: string; email: string; role: string; password_hash: string }
    | undefined;
  if (!row || !checkPassword(password, row.password_hash)) throw new HttpError("E-mail ou senha incorretos", 401);
  const token = randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  getDb().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, row.id, expires);
  return { token, expires, user: { id: row.id, name: row.name, email: row.email, role: row.role } satisfies SessionUser };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(SESSION_COOKIE);
}

export function changePassword(userId: string, current: string, next: string) {
  if (next.trim().length < 8) throw new HttpError("A nova senha precisa ter pelo menos 8 caracteres");
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  if (!row || !checkPassword(current, row.password_hash)) throw new HttpError("Senha atual incorreta", 401);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next.trim()), userId);
  return { ok: true, at: nowIso() };
}

export async function createSessionCookie(token: string, expires: string, secure = false) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(expires),
  });
}

export { nid };
