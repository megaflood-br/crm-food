"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bike, ClipboardList, Flame, Gift, LayoutDashboard, LogOut, Megaphone, Menu, MessageCircle, Settings, Ticket, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { api } from "@/lib/client";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/painel/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/painel/atendimento", label: "Atendimento", icon: MessageCircle },
  { href: "/painel/cardapio", label: "Cardápio", icon: UtensilsCrossed },
  { href: "/painel/clientes", label: "Clientes", icon: Users },
  { href: "/painel/cupons", label: "Cupons", icon: Ticket },
  { href: "/painel/disparos", label: "Disparos", icon: Megaphone },
  { href: "/painel/fidelidade", label: "Fidelidade", icon: Gift },
  { href: "/painel/caixa", label: "Caixa", icon: Wallet },
  { href: "/painel/entregas", label: "Entregas", icon: Bike },
  { href: "/painel/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/painel/ajustes", label: "Ajustes", icon: Settings },
];

export function Shell({ userName, storeName, children }: { userName: string; storeName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [accepting, setAccepting] = useState(true);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const data = await api<{ unread: number; accepting: boolean }>("/api/notifications");
        if (!stop) {
          setUnread(data.unread);
          setAccepting(data.accepting);
        }
      } catch {
        /* o painel mostra o erro na página */
      }
    };
    void tick();
    const id = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === "/painel" ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cx("flex items-center gap-3 rounded-2xl px-3 py-2 text-sm", active ? "bg-white/10 text-white" : "text-[#e7d9cf] hover:bg-white/5")}>
            <Icon size={16} />
            <span className="flex-1">{item.label}</span>
            {item.href === "/painel/atendimento" && unread > 0 && <span className="rounded-full bg-ember px-2 text-xs font-bold text-white">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh min-h-0 flex-col overflow-hidden bg-[#161311] px-3 py-4 text-white md:flex">
        <Link href="/painel" className="mb-5 flex items-center gap-3 px-2">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ember"><Flame size={18} /></span>
          <span>
            <strong className="block font-display text-lg leading-none">Brasa</strong>
            <span className="text-xs text-[#c8b8ae]">{storeName}</span>
          </span>
        </Link>
        <div className="mb-3 px-2 text-xs text-[#c8b8ae]">{accepting ? "Loja recebendo pedidos" : "Loja pausada ou fechada"}</div>
        <div className="min-h-0 flex-1 overflow-auto">{nav}</div>
        <form className="shrink-0" action="/api/auth/logout" onSubmit={async (event) => { event.preventDefault(); await api("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
          <button className="mt-3 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm text-[#e7d9cf] hover:bg-white/5"><LogOut size={16} /> Sair · {userName.split(" ")[0]}</button>
        </form>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-[#f3eee7]/90 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white"><Menu size={18} /></button>
          <strong className="font-display text-xl">Brasa</strong>
          <span className={cx("h-2.5 w-2.5 rounded-full", accepting ? "bg-leaf" : "bg-ember")} />
        </header>
        {open && (
          <div className="fixed inset-0 z-40 bg-[#161311] p-4 text-white md:hidden" onClick={() => setOpen(false)}>
            <div className="mb-4 font-display text-2xl">Brasa</div>
            {nav}
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
