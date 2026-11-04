import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, describe, it } from "node:test";

const file = path.join(os.tmpdir(), `brasa-test-${process.pid}.db`);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
process.env.BRASA_DB = file;

describe("fluxo da loja", () => {
  before(async () => {
    const { getDb } = await import("../src/server/db.ts");
    getDb();
  });

  it("sobe com pedidos no gestor e a Lia anota um pedido", async () => {
    const { listOrders } = await import("../src/server/orders.ts");
    const { onCustomerMessage } = await import("../src/server/attendant.ts");
    const { getOrder } = await import("../src/server/orders.ts");
    const open = listOrders().filter((order) => order.status === "analysis");
    assert.ok(open.some((order) => order.customerName === "João Victor"));
    const reply = await onCustomerMessage({
      phone: "11977770001",
      pushName: "Clara Teste",
      text: "oi quero um duplo e um chopp, retirada, no pix, pode fechar",
      kind: "text",
      origin: "http://localhost:3000",
    });
    assert.match(reply ?? "", /Pedido/);
    assert.match(reply ?? "", /Pix copia e cola/);
    const created = listOrders("Clara");
    assert.equal(created[0]?.paymentMethod, "pix");
    assert.equal(created[0]?.fulfillment, "pickup");
    assert.ok(getOrder(created[0].id));
  });
});
