import { TIME_ZONE } from "./constants";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(input: string) {
  let d = digits(input);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

export function formatPhone(input: string) {
  const d = digits(input);
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return input;
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export function weekdayName(day: number) {
  return ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][day] ?? "";
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    analysis: "Em análise",
    preparing: "Em preparo",
    ready: "Pronto",
    delivering: "Em entrega",
    done: "Finalizado",
    cancelled: "Cancelado",
    bot: "Lia",
    human: "Equipe",
    closed: "Encerrada",
    delivery: "Entrega",
    pickup: "Retirada",
    table: "Mesa",
    counter: "Balcão",
    whatsapp: "WhatsApp",
    menu: "Cardápio",
    pix: "Pix",
    cash: "Dinheiro",
    card_delivery: "Cartão na entrega",
    card_online: "Cartão online",
    pending: "A receber",
    paid: "Pago",
    refunded: "Estornado",
  };
  return labels[status] ?? status;
}

export function emptyDraft(): { items: [] } {
  return { items: [] };
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
