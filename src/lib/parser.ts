import { fold } from "./format";
import type { Fulfillment, PaymentMethod } from "./types";

export type ProductRef = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  aliases?: string[];
};

export type Parsed = {
  greeting: boolean;
  handoff: boolean;
  cancelDraft: boolean;
  confirm: boolean;
  menu: boolean;
  hours: boolean;
  storeAddress: boolean;
  fees: boolean;
  status: boolean;
  rating?: { rating: number; comment: string };
  payment?: PaymentMethod;
  fulfillment?: Extract<Fulfillment, "delivery" | "pickup">;
  table?: string;
  address?: string;
  note?: string;
  coupon?: string;
  items?: { product: ProductRef; qty: number }[];
  priceOf?: ProductRef[];
};

const STOP = new Set(["casa", "fogo", "lata", "para", "como", "mais", "pelo", "pela", "daqui", "onde"]);
const QTY: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };

function tokensOf(product: ProductRef) {
  const bag = [product.name, ...(product.aliases ?? [])].join(" ");
  return [...new Set(fold(bag).split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !STOP.has(token)))];
}

function findItems(text: string, products: ProductRef[]) {
  const folded = fold(text);
  const hits: { product: ProductRef; index: number; score: number }[] = [];
  for (const product of products) {
    if (!product.available) continue;
    let index = -1;
    let score = 0;
    for (const token of tokensOf(product)) {
      const at = folded.indexOf(token);
      if (at >= 0) {
        score += token.length;
        if (index < 0 || at < index) index = at;
      }
    }
    if (score >= 4) hits.push({ product, index, score });
  }
  hits.sort((a, b) => a.index - b.index || b.score - a.score);
  const chosen: typeof hits = [];
  for (const hit of hits) {
    const dominated = chosen.some((current) => Math.abs(current.index - hit.index) < 6 && current.score >= hit.score);
    if (!dominated) chosen.push(hit);
  }
  return chosen.map((hit) => {
    const before = folded.slice(Math.max(0, hit.index - 18), hit.index);
    const numeric = before.match(/(\d{1,2})\s*(x\s*)?$/);
    const word = before.match(/(um|uma|dois|duas|tres|quatro|cinco)\s*$/);
    let qty = numeric ? Number(numeric[1]) : word ? QTY[word[1]] : 1;
    if (!qty || qty < 1) qty = 1;
    if (qty > 30) qty = 30;
    return { product: hit.product, qty };
  });
}

export function interpret(raw: string, products: ProductRef[]): Parsed {
  const text = raw.trim();
  const f = fold(text);
  const wants = /\b(quero|queria|pedia|pede|manda|mande|me ve|vou querer|coloca|bota|adiciona|traz|traga)\b/.test(f);
  const question = /\?|\b(quanto|qual|quais|tem |voces tem|voce tem)\b/.test(f);
  const parsed: Parsed = {
    greeting: /^(oi|ola|bom dia|boa tarde|boa noite|e ai|eai|opa|hey|hello|salve)\b/.test(f),
    handoff: /\b(atendente|humano|pessoa real|gerente|alguem de verdade|falar com gente)\b/.test(f),
    cancelDraft: /\b(cancela(r)? (o )?pedido|limpa(r)? (o )?carrinho|esquece o pedido|deixa pra la)\b/.test(f),
    confirm: /\b(pode fechar|fechar pedido|finalizar|confirmar|confirma|pode mandar|e isso|so isso|pode anotar|fecha ai|pode ser)\b/.test(f),
    menu: /\b(cardapio|menu|o que tem|oque tem)\b/.test(f),
    hours: /\b(horario|abre|fecha que horas|funcionamento|ate que horas|que horas)\b/.test(f),
    storeAddress: /\b(onde fica|endereco da loja|endereco de voces|como chego|localizacao)\b/.test(f),
    fees: /\b(taxa|frete|quanto custa a entrega|entrega custa)\b/.test(f),
    status: /\b(status do pedido|meu pedido|cade o pedido|ja saiu)\b/.test(f),
  };

  if (/^[1-5]$/.test(f) || /^nota\s*[1-5]\b/.test(f) || /\b([1-5])\s*estrelas?\b/.test(f)) {
    const rating = Number(f.match(/[1-5]/)?.[0] ?? 0);
    if (rating) parsed.rating = { rating, comment: text };
  }

  if (/\bpix\b/.test(f)) parsed.payment = "pix";
  else if (/\b(dinheiro|especie)\b/.test(f)) parsed.payment = "cash";
  else if (/\b(cartao online|credito online)\b/.test(f)) parsed.payment = "card_online";
  else if (/\b(cartao|debito|credito|maquininha)\b/.test(f)) parsed.payment = "card_delivery";

  const table = f.match(/\bmesa\s*(\d+|[a-z])\b/);
  if (table) parsed.table = table[1].toUpperCase();
  if (/\b(retirada|retirar|buscar|vou buscar|passo ai|balcao)\b/.test(f)) parsed.fulfillment = "pickup";
  else if (/\b(entrega|delivery|motoboy)\b/.test(f) && !/\b(entrega|entregar|mandar|manda)\s+(na|no|em|para|pra)\b/.test(f)) parsed.fulfillment = "delivery";

  const addressMatch = text.match(/(?:entrega|entregar|mandar|manda)\s+(?:na|no|em|para|pra)\s+(.+)/i)
    || text.match(/(?:meu endere[cç]o(?:\s+(?:e|é|:))?\s*)(.+)/i)
    || text.match(/\b((?:rua|av\.?|avenida|alameda|travessa|pra[cç]a)\s+.+)/i);
  if (addressMatch) {
    parsed.address = (addressMatch[1] || addressMatch[0]).replace(/[.!]+$/, "").trim();
    parsed.fulfillment = "delivery";
  }

  const coupon = f.match(/\bcupom\s+([a-z0-9]{3,20})/);
  if (coupon) parsed.coupon = coupon[1].toUpperCase();

  const change = f.match(/\btroco (?:pra|para) (?:r\$\s*)?(\d+)/);
  if (change) parsed.note = `Troco para R$ ${change[1]}`;
  else if (/^(sem |observa)/.test(f)) parsed.note = text;

  const items = findItems(text, products);
  if (items.length && !(parsed.greeting && !wants)) {
    if (question && !wants) parsed.priceOf = items.map((item) => item.product);
    else parsed.items = items;
  }

  if (parsed.status && parsed.items && question) {
    parsed.items = undefined;
  }

  return parsed;
}

export function draftSubtotal(items: { qty: number; unitPriceCents: number }[]) {
  return items.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0);
}
