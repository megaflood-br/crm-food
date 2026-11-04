"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, centsToInput, reaisToCents } from "@/lib/client";
import { weekdayName } from "@/lib/format";
import type { HourDTO } from "@/lib/types";
import { Banner, Button, control, Field, PageHeader } from "./ui";

type Settings = {
  name: string; slug: string; phone: string; address: string; city: string; description: string;
  pixKey: string; pixHolder: string; prepMinutes: number; minOrderCents: number; deliveryFeeCents: number;
  accepting: boolean; closedReason: string | null; attendantName: string; attendantEnabled: boolean; attendantPersonality: string;
  recoveryEnabled: boolean; recoveryMinutes: number; recoveryMessage: string;
  evolutionUrl: string; evolutionInstance: string; evolutionKeySet: boolean; evolutionKeyHint: string;
  openaiKeySet: boolean; evolutionState: string; evolutionQr: string | null; webhookUrl: string; publicUrl: string;
  hours: HourDTO[];
};

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hours, setHours] = useState<HourDTO[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [test, setTest] = useState<string[]>([]);
  const [qr, setQr] = useState<string | null>(null);

  async function reload() {
    const data = await api<Settings>("/api/settings");
    setSettings(data);
    setHours(data.hours);
    setQr(data.evolutionQr);
  }
  useEffect(() => { void reload().catch((err) => setError(err.message)); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const next = await api<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify({
        name: form.get("name"), slug: form.get("slug"), phone: form.get("phone"), address: form.get("address"), city: form.get("city"),
        description: form.get("description"), pixKey: form.get("pixKey"), pixHolder: form.get("pixHolder"),
        prepMinutes: Number(form.get("prep")), minOrderCents: reaisToCents(String(form.get("min"))), deliveryFeeCents: reaisToCents(String(form.get("fee"))),
        attendantName: form.get("attendantName"), attendantEnabled: form.get("attendantEnabled") === "on", attendantPersonality: form.get("personality"),
        recoveryEnabled: form.get("recoveryEnabled") === "on", recoveryMinutes: Number(form.get("recoveryMinutes")), recoveryMessage: form.get("recoveryMessage"),
        evolutionUrl: form.get("evolutionUrl"), evolutionInstance: form.get("evolutionInstance"), evolutionKey: form.get("evolutionKey"),
        openaiKey: form.get("openaiKey"), hours,
      }) });
      setSettings(next);
      setNotice("Ajustes salvos.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  async function pause(mode: string) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify({ pauseMode: mode }) });
    await reload();
  }

  if (!settings) return <p>{error || "Carregando ajustes..."}</p>;
  return (
    <form onSubmit={save} className="space-y-6">
      <PageHeader kicker="Casa" title="Ajustes" />
      {notice && <Banner tone="good">{notice}</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      <section className="grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">Loja</h2>
        <Field label="Nome"><input name="name" className={control} defaultValue={settings.name} /></Field>
        <Field label="Link do cardápio"><input name="slug" className={control} defaultValue={settings.slug} /></Field>
        <Field label="Telefone"><input name="phone" className={control} defaultValue={settings.phone} /></Field>
        <Field label="Cidade do Pix"><input name="city" className={control} defaultValue={settings.city} /></Field>
        <Field label="Endereço"><input name="address" className={control} defaultValue={settings.address} /></Field>
        <Field label="Descrição"><input name="description" className={control} defaultValue={settings.description} /></Field>
        <Field label="Chave Pix"><input name="pixKey" className={control} defaultValue={settings.pixKey} /></Field>
        <Field label="Titular do Pix"><input name="pixHolder" className={control} defaultValue={settings.pixHolder} /></Field>
        <Field label="Preparo (min)"><input name="prep" type="number" className={control} defaultValue={settings.prepMinutes} /></Field>
        <Field label="Pedido mínimo"><input name="min" className={control} defaultValue={centsToInput(settings.minOrderCents)} /></Field>
        <Field label="Taxa padrão"><input name="fee" className={control} defaultValue={centsToInput(settings.deliveryFeeCents)} /></Field>
        <p className="text-sm text-[#7a685c] md:col-span-2">Cardápio público: {settings.publicUrl}</p>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="button" tone="ghost" onClick={() => pause("30")}>Pausar 30 min</Button>
          <Button type="button" tone="ghost" onClick={() => pause("tomorrow")}>Até amanhã</Button>
          <Button type="button" tone="danger" onClick={() => pause("close")}>Fechar</Button>
          <Button type="button" tone="good" onClick={() => pause("open")}>Reabrir</Button>
          <span className="self-center text-sm">{settings.accepting ? "Recebendo pedidos" : settings.closedReason}</span>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-4 shadow-card">
        <h2 className="font-display text-2xl">Horários</h2>
        <div className="mt-3 space-y-2">
          {hours.map((hour) => (
            <div key={hour.weekday} className="grid grid-cols-[120px_1fr_1fr_auto] items-center gap-2 text-sm">
              <span className="capitalize">{weekdayName(hour.weekday)}</span>
              <input className={control} value={hour.open} onChange={(event) => setHours((current) => current.map((item) => item.weekday === hour.weekday ? { ...item, open: event.target.value } : item))} />
              <input className={control} value={hour.close} onChange={(event) => setHours((current) => current.map((item) => item.weekday === hour.weekday ? { ...item, close: event.target.value } : item))} />
              <label className="flex items-center gap-1"><input type="checkbox" checked={hour.closed} onChange={(event) => setHours((current) => current.map((item) => item.weekday === hour.weekday ? { ...item, closed: event.target.checked } : item))} /> Fechado</label>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">Atendente</h2>
        <Field label="Nome"><input name="attendantName" className={control} defaultValue={settings.attendantName} /></Field>
        <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="attendantEnabled" defaultChecked={settings.attendantEnabled} /> Responder sozinha</label>
        <Field label="Jeito de falar"><textarea name="personality" className={control} defaultValue={settings.attendantPersonality} /></Field>
        <Field label="Chave OpenAI, se quiser respostas fora do cardápio"><input name="openaiKey" type="password" className={control} placeholder={settings.openaiKeySet ? "Chave já salva" : "Opcional"} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="recoveryEnabled" defaultChecked={settings.recoveryEnabled} /> Recuperar conversa parada</label>
        <Field label="Minutos de silêncio"><input name="recoveryMinutes" type="number" className={control} defaultValue={settings.recoveryMinutes} /></Field>
        <Field label="Mensagem do recuperador"><textarea name="recoveryMessage" className={`${control} md:col-span-2`} defaultValue={settings.recoveryMessage} /></Field>
        <TestBox onReply={(line) => setTest((current) => [...current, line])} lines={test} />
      </section>
      <section className="grid gap-3 rounded-3xl bg-[#161311] p-4 text-white md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">WhatsApp · Evolution API</h2>
        <Field label="URL do servidor"><input name="evolutionUrl" className={control} defaultValue={settings.evolutionUrl} placeholder="https://sua-evolution.com" /></Field>
        <Field label="Instância"><input name="evolutionInstance" className={control} defaultValue={settings.evolutionInstance} /></Field>
        <Field label="API key"><input name="evolutionKey" type="password" className={control} placeholder={settings.evolutionKeySet ? settings.evolutionKeyHint : "Cole a chave"} /></Field>
        <p className="text-sm text-[#e7d9cf]">Estado: {settings.evolutionState}. O webhook é gravado ao conectar.</p>
        <p className="break-all text-xs text-[#e7d9cf] md:col-span-2">{settings.webhookUrl}</p>
        <div className="flex gap-2">
          <Button type="button" onClick={async () => { const result = await api<{ qr: string | null; state: string }>("/api/whatsapp", { method: "POST", body: JSON.stringify({ action: "connect" }) }); setQr(result.qr); setNotice(`Conexão: ${result.state}`); }}>Conectar e gerar QR</Button>
          <Button type="button" tone="ghost" onClick={async () => { const result = await api<{ state: string }>("/api/whatsapp"); setNotice(`Estado: ${result.state}`); }}>Atualizar estado</Button>
        </div>
        {qr && <img src={qr} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-2xl bg-white p-2" />}
      </section>
      <PasswordBox />
      <Button>Salvar ajustes</Button>
    </form>
  );
}

function TestBox({ lines, onReply }: { lines: string[]; onReply: (line: string) => void }) {
  const [text, setText] = useState("oi, quero 2 brasa clássico pra entrega na rua harmonia 120 no pix");
  return (
    <div className="md:col-span-2 rounded-2xl bg-[#f6f1ea] p-3">
      <h3 className="font-semibold">Testar a Lia</h3>
      <div className="mt-2 space-y-1 text-sm">{lines.map((line, index) => <p key={index} className="whitespace-pre-wrap">{line}</p>)}</div>
      <div className="mt-2 flex gap-2">
        <input className={control} value={text} onChange={(event) => setText(event.target.value)} />
        <Button type="button" onClick={async () => { const result = await api<{ reply: string }>("/api/attendant/test", { method: "POST", body: JSON.stringify({ text }) }); onReply(`Você: ${text}`); onReply(result.reply); setText(""); }}>Enviar</Button>
      </div>
    </div>
  );
}

function PasswordBox() {
  const [message, setMessage] = useState("");
  return (
    <div className="grid gap-2 rounded-3xl bg-white p-4 shadow-card md:grid-cols-3" onSubmit={undefined}>
      <h2 className="font-display text-2xl md:col-span-3">Senha do painel</h2>
      <input id="current" type="password" className={control} placeholder="Senha atual" />
      <input id="next" type="password" className={control} placeholder="Nova senha" />
      <Button type="button" onClick={async () => {
        const current = (document.getElementById("current") as HTMLInputElement).value;
        const next = (document.getElementById("next") as HTMLInputElement).value;
        try {
          await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
          setMessage("Senha atualizada.");
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Erro");
        }
      }}>Trocar senha</Button>
      {message && <p className="text-sm md:col-span-3">{message}</p>}
    </div>
  );
}
