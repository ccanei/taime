# SPEC — Newsletter do Radar: envio diário + admin

> Autonomia total para implementar. Build deve ter 0 erros TypeScript antes da
> entrega. Trabalhar em `claude-taime/taime-web`. Seguir os padrões já existentes
> no projeto (citados em cada seção). Não consolidar package.json. Sem em dash
> (U+2014) em nenhuma copy. Fontes sempre por categoria, nunca por nome.

## Contexto

A captura de inscritos já existe e funciona: `/radar` tem o `NewsletterSignup`,
`POST /api/newsletter/subscribe` grava em `newsletter_subscribers`
(`status:'active'`, `source:'radar'`). O que falta é **o outro lado**: o envio
diário, o histórico e o admin de gestão.

Decisões já tomadas pelo dono do produto:
- Conteúdo do e-mail = **reusar o briefing diário** (`radar_briefings`), que o cron
  `/api/cron/radar-briefing` já gera 1x/dia (08:00 BRT).
- Histórico = **tabela própria** (`newsletter_sends` + `newsletter_send_recipients`).
- Remoção de inscrito = **soft delete via status**, nunca DELETE.
- Inscrição **já entra aprovada** e na lista de destinatários. O admin é
  verificação e, se preciso, bloqueio/remoção — não uma fila de aprovação.

## Pré-requisito (humano, antes do deploy)

Rodar `add-newsletter-admin.sql` no Supabase SQL Editor. Estende
`newsletter_subscribers` (token de unsubscribe + campos de rastro de status) e
cria `newsletter_sends` e `newsletter_send_recipients`. É idempotente.

---

## Parte 1 — Cron de envio diário

**Novo:** `app/api/cron/newsletter-send/route.ts`

Padrão de auth e estrutura idênticos a `/api/cron/radar-briefing`:
- Header `Authorization: Bearer ${CRON_SECRET}`; 401 se inválido.
- Service key para todas as leituras/escritas no Supabase (REST).

Fluxo:
1. **Pega o briefing do dia.** GET
   `radar_briefings?briefing_date=eq.{hoje UTC YYYY-MM-DD}&limit=1`.
   Se não existe briefing hoje, retorna `{ success:true, skipped:true,
   reason:'no_briefing_today' }` e **não** cria linha em `newsletter_sends`
   (ou cria com `status:'skipped'` — ver nota de idempotência). Não inventa
   conteúdo: sem briefing, não há e-mail.
2. **Idempotência.** Antes de enviar, GET
   `newsletter_sends?briefing_date=eq.{hoje}&status=in.(sent,partial)&limit=1`.
   Se já houve envio do briefing de hoje, retorna
   `{ success:true, skipped:true, reason:'already_sent' }`. Evita duplicar se o
   cron rodar duas vezes.
3. **Carrega destinatários ativos.** GET
   `newsletter_subscribers?status=eq.active&select=id,email,locale`.
   Se 0 ativos, grava `newsletter_sends` com `status:'skipped'`,
   `recipient_count:0` e retorna.
4. **Monta o e-mail por idioma.** Reusa o template dark table-based já validado
   (mesmo padrão visual de `sendApprovalEmail` / `radar-briefing`):
   - `pt-BR` → `title_pt` / `body_pt`; `en` → `title_en` / `body_en`.
   - Corpo do briefing em parágrafos (`split(/\n{2,}|\n/g)`), fonte serif para o
     corpo (consistência com a página `/radar`).
   - **`escapeHtml`** em todo campo dinâmico (defesa XSS, padrão do projeto).
   - **Rodapé obrigatório com link de unsubscribe**:
     `https://www.taime.tech/api/newsletter/unsubscribe?token={unsubscribe_token}`.
     O token é por inscrito (vem do passo 3 — incluir `unsubscribe_token` no
     select). CAN-SPAM / LGPD: todo e-mail de lista precisa de saída em 1 clique.
   - Sem em dash. Sem valores monetários. Fonte por categoria.
   - `from: noreply@taime.tech`.
5. **Envio.** Preferir o endpoint de **batch do Resend** (`/emails/batch`,
   até 100 por chamada) agrupando por idioma; paginar em lotes de 100. Capturar
   sucesso/falha por destinatário.
