"use client";

import { FormEvent, useMemo, useState } from "react";
import { api, reaisToCents } from "@/lib/client";
import { brl, formatPhone } from "@/lib/format";
import type { Addon, PublicMenu } from "@/lib/types";
import { Banner, Button, control, Field } from "./ui";

type CartLine = { key: string; productId: string; name: string; qty: number; unit: number; addons: Addon[] };

export function PublicMenuView({ menu }: { menu: PublicMenu }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [zoneId, setZoneId] = useState(menu.zones[0]?.id ?? "");
  const [result, setResult] = useState<{ code: string; total: number; pix: string | null; pixQr: string | null } | null>(null);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<PublicMenu["categories"][number]["products"][number] | null>(null);

  function add(product: PublicMenu["categories"][number]["products"][number], addons: Addon[] = []) {
    const unit = product.priceCents + addons.reduce((sum, addon) => sum + addon.priceCents, 0);
    const key = `${product.id}:${addons.map((addon) => addon.name).join(",")}`;
    setCart((current) => {
      const found = current.find((line) => line.key === key);
      if (found) return current.map((line) => line.key === key ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { key, productId: product.id, name: product.name, qty: 1, unit, addons }];
    });
    setPicker(null);
  }

  const subtotal = cart.reduce((sum, line) => sum + line.unit * line.qty, 0);
  const zone = menu.zones.find((item) => item.id === zoneId);
  const fee = fulfillment === "delivery" ? (zone?.feeCents ?? 0) : 0;
  const count = cart.reduce((sum, line) => sum + line.qty, 0);
  const groups = useMemo(() => menu.categories, [menu]);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    try {
      const response = await api<{ order: { code: string; totalCents: number }; pix: string | null; pixQr: string | null }>(`/api/public/${menu.slug}/order`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"), phone: form.get("phone"), fulfillment, address: form.get("address"),
          paymentMethod: form.get("payment"), notes: form.get("notes"), couponCode: form.get("coupon"),
          zoneId: fulfillment === "delivery" ? zoneId : undefined,
          cashbackCents: reaisToCents(String(form.get("cashback") || "0")),
          items: cart.map((line) => ({ productId: line.productId, qty: line.qty, addons: line.addons })),
        }),
      });
      setResult({ code: response.order.code, total: response.order.totalCents, pix: response.pix, pixQr: response.pixQr });
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  if (result) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="text-xs uppercase tracking-[0.18em] text-ember">{menu.name}</p>
        <h1 className="font-display text-4xl">Pedido {result.code}</h1>
        <p className="mt-2">Total {brl(result.total)}. A cozinha já viu.</p>
        {result.pix && (
          <div className="mt-4 rounded-3xl bg-white p-4 shadow-card">
            <h2 className="font-display text-2xl">Pague com Pix</h2>
            {result.pixQr && <img src={result.pixQr} alt="QR Code Pix" className="mx-auto mt-3 h-56 w-56" />}
            <textarea className={`${control} mt-3 text-xs`} readOnly value={result.pix} />
            <Button className="mt-3" type="button" onClick={() => navigator.clipboard.writeText(result.pix!)}>Copiar código</Button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">Cardápio</p>
          <h1 className="font-display text-5xl">{menu.name}</h1>
          <p className="mt-2 max-w-xl text-[#5c4d44]">{menu.description}</p>
          <p className="mt-2 text-sm">{menu.accepting ? menu.hoursLabel : menu.closedReason} · {menu.address} · {formatPhone(menu.phone)}</p>
        </header>
        {!menu.accepting && <Banner>O cardápio está visível, mas a loja não confirma pedido agora.</Banner>}
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-auto bg-[#f3eee7]/90 px-4 py-2 backdrop-blur">
          {groups.map((category) => <a key={category.id} href={`#${category.id}`} className="rounded-full bg-white px-3 py-1 text-sm">{category.name}</a>)}
        </div>
        {groups.map((category) => (
          <section key={category.id} id={category.id} className="mb-6">
            <h2 className="font-display text-3xl">{category.name}</h2>
            <div className="mt-2 space-y-2">
              {category.products.map((product) => (
                <article key={product.id} className="flex items-center justify-between gap-3 rounded-3xl bg-white p-3 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl">{product.emoji}</p>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-[#7a685c]">{product.description}</p>
                    <p className="mt-1">{brl(product.priceCents)}</p>
                  </div>
                  <Button className="shrink-0" type="button" onClick={() => product.addons.length ? setPicker(product) : add(product)}>Pedir</Button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="h-fit rounded-3xl bg-white p-4 shadow-card lg:sticky lg:top-4">
        <h2 className="font-display text-2xl">Seu pedido {count > 0 && `· ${count}`}</h2>
        {!cart.length && <p className="mt-2 text-sm text-[#7a685c]">Escolhe aí. A cozinha recebe na hora.</p>}
        {cart.map((line) => (
          <div key={line.key} className="mt-2 flex items-center justify-between text-sm">
            <span>{line.qty}× {line.name}</span>
            <span className="flex items-center gap-2"><button onClick={() => setCart((current) => current.flatMap((item) => item.key === line.key ? item.qty > 1 ? [{ ...item, qty: item.qty - 1 }] : [] : [item]))}>−</button>{brl(line.unit * line.qty)}</span>
          </div>
        ))}
        {cart.length > 0 && (
          <form className="mt-4 space-y-2" onSubmit={checkout}>
            <div className="flex gap-2 text-sm">
              <button type="button" className={`rounded-full px-3 py-1 ${fulfillment === "delivery" ? "bg-ink text-white" : "bg-[#f6f1ea]"}`} onClick={() => setFulfillment("delivery")}>Entrega</button>
              <button type="button" className={`rounded-full px-3 py-1 ${fulfillment === "pickup" ? "bg-ink text-white" : "bg-[#f6f1ea]"}`} onClick={() => setFulfillment("pickup")}>Retirada</button>
            </div>
            <Field label="Nome"><input name="name" className={control} required /></Field>
            <Field label="WhatsApp"><input name="phone" className={control} required placeholder="11988881001" onBlur={async (event) => {
              const data = await api<{ found: boolean; name?: string; address?: string }>(`/api/public/${menu.slug}/lookup`, { method: "POST", body: JSON.stringify({ phone: event.target.value }) });
              if (!data.found) return;
              const form = event.target.form;
              if (form && data.name) (form.elements.namedItem("name") as HTMLInputElement).value = data.name;
              if (form && data.address) (form.elements.namedItem("address") as HTMLInputElement).value = data.address;
            }} /></Field>
            {fulfillment === "delivery" && (
              <>
                <Field label="Área"><select className={control} value={zoneId} onChange={(event) => setZoneId(event.target.value)}>{menu.zones.map((item) => <option key={item.id} value={item.id}>{item.name} · {brl(item.feeCents)}</option>)}</select></Field>
                <Field label="Endereço"><input name="address" className={control} required /></Field>
              </>
            )}
            <Field label="Pagamento">
              <select name="payment" className={control} defaultValue="pix"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="card_delivery">Cartão na entrega</option></select>
            </Field>
            <Field label="Cupom"><input name="coupon" className={control} /></Field>
            <Field label="Usar cashback"><input name="cashback" className={control} placeholder="0,00" /></Field>
            <Field label="Observação"><input name="notes" className={control} /></Field>
            <p className="text-sm">Subtotal {brl(subtotal)} {fee ? `+ entrega ${brl(fee)}` : ""}</p>
            {subtotal < menu.minOrderCents && <p className="text-sm text-[#9f1239]">Mínimo de {brl(menu.minOrderCents)}.</p>}
            {error && <Banner tone="bad">{error}</Banner>}
            <Button className="w-full" disabled={!menu.accepting || subtotal < menu.minOrderCents}>Fechar pedido</Button>
          </form>
        )}
      </aside>
      {open && null}
      {picker && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-[#1c1410]/40 p-4 sm:place-items-center" onClick={() => setPicker(null)}>
          <form className="w-full max-w-md rounded-3xl bg-white p-4" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const chosen = picker.addons.filter((addon) => form.get(addon.name) === "on");
            add(picker, chosen);
          }}>
            <h3 className="font-display text-2xl">{picker.name}</h3>
            {picker.addons.map((addon) => <label key={addon.name} className="mt-2 flex justify-between text-sm"><span><input type="checkbox" name={addon.name} /> {addon.name}</span><span>{brl(addon.priceCents)}</span></label>)}
            <Button className="mt-4 w-full">Adicionar</Button>
          </form>
        </div>
      )}
    </main>
  );
}
