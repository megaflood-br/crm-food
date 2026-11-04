import type { HourDTO, StoreConfig } from "@/lib/types";
import { addIsoDays, isOpen, todayBounds, zonedTimeToUtc } from "@/lib/time";
import { parseJson } from "@/lib/format";
import { getDb } from "./db";
import { defaultConfig } from "./db";

export type EvolutionRuntime = { state: string; qr: string | null; updatedAt: string | null };

export function getConfig(): StoreConfig {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'config'").get() as { value: string } | undefined;
  return { ...defaultConfig(), ...parseJson(row?.value, {}) };
}

export function saveConfig(config: StoreConfig) {
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(config));
  return config;
}

export function updateConfig(patch: Partial<StoreConfig>) {
  return saveConfig({ ...getConfig(), ...patch });
}

export function getRuntime(): EvolutionRuntime {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'evolution_runtime'").get() as { value: string } | undefined;
  const parsed = parseJson<Partial<EvolutionRuntime>>(row?.value, {});
  return { state: parsed.state ?? "disconnected", qr: parsed.qr ?? null, updatedAt: parsed.updatedAt ?? null };
}

export function saveRuntime(patch: Partial<EvolutionRuntime>) {
  const next = { ...getRuntime(), ...patch, updatedAt: new Date().toISOString() };
  getDb().prepare("INSERT INTO settings (key, value) VALUES ('evolution_runtime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(next));
  return next;
}

export function listHours(): HourDTO[] {
  const rows = getDb().prepare("SELECT weekday, open_time, close_time, closed FROM hours ORDER BY weekday").all() as Array<{
    weekday: number; open_time: string; close_time: string; closed: number;
  }>;
  return rows.map((row) => ({ weekday: row.weekday, open: row.open_time, close: row.close_time, closed: row.closed === 1 }));
}

export function saveHours(hours: HourDTO[]) {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO hours (weekday, open_time, close_time, closed) VALUES (?, ?, ?, ?) ON CONFLICT(weekday) DO UPDATE SET open_time = excluded.open_time, close_time = excluded.close_time, closed = excluded.closed");
  const write = db.transaction(() => {
    for (const hour of hours) {
      if (!/^\d{2}:\d{2}$/.test(hour.open) || !/^\d{2}:\d{2}$/.test(hour.close)) {
        throw new Error("Horário inválido");
      }
      stmt.run(hour.weekday, hour.open, hour.close, hour.closed ? 1 : 0);
    }
  });
  write();
  return listHours();
}

export function storefrontState(now = new Date()) {
  const config = getConfig();
  const hours = listHours();
  const clock = isOpen(now, hours);
  if (config.forceClosed) return { accepting: false, reason: "A loja está fechada.", label: clock.label, hours };
  if (config.pausedUntil && new Date(config.pausedUntil).getTime() > now.getTime()) {
    return { accepting: false, reason: `Pedidos pausados até ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(config.pausedUntil))}.`, label: clock.label, hours };
  }
  if (!clock.open) return { accepting: false, reason: clock.nextLabel, label: clock.label, hours };
  return { accepting: true, reason: null, label: clock.nextLabel, hours };
}

export function effectiveEvolution() {
  const config = getConfig();
  const url = config.evolutionUrl || process.env.EVOLUTION_URL || "";
  const key = config.evolutionKey || process.env.EVOLUTION_API_KEY || "";
  const instance = config.evolutionInstance || process.env.EVOLUTION_INSTANCE || "brasa";
  return { url: url.replace(/\/$/, ""), key, instance };
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function applyPause(mode: "30" | "60" | "tomorrow" | "close" | "open") {
  const config = getConfig();
  if (mode === "30" || mode === "60") {
    config.pausedUntil = new Date(Date.now() + Number(mode) * 60 * 1000).toISOString();
    config.forceClosed = false;
  } else if (mode === "tomorrow") {
    config.pausedUntil = zonedTimeToUtc(addIsoDays(todayBounds().isoDate, 1), 0, 0).toISOString();
    config.forceClosed = false;
  } else if (mode === "close") {
    config.forceClosed = true;
    config.pausedUntil = null;
  } else {
    config.forceClosed = false;
    config.pausedUntil = null;
  }
  saveConfig(config);
  return storefrontState();
}