6. **Registra histórico** (mesma transação lógica, best-effort por linha):
   - 1 linha em `newsletter_sends`: `briefing_id`, `briefing_date`, snapshot
     (`subject_pt/en`, `body_pt/en`), `recipient_count`, `sent_count`,
     `failed_count`, `status` (`sent` se tudo ok, `partial` se houve falha,
     `failed` se nada saiu), `resend_reference` (id de batch ou 1º id retornado).
   - N linhas em `newsletter_send_recipients` (1 por destinatário): `send_id`,
     `subscriber_id`, `email`, `locale`, `delivered`, `error`.
   - O snapshot do corpo é deliberado: preserva o que foi enviado mesmo que o
     briefing seja editado depois.
7. Retorna `{ success:true, sent, failed, recipient_count }`.

**Agendamento (`vercel.json`):** adicionar um cron novo **depois** do
`radar-briefing`. O briefing roda 11:00 UTC (08:00 BRT); o envio pode rodar, por
exemplo, **11:30 UTC** (08:30 BRT), garantindo que o briefing do dia já existe.
Não alterar os crons existentes (`/api/cron/radar` 10:00 UTC, `/api/cron/radar-briefing`
11:00 UTC).

> Nota de robustez: como o envio depende do briefing existir, e o briefing é
> gerado 30min antes, manter o passo 1 tolerante (se o briefing falhou naquele
> dia, apenas skip — não quebrar, não enviar e-mail vazio).

---

## Parte 2 — Endpoint público de unsubscribe

**Novo:** `app/api/newsletter/unsubscribe/route.ts`

- GET com `?token={uuid}` (link clicável direto do e-mail, sem login).
- Service key: PATCH
  `newsletter_subscribers?unsubscribe_token=eq.{token}` →
  `{ status:'unsubscribed', status_changed_at: now, status_changed_by:'self' }`.
