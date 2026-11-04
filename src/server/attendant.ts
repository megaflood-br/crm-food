import { brl } from "@/lib/format";
import { draftSubtotal, interpret, type ProductRef } from "@/lib/parser";
import { pixPayload } from "@/lib/pix";
import type { Draft, PaymentMethod } from "@/lib/types";
import { getConfig, storefrontState } from "./config";
import { listProducts } from "./catalog";
import { addMessage, ensureConversation, getConversation, listMessages, saveDraft, setConversationStatus } from "./conversations";
import { getCustomerByPhone, upsertCustomer } from "./customers";
import { listZones } from "./delivery";
import { sendText } from "./evolution";
import { HttpError } from "./http";
import { createOrder, latestOrderFor, saveReview } from "./orders";

function products(): ProductRef[] {
  return listProducts().map((product) => ({
    id: product.id,
    name: product.name,
    priceCents: product.priceCents,
    available: product.available,
    aliases: product.aliases,
  }));
}

function menuLink(origin: string) {
  const config = getConfig();
  return `${origin}/cardapio/${config.slug}`;
}

async function deliver(conversationId: string, phone: string, text: string) {
  const sent = await sendText(phone, text);
  addMessage({
    conversationId,
    direction: "out",
    body: text,
    author: "bot",
    status: sent.delivered ? "sent" : sent.error ? "failed" : "local",
    waId: sent.waId,
  });
  return text;
}

function missingQuestion(draft: Draft) {
  if (!draft.items.length) return "Me diz o que vai querer, ou abre o cardápio.";
  if (!draft.fulfillment && !draft.address && !draft.tableName) return "É entrega ou retirada?";
  if ((draft.fulfillment === "delivery" || draft.address) && !draft.address) return "Qual o endereço, com número e referência?";
  if (!draft.payment) return "Pix, dinheiro ou cartão na entrega?";
  return "Posso fechar o pedido?";
}

function upsell(draft: Draft) {
  const catalog = listProducts();
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const hasBurger = draft.items.some((item) => byId.get(item.productId)?.categoryId === "cat_burgers");
  const hasDrink = draft.items.some((item) => byId.get(item.productId)?.categoryId === "cat_drinks");
  const chopp = catalog.find((product) => product.id === "p_chopp" && product.available);
  if (hasBurger && !hasDrink && chopp) return ` Quer um ${chopp.name.toLowerCase()} (${brl(chopp.priceCents)}) pra acompanhar?`;
  return "";
}

function cartText(draft: Draft) {
  const lines = draft.items.map((item) => `${item.qty}× ${item.name} (${brl(item.qty * item.unitPriceCents)})`);
  return `${lines.join("\n")}\nSubtotal ${brl(draftSubtotal(draft.items))}.${upsell(draft)}`;
}

async function modelReply(text: string, origin: string) {
  const config = getConfig();
  const key = config.openaiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const menu = listProducts().filter((product) => product.available).map((product) => `${product.name} ${brl(product.priceCents)}`).join("; ");
  const state = storefrontState();
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: `Você é ${config.attendantName}, atendimento de WhatsApp da ${config.name}. ${config.attendantPersonality} Responda em português do Brasil, curto, sem markdown. Não invente item nem preço. Cardápio: ${menu}. Endereço: ${config.address}. ${state.accepting ? "A loja está aberta." : state.reason} Link: ${menuLink(origin)}. Se a pessoa quiser pedir, peça o nome do item para eu anotar no sistema. Máximo de 3 frases.`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ? content.slice(0, 700) : null;
  } catch {
    return null;
  }
}

export async function onCustomerMessage(input: { phone: string; pushName?: string; text: string; kind: string; waId?: string; origin: string; fromMe?: boolean }) {
  const customer = upsertCustomer({ name: input.pushName, phone: input.phone });
  const conversationId = ensureConversation(customer.id);
  if (input.fromMe) {
    addMessage({ conversationId, direction: "out", body: input.text || "[mensagem]", kind: input.kind, waId: input.waId, author: "agent", status: "sent" });
    return null;
  }
  addMessage({ conversationId, direction: "in", body: input.text || `[${input.kind}]`, kind: input.kind, waId: input.waId, author: "customer", status: "received" });
  const conversation = getConversation(conversationId);
  if (!conversation) return null;
  const config = getConfig();
  if (customer.blocked) {
    return deliver(conversationId, customer.phone, "Seu número está com o atendimento pausado nesta loja.");
  }
  if (!config.attendantEnabled || conversation.status !== "bot") return null;
  const reply = await compose(conversationId, customer.name, input.text, input.kind, input.origin);
  if (!reply) return null;
  return deliver(conversationId, customer.phone, reply);
}

