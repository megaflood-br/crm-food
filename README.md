# Brasa

CRM de delivery em TypeScript e Next.js, no espírito de uma operação que vende pelo próprio WhatsApp: cardápio, atendimento, gestor de pedidos, caixa, entregas, cupons, disparos, fidelidade e relatórios. O número da loja entra pela [Evolution API](https://doc.evolution-api.com/).

## Subir

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Acesso de demonstração: `ana@brasa.local` / `brasa1234`.

O banco SQLite nasce em `data/crm.db` com a hamburgueria Brasa & Cia, pedidos no kanban e conversas da Lia. Cardápio público: [http://localhost:3000/cardapio/brasa](http://localhost:3000/cardapio/brasa).

## WhatsApp

Em **Ajustes**, preencha a URL, a instância e a API key da Evolution (ou use `EVOLUTION_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` no ambiente). **Conectar e gerar QR** cria a instância, grava o webhook e mostra o QR Code.

O webhook fica em `/api/webhooks/evolution?token=...`. Mensagens novas entram no atendimento. Com a Lia ligada, ela anota item, endereço, pagamento e fecha o pedido. Áudio, figurinha e imagem são recebidos; a transcrição de áudio não é automática. Se houver `OPENAI_API_KEY`, o que fugir do cardápio pode ser respondido pelo modelo, sem inventar preço.

Sem a Evolution configurada, o painel continua inteiro: a Lia responde na conversa local e os disparos ficam registrados no atendimento.

## O que tem no painel

- Painel do dia, pausa e fechamento da loja
- Gestor em colunas: análise, preparo, pronto, entrega e finalizados, com balcão, mesa, retirada e delivery
- Atendimento com fila, assumir conversa, carrinho da atendente e resposta humana
- Cardápio com adicional, apelido e pausa de item
- Clientes, bloqueio, opt-out de disparo, pontos e cashback
- Cupons e recuperador de conversa parada
- Disparos por público (todos, sumidos, VIP, nunca pediram)
- Caixa com abertura, sangria, suprimento e fechamento
- Motoboys, áreas de entrega e despacho
- Relatórios de 1, 7 e 30 dias
- Pix copia e cola no cardápio e na conversa
- Impressão do pedido

Dinheiro e cartão na entrega entram no caixa aberto. Pix e cartão online ficam no relatório, fora da gaveta.

## Scripts

```bash
npm test
npm run build
```
