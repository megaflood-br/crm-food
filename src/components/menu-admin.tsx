"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, centsToInput, reaisToCents } from "@/lib/client";
import { brl } from "@/lib/format";
import type { Addon, CategoryDTO, ProductDTO } from "@/lib/types";
import { Banner, Button, control, Field, Modal, PageHeader } from "./ui";

export function MenuAdmin() {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const data = await api<{ categories: CategoryDTO[] }>("/api/catalog");
    setCategories(data.categories);
  }
  useEffect(() => { void reload().catch((err) => setError(err.message)); }, []);

  async function toggle(product: ProductDTO) {
    await api("/api/catalog", { method: "POST", body: JSON.stringify({ action: "availability", id: product.id, available: !product.available }) });
    await reload();
  }

  return (
    <div>
      <PageHeader kicker="Cozinha" title="Cardápio">
        <Button onClick={() => setCreating(true)}>Novo produto</Button>
      </PageHeader>
      {error && <Banner tone="bad">{error}</Banner>}
      <CategoryForm onSaved={reload} />
      <div className="mt-4 space-y-6">
        {categories.map((category) => (
          <section key={category.id}>
            <h2 className="font-display text-2xl">{category.name}</h2>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {(category.products ?? []).map((product) => (
                <article key={product.id} className="flex items-start justify-between gap-3 rounded-3xl bg-white p-4 shadow-card">
                  <div>
                    <p className="text-2xl">{product.emoji}</p>
                    <h3 className="font-semibold">{product.name}</h3>
                    <p className="text-sm text-[#7a685c]">{product.description}</p>
                    <p className="mt-1">{brl(product.priceCents)} {!product.available && "· pausado"}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button tone="ghost" onClick={() => toggle(product)}>{product.available ? "Pausar" : "Ativar"}</Button>
                    <Button tone="ink" onClick={() => setEditing(product)}>Editar</Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {(editing || creating) && <ProductForm categories={categories} product={editing} onClose={() => { setEditing(null); setCreating(false); }} onSaved={async () => { setEditing(null); setCreating(false); await reload(); }} />}
    </div>
  );
}

function CategoryForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <form className="flex gap-2" onSubmit={async (event) => { event.preventDefault(); await api("/api/catalog", { method: "POST", body: JSON.stringify({ action: "category", name }) }); setName(""); await onSaved(); }}>
      <input className={control} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nova categoria" />
      <Button tone="ghost">Criar</Button>
    </form>
  );
}

function ProductForm({ categories, product, onClose, onSaved }: { categories: CategoryDTO[]; product: ProductDTO | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [addons, setAddons] = useState<Addon[]>(product?.addons ?? []);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/catalog", { method: "POST", body: JSON.stringify({
        id: product?.id,
        categoryId: form.get("categoryId"),
        name: form.get("name"),
        description: form.get("description"),
        priceCents: reaisToCents(String(form.get("price"))),
        emoji: form.get("emoji"),
        aliases: String(form.get("aliases") || "").split(",").map((item) => item.trim()).filter(Boolean),
        featured: form.get("featured") === "on",
        available: product?.available ?? true,
        addons,
      }) });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }
  return (
    <Modal title={product ? "Editar produto" : "Novo produto"} onClose={onClose}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Categoria">
          <select name="categoryId" className={control} defaultValue={product?.categoryId ?? categories[0]?.id}>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="Nome"><input name="name" className={control} defaultValue={product?.name} required /></Field>
        <Field label="Descrição"><textarea name="description" className={control} defaultValue={product?.description} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço"><input name="price" className={control} defaultValue={product ? centsToInput(product.priceCents) : ""} required /></Field>
          <Field label="Emoji"><input name="emoji" className={control} defaultValue={product?.emoji ?? "🍽️"} /></Field>
        </div>
        <Field label="Apelidos, separados por vírgula"><input name="aliases" className={control} defaultValue={product?.aliases.join(", ")} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={product?.featured} /> Destaque</label>
        <div className="space-y-2">
          {addons.map((addon, index) => (
            <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input className={control} value={addon.name} onChange={(event) => setAddons((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
              <input className={control} value={centsToInput(addon.priceCents)} onChange={(event) => setAddons((current) => current.map((item, i) => i === index ? { ...item, priceCents: reaisToCents(event.target.value) } : item))} />
              <Button type="button" tone="ghost" onClick={() => setAddons((current) => current.filter((_, i) => i !== index))}>Tirar</Button>
            </div>
          ))}
          <Button type="button" tone="ghost" onClick={() => setAddons((current) => [...current, { name: "", priceCents: 0 }])}>Adicional</Button>
        </div>
        {error && <Banner tone="bad">{error}</Banner>}
        <div className="flex gap-2">
          <Button>Salvar</Button>
          {product && <Button type="button" tone="danger" onClick={async () => { await api("/api/catalog", { method: "POST", body: JSON.stringify({ action: "delete", id: product.id }) }); await onSaved(); }}>Arquivar</Button>}
        </div>
      </form>
    </Modal>
  );
}
