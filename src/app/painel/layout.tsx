import { requireUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = getConfig();
  return <Shell userName={user.name} storeName={store.name}>{children}</Shell>;
}
