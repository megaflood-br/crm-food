import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getOrder } from "@/server/orders";
import { PrintTicket } from "@/components/print-ticket";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();
  return <PrintTicket order={order} store={getConfig().name} />;
}
