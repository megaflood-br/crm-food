"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { brl, formatPhone, statusLabel, timeAgo } from "@/lib/format";
import type { ConversationDTO, CustomerDTO, Draft, MessageDTO } from "@/lib/types";
import { Banner, Button, control, Empty, PageHeader } from "./ui";

export function Inbox() {
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [conversation, setConversation] = useState<ConversationDTO | null>(null);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function loadList() {
    const data = await api<{ conversations: ConversationDTO[] }>("/api/conversations");
    setConversations(data.conversations);
    setSelected((current) => current ?? data.conversations[0]?.id ?? null);
  }

  async function loadThread(id: string) {
    const data = await api<{ conversation: ConversationDTO; messages: MessageDTO[]; customer: CustomerDTO }>(`/api/conversations/${id}`);
    setConversation(data.conversation);
    setMessages(data.messages);
    setCustomer(data.customer);
    if (data.conversation.unread) await api(`/api/conversations/${id}`, { method: "POST", body: JSON.stringify({ action: "read" }) });
  }

  useEffect(() => {
    void loadList().catch((err) => setError(err.message));
    const id = setInterval(() => { void loadList().catch(() => undefined); }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selected) return;
    void loadThread(selected).catch((err) => setError(err.message));
    const id = setInterval(() => { void loadThread(selected).catch(() => undefined); }, 4000);
    return () => clearInterval(id);
  }, [selected]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim()) return;
    const body = text;
    setText("");
    try {
      const data = await api<{ messages: MessageDTO[]; delivery: string | null }>(`/api/conversations/${selected}`, { method: "POST", body: JSON.stringify({ action: "message", text: body }) });
      setMessages(data.messages);
      if (data.delivery) setError(`Mensagem salva no painel. WhatsApp: ${data.delivery}`);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  async function run(action: string, extra?: object) {
    if (!selected) return;
    await api(`/api/conversations/${selected}`, { method: "POST", body: JSON.stringify({ action, ...extra }) });
    await loadThread(selected);
    await loadList();
  }

  const draft: Draft = conversation?.draft ?? { items: [] };

  return (
    <div>
      <PageHeader kicker="WhatsApp" title="Atendimento" />
      {error && <div className="mb-3"><Banner tone="bad">{error}</Banner></div>}
      <div className="grid min-h-[70vh] overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:grid-cols-[280px_1fr_280px]">
        <aside className="border-b border-line lg:border-b-0 lg:border-r">
          {conversations.map((item) => (
            <button key={item.id} onClick={() => setSelected(item.id)} className={`block w-full border-b border-line px-3 py-3 text-left ${selected === item.id ? "bg-[#fff4ef]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <strong className="truncate">{item.customerName}</strong>
                {item.unread > 0 && <span className="rounded-full bg-ember px-2 text-xs text-white">{item.unread}</span>}
              </div>
              <p className="truncate text-sm text-[#7a685c]">{item.lastPreview || "Sem mensagens"}</p>
              <p className="text-xs text-[#7a685c]">{statusLabel(item.status)} · {timeAgo(item.lastMessageAt)}</p>
            </button>
          ))}
          {!conversations.length && <Empty>Nenhuma conversa ainda.</Empty>}
        </aside>
        <section className="flex min-h-[420px] flex-col">
          <div className="flex-1 space-y-2 overflow-auto bg-[#f6f1ea] p-4">
            {messages.map((message) => (
              <div key={message.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.direction === "out" ? "ml-auto bg-[#d9fdd3]" : "bg-white"}`}>
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-1 text-[10px] text-[#7a685c]">{message.author} · {message.status}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto border-t border-line p-2">
            {["Já estou vendo.", "Qual o endereço com referência?", "O prazo hoje está de 40 a 60 min."].map((reply) => (
              <button key={reply} className="shrink-0 whitespace-nowrap rounded-full bg-[#f6f1ea] px-3 py-1 text-xs" onClick={() => setText(reply)}>{reply}</button>
            ))}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
            <input className={control} value={text} onChange={(event) => setText(event.target.value)} placeholder="Responder como a equipe" />
            <Button disabled={!selected}>Enviar</Button>
          </form>
        </section>
        <aside className="space-y-3 border-t border-line p-4 text-sm lg:border-l lg:border-t-0">
          {customer ? (
            <>
              <div>
                <h2 className="font-display text-2xl">{customer.name}</h2>
                <p>{formatPhone(customer.phone)}</p>
                <p className="text-[#7a685c]">{customer.address || "Sem endereço"}</p>
                <p>{customer.points} pts · cashback {brl(customer.cashbackCents)}</p>
                <Link className="text-ember" href={`/painel/clientes/${customer.id}`}>Ficha do cliente</Link>
              </div>
              <div className="flex gap-2">
                {conversation?.status === "bot" ? <Button onClick={() => run("status", { status: "human" })}>Assumir</Button> : <Button tone="ghost" onClick={() => run("status", { status: "bot" })}>Devolver pra Lia</Button>}
              </div>
              <div>
                <h3 className="font-semibold">Carrinho da Lia</h3>
                {draft.items.length ? draft.items.map((item) => <p key={item.productId}>{item.qty}× {item.name}</p>) : <p className="text-[#7a685c]">Vazio</p>}
                {draft.address && <p>{draft.address}</p>}
                {draft.payment && <p>{statusLabel(draft.payment)}</p>}
                <Button className="mt-2" disabled={!draft.items.length} onClick={() => run("confirm").catch((err) => setError(err.message))}>Lançar pedido</Button>
              </div>
            </>
          ) : <p className="text-[#7a685c]">Escolha uma conversa.</p>}
        </aside>
      </div>
    </div>
  );
}
