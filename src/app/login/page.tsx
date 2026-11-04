"use client";

import { FormEvent, useState } from "react";
import { Flame } from "lucide-react";
import { api } from "@/lib/client";
import { Button, control, Field } from "@/components/ui";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      window.location.href = "/painel";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#161311] p-10 text-white lg:flex">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-ember"><Flame /></span><span className="font-display text-2xl">Brasa</span></div>
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-[#e7b5a4]">Delivery no seu WhatsApp</p>
          <h1 className="mt-3 max-w-md font-display text-5xl leading-[1.05]">Do primeiro oi ao cliente que volta, sem comissão no meio.</h1>
        </div>
        <p className="max-w-sm text-sm text-[#d6c4ba]">Cardápio, atendimento, pedidos, motoboy, caixa, cupom, cashback e disparo. A Evolution API liga o número da loja.</p>
      </section>
      <section className="grid place-items-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden flex items-center gap-2 font-display text-3xl"><Flame className="text-ember" /> Brasa</div>
          <h2 className="font-display text-4xl">Entrar na loja</h2>
          <Field label="E-mail"><input className={control} name="email" type="email" defaultValue="ana@brasa.local" required /></Field>
          <Field label="Senha"><input className={control} name="password" type="password" defaultValue="brasa1234" required /></Field>
          {error && <p className="text-sm text-[#9f1239]">{error}</p>}
          <Button className="w-full" disabled={loading}>{loading ? "Entrando..." : "Abrir o painel"}</Button>
          <p className="text-xs text-[#7a685c]">Acesso de demonstração já preenchido: ana@brasa.local / brasa1234</p>
        </form>
      </section>
    </main>
  );
}