- Token inválido/ausente: página simples informando que o link é inválido (não
  vazar se o e-mail existe). Sucesso: página simples bilíngue confirmando a saída
  ("Você não receberá mais a newsletter do Radar." / "You will no longer receive
  the Radar newsletter."). Sem em dash.
- Sem honeypot necessário (é GET idempotente por token). Idempotente: re-clicar
  mantém `unsubscribed`.

---

## Parte 3 — Admin da newsletter

**Novo:** `app/admin/newsletter/page.tsx` (server component)
- Gate admin idêntico aos outros: `isAdmin(user.email)`; 403/redirect se não.
- Renderiza `<AdminNav active="/admin/newsletter" />` após o breadcrumb (ver Parte 4).
- Busca via service key, em paralelo (`Promise.all`):
  - inscritos: `newsletter_subscribers?order=created_at.desc` (todos os status).
  - envios: `newsletter_sends?order=created_at.desc&limit=50`.
- Distinguir "tabela ausente" (instruir a rodar o SQL, padrão de `/admin/engagement`)
  de "lista vazia".
- Passa os dados para um client component `NewsletterAdmin`.

**Novo:** `app/admin/newsletter/NewsletterAdmin.tsx` (client component)
- Bilíngue via `useLocale()` (mesmo padrão das telas admin).
- **Duas abas / seções**: "Inscritos" e "Envios".

### Seção Inscritos
- Tabela: Email · Idioma · Origem (`source`) · Status (badge) · Inscrito em ·
  Ações.
- Badges de status: active = verde, blocked = vermelho, unsubscribed = zinc,
  removed = zinc riscado.
- Filtros (chips com contagem): Todos / Ativos / Bloqueados / Saíram / Removidos.
- Busca por email (input client-side).
- Ações por linha, conforme status atual:
  - **Bloquear** (active → blocked): abre prompt opcional de motivo
    (`blocked_reason`). Bloqueado não recebe envio.
  - **Reativar** (blocked/unsubscribed/removed → active).
  - **Remover** (qualquer → removed): soft delete, `window.confirm` antes.
- Cada ação chama a API admin (Parte 3b) e atualiza a linha localmente (sem reload),
  no mesmo estilo do `WaitlistAdmin` (estado de `busy` por linha, flash de
  confirmação).
- Deixar explícito na UI que inscrição **já entra como `active`** — o admin não
  aprova, só gere exceções.

### Seção Envios
- Tabela: Data do briefing · Enviado em · Destinatários · Enviados · Falhas ·
  Status (badge) · Ações.
- Linha expansível: ao abrir, mostra o **conteúdo enviado** (subject + body, PT e
  EN lado a lado, do snapshot em `newsletter_sends`) e a **lista de destinatários**
  daquele envio (GET sob demanda em `newsletter_send_recipients?send_id=eq.{id}`,
  via uma rota admin de leitura ou já incluído no SSR se o volume for baixo).
- Se houver `resend_reference`, mostrar como texto (referência para cruzar no
  painel do Resend). Não chamar a API do Resend aqui — a tabela própria é a fonte.

### Parte 3b — APIs admin (todas com `isAdmin` + service key)
- **Novo** `app/api/admin/newsletter/subscriber-action/route.ts`:
  POST `{ id, action, reason? }` onde `action ∈ block|reactivate|remove`.
  Valida `isAdmin`; mapeia para o `status` correspondente; grava
  `status_changed_at:now`, `status_changed_by: user.email`, e `blocked_reason`
  quando `block` (limpa quando reativa). PATCH via service key. Retorna
  `{ success:true }`.
- **Novo (opcional, se não vier no SSR)**
  `app/api/admin/newsletter/send-recipients/route.ts`:
  GET `?send_id=...` → lista de `newsletter_send_recipients` daquele envio.
  `isAdmin` + service key.

> Não criar rota de "aprovar inscrito" — inscrição não tem fila de aprovação.

---

## Parte 4 — AdminNav: adicionar Newsletter

`components/AdminNav.tsx` é a **fonte única** do menu admin. Hoje tem 4 links:
Waitlist, Reports, Feedback, Engagement.

- Adicionar **Newsletter** (`/admin/newsletter`) à constante de links, na ordem
  que fizer sentido (sugestão: após Feedback, antes de Engagement, ou ao fim).
- Como todas as páginas admin já usam `<AdminNav />`, o link novo aparece
  automaticamente em todas elas. Nenhuma outra página admin precisa ser editada
  além de criar a `/admin/newsletter` usando o componente.
- Label igual em PT e EN ("Newsletter"), como os outros itens.

---

## Resumo de arquivos

Novos:
- `add-newsletter-admin.sql` (rodar no Supabase) — entregue junto.
- `app/api/cron/newsletter-send/route.ts`
- `app/api/newsletter/unsubscribe/route.ts`
- `app/admin/newsletter/page.tsx`
- `app/admin/newsletter/NewsletterAdmin.tsx`
- `app/api/admin/newsletter/subscriber-action/route.ts`
- `app/api/admin/newsletter/send-recipients/route.ts` (se não vier no SSR)

Modificados:
- `components/AdminNav.tsx` (1 link novo)
- `vercel.json` (1 cron novo, 11:30 UTC; não tocar os existentes)

Não tocar:
- `/api/newsletter/subscribe`, `NewsletterSignup`, `/api/cron/radar-briefing`,
  `/api/cron/radar`, template de aprovação, nenhuma outra página admin.

## Checklist de aceite
- [ ] `add-newsletter-admin.sql` roda limpo no Supabase.
- [ ] `cd taime-web && npm run build` com 0 erros TypeScript.
- [ ] Cron de envio: testável via `curl` com `Authorization: Bearer $CRON_SECRET`;
      skip correto quando não há briefing / não há ativos / já enviado hoje.
- [ ] E-mail traz link de unsubscribe funcional por inscrito; clicar marca
      `unsubscribed` e o inscrito some dos ativos.
- [ ] `/admin/newsletter` aparece no AdminNav de todas as telas admin.
- [ ] Bloquear/reativar/remover refletem no status e no rastro
      (`status_changed_at/by`, `blocked_reason`); inscrito bloqueado/removido não
      entra no próximo envio.
- [ ] Seção Envios mostra conteúdo enviado (snapshot) e destinatários por envio.
- [ ] 0 em dash em qualquer copy nova. Fontes por categoria no e-mail.
