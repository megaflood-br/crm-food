import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpret } from "../src/lib/parser.ts";
import { crc16, pixPayload } from "../src/lib/pix.ts";
import { isOpen } from "../src/lib/time.ts";
import type { ProductRef } from "../src/lib/parser.ts";

const products: ProductRef[] = [
  { id: "p_classico", name: "Brasa Clássico", priceCents: 3490, available: true, aliases: ["classico", "hamburguer"] },
  { id: "p_bacon", name: "X-Bacon Defumado", priceCents: 3990, available: true, aliases: ["bacon", "xbacon"] },
  { id: "p_duplo", name: "Duplo da Casa", priceCents: 4690, available: true, aliases: ["duplo"] },
  { id: "p_batata", name: "Batata rústica", priceCents: 1890, available: true, aliases: ["batata", "fritas"] },
  { id: "p_refri", name: "Refrigerante lata", priceCents: 800, available: true, aliases: ["refri", "coca"] },
  { id: "p_chopp", name: "Chopp 500 ml", priceCents: 1600, available: true, aliases: ["chopp", "cerveja"] },
];

const hours = [
  { weekday: 0, open: "12:00", close: "23:00", closed: true },
  { weekday: 1, open: "18:00", close: "23:00", closed: false },
  { weekday: 2, open: "18:00", close: "23:00", closed: false },
  { weekday: 3, open: "18:00", close: "23:00", closed: false },
  { weekday: 4, open: "18:00", close: "23:30", closed: false },
  { weekday: 5, open: "18:00", close: "00:00", closed: false },
  { weekday: 6, open: "12:00", close: "00:00", closed: false },
];

describe("pedidos em português", () => {
  it("entende quantidade, dois itens e o endereço", () => {
    const parsed = interpret("quero 2 brasa classico e uma batata pra entrega na rua harmonia 120", products);
    assert.equal(parsed.items?.length, 2);
    assert.equal(parsed.items?.[0].qty, 2);
    assert.equal(parsed.items?.[0].product.id, "p_classico");
    assert.equal(parsed.items?.[1].product.id, "p_batata");
    assert.match(parsed.address ?? "", /harmonia/i);
    assert.equal(parsed.fulfillment, "delivery");
  });

  it("reconhece x-bacon, pix e fechamento", () => {
    assert.equal(interpret("quero um x bacon", products).items?.[0].product.id, "p_bacon");
    assert.equal(interpret("pode ser no pix", products).payment, "pix");
    assert.equal(interpret("pode fechar", products).confirm, true);
    assert.equal(interpret("quero falar com atendente", products).handoff, true);
    assert.equal(interpret("nota 5 ficou otima", products).rating?.rating, 5);
  });

  it("não transforma pergunta de preço em item", () => {
    const parsed = interpret("quanto fica o duplo?", products);
    assert.equal(parsed.items, undefined);
    assert.equal(parsed.priceOf?.[0].id, "p_duplo");
  });
});

describe("pix e horário", () => {
  it("gera payload com CRC válido", () => {
    assert.equal(crc16("123456789"), "29B1");
    const payload = pixPayload({ key: "financeiro@brasaecia.com.br", holder: "Brasa e Cia", city: "Sao Paulo", amountCents: 4690, txid: "B1042" });
    assert.match(payload, /^00020126/);
    assert.ok(payload.includes("BR.GOV.BCB.PIX"));
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  });

  it("sabe quando a cozinha está aberta em São Paulo", () => {
    const open = isOpen(new Date("2026-11-03T23:30:00Z"), hours);
    assert.equal(open.open, true);
    const closed = isOpen(new Date("2026-11-03T18:00:00Z"), hours);
    assert.equal(closed.open, false);
    assert.match(closed.nextLabel, /18:00/);
  });
});