async function compose(conversationId: string, customerName: string, text: string, kind: string, origin: string) {
  const config = getConfig();
  const conversation = getConversation(conversationId);
  if (!conversation) return null;
  if (kind === "audio") return "Recebi seu áudio. Me manda em texto que eu anoto agora — ou abre o cardápio.";
  if (kind === "sticker") return "Recebi a figurinha. Me fala o que vai querer que eu anoto.";
  if (kind === "image" && (!text || text === "[imagem]")) return "Recebi a imagem. Se for um item, me diz o nome que eu anoto.";

  const parsed = interpret(text, products());
  let draft: Draft = { ...conversation.draft, items: [...conversation.draft.items] };

  if (parsed.handoff) {
    setConversationStatus(conversationId, "human");
    return `Chamei a equipe da ${config.name}. Já já alguém assume daqui.`;
  }
  if (parsed.rating && !parsed.items && !parsed.confirm) {
    const order = latestOrderFor(conversation.customerId);
    if (!order || order.status !== "done") return "Ainda não tenho um pedido finalizado pra avaliar. Quando chegar, me manda a nota de 1 a 5.";
    const review = saveReview(order.id, parsed.rating.rating, parsed.rating.comment);
    return review.already ? "Essa nota já estava salva. Obrigada!" : `Nota ${parsed.rating.rating} registrada. Obrigada por falar com a ${config.name}.`;
  }
  if (parsed.cancelDraft) {
    saveDraft(conversationId, { items: [] });
    return "Pronto, limpei o pedido. Se quiser recomeçar, é só dizer o item.";
  }

  if (parsed.items?.length) {
    for (const item of parsed.items) {
      const current = draft.items.find((line) => line.productId === item.product.id);
      if (current) current.qty = Math.min(30, current.qty + item.qty);
      else draft.items.push({ productId: item.product.id, name: item.product.name, qty: item.qty, unitPriceCents: item.product.priceCents });
    }
  }
  if (parsed.address) {
    draft.address = parsed.address;
    draft.fulfillment = "delivery";
  }
  if (parsed.fulfillment) draft.fulfillment = parsed.fulfillment;
  if (parsed.table) {
    draft.tableName = parsed.table;
    draft.fulfillment = "table";
  }
  if (parsed.payment) draft.payment = parsed.payment;
  if (parsed.note) draft.notes = draft.notes ? `${draft.notes}. ${parsed.note}` : parsed.note;
  if (parsed.coupon) draft.couponCode = parsed.coupon;
  saveDraft(conversationId, draft);

  const state = storefrontState();
  const first = customerName && customerName !== "Cliente" ? customerName.split(" ")[0] : "";
  const hello = first ? `Oi, ${first}! ` : "Oi! ";

  if (parsed.confirm) {
    try {
      const closed = await confirmDraftOrder(conversationId, config.attendantName, true);
      const order = closed.order;
      let payment = "";
      if (order.paymentMethod === "pix") {
        try {
          const payload = pixPayload({ key: config.pixKey, holder: config.pixHolder, city: config.city, amountCents: order.totalCents, txid: order.code.replace(/[^A-Za-z0-9]/g, "") });
          payment = `\n\nPix copia e cola:\n${payload}`;
        } catch {
          payment = config.pixKey ? `\n\nChave Pix: ${config.pixKey}` : "";
        }
      } else if (order.paymentMethod === "cash") payment = "\n\nPagamento em dinheiro na entrega.";
      else payment = "\n\nPagamento no cartão.";
      const when = order.scheduledAt ? `\nA cozinha está fechada agora. Deixei anotado: ${order.scheduledAt}` : "\nAssim que a cozinha aceitar, eu te aviso.";
      return `Pedido ${order.code} confirmado.\n${order.fulfillment === "delivery" ? order.address : order.fulfillment === "pickup" ? "Retirada no balcão" : `Mesa ${order.tableName}`}\nTotal ${brl(order.totalCents)}.${payment}${when}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não consegui fechar o pedido";
      return `${message}\n${cartText(draft)}\n${missingQuestion(draft)}`;
    }
  }

  if (parsed.priceOf?.length) {
    return parsed.priceOf.map((product) => `${product.name}: ${brl(product.priceCents)}`).join("\n") + "\nQuer que eu anote?";
  }
  if (parsed.items?.length || parsed.address || parsed.payment || parsed.fulfillment || parsed.table || parsed.coupon || parsed.note) {
    const pause = config.forceClosed || (config.pausedUntil != null && new Date(config.pausedUntil).getTime() > Date.now());
    const extra = pause ? `\n${state.reason} Não consigo confirmar enquanto a pausa estiver ligada.` : !state.accepting ? `\n${state.reason} Posso deixar agendado.` : "";
    return `Anotei.\n${cartText(draft)}\n${missingQuestion(draft)}${extra}`;
  }
  if (parsed.menu) {
    const lines = listProducts().filter((product) => product.available).slice(0, 8).map((product) => `${product.emoji} ${product.name} — ${brl(product.priceCents)}`);
    return `${lines.join("\n")}\n\nCardápio completo: ${menuLink(origin)}`;
  }
  if (parsed.hours || (parsed.greeting && !state.accepting)) {
    const hours = parsed.hours || !parsed.greeting ? `${state.accepting ? state.label : state.reason}` : "";
    if (parsed.hours && !parsed.greeting) return `${config.name}: ${state.accepting ? state.label : state.reason}`;
    return `${hello}Aqui é a ${config.attendantName}, da ${config.name}. ${state.accepting ? "Estamos abertos." : state.reason} Cardápio: ${menuLink(origin)}\n${hours}É entrega ou retirada?`.trim();
  }
  if (parsed.storeAddress) return `A gente fica em ${config.address}.`;
  if (parsed.fees) {
    const zones = listZones().filter((zone) => zone.active).map((zone) => `${zone.name}: ${brl(zone.feeCents)} (${zone.etaMin}–${zone.etaMax} min)`);
    return `Taxa padrão ${brl(config.deliveryFeeCents)}. Áreas:\n${zones.join("\n")}`;
  }
  if (parsed.status) {
    const order = latestOrderFor(conversation.customerId);
    if (!order) return "Ainda não achei pedido no seu número. Quer montar um agora?";
    return `Pedido ${order.code}: ${order.status === "analysis" ? "em análise" : order.status === "preparing" ? "na chapa" : order.status === "ready" ? "pronto" : order.status === "delivering" ? "saiu para entrega" : order.status === "done" ? "finalizado" : "cancelado"}. Total ${brl(order.totalCents)}.`;
  }
  if (parsed.greeting) {
    return `${hello}Aqui é a ${config.attendantName}, da ${config.name}. Posso anotar seu pedido por aqui.\n${menuLink(origin)}\nÉ entrega ou retirada?`;
  }
  const generated = await modelReply(text, origin);
  if (generated) return generated;
  return `Consigo anotar pedido, passar horário, taxa e status. O cardápio está aqui: ${menuLink(origin)}`;
}

export async function confirmDraftOrder(conversationId: string, actor: string, silent: boolean) {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new HttpError("Conversa não encontrada", 404);
  const draft = conversation.draft;
  if (!draft.items.length) throw new HttpError("O carrinho está vazio");
  const fulfillment = draft.fulfillment ?? (draft.address ? "delivery" : undefined);
  if (!fulfillment) throw new HttpError("Falta dizer se é entrega ou retirada");
  if (fulfillment === "delivery" && !draft.address) throw new HttpError("Falta o endereço");
  if (fulfillment === "table" && !draft.tableName) throw new HttpError("Falta o número da mesa");
  if (!draft.payment) throw new HttpError("Falta a forma de pagamento");
  const result = await createOrder({
    customerName: conversation.customerName,
    customerPhone: conversation.customerPhone,
    fulfillment,
    channel: "whatsapp",
    address: draft.address,
    tableName: draft.tableName,
    paymentMethod: draft.payment as PaymentMethod,
    notes: draft.notes,
    couponCode: draft.couponCode,
    items: draft.items.map((item) => ({ productId: item.productId, qty: item.qty })),
    actor,
    silent,
  });
  saveDraft(conversationId, { items: [] });
  return result;
}

export async function testAttendant(text: string, origin: string) {
  const reply = await onCustomerMessage({ phone: "5500000000001", pushName: "Teste do painel", text, kind: "text", origin });
  const customer = getCustomerByPhone("5500000000001");
  const conversation = customer ? getConversation(ensureConversation(customer.id)) : null;
  return { reply: reply ?? "A Lia está desligada ou a conversa está com a equipe.", draft: conversation?.draft ?? { items: [] }, messages: customer ? listMessages(ensureConversation(customer.id)).slice(-8) : [] };
}
