import type { Addon, CategoryDTO, ProductDTO, PublicMenu } from "@/lib/types";
import { parseJson } from "@/lib/format";
import { getConfig, storefrontState } from "./config";
import { getDb } from "./db";
import { HttpError } from "./http";
import { nid } from "./ids";
import { listZones } from "./delivery";

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price_cents: number;
  emoji: string;
  available: number;
  featured: number;
  addons_json: string;
  aliases_json: string;
  sort: number;
};

export function mapProduct(row: ProductRow): ProductDTO {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    emoji: row.emoji,
    available: row.available === 1,
    featured: row.featured === 1,
    addons: parseJson<Addon[]>(row.addons_json, []),
    aliases: parseJson<string[]>(row.aliases_json, []),
    sort: row.sort,
  };
}

export function listProducts() {
  const rows = getDb().prepare("SELECT * FROM products ORDER BY sort, name").all() as ProductRow[];
  return rows.map(mapProduct);
}

export function listCategories(withProducts = false): CategoryDTO[] {
  const categories = getDb().prepare("SELECT * FROM categories ORDER BY sort, name").all() as Array<{ id: string; name: string; sort: number; active: number }>;
  const products = withProducts ? listProducts() : [];
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    sort: category.sort,
    active: category.active === 1,
    products: withProducts ? products.filter((product) => product.categoryId === category.id) : undefined,
  }));
}

export function getProduct(id: string) {
  const row = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  return row ? mapProduct(row) : null;
}

export function saveCategory(input: { id?: string; name: string }) {
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError("Dê um nome para a categoria");
  if (input.id) {
    getDb().prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, input.id);
    return input.id;
  }
  const id = nid("cat");
  const sort = (getDb().prepare("SELECT coalesce(max(sort), -1) AS s FROM categories").get() as { s: number }).s + 1;
  getDb().prepare("INSERT INTO categories (id, name, sort, active) VALUES (?, ?, ?, 1)").run(id, name, sort);
  return id;
}

export function saveProduct(input: {
  id?: string;
  categoryId: string;
  name: string;
  description?: string;
  priceCents: number;
  emoji?: string;
  available?: boolean;
  featured?: boolean;
  addons?: Addon[];
  aliases?: string[];
}) {
  const name = input.name.trim();
  if (name.length < 2) throw new HttpError("Dê um nome para o produto");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new HttpError("Preço inválido");
  const category = getDb().prepare("SELECT id FROM categories WHERE id = ?").get(input.categoryId);
  if (!category) throw new HttpError("Categoria não encontrada", 404);
  const addons = JSON.stringify(input.addons ?? []);
  const aliases = JSON.stringify(input.aliases ?? []);
  if (input.id) {
    getDb().prepare(`UPDATE products SET category_id = ?, name = ?, description = ?, price_cents = ?, emoji = ?, available = ?, featured = ?, addons_json = ?, aliases_json = ? WHERE id = ?`).run(
      input.categoryId, name, input.description?.trim() ?? "", input.priceCents, input.emoji || "🍽️",
      input.available === false ? 0 : 1, input.featured ? 1 : 0, addons, aliases, input.id,
    );
    return getProduct(input.id);
  }
  const id = nid("prod");
  const sort = (getDb().prepare("SELECT coalesce(max(sort), -1) AS s FROM products WHERE category_id = ?").get(input.categoryId) as { s: number }).s + 1;
  getDb().prepare(`INSERT INTO products (id, category_id, name, description, price_cents, emoji, available, featured, addons_json, aliases_json, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.categoryId, name, input.description?.trim() ?? "", input.priceCents, input.emoji || "🍽️",
    input.available === false ? 0 : 1, input.featured ? 1 : 0, addons, aliases, sort,
  );
  return getProduct(id);
}

export function setProductAvailable(id: string, available: boolean) {
  const result = getDb().prepare("UPDATE products SET available = ? WHERE id = ?").run(available ? 1 : 0, id);
  if (!result.changes) throw new HttpError("Produto não encontrado", 404);
  return getProduct(id);
}

export function deleteProduct(id: string) {
  const used = getDb().prepare("SELECT count(*) AS c FROM order_items WHERE product_id = ?").get(id) as { c: number };
  if (used.c > 0) {
    setProductAvailable(id, false);
    return { archived: true };
  }
  getDb().prepare("DELETE FROM products WHERE id = ?").run(id);
  return { archived: false };
}

export function getPublicMenu(slug: string): PublicMenu | null {
  const config = getConfig();
  if (config.slug !== slug) return null;
  const state = storefrontState();
  const categories = listCategories(true).filter((category) => category.active);
  return {
    name: config.name,
    slug: config.slug,
    description: config.description,
    address: config.address,
    phone: config.phone,
    prepMinutes: config.prepMinutes,
    minOrderCents: config.minOrderCents,
    accepting: state.accepting,
    closedReason: state.reason,
    hoursLabel: state.label,
    zones: listZones().filter((zone) => zone.active),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      products: (category.products ?? []).filter((product) => product.available).map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        emoji: product.emoji,
        featured: product.featured,
        addons: product.addons,
      })),
    })).filter((category) => category.products.length > 0),
  };
}
