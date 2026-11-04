import { notFound } from "next/navigation";
import { PublicMenuView } from "@/components/public-menu";
import { getPublicMenu } from "@/server/catalog";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = getPublicMenu(slug);
  if (!menu) notFound();
  return <PublicMenuView menu={menu} />;
}
