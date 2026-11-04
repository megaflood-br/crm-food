import { timingSafeEqual } from "crypto";
import { getConfig, saveRuntime } from "./config";
import { hasWaMessage, updateMessageStatus } from "./conversations";
import { onCustomerMessage } from "./attendant";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function normalizeEvent(event: unknown) {
  return String(event ?? "").toLowerCase().replace(/_/g, ".");
}

export function webhookAuthorized(token: string | null) {
  const expected = getConfig().webhookToken;
  if (!token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function messageText(message: Record<string, unknown> | null) {
  if (!message) return { text: "", kind: "unknown" };
  if (typeof message.conversation === "string") return { text: message.conversation, kind: "text" };
  const extended = record(message.extendedTextMessage);
  if (typeof extended?.text === "string") return { text: extended.text, kind: "text" };
  const image = record(message.imageMessage);
  if (image) return { text: typeof image.caption === "string" && image.caption ? image.caption : "[imagem]", kind: "image" };
  if (message.audioMessage) return { text: "[áudio]", kind: "audio" };
  if (message.stickerMessage) return { text: "[figurinha]", kind: "sticker" };
  const video = record(message.videoMessage);
  if (video) return { text: typeof video.caption === "string" && video.caption ? video.caption : "[vídeo]", kind: "video" };
  const document = record(message.documentMessage);
  if (document) return { text: typeof document.fileName === "string" ? document.fileName : "[documento]", kind: "document" };
  return { text: "[mensagem]", kind: "unknown" };
}

function statusName(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("read") || raw === "4" || raw === "played") return "read";
  if (raw.includes("delivery") || raw === "3") return "delivered";
  if (raw.includes("server") || raw === "2") return "sent";
  return "";
}

export async function ingestEvolution(payload: unknown, origin: string) {
  const body = record(payload);
  if (!body) return { ok: true };
  const event = normalizeEvent(body.event);
  const data = body.data;
  if (event === "qrcode.updated") {
    const dataRecord = record(data);
    const qrRecord = record(dataRecord?.qrcode);
    const qr = qrRecord?.base64 ?? dataRecord?.base64;
    if (typeof qr === "string") saveRuntime({ state: "qr", qr: qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}` });
    return { ok: true };
  }
  if (event === "connection.update") {
    const dataRecord = record(data);
    const state = typeof dataRecord?.state === "string" ? dataRecord.state : "connecting";
    saveRuntime({ state, qr: state === "open" ? null : undefined });
    return { ok: true };
  }
  if (event === "messages.update") {
    for (const entry of Array.isArray(data) ? data : [data]) {
      const item = record(entry);
      const key = record(item?.key);
      const id = typeof key?.id === "string" ? key.id : "";
      const status = statusName(item?.status ?? item?.update);
      if (id && status) updateMessageStatus(id, status);
    }
    return { ok: true };
  }
  if (event !== "messages.upsert") return { ok: true, ignored: event };
  const entries = Array.isArray(data) ? data : [data];
  for (const entry of entries) {
    const item = record(entry);
    if (!item) continue;
    const key = record(item.key);
    const remote = typeof key?.remoteJid === "string" ? key.remoteJid : "";
    if (!remote || remote.endsWith("@g.us") || remote === "status@broadcast") continue;
    const waId = typeof key?.id === "string" ? key.id : undefined;
    if (waId && hasWaMessage(waId)) continue;
    const parsed = messageText(record(item.message));
    await onCustomerMessage({
      phone: remote.split("@")[0] ?? "",
      pushName: typeof item.pushName === "string" ? item.pushName : undefined,
      text: parsed.text,
      kind: parsed.kind,
      waId,
      origin,
      fromMe: key?.fromMe === true,
    });
  }
  return { ok: true };
}
