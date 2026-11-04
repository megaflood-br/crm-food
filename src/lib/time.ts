import { TIME_ZONE } from "./constants";
import { weekdayName } from "./format";

export function zonedParts(date = new Date(), timeZone = TIME_ZONE) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour === "24" ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function offsetAt(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(isoDate: string, hour: number, minute: number, timeZone = TIME_ZONE) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const first = guess - offsetAt(new Date(guess), timeZone);
  return new Date(guess - offsetAt(new Date(first), timeZone));
}

export function addIsoDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function todayBounds(now = new Date()) {
  const parts = zonedParts(now);
  const start = zonedTimeToUtc(parts.isoDate, 0, 0);
  const end = zonedTimeToUtc(addIsoDays(parts.isoDate, 1), 0, 0);
  return { start: start.toISOString(), end: end.toISOString(), isoDate: parts.isoDate, weekday: parts.weekday };
}

export function rangeFrom(days: number, now = new Date()) {
  const today = todayBounds(now);
  const startDate = addIsoDays(today.isoDate, -(days - 1));
  return { start: zonedTimeToUtc(startDate, 0, 0).toISOString(), end: today.end, isoDate: today.isoDate };
}

export type HourRow = { weekday: number; open: string; close: string; closed: boolean };

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isOpen(now: Date, hours: HourRow[]) {
  const parts = zonedParts(now);
  const current = parts.hour * 60 + parts.minute;
  const today = hours.find((row) => row.weekday === parts.weekday);
  const openNow = (() => {
    if (!today || today.closed) return false;
    let start = minutes(today.open);
    let end = minutes(today.close);
    let cursor = current;
    if (end <= start) {
      end += 1440;
      if (cursor < start) cursor += 1440;
    }
    return cursor >= start && cursor < end;
  })();

  const label = today && !today.closed ? `Hoje ${today.open}–${today.close === "00:00" ? "00:00" : today.close}` : "Fechado hoje";

  let nextLabel = "Sem horário de funcionamento cadastrado.";
  if (!openNow) {
    if (today && !today.closed && current < minutes(today.open)) {
      nextLabel = `Abre hoje às ${today.open}.`;
    } else {
      for (let step = 1; step <= 7; step += 1) {
        const weekday = (parts.weekday + step) % 7;
        const row = hours.find((item) => item.weekday === weekday);
        if (row && !row.closed) {
          nextLabel = step === 1 && (!today || today.closed || current >= minutes(today.close))
            ? `Abre amanhã às ${row.open}.`
            : `Abre ${weekdayName(weekday)} às ${row.open}.`;
          break;
        }
      }
    }
  } else if (today) {
    nextLabel = `Aberto até ${today.close}.`;
  }

  return { open: openNow, label, nextLabel };
}

export function greeting(now = new Date()) {
  const hour = zonedParts(now).hour;
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
