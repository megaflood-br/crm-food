export type OrderStatus = "analysis" | "preparing" | "ready" | "delivering" | "done" | "cancelled";
export type Fulfillment = "delivery" | "pickup" | "table" | "counter";
export type Channel = "whatsapp" | "menu" | "counter" | "table";
export type PaymentMethod = "pix" | "cash" | "card_delivery" | "card_online";
export type PaymentStatus = "pending" | "paid" | "refunded";

export type Addon = { name: string; priceCents: number };

export type StoreConfig = {
  name: string;
  slug: string;
  phone: string;
  address: string;
  city: string;
  description: string;
  pixKey: string;
  pixHolder: string;
  prepMinutes: number;
  minOrderCents: number;
  deliveryFeeCents: number;
  pausedUntil: string | null;
  forceClosed: boolean;
  attendantName: string;
  attendantEnabled: boolean;
  attendantPersonality: string;
  loyaltyEnabled: boolean;
  cashbackPercent: number;
  pointsPerReal: number;
  rewardPoints: number;
  rewardCents: number;
  recoveryEnabled: boolean;
  recoveryMinutes: number;
  recoveryMessage: string;
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
  openaiKey: string;
  webhookToken: string;
  orderSeq: number;
};

export type HourDTO = {
  weekday: number;
  open: string;
  close: string;
  closed: boolean;
};

export type ProductDTO = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  emoji: string;
  available: boolean;
  featured: boolean;
  addons: Addon[];
  aliases: string[];
  sort: number;
};

export type CategoryDTO = {
  id: string;
  name: string;
  sort: number;
  active: boolean;
  products?: ProductDTO[];
};

export type DraftItem = {
  productId: string;
  name: string;
  qty: number;
  unitPriceCents: number;
};

export type Draft = {
  items: DraftItem[];
  fulfillment?: Fulfillment;
  address?: string;
  tableName?: string;
  payment?: PaymentMethod;
  notes?: string;
  couponCode?: string;
};

export type OrderItemDTO = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPriceCents: number;
  notes: string;
  addons: Addon[];
};

export type OrderEventDTO = {
  id: string;
  message: string;
  createdAt: string;
};

export type OrderDTO = {
  id: string;
  code: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  channel: Channel;
  fulfillment: Fulfillment;
  address: string;
  tableName: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  cashbackUsedCents: number;
  totalCents: number;
  notes: string;
  couponCode: string | null;
  courierId: string | null;
  courierName: string | null;
  cancelReason: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDTO[];
  events?: OrderEventDTO[];
};

export type CustomerDTO = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  tags: string[];
  cashbackCents: number;
  points: number;
  blocked: boolean;
  noCampaign: boolean;
  hidden: boolean;
  ordersCount: number;
  spentCents: number;
  createdAt: string;
  lastOrderAt: string | null;
};

export type ConversationDTO = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  blocked: boolean;
  status: "bot" | "human" | "closed";
  unread: number;
  draft: Draft;
  lastMessageAt: string;
  lastPreview: string;
};

export type MessageDTO = {
  id: string;
  direction: "in" | "out";
  body: string;
  kind: string;
  status: string;
  author: string;
  createdAt: string;
};

export type CouponDTO = {
  id: string;
  code: string;
  description: string;
  kind: "percent" | "fixed";
  value: number;
  minCents: number;
  maxUses: number | null;
  used: number;
  active: boolean;
  recovery: boolean;
  expiresAt: string | null;
};

export type CourierDTO = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  active: boolean;
};

export type ZoneDTO = {
  id: string;
  name: string;
  feeCents: number;
  etaMin: number;
  etaMax: number;
  active: boolean;
};

export type PublicMenu = {
  name: string;
  slug: string;
  description: string;
  address: string;
  phone: string;
  prepMinutes: number;
  minOrderCents: number;
  accepting: boolean;
  closedReason: string | null;
  hoursLabel: string;
  zones: ZoneDTO[];
  categories: {
    id: string;
    name: string;
    products: {
      id: string;
      name: string;
      description: string;
      priceCents: number;
      emoji: string;
      featured: boolean;
      addons: Addon[];
    }[];
  }[];
};
