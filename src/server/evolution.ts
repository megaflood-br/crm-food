import { normalizePhone } from "@/lib/format";
import { effectiveEvolution, getConfig, saveRuntime } from "./config";
import { HttpError } from "./http";

async function evo(pathname: string, init?: RequestInit) {
  const config = effectiveEvolution();
  if (!config.url || !config.key) throw new HttpError("Configure a URL e a chave da Evolution API");
  const response = await fetch(`${config.url}${pathname}`, {
    ...init,
    headers: {
      apikey: config.key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : text.slice(0, 400);
    throw new HttpError(message || `Evolution respondeu ${response.status}`, 502);
  }
  return body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function extractState(body: unknown) {
  const record = asRecord(body);
  const instance = asRecord(record?.instance);
  const state = record?.state ?? instance?.state ?? record?.status;
  return typeof state === "string" ? state : "";
}

export function extractQr(body: unknown) {
  const record = asRecord(body);
  const nested = asRecord(record?.qrcode);
  const value = nested?.base64 ?? record?.base64 ?? record?.qrcode;
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

function extractWaId(body: unknown) {
  const record = asRecord(body);
  const key = asRecord(record?.key);
  return typeof key?.id === "string" ? key.id : undefined;
}

export async function sendText(number: string, text: string) {
  const config = effectiveEvolution();
  if (!config.url || !config.key || !config.instance) return { delivered: false as const };
  try {
    const body = await evo(`/message/sendText/${encodeURIComponent(config.instance)}`, {
      method: "POST",
      body: JSON.stringify({ number: normalizePhone(number), text }),
    });
    return { delivered: true as const, waId: extractWaId(body) };
  } catch (error) {
    return { delivered: false as const, error: error instanceof Error ? error.message : "Falha ao enviar" };
  }
}

export async function connectionSnapshot() {
  const config = effectiveEvolution();
  if (!config.url || !config.key) return { state: "unconfigured", qr: null as string | null };
  try {
    const body = await evo(`/instance/connectionState/${encodeURIComponent(config.instance)}`);
    const state = extractState(body) || "connecting";
    saveRuntime({ state, qr: state === "open" ? null : undefined });
    return { state, qr: state === "open" ? null : undefined };
  } catch {
    return { state: "disconnected", qr: null as string | null };
  }
}

export async function connectInstance(origin: string) {
  const config = effectiveEvolution();
  if (!config.url || !config.key) throw new HttpError("Salve a URL e a chave da Evolution antes de conectar");
  try {
    await evo("/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName: config.instance, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unauthorized") || message.includes("apikey") || message.includes("api key")) throw error;
  }
  const hook = `${origin}/api/webhooks/evolution?token=${encodeURIComponent(getConfig().webhookToken)}`;
  const webhook = {
    enabled: true,
    url: hook,
    webhookByEvents: false,
    webhookBase64: false,
    events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
  };
  try {
    await evo(`/webhook/set/${encodeURIComponent(config.instance)}`, { method: "POST", body: JSON.stringify(webhook) });
  } catch {
    await evo(`/webhook/set/${encodeURIComponent(config.instance)}`, { method: "POST", body: JSON.stringify({ webhook }) });
  }
  const qrBody = await evo(`/instance/connect/${encodeURIComponent(config.instance)}`);
  const qr = extractQr(qrBody);
  const state = extractState(qrBody) || "connecting";
  saveRuntime({ state, qr });
  return { state, qr, webhook: hook };
}

export async function logoutInstance() {
  const config = effectiveEvolution();
  if (!config.url || !config.key) throw new HttpError("Evolution API não configurada");
  await evo(`/instance/logout/${encodeURIComponent(config.instance)}`, { method: "DELETE" });
  saveRuntime({ state: "close", qr: null });
  return { state: "close" };
}
