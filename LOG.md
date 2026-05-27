# TAIME — Development Log

---

## [2026-05-27] — Email de aprovação via Resend em /api/admin/approve

### Status
- [x] `app/api/admin/approve/route.ts`: novo helper `sendApprovalEmail(to)` + chamada após sucesso do update da waitlist
- [x] Template HTML em constante `APPROVAL_EMAIL_HTML` — estrutura table-based XHTML (mesmo padrão Outlook-compat do `userEmailHtml` da waitlist), com CTA `Access TAIME →` linkando para `https://www.taime.tech/login`
- [x] Caracteres HTML-entities (`&rarr;`, `&middot;`) usados em vez de unicode literal — evita risco de codificação em clients que não respeitam UTF-8 declarado
- [x] `from: 'TAIME <noreply@taime.tech>'`, `subject: 'Your TAIME access is ready'`
- [x] Padrão de falha consistente com outras rotas Resend: `.catch((e) => console.error('Resend approval error:', e))` + early return se `RESEND_API_KEY` ausente. **Falha no email não bloqueia a aprovação** — usuário já foi criado no Auth e marcado como contacted
- [x] `npm run build`: 0 erros TypeScript ✓

### Ordem de operações
1. Auth check (admin only)
2. Cria usuário no Supabase Auth (REST admin API)
3. Marca `contacted = true` na waitlist
4. Envia email de aprovação via Resend (best-effort)
5. Retorna `{ success: true }`

---

## [2026-05-27] — ADMIN_EMAIL agora vem de env var (fallback hardcoded preservado)

### Status
- [x] `app/api/admin/waitlist/route.ts`: `const ADMIN_EMAIL = 'claudineicanei1@gmail.com'` → `process.env.ADMIN_NOTIFICATION_EMAIL ?? 'claudineicanei1@gmail.com'`
- [x] Fallback hardcoded mantido (mesmo email) — se a env var não for definida, comportamento atual é preservado
- [x] `npm run build`: 0 erros TypeScript ✓

### Ação opcional na Vercel
Para mudar o destinatário sem alterar código, definir:
```
ADMIN_NOTIFICATION_EMAIL=outro@taime.tech
```

---

## [2026-05-27] — Email da waitlist (user) reescrito como tabela (Outlook/Microsoft 365)

### Status
- [x] `app/api/admin/waitlist/route.ts` `userEmailHtml` reescrito com estrutura table-based:
  - DOCTYPE XHTML 1.0 Transitional + `<html xmlns>` para tolerância máxima de renderers
  - Meta charset UTF-8 + viewport para mobile
  - `<table>` aninhada (outer 100% + inner 600px) — padrão recomendado para Outlook desktop, que não respeita CSS de layout em `<div>`
  - Todos os estilos inline (Outlook ignora `<style>` blocks)
  - `border="0" cellpadding="0" cellspacing="0"` em todas as tables (zera defaults do Outlook)
  - Cores em hex (`#0F172A`, `#ffffff`) onde possível, rgba mantido nos textos secundários
  - `font-family:Georgia,serif` declarado em cada `<td>`/elemento (Outlook não herda fontes confiavelmente)
  - Padding em `<td>` (Outlook ignora `margin` na maioria dos elementos)
- [x] `escapeHtml(firstName)` mantido — defesa XSS preservada
- [x] `npm run build`: 0 erros TypeScript ✓

### Não tocado
- Email do **admin** (`adminEmailHtml`): mantido como `<div>` simples — vai para `claudineicanei1@gmail.com` (Gmail render é tolerante). Se admin migrar para Outlook, repete o tratamento table-based.
- Warning de lockfiles duplicados continua (não bloqueador).

---

## [2026-05-27] — Preços "Acesso Antecipado", period_label no dashboard, FAQ sobre frequência

### Status
- [x] **Plans (home + /planos)** PT: `R$ 197/mês` / `R$ 497/mês` → `Acesso Antecipado`. Essencial desc `Inteligência completa mensal` → `Inteligência completa quinzenal`. Estratégico desc mantida (`Inteligência contínua e histórica`). Gratuito mantido (`Grátis`)
- [x] **Plans EN**: `R$ 197/mo` / `R$ 497/mo` → `Early Access`. Essential desc `Complete monthly intelligence` → `Complete biweekly intelligence`. Strategic mantido
- [x] **Nota dos planos** PT (`plansNote` na home + `subtitle` em /planos): "Preços serão anunciados em breve. Cadastre-se agora para garantir condições especiais de lançamento."
- [x] **Nota dos planos** EN: "Pricing coming soon. Sign up now to secure special launch conditions."
- [x] **plansSub** alinhado também (removida menção a Stripe): PT "Preços serão anunciados em breve. Cadastre-se para garantir acesso antecipado." / EN "Pricing coming soon. Sign up now to secure early access."
- [x] **FAQ "frequência"** PT: "relatórios mensais para 2000–2014 e quinzenais de 2015 até hoje" (removido "quinzenais de 2015 a 2021, e quinzenais a partir de 2022")
- [x] **FAQ "frequência"** EN: "monthly reports for 2000–2014 and biweekly from 2015 to present"
- [x] **DashboardClient.tsx**: já implementado em PT (`report.period_label || formatPeriodFull(report.period, 'pt-BR')`) — sem alteração necessária. Query em `dashboard/page.tsx` faz `select('*, ...')` então `period_label` já vem
- [x] `npm run build`: 0 erros, 0 warnings TypeScript ✓

### Warning conhecido (não-bloqueador)
Next detecta múltiplos `package-lock.json` (na raiz e em `taime-web/`) e infere workspace root como a raiz. Para silenciar, ou remover o lockfile raiz, ou definir `turbopack.root` no next.config. Build segue normal.

### Não tocado
- App/page.tsx e app/planos/page.tsx renderizam `price` com `text-2xl font-bold tabular-nums` — esse estilo foi pensado para "R$ 197/mês" (numérico). "Acesso Antecipado" / "Early Access" vão renderizar mas com `tabular-nums` (visual neutro, sem dano). Se quiser fonte menor para texto não-numérico, posso ajustar depois.

---

## [2026-05-26] — Untrack .claude/ + force push limpo

### Status
- [x] `.claude/` adicionado ao `.gitignore` raiz
- [x] `git rm --cached -rf .claude/` — removido do tracking sem deletar do disco
- [x] Commit refeito sem `.claude/settings.local.json` poluindo o diff
- [x] `git push --force-with-lease` — substituiu `850028e` no remote por `f7dfc7c`. Os 2 commits "security" do remote foram absorvidos: a intenção (proteger `.claude/`) está agora no `.gitignore` do meu commit
- [x] Remote agora reflete o trabalho real do projeto

### Histórico final no remote (top 5)
```
f7dfc7c feat: waitlist API route with Resend emails
846fce7 chore: remove accidental empty file
6a2b4fc debug: add logs to waitlist route
39d07ab feat: Resend emails for waitlist signup
5445366 feat: Resend emails for waitlist and magic link setup
```

---

## [2026-05-26] — Nova rota /api/admin/waitlist com Resend (substitui insert direto)

### Status
- [x] `app/api/admin/waitlist/route.ts` criada: POST recebe `{ name, email, company, role, interest }`, insere via service key na tabela `waitlist`, envia 2 emails via Resend
- [x] Email **usuário** (`from: TAIME <noreply@taime.tech>`, subject `You are on the TAIME waitlist`): fundo escuro, saudação personalizada com primeiro nome (fallback `there`), corpo formal sem contrações
- [x] Email **admin** (`claudineicanei1@gmail.com`, subject `New TAIME waitlist signup`): tabela com Nome/Email/Empresa/Cargo/Interesse/Data (timezone `America/Sao_Paulo`) + botão `Ver waitlist completa →` para `/admin/waitlist`
- [x] `escapeHtml` em todos os campos do user nos 2 emails (defesa XSS)
- [x] `await Promise.all([...])` — falhas silenciadas dentro de `sendEmail.catch`, não bloqueiam cadastro
- [x] Trata 409 (duplicate) com `{ error: 'Email já cadastrado' }`
- [x] `app/login/page.tsx` `handleWaitlist` atualizado: `supabase.from('waitlist').insert(...)` → `fetch('/api/admin/waitlist', POST)`. Trata 409 com `t.login.errDuplicate`, resto com `t.login.errGeneric`. `createSupabaseBrowser` mantido (ainda usado pelo magic link)
- [x] `npm run build`: 0 erros, 0 warnings, 24 rotas (nova `/api/admin/waitlist`) ✓

### Por que mover para API route
`supabase.from('waitlist').insert(...)` direto do browser depende de RLS policy aberta para anon role — frágil. Com service key no servidor, dispensa RLS no client e permite enviar emails Resend no mesmo handler.

### Endpoint
`POST /api/admin/waitlist` — payload `{ name, email, company, role, interest }`, retorna `{ success: true }` ou `{ error: string }` com status apropriado.

---

## [2026-05-26] — Fix remote do git + force push: ccanei/taime-web → ccanei/taime

### Status
- [x] `git remote set-url origin https://github.com/ccanei/taime.git` — remote corrigido
- [x] `git fetch origin` — identificada divergência total (remote tinha 2 commits independentes, local tinha 12 commits sem nenhum em comum)
- [x] `git push --force-with-lease` (autorizado pelo user) — substituído `01f3969`/`0a25c4a` no remote pelos 12 commits locais

### Commits que subiram (em ordem)
```
846fce7 chore: remove accidental empty file
6a2b4fc debug: add logs to waitlist route
39d07ab feat: Resend emails for waitlist signup
5445366 feat: Resend emails for waitlist and magic link setup
1faf659 fix: API routes + waitlist API + login Supabase client
fc8e097 fix:home reports + Vercel compat
e9f7a1c fix: downgrade Next.js 16 to 14 — performance + Vercel compat
3670fe9 fix: PGRST125 query simplification + plural label
03edc56 fix: home page uses service role for public report preview
7ae21cc fix: next.config.mjs + middleware + multiple improvements
bccc63a feat: TAIME initial commit — pipeline + frontend + 9 reports
a82cd00 TAIME — initial commit
```

### Commits do remote que foram substituídos
- `01f3969 fix: next.config.mjs outputFileTracingRoot` (substituído — mudança equivalente já está em `7ae21cc`)
- `0a25c4a feat: TAIME initial deploy` (substituído — conteúdo equivalente em `a82cd00`/`bccc63a`)

### Convenção
**Repositório correto SEMPRE: `https://github.com/ccanei/taime.git`** — nunca `ccanei/taime-web`.

---

## [2026-05-26] — Debug: logs em pontos estratégicos da rota waitlist

### Status
- [x] `app/api/waitlist/route.ts` instrumentado com 5 logs:
  - `console.log('waitlist called')` — início do POST
  - `console.log('RESEND_API_KEY set:', !!process.env.RESEND_API_KEY)` — verifica env var (sem expor valor)
  - `console.log('inserted:', email)` — após sucesso da inserção no banco
  - `console.log('sending emails...')` — antes do `Promise.all` do Resend
  - `console.log('emails sent')` — após o `Promise.all` resolver
- [x] `console.error('Resend error:', e)` dentro de `sendEmail.catch(...)` mantido (já existia)
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Como usar
Após deploy na Vercel, abrir Functions logs → `/api/waitlist`. Cada cadastro produz a sequência:
```
waitlist called
RESEND_API_KEY set: true|false
inserted: <email>
sending emails...
emails sent
```
Se faltar algum step, fica claro onde parou. Se aparecer `Resend error: ...`, o problema é no envio (chave inválida, domínio não verificado, rate limit, etc).

---

## [2026-05-26] — Refazer emails da waitlist conforme spec final

### Status
- [x] `app/api/waitlist/route.ts` refeito para bater 100% com o spec novo
- [x] Email do usuário: removida `<img>` do logo, fonte do "TAIME" agora 22px, saudação `You are on the list, [FIRST_NAME].` (sem apóstrofes), corpo `You will receive... We will be in touch...`
- [x] Email do admin: labels em PT (Nome/Email/Empresa/Cargo/Interesse/**Data**), campo Data com timestamp `pt-BR` (timezone `America/Sao_Paulo`), botão `Ver waitlist completa →`
- [x] Padrão de envio: `await Promise.all([sendEmail(...), sendEmail(...)])` — falhas individuais silenciadas dentro de `sendEmail` via `.catch`, então `Promise.all` nunca rejeita
- [x] `escapeHtml` mantido em todos os campos do user (defesa XSS)
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Diferenças vs. iteração anterior
- Logo `<img>` removida (apenas texto "TAIME")
- Saudação sem contrações (`You are`, `You will`, `We will`) — mais formal
- Email admin em PT em vez de EN, com campo Data adicional
- `await Promise.all` em vez de fire-and-forget (cadastro só responde após tentativa de envio dos 2 emails)

---

## [2026-05-26] — Resend: emails da waitlist + setup SMTP do magic link

### Status
- [x] `app/api/waitlist/route.ts` envia 2 emails via Resend após inserir com sucesso:
  - **Usuário** (`from: TAIME <noreply@taime.tech>`, subject `You're on the TAIME waitlist`): HTML escuro com logo `taime-icon.svg`, saudação personalizada (primeiro nome, fallback `there`), corpo bilíngue de boas-vindas e footer
  - **Admin** (`claudineicanei1@gmail.com`, subject `New TAIME waitlist signup`): tabela com nome/email/empresa/cargo/interesse + botão direto para `/admin/waitlist`
- [x] Envio em paralelo via `Promise.all([...]).catch(() => {})` — falhas no Resend NÃO bloqueiam o sucesso do cadastro (apenas `console.error`)
- [x] `escapeHtml()` aplicado a todos os campos do usuário em ambos os emails (defesa XSS)
- [x] Se `RESEND_API_KEY` ausente, `sendEmail` faz `console.error` e segue silencioso
- [x] `taime-web/RESEND_SMTP_SETUP.md` criado com instruções passo-a-passo para configurar SMTP do Supabase com Resend + template do email de magic link
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Por que SMTP customizado para magic link
O email de magic link é enviado pelo próprio Supabase (não pela nossa API). Para customizar o visual (logo TAIME, fundo escuro, botão azul), precisa apontar o SMTP do Supabase para o Resend e substituir o template HTML no painel. A configuração é manual no painel do Supabase — daí o `.md`.

### Variáveis necessárias
- `RESEND_API_KEY` — já em `.env.local` (e na Vercel)
- DNS do `taime.tech` precisa ter os registros do Resend validados para enviar de `noreply@taime.tech`

---

## [2026-05-26] — Hardening Vercel: API routes robustas + waitlist via API + fallback SITE_URL

### Status
- [x] `app/api/reports/latest/route.ts`: URL normalization (`replace /rest/v1` e `/$/`), env var validation, `if (!res.ok)` + `try/catch` retornando `[]` em qualquer falha
- [x] `app/api/trends/top/route.ts`: mesmas correções
- [x] `app/api/waitlist/route.ts` criada: POST com service key, trata 409 (duplicate), error handling completo
- [x] `app/page.tsx`: fallback de `SITE_URL` mudado de `http://localhost:3000` → `https://taime-xi.vercel.app`; helpers agora verificam `if (!res.ok) return []`
- [x] `app/login/page.tsx` `handleWaitlist`: inserção direta `supabase.from('waitlist').insert(...)` → `fetch('/api/waitlist', { POST })`. Trata 409 com `t.login.errDuplicate`, resto com `t.login.errGeneric`. `createSupabaseBrowser` mantido (ainda usado pelo magic link)
- [x] `.env.local`: `NEXT_PUBLIC_SITE_URL=http://localhost:3000` já presente da entrega anterior — sem mudanças
- [x] `npm run build`: 0 erros, 0 warnings, 24 rotas (nova `/api/waitlist` registrada) ✓

### Por que isso resolve na Vercel
- Inserir na `waitlist` direto do browser exige `INSERT` policy aberta (anon role) — frágil e dependente de RLS. Movendo para API route, usa service key no servidor, sem depender de RLS no client.
- `SUPABASE_SERVICE_KEY` é server-only e não está disponível em Server Components na Vercel — daí o padrão de API route.
- `SITE_URL` fallback agora aponta para a Vercel para o caso de a env var não estar configurada no painel; quando configurada (recomendado), ela ganha precedência.
- URL normalization (`.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')`) tolera variações em como `NEXT_PUBLIC_SUPABASE_URL` é configurada (com ou sem trailing slash, com ou sem `/rest/v1`).

### Ação necessária na Vercel
Adicionar variável de ambiente no painel da Vercel:
`NEXT_PUBLIC_SITE_URL=https://taime-xi.vercel.app`

### Verificação: cliente browser
`lib/supabase-browser.ts` já usa `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL!, NEXT_PUBLIC_SUPABASE_ANON_KEY!)` — sem mudanças necessárias.

---

## [2026-05-26] — Fix next.config.mjs: trocar turbopack.root por outputFileTracingRoot

### Status
- [x] `taime-web/next.config.mjs` simplificado: removidos imports (`fileURLToPath`, `dirname`, `resolve`) e `turbopack.root`
- [x] Adicionado `outputFileTracingRoot: process.cwd()` — aponta tracing root para o próprio diretório do app
- [x] `npm run build`: 0 erros, 0 warnings (warning de mismatch entre `outputFileTracingRoot` e `turbopack.root` eliminado) ✓

### Causa
O warning anterior dizia que `outputFileTracingRoot` (inferido pelo Next como a raiz `claude-taime/`) e `turbopack.root` (que apontava para `..`) estavam coincidentemente apontando para o mesmo lugar, mas a inferência implícita do `outputFileTracingRoot` é frágil. Fixar ambos explicitamente para `process.cwd()` (que é o cwd quando `next build` roda — `taime-web/`) alinha o tracing à raiz correta do app sem depender de inferência.

### Config final
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
}

export default nextConfig
```

---

## [2026-05-26] — Score Dimensions: refazer como grid de 5 cards bilíngue

### Status
- [x] `lib/types.ts`: `TaimeFramework.score_dimensions` agora opcional (`score_dimensions?: ScoreDimensions`)
- [x] `components/ReportClient.tsx` `ScoreDimensionsPanel` reescrito:
  - Layout: flex horizontal com scroll em mobile, `sm:grid sm:grid-cols-5` em desktop
  - Nome da dimensão bilíngue (PT/EN) via `DIMENSION_NAMES` + `lang` prop
  - Label CAPS abaixo do nome (`text-[10px] font-medium tracking-wider text-zinc-400 uppercase`)
  - Barra de progresso colorida: `dimensionBarColor` (≥80 emerald, ≥60 amber, resto orange)
  - Score grande em destaque (`text-xl font-bold tabular-nums`) com cor combinando (`dimensionTextColor`)
  - Largura fixa em mobile (`w-44 shrink-0`) para permitir scroll horizontal
- [x] `TrendSection`: guard `fw.score_dimensions && (...)` — não renderiza se ausente
- [x] Section label traduzido: "Dimensões do Score" (PT) / "Score Dimensions" (EN)
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Mapeamento dos nomes
| chave | PT | EN |
|---|---|---|
| market_maturity | Maturidade de Mercado | Market Maturity |
| competitive_pressure | Pressão Competitiva | Competitive Pressure |
| strategic_impact | Impacto Estratégico | Strategic Impact |
| execution_complexity | Complexidade de Execução | Execution Complexity |
| competitive_lag_risk | Risco de Atraso Competitivo | Competitive Lag Risk |

### Lógica de cor
Diferente do `scoreColor` global (que usa ≥85/≥70/≥50). Para as dimensões usa a regra explícita:
- score ≥ 80 → `bg-emerald-500` / `text-emerald-700`
- score ≥ 60 → `bg-amber-500` / `text-amber-700`
- resto → `bg-orange-500` / `text-orange-700`

---

## [2026-05-26] — Refazer cards "Memória 25 anos": 3 cards temáticos → 2 cards por era

### Status
- [x] `lib/i18n/pt.ts` + `lib/i18n/en.ts`: `memCards` reescrito (shape novo: `badge, title, subtitle, desc`), agora 2 itens
- [x] `memImpact` removido dos dois i18n (violava as 3 regras: travessão, menção a quantidade de relatórios, menção a 47 fontes)
- [x] `memNote` removido dos dois i18n (instrução explícita)
- [x] `app/page.tsx` seção 5: grid `sm:grid-cols-3` → `md:grid-cols-2`, padding card `p-6` → `p-8 sm:p-10`
- [x] Cards: badge (taime-600 uppercase), título grande (`text-3xl sm:text-4xl` branco bold), subtítulo (`text-base white/60`), linha divisória (`h-px bg-white/10`), texto (`text-sm white/55`)
- [x] `<p>{h.memImpact}</p>` e `<p>{h.memNote}</p>` removidos da renderização
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Conteúdo final (PT)
- **2000 a 2014** · RELATÓRIOS MENSAIS · "A era da fundação digital"
- **2015 a hoje** · RELATÓRIOS QUINZENAIS · "A era da aceleração"

### Conteúdo final (EN)
- **2000 to 2014** · MONTHLY REPORTS · "The digital foundation era"
- **2015 to present** · BIWEEKLY REPORTS · "The acceleration era"

### Regras respeitadas
Nenhum travessão (`—`) nos textos. Nenhuma menção a quantidade de relatórios. Nenhuma menção ao número de fontes.

---

## [2026-05-26] — Refazer seção "25 anos de memória estratégica" com 3 cards temáticos

### Status
- [x] `lib/i18n/pt.ts`: `memTitle` reescrito; `memPeriods` removido; `memImpact`, `memCards` (3 itens), `memNote` adicionados
- [x] `lib/i18n/en.ts`: mesmas adições (estrutura espelhada à pt — `Translations` é `typeof pt`)
- [x] `app/page.tsx` seção 5: novo layout — badge + título + body + impact + 3 cards (grid 3/1) + nota + CTA
- [x] Cards: `bg-white/5` + `border-white/10` (mais claro que `bg-taime-900`), número em `text-taime-600`, título branco bold, desc `white/55`
- [x] `npm run build`: 0 erros, 0 warnings ✓

### Conteúdo dos cards (PT)
- **30+** — IA Agêntica em Operações
- **15+** — Cibersegurança com IA
- **15+** — Infraestrutura e Soberania

### Conteúdo dos cards (EN)
- **30+** — Agentic AI in Operations
- **15+** — AI-Powered Cybersecurity
- **15+** — Infrastructure and Sovereignty

### Nota
A página continua usando `getTranslations(locale)` (que já trata cookie `taime-locale`). Como `Translations = typeof pt`, qualquer mudança em pt.ts deve ser espelhada em en.ts ou TS quebra — ambos foram atualizados.

---

## [2026-05-26] — Remover cards da seção "Memória 25 anos" na home

### Status
- [x] `app/page.tsx` seção 5 (Memória 25 anos): grid de cards (`h.memPeriods.map(...)`) removido
- [x] Mantidos: label `memBadge`, título `memTitle`, subtítulo `memBody`, botão CTA `memCta`
- [x] Padding vertical da seção: `py-24` → `py-40` (respiro maior já que ficou só texto + CTA)
- [x] Espaçamentos internos aumentados: label `mb-3 → mb-6`, título `mb-4 → mb-6`, subtítulo `mb-12 → mb-16`
- [x] `npm run build`: 0 erros, 0 warnings, 23 rotas ✓

### Nota
`memPeriods` permanece definido em `lib/i18n/pt.ts` e `lib/i18n/en.ts` (não removido). Não é mais usado, mas mantê-lo é inócuo — se quiser limpar i18n no futuro, basta remover as chaves `memPeriods` dos dois arquivos.

---

## [2026-05-26] — Fix params como Promise no /reports/[id] (Next.js 16)

### Status
- [x] `app/reports/[id]/page.tsx`: `Props.params` tipado como `Promise<{ id: string }>`
- [x] `ReportPage`: adicionado `const { id } = await params` antes de qualquer uso
- [x] `getReport(params.id)` → `getReport(id)`
- [x] Verificado: única rota dinâmica do app (`find app -type d -name "[*]"`) — nenhuma outra correção necessária
- [x] Sem `generateMetadata` no arquivo, nada mais a corrigir
- [x] `npm run build`: 0 erros, 0 warnings, 23 rotas ✓
- [x] `GET /reports/6c73077f...` (ID real): 307 → `/login` ✓
- [x] `GET /reports/qualquer-id` (ID inválido): 307 → `/login` ✓

### Causa
Next.js 16 mudou `params` (e `searchParams`) de objeto síncrono para `Promise`. Acessar `params.id` direto sem `await` causa erro de runtime e o type check falha quando `Props.params` é tipado corretamente como `Promise<...>`.

---

## [2026-05-26] — Migrar middleware.ts → proxy.ts (convenção Next.js 16)

### Status
- [x] `taime-web/middleware.ts` renomeado para `taime-web/proxy.ts` (função `middleware` → `proxy`)
- [x] `config.matcher` mantido: `['/dashboard/:path*', '/reports/:path*', '/admin/:path*']`
- [x] `npm run build`: 0 erros, 0 warnings (deprecation eliminado), 23 rotas, `ƒ Proxy (Middleware)` registrado
- [x] `GET /reports/6c73077f...` (ID real): 307 → `/login` ✓ proxy protegendo
- [x] `GET /reports/qualquer-id` (ID inválido): 307 → `/login` ✓ não dá 404

### Causa
Next.js 16 inverteu a convenção: `middleware.ts` foi deprecado em favor de `proxy.ts`. O warning explícito do build (`The "middleware" file convention is deprecated. Please use "proxy" instead.`) confirmou a mudança. Migrar para `proxy.ts` elimina o warning e alinha com a convenção oficial.

### Detalhe TypeScript
O snippet sugerido sem tipo no parâmetro `setAll(cookiesToSet)` quebra o build com `Parameter 'cookiesToSet' implicitly has an 'any' type` (TS strict). Tipo explícito mantido:
```ts
setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>)
```

---

## [2026-05-26] — Restaurar middleware.ts + simplificar timeline (memPeriods)

### Status
- [x] `taime-web/proxy.ts` renomeado para `taime-web/middleware.ts` (função `proxy` → `middleware`)
- [x] `config.matcher` mantido: `['/dashboard/:path*', '/reports/:path*', '/admin/:path*']`
- [x] `lib/i18n/pt.ts` memPeriods: 3 itens → 2 itens (já estava correto da entrega anterior)
- [x] `lib/i18n/en.ts` memPeriods: 3 itens → 2 itens (já estava correto da entrega anterior)
- [x] `npm run build`: 0 erros, 23 rotas, `ƒ Proxy (Middleware)` registrado
- [x] `GET /reports/6c73077f...` (ID real): 307 → `/login` ✓ middleware protegendo
- [x] `GET /reports/qualquer-id` (ID inválido): 307 → `/login` ✓ não dá 404

### memPeriods finais
- **PT**: `2000–2014: Relatórios mensais` + `2015–hoje: Análises quinzenais`
- **EN**: `2000–2014: Monthly reports` + `2015–present: Biweekly analysis`

### ⚠ Warning conhecido (Next.js 16.2.4)
> The "middleware" file convention is deprecated. Please use "proxy" instead.

O Next.js 16 inverteu a convenção: agora prefere `proxy.ts` em vez de `middleware.ts`. O `middleware.ts` continua funcionando (compatibilidade), mas emite warning no build. Para silenciar, basta renomear novamente para `proxy.ts` e usar `export async function proxy(...)`. Mantido como `middleware.ts` por decisão do usuário.

---

## [2026-05-26] — Mover queries da home para API routes

### Status
- [x] `app/api/reports/latest/route.ts` criada — fetch direto ao Supabase com service key
- [x] `app/api/trends/top/route.ts` criada — fetch direto ao Supabase com service key
- [x] `app/page.tsx`: `adminClient()` + Supabase SDK removidos; `getLatestReports()` e `getTopTrends()` chamam as API routes via `fetch`
- [x] `.env.local`: `NEXT_PUBLIC_SITE_URL=http://localhost:3000` adicionado
- [x] `npm run build`: 0 erros TypeScript, 23 rotas (21 app + 2 novas API) ✓

### Causa
`SUPABASE_SERVICE_KEY` não estava acessível dentro do Server Component na Vercel (diferente do ambiente local). Padrão correto: service key só em API routes (`/api/*`) que são sempre server-side e têm acesso garantido às env vars no runtime da Vercel.

### Ação necessária na Vercel
Adicionar variável de ambiente no painel da Vercel:
`NEXT_PUBLIC_SITE_URL=https://taime-web.vercel.app`

### Mudanças
- `app/api/reports/latest/route.ts`: nova rota, `force-dynamic`, fetch REST Supabase com service key
- `app/api/trends/top/route.ts`: nova rota, `force-dynamic`, fetch REST Supabase com service key
- `app/page.tsx`: import `createClient` removido; `adminClient()` removido; `getLatestReports/getTopTrends` agora fazem fetch para as API routes internas via `NEXT_PUBLIC_SITE_URL`
- `taime-web/.env.local`: `NEXT_PUBLIC_SITE_URL=http://localhost:3000` adicionado

---

## [2026-05-26] — Fix conflito de lockfiles: next.config.mjs + .gitignore

### Status
- [x] `package-lock.json` da raiz adicionado ao `.gitignore` (Next.js usava o errado)
- [x] `taime-web/next.config.mjs` restaurado com `turbopack.root` apontando para `..`
- [x] `npm run dev`: ✓ Ready in 346ms — sem warnings de lockfile
- [x] `npm run build`: 0 erros TypeScript, 19 páginas + Proxy (Middleware) ✓

### Causa
O Next.js (Turbopack) resolvia o `package-lock.json` da raiz `claude-taime/` em vez do `taime-web/package-lock.json`, gerando conflito silencioso. Solução: ignorar o lockfile da raiz via `.gitignore` e configurar `turbopack.root` para que o Turbopack resolva módulos a partir do workspace correto.

### Mudanças
- `.gitignore`: `package-lock.json` adicionado (raiz)
- `taime-web/next.config.mjs`: reescrito com `fileURLToPath` + `turbopack.root: resolve(__dirname, '..')`

---

## [2026-05-26] — Fix PGRST125: queries simplificadas em app/page.tsx

### Status
- [x] PGRST125 corrigido: join `report_trends(...)` removido de `getLatestReports()`
- [x] Debug visual (`_debug: true`) removido
- [x] Label singular/plural da seção de relatórios mantido correto
- [x] Build: 0 erros TypeScript, 19 páginas + Proxy (Middleware) ✓

### Causa do PGRST125
O erro "Invalid path in request URL" era causado pelo join inline `report_trends(...)` na query REST do Supabase. Queries com join via PostgREST exigem relação FK explícita — sem FK configurada, a query falha.

### Mudanças em app/page.tsx
- Import: `createSupabaseService` removido, `createClient` de `@supabase/supabase-js` adicionado
- `adminClient()`: helper local com `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
- `getLatestReports()`: select sem join — `id, period, period_label, period_type, title_pt_br, title_en, executive_summary_pt_br, executive_summary_en, published_at`
- `getTopTrends()`: select expandido — `id, report_id, rank, title_pt_br, title_en, taime_score, taime_framework_pt_br, taime_framework_en, then_now_next_pt_br, then_now_next_en`
- Interfaces: `LandingTrend` removida, `LandingReport` sem `report_trends`, `TopTrend` expandida
- Mockup: `firstTrend` agora vem de `topTrends[0]` (antes vinha de `report.report_trends[0]`)
- `avgScore()` removida (não mais usada — score médio não aparece nos cards de relatório)
- Bloco debug visual `_debug` removido, todos os `console.log('[DEBUG]')` removidos

---

## [2026-05-26] — Diagnóstico: home page sem relatórios na Vercel

### Status
- [x] Código já estava correto: `getLatestReports()` e `getTopTrends()` usam `createSupabaseService()` com `SUPABASE_SERVICE_KEY`
- [x] Build: 0 erros TypeScript, 19 páginas + Proxy (Middleware) ✓

### Diagnóstico real
- `app/page.tsx` linhas 49 e 60: ambas as funções já usam `createSupabaseService()` — bypassa RLS
- `lib/supabase-server.ts` linha 31: `createSupabaseService()` usa `process.env.SUPABASE_SERVICE_KEY!`
- O código está correto localmente

### Causa provável do problema na Vercel
`SUPABASE_SERVICE_KEY` não é `NEXT_PUBLIC_` — precisa ser adicionada manualmente nas **Environment Variables** do projeto Vercel:
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Adicionar: `SUPABASE_SERVICE_KEY` = `<service_role key do Supabase>`
3. Re-deploy após adicionar

Variáveis necessárias na Vercel (todas sem `NEXT_PUBLIC_` precisam de config manual):
- `SUPABASE_SERVICE_KEY`
- `ANTHROPIC_API_KEY`
- `SERPER_API_KEY`
- `RESEND_API_KEY`
- `CRON_SECRET`

---

## [2026-05-26] — Verificação: proxy.ts e .gitignore

### Status
- [x] PROBLEMA 1 — `proxy.ts` é o nome correto para Next.js 16.2.6 (não `middleware.ts`)
- [x] PROBLEMA 2 — `taime-web/.gitignore` contém apenas `.vercel` — correto, sem exclusões problemáticas
- [x] Build: 0 erros TypeScript, 0 warnings de deprecação, 19 páginas + Proxy (Middleware) ✓

### Diagnóstico
- Next.js 16.2.6 mudou a convenção: `middleware.ts` está **deprecated**, o arquivo correto é `proxy.ts`
- A warning `"middleware" file convention is deprecated. Please use "proxy" instead.` aparece se o arquivo se chamar `middleware.ts`
- O arquivo `proxy.ts` com `export async function proxy()` já estava correto desde a sessão anterior
- `taime-web/.gitignore` OK: apenas `.vercel` excluído (configuração local do Vercel CLI, não deve ser commitada)

### Arquivos verificados
- `taime-web/proxy.ts` — mantido com função `proxy` (convenção Next.js 16)
- `taime-web/.gitignore` — apenas `.vercel` (correto)

---

## [2026-05-25] — Next.js 16.2.6: upgrade + correções de compatibilidade

### Status
- [x] Next.js atualizado de 14.2.x para 16.2.6
- [x] `cookies()` agora async — `await` adicionado em todos os usos
- [x] `createSupabaseServer()` agora async — todos os callers atualizados
- [x] `middleware.ts` renomeado para `proxy.ts` (nova convenção Next.js 16)
- [x] `next.config.mjs`: `turbopack.root` configurado para silenciar aviso de workspace
- [x] Build: 0 erros TypeScript, 19 páginas + Proxy (Middleware) ✓

### Arquivos modificados
- `lib/supabase-server.ts`: `createSupabaseServer()` → `async`, `await cookies()`
- `app/api/admin/approve/route.ts`: `await cookies()`
- `app/auth/callback/route.ts`: `await cookies()`
- `app/page.tsx`: `await cookies()`, `await createSupabaseServer()`
- `app/dashboard/page.tsx`: `await cookies()`, `await createSupabaseServer()`
- `app/dashboard/advisor/page.tsx`: `await createSupabaseServer()`
- `app/admin/waitlist/page.tsx`: `await createSupabaseServer()`
- `app/api/advisor/chat/route.ts`: `await createSupabaseServer()`
- `app/reports/[id]/page.tsx`: `await createSupabaseServer()`
- `app/sobre/page.tsx`: `SobrePage` e `generateMetadata` agora async, `await cookies()`
- `middleware.ts` → `proxy.ts`, função renomeada de `middleware` para `proxy`
- `next.config.mjs`: adicionado `turbopack.root` com `fileURLToPath(import.meta.url)`

---

## [2026-05-25] — Radar TAIME: nova posição, 4 cards aleatórios, cards simplificados

### Status
- [x] MUDANÇA 1 — RadarFeed movido para entre FAQ (seção 11) e Planos (seção 12)
- [x] MUDANÇA 2 — 4 cards aleatórios por carregamento (shuffle único, sem polling)
- [x] MUDANÇA 3 — Cards simplificados: sem badge de relevância, resumo 120 chars, grid 2 colunas

### MUDANÇA 1 — Nova posição
- Removido de entre SEÇÃO 6 (Relatórios Recentes) e SEÇÃO 7 (Como Funciona)
- Inserido entre SEÇÃO 11 (FAQ) e SEÇÃO 12 (Planos), perto do final da página

### MUDANÇA 2 — 4 cards aleatórios
- `useEffect` único sem interval: fetch → shuffle com `sort(() => Math.random() - 0.5)` → `.slice(0, 4)`
- Removido `useCallback` e `setInterval`; cada visita/F5 exibe seleção diferente

### MUDANÇA 3 — Cards simplificados
- Badge de relevância (Alto/Médio/Baixo) removido completamente
- Grid: `sm:grid-cols-2` (2 colunas desktop, 1 mobile) — era 4 colunas
- Resumo truncado a 120 chars com `...` via `truncate()`
- Footer: source_category + data absoluta à esquerda, "Ver fonte →" à direita
- Skeletons de loading reduzidos para 4 cards (era 8)

### Build
- `npm run build`: 0 erros TypeScript, 20 páginas ✓

---

## [2026-05-25] — Regeneração Jan–Abr 2026 (8 relatórios com novas regras de qualidade)

### Status
- [x] 8/8 períodos regenerados com sucesso
- [x] PERIOD_LABEL presente nos campos THEN de todos os relatórios
- [x] Scores PT = EN verificados (todos ✓)
- [x] period_label e period_type salvos automaticamente pelo generate-report.ts

### Relatórios regenerados

| Período       | Label PT                           | Score médio | Trends |
|---------------|------------------------------------|-------------|--------|
| 2026-01-01    | 1ª Quinzena de Janeiro de 2026     | 83          | 5      |
| 2026-01-16    | 2ª Quinzena de Janeiro de 2026     | 84          | 5      |
| 2026-02-01    | 1ª Quinzena de Fevereiro de 2026   | 84          | 5      |
| 2026-02-16    | 2ª Quinzena de Fevereiro de 2026   | 84          | 5      |
| 2026-03-01    | 1ª Quinzena de Março de 2026       | 83          | 5      |
| 2026-03-16    | 2ª Quinzena de Março de 2026       | 83          | 5      |
| 2026-04-01    | 1ª Quinzena de Abril de 2026       | 85          | 5      |
| 2026-04-16    | 2ª Quinzena de Abril de 2026       | 84          | 5      |

### Detalhes técnicos
- Script: `regen-jan-apr.ts` — delete → check signals → analyze → generate (15s delay)
- Sinais por período: 224–281 (média ~255); cobertos pelos clusters: 87–122 por período
- Erro de verificação pós-geração (`TypeError: fetch failed`) foi falso negativo — todos os relatórios foram publicados corretamente; confirmado via REST API direto
- PERIOD_LABEL confirmado: `PERIOD_LABEL: O consenso pré-2024 sobre IA generativa` (2026-01-01 rank 1)

---

## [2026-05-25] — Mockup THEN: corte por palavras com reticências

- `firstWords()` atualizada: aceita `string | null`, adiciona `...` apenas quando trunca, mantém texto completo se cabe
- Limite aumentado de 4 para 6 palavras em THEN, NOW e NEXT do mockup
- Resultado: "Entre 2023 e o início..." em vez de "Entre 2023 e o" (frase cortada)
- Build: 0 erros ✓

---

## [2026-05-25] — 2 correções na home page: stripPeriodLabel no mockup + label plural dinâmico

### Status
- [x] CORREÇÃO 1 — Home page mockup: stripPeriodLabel() remove prefixo PERIOD_LABEL: do campo then
- [x] CORREÇÃO 2 — Preview label dinâmico: singular (1 relatório) vs plural (2+)

### CORREÇÃO 1 — stripPeriodLabel no mockup
- `stripPeriodLabel()` adicionada em `app/page.tsx`: remove primeira linha se começar com `PERIOD_LABEL:`
- `mockupTnn.THEN`: `firstWords(stripPeriodLabel(tnnMockup.then), 4)` — prefixo não aparece mais no card do mockup

### CORREÇÃO 2 — Label singular/plural
- Seção preview (SEÇÃO 6): label computado inline com `reports.length <= 1`
- PT: "Último relatório publicado" / "Últimos relatórios publicados"
- EN: "Latest published report" / "Latest published reports"

### Build
- `npm run build`: 0 erros TypeScript, 20 páginas geradas ✓

---

## [2026-05-25] — 5 correções: PERIOD_LABEL, home CTA, busca com stopwords, period_label no card, Radar data absoluta

### Status
- [x] CORREÇÃO 1 — extractThenLabel: parse correto linha a linha, remove prefixo PERIOD_LABEL:
- [x] CORREÇÃO 2 — Home page mockup: botão "Ver relatório completo →" com link auth-aware
- [x] CORREÇÃO 3 — scoreMatch: STOPWORDS + score mínimo proporcional (minScore = terms × 0.4 × 3)
- [x] CORREÇÃO 4 — Dashboard card: usa period_label (PT) ou formatPeriodFull (EN); tipo Report atualizado
- [x] CORREÇÃO 5 — RadarFeed: data absoluta formatada (DD/MM/AAAA ou MM/DD/YYYY) no lugar de tempo relativo

### CORREÇÃO 1 — extractThenLabel robusta
- Reescrita com `text.split('\n')` + verificação de `firstLine.startsWith('PERIOD_LABEL:')`
- Remove a linha inteira antes de juntar o conteúdo restante — prefixo não aparece mais no texto

### CORREÇÃO 2 — Home: CTA no mockup
- Rodapé do card mockup: `<Link>` para `/reports/[id]` (logado) ou `/login` (não logado)
- Texto PT: "Ver relatório completo →" / EN: "View full report →"
- Estilo discreto: `text-xs font-semibold text-taime-600`, alinhado à direita

### CORREÇÃO 3 — Busca com stopwords e threshold
- `STOPWORDS` filtra termos curtos e comuns (PT + EN) antes de pontuar
- `minScore = Math.max(1, Math.floor(terms.length * 0.4)) * 3` — threshold proporcional ao número de termos
- Busca "Agentes de IA Saem do Laboratório" agora filtra corretamente sem retornar todos os relatórios

### CORREÇÃO 4 — period_label no card do Dashboard
- `Report` interface: `period_label: string | null`, `period_type: string | null` adicionados
- Card: PT usa `report.period_label` ou `formatPeriodFull(period, 'pt-BR')` como fallback
- Card: EN usa `formatPeriodFull(period, 'en')` diretamente
- `formatPeriodFull` importado em `DashboardClient.tsx`

### CORREÇÃO 5 — RadarFeed: data absoluta
- `relativeTime()` substituída por `formatDate(dateStr, locale)`
- PT: `date.toLocaleDateString('pt-BR', ...)` → "25/05/2026"
- EN: `date.toLocaleDateString('en-US', ...)` → "05/25/2026"

### Build
- `npm run build`: 0 erros TypeScript, 20 páginas geradas ✓

---

## [2026-05-25] — 8 entregas: qualidade de prompt, frontend, period_label

### Status
- [x] ENTREGA 1 — generate-report.ts: 4 blocos de qualidade no SYSTEM_PROMPT
- [x] ENTREGA 2 — Regenerar 2026-05-01 com novos prompts
- [x] ENTREGA 3 — Gerar período faltante 2026-01-01
- [x] ENTREGA 4 — ReportClient.tsx: subtítulos dinâmicos THEN/NOW/NEXT
- [x] ENTREGA 5 — Dashboard: remover published_at, mostrar só trends count
- [x] ENTREGA 6 — ReportClient.tsx: banner para registros históricos (>6 meses)
- [x] ENTREGA 7 — DashboardClient.tsx: scoreMatch com pesos (title=3, summary=2)
- [x] ENTREGA 8 — period_label e period_type populados para todos os relatórios existentes

### ENTREGA 1 — generate-report.ts: blocos de qualidade no SYSTEM_PROMPT
- `TEMPORAL INTEGRITY PROTOCOL`: analista escreve a partir da perspectiva de PERIOD_END_DATE
- `THEN STRATEGIC INFLECTION POINT RULE`: LLM usa `PERIOD_LABEL: [label]\n[conteúdo]`
- `VARIATION RULE`: proíbe conteúdo repetido entre trends do mesmo relatório
- `MOVE VOICE RULE`: MOVE usa voz imperativa clara (ex: "Acelere", "Contrate")
- PERIOD_END_DATE calculado a partir de `parsePeriod()` e passado ao prompt como variável real

### ENTREGA 2+3 — Regeneração e geração de períodos (background)
- 2026-05-01 deletado do DB e regenerado com novos prompts ✓
- 2026-01-01 gerado pela primeira vez ✓
- Ambos com 5 trends, PERIOD_LABEL no campo `then`, scores PT=EN

### ENTREGA 4 — ReportClient.tsx: subtítulos dinâmicos THEN/NOW/NEXT
- `extractThenLabel()`: extrai `PERIOD_LABEL:` da primeira linha do campo `then`
- `formatPeriodFull()` adicionado a `lib/types.ts`: calcula label quinzenal/mensal para NOW e NEXT
- `ThenNowNextPanel` recebe `period` e `lang`; renderiza subtítulo + divisor + conteúdo
- `TrendSection` agora recebe `period: string` e passa para `ThenNowNextPanel`
- `ReportClient` passa `period={report.period}` a cada `<TrendSection>`

### ENTREGA 5 — Dashboard: período no lugar de data de publicação
- `DashboardClient.tsx`: removida exibição de `published_at` nos cards
- Meta section mantém: trends count + badge "Publicado"

### ENTREGA 6 — Banner de registro histórico
- `ReportClient.tsx`: banner `bg-blue-50 border-blue-100` aparece quando `report.period < hoje − 6 meses`
- Texto PT/EN inline, ícone info SVG sem dependência externa

### ENTREGA 7 — Busca por relevância progressiva no Dashboard
- `scoreMatch()` substitui `matchesSearch()`: retorna score ponderado (title×3, summary×2)
- `filtered` useMemo filtra `score > 0` e ordena por score decrescente
- Resultados mais relevantes aparecem primeiro

### ENTREGA 8 — period_label e period_type no banco
- Script `patch-period-labels.ts` criado e executado
- 7 relatórios atualizados via Supabase REST PATCH
- Todos os 9 relatórios agora têm `period_label` e `period_type` preenchidos

### Build
- `npm run build` no taime-web: 0 erros TypeScript, 20 páginas geradas ✓

---

## [2026-05-23] — Fix TS2454 + batch pipeline 2026-01-16 → 2026-05-01

### Fix: period-utils.ts TS2454
- Variáveis `startDay`, `endDay`, `labelPt`, `labelEn` inicializadas com valores padrão
- `startDay = 1`, `endDay = lastDayOfMonth(year, month)`, `labelPt/labelEn = nome do mês`
- Causa: `PeriodType` inclui `'weekly'` mas `getPeriodType` nunca o retorna — TS não sabia

### generate-periods.ts — verificação
- `npx ts-node generate-periods.ts 2026-01-01 2026-05-15`
- Resultado: 8 períodos quinzenais corretos (2026-01-16 → 2026-05-01) ✅

### batch-pipeline.ts — CONCLUÍDO (8/8 períodos, 0 falhas)
- [1/8] 2026-01-16 — 2ª Quinzena de Janeiro de 2026 ✓
- [2/8] 2026-02-01 — 1ª Quinzena de Fevereiro de 2026 ✓
- [3/8] 2026-02-16 — 2ª Quinzena de Fevereiro de 2026 ✓
- [4/8] 2026-03-01 — 1ª Quinzena de Março de 2026 ✓
- [5/8] 2026-03-16 — 2ª Quinzena de Março de 2026 ✓
- [6/8] 2026-04-01 — 1ª Quinzena de Abril de 2026 ✓
- [7/8] 2026-04-16 — 2ª Quinzena de Abril de 2026 ✓
- [8/8] 2026-05-01 — já publicado no banco (⏭ ignorado)
- Cada relatório: 5 trends, scores PT=EN garantidos, ~200-225 sinais por período
- batch-progress.json: completed=8, failed=0, pending=0

---

## [2026-05-23] — 8 entregas: logo, middleware, navegação, busca, 3 relatórios, HomeSearch

### ENTREGA 1 — Logo TAIME em todas as páginas
- `public/taime-icon.svg`: SVG atualizado com novo design (arcs + dots)
- `components/Navbar.tsx`: importa `Image` do next/image; logo mostra `<Image>` + texto "TAIME" lado a lado
- `app/layout.tsx`: adicionado `<head>` com `<link rel="icon" href="/taime-icon.svg" type="image/svg+xml">`

### ENTREGA 2 — Middleware reescrito (padrão SSR correto)
- `middleware.ts`: reescrito com `createServerClient` + `getUser()` com fallback `getSession()`
- Matcher mudado para restrito: `/dashboard/:path*`, `/reports/:path*`, `/admin/:path*`
- Removida detecção de locale do middleware (locale é gerenciado via cookie pelo LanguageSelector)
- TypeScript: `setAll` com tipo explícito + `options as any` para compatibilidade Next.js

### ENTREGA 3 — Navegação corrigida
- `Navbar.tsx`: logo já aponta para `/` (confirmado)
- `app/dashboard/page.tsx`: logo TAIME no header mudado de `/dashboard` para `/`

### ENTREGA 4 — Busca melhorada no Dashboard
- `DashboardClient.tsx`: funções `normalize()`, `expandQuery()`, `matchesSearch()` adicionadas
- `normalize`: lowercase + NFD decomposition + remove acentos + normaliza espaços
- `SYNONYMS`: mapeamento de 9 grupos semânticos (ia, cloud, segurança, dados, fintech, automação…)
- `filtered` useMemo: usa `matchesSearch()` em vez de `.includes()` simples

### ENTREGA 5 — Home: 3 relatórios recentes + busca para visitantes
- `app/page.tsx`: `getLatestReport()` → `getLatestReports()`, retorna array de até 3 relatórios
- Seção 6 (preview): substituída por grid de 3 cards — título, período, score, resumo truncado, CTA locale-aware
- `avgDimensions()` e `DIMENSION_LABELS` removidos (não mais necessários)
- `components/HomeSearch.tsx`: criado — Client Component com input de busca; filtra `topTrends` em tempo real por título e executive_snapshot; links corretos por estado de autenticação
- Seção 9 (trends): substituída por `<HomeSearch>` com props `trends`, `isLoggedIn`, `locale`, `trendsCta`, `trendsEmpty`

### ENTREGAs 6, 7, 8 — Já estavam completas
- ENTREGA 6 (Dashboard i18n): DashboardClient + dashboard/page.tsx locale-aware ✅
- ENTREGA 7 (Mockup dinâmico): firstTrend do relatório mais recente ✅
- ENTREGA 8 (Prompt anti-PME): AUDIENCE RULE + MONETARY VALUES RULE já no SYSTEM_PROMPT ✅

### Status final
- [x] `npm run build` — 0 erros, 20 rotas compiladas
- [x] Logo com ícone SVG em todas as páginas
- [x] Middleware com matcher restrito e auth correto
- [x] Logo dashboard → home
- [x] Busca com normalização + sinônimos no dashboard
- [x] 3 relatórios na home + HomeSearch com busca em tempo real

---

## [2026-05-23] — Correção: links da home respeitam autenticação

### Problema
Botões "Ver análise completa" e "Acessar relatório completo" na home page redirecionavam para `/login` mesmo quando o usuário já estava autenticado.

### Causa
Links hardcoded para `/login` em 4 pontos do `app/page.tsx`, sem verificar a sessão.

### Solução
- `app/page.tsx`: importa `createSupabaseServer`; no início da função `LandingPage()`, chama `supabase.auth.getUser()` e deriva `isLoggedIn`
- `TopTrend` interface: adicionado campo `report_id`
- `getTopTrends()`: query agora seleciona `report_id` junto com os outros campos
- 4 links corrigidos:
  - Hero CTA secundário: `isLoggedIn ? '/dashboard' : '/login'`
  - Memória 25 anos CTA: `isLoggedIn ? '/dashboard' : '/login'`
  - Preview gate ("Ver análise completa"): `isLoggedIn && report ? `/reports/${report.id}` : '/login'`
  - Trends CTA ("Acessar relatório completo"): `isLoggedIn ? `/reports/${trend.report_id}` : '/login'`
- Middleware permanece inalterado — já estava correto

### Status final
- [x] `npm run build` — 0 erros, 20 rotas compiladas
- [x] Usuário autenticado vai direto ao relatório/dashboard
- [x] Usuário não autenticado vai para /login (middleware redireciona de /reports/* se necessário)

---

## [2026-05-23] — 3 correções críticas: Dashboard i18n, Radar API, LanguageSelector reload

### CORREÇÃO 1 — Dashboard i18n completo
- `DashboardClient.tsx`: reescrito com prop `locale: 'pt' | 'en'`; objeto `UI` com todas as strings PT/EN (busca, períodos, contador, empty state, badge "Publicado"/"Published", data locale); busca inclui `title_en`; título do card usa `title_en` quando EN
- `dashboard/page.tsx`: importa `cookies` do `next/headers`; detecta locale do cookie `taime-locale`; passa `locale` prop ao `DashboardClient`; badge "NOVO"/"NEW" locale-aware; textos do card Advisor locale-aware (4 strings); header "Relatórios"/"Reports" e contador locale-aware

### CORREÇÃO 2 — Radar API route reescrita com fetch direto
- `app/api/radar/route.ts`: removido Supabase JS client (instável em Route Handlers); reescrito com `fetch()` direto à REST API do Supabase
- Headers corretos: `apikey` + `Authorization: Bearer` + `Content-Type`
- `cache: 'no-store'` + `force-dynamic` + logging de erros

### CORREÇÃO 3 — LanguageSelector com reload correto
- `LanguageSelector.tsx`: importa `useRouter` do `next/navigation`; ao trocar idioma: define cookie → `router.refresh()` → `setTimeout(() => window.location.reload(), 100)`
- Garante que Server Components (dashboard, home) re-renderizem com locale correto

### Status final
- [x] `npm run build` — 0 erros, 20 rotas compiladas
- [x] Dashboard completamente i18n (server + client)
- [x] Radar API retorna dados via fetch direto ao Supabase REST
- [x] Troca de idioma recarrega página corretamente

---

## [2026-05-23] — 3 tarefas: mockup dinâmico, LanguageSelector global, Radar verificado

### TAREFA 1 — Mockup "O que é o TAIME" totalmente dinâmico
- `LandingTrend` interface expandida: `title_pt_br`, `title_en`, `taime_framework_en`, `then_now_next_pt_br`, `then_now_next_en`
- `ThenNowNext` adicionado ao import de tipos
- `getLatestReport()` query atualizada para buscar todos os campos necessários dos `report_trends`
- Helpers adicionados: `firstWords(text, n)`, `scoreBadgeLabel(score, isEn)`
- Variáveis computadas antes do return: `firstTrend`, `fwMockup`, `tnnMockup`, `mockupDims`, `mockupFwItems`, `mockupTnn`
- Mockup substituído: título real, score real com cor dinâmica, 3 dimensões reais, framework com primeiras palavras, THEN/NOW/NEXT com primeiras palavras
- Badge de score: "Prioridade Executiva" (80-100) / "Alta Relevância" (60-79) / "Monitoramento Ativo" (40-59)
- Fallback: dados genéricos locale-aware quando não há relatório no banco

### TAREFA 2 — Seletor de idioma global no dashboard e relatórios
- `dashboard/page.tsx`: `LanguageSelector` importado e inserido entre email e `LogoutButton`
- `ReportClient.tsx`: importa `LanguageSelector` e `useEffect`; inicializa `lang` a partir do cookie `taime-locale` no mount; toggle interno substituído por `<LanguageSelector />`
- Resultado: trocar idioma no dashboard ou no relatório define o cookie global e recarrega com locale correto

### TAREFA 3 — Radar TAIME verificado e operacional
- `radar_signals` table: 10 sinais presentes (verificado via Supabase REST)
- Dados mais recentes: "AI is just unauthorised plagiarism at a bigger scale" (HIGH), "AWS Step Functions" (MEDIUM), etc.
- Coletado em 2026-05-23T00:45h — Radar ativo e retornando dados reais

### Status final
- [x] `npm run build` — 0 erros, 20 rotas compiladas
- [x] Mockup da landing page usa dados reais do banco
- [x] LanguageSelector consistente no dashboard e nos relatórios
- [x] Radar operacional com 10 sinais das últimas 24h

---

## [2026-05-22] — 6 tarefas: cron Radar, FAQ quinzenal, home EN, SYSTEM_PROMPT audience+budget, Radar ativo

### TAREFA 1 — Cron route do Radar
- `taime-web/app/api/cron/radar/route.ts` criado: GET com Bearer CRON_SECRET, chama `collect-radar.ts` via `execSync`
- `taime-web/vercel.json` criado: dois crons diários — 10h00 e 17h00 UTC
- `taime-web/.env.local` atualizado: `SERPER_API_KEY` e `ANTHROPIC_API_KEY` adicionados

### TAREFA 2 — FAQ e i18n: semanal → quinzenal
- `lib/i18n/pt.ts`: FAQ frequência, `memPeriods[2].freq`, plans features, planos.featureLabels[9] — todos trocados de "semanal" para "quinzenal"
- `lib/i18n/en.ts`: mesmos campos — "weekly" → "biweekly" em todos os lugares

### TAREFA 3 — Home em inglês: conteúdo dinâmico locale-aware
- `LandingReport` interface: adicionado `title_en`, `executive_summary_en`
- `TopTrend` interface: adicionado `title_en`, `taime_framework_en`
- Queries atualizadas para selecionar campos EN no banco
- Preview do relatório: usa `reportTitle` e `summary` baseados em `locale`
- Seção Trends: usa `trendTitle` e `trendFramework` baseados em `locale`

### TAREFA 4 — SYSTEM_PROMPT: audiência pública ampla
- `generate-report.ts`: linha de abertura removida "SME executives" → "leaders, managers, consultants and decision-makers"
- Exemplo FRAMEWORK `$500K` removido (valor monetário)
- Novo bloco `AUDIENCE RULE` adicionado ao final do SYSTEM_PROMPT

### TAREFA 5 — SYSTEM_PROMPT: sem valores monetários no MOVE
- Novo bloco `MONETARY VALUES RULE` adicionado ao SYSTEM_PROMPT
- Proíbe: valores em BRL, USD, EUR ou qualquer moeda em análises
- Orienta: linguagem estratégica sem dimensionamento financeiro

### TAREFA 6 — Radar rodado pela primeira vez
- `npx ts-node collect-radar.ts` executado com sucesso
- 50 fontes consultadas, 36 candidatos coletados, 36 classificados pelo Haiku
- **10 sinais HIGH/MEDIUM salvos em `radar_signals`** — Radar TAIME ativo

### Status final
- [x] `npm run build` — 0 erros TypeScript, 20 rotas compiladas
- [x] Footer padronizado: todas as 8 páginas públicas usam `Footer.tsx`
- [x] RadarFeed removido do dashboard, mantido apenas na home
- [x] Radar operacional com dados reais das últimas 24h

---

## [2026-05-22] — 4 entregas: pipeline quinzenal, Radar TAIME, Advisor em breve, páginas legais

### ENTREGA 1 — Pipeline quinzenal + anti-alucinação

**`period-utils.ts`** (atualizado):
- `getPeriodType()`: 2022+ agora retorna `'biweekly'` (era `'weekly'`)
- Bloco weekly removido de `parsePeriod()` — agora só monthly e biweekly
- `generatePeriods()`: 2022+ gera 2 períodos/mês (`[1, 16]`) em vez de 4
- Labels 2022+: "1ª Quinzena de Maio de 2026" / "First Half of May 2026"

**`collect-signals.ts`** (atualizado):
- `defaultPeriodKey()`: lógica quinzenal para 2022+ (`day ≤ 15 → 01, else → 16`)
- Períodos recentes: `tbs: 'qdr:w'` (última semana, era `qdr:m` — mais preciso com janela quinzenal)

**`generate-report.ts`** (atualizado):
- Novo bloco no SYSTEM_PROMPT: `CRITICAL ANTI-HALLUCINATION RULES` (5 regras)
  - Toda afirmação factual deve ser rastreável aos signals fornecidos
  - Nunca incluir fatos não presentes nos signals
  - Analista de evidências, não jornalista
  - Se insuficiente, declarar limitação em vez de preencher com suposição
  - Nunca inventar trends, empresas, produtos ou eventos

### ENTREGA 2 — Radar TAIME

**`collect-radar.ts`** (novo) — script de coleta diária:
- Busca notícias das últimas 24h em todas as fontes via Serper (`tbs: 'qdr:d'`)
- Query por domínio: `"site:{domain} technology news announcement"`
- Filtra resultados de hoje/ontem por texto da data
- Classifica com Claude Haiku (`claude-haiku-4-5-20251001`): título bilíngue, resumo PT/EN, categoria, relevância
- Anti-alucinação: descarta itens sem URL válida e começa com `https://`
- Salva top 10 por relevância (high → medium → low) em `radar_signals`
- Uso: `npx ts-node collect-radar.ts`

**`add-radar-table.sql`** (novo, ⚠ rodar no Supabase SQL Editor):
- Tabela `radar_signals`: id, title_pt/en, summary_pt/en, category, relevance, source_category, url, published_at, collected_at
- RLS: leitura pública (sem autenticação)
- Índices em collected_at, relevance, category

**`app/api/radar/route.ts`** (novo):
- GET público (sem auth): retorna top 10 sinais mais recentes ordenados por relevância DESC
- `dynamic = 'force-dynamic'` para sempre buscar dados frescos

**`components/RadarFeed.tsx`** (novo):
- Client component, busca `/api/radar`, useLocale() para PT/EN
- 8 cards com: badge de categoria (cores por tipo), badge de relevância, título traduzido,
  resumo de 2-3 linhas, fonte por categoria (nunca nome), link "Ver fonte →", tempo relativo
- Skeleton loading durante fetch
- Auto-refresh a cada 30 minutos

**`app/page.tsx`** (atualizado):
- RadarFeed inserido após o Hero, antes de "A dor que o TAIME resolve"
- Visível sem login

**`app/dashboard/page.tsx`** (atualizado):
- RadarFeed após card do Advisor com título "Radar — Sinais de Hoje"

### ENTREGA 3 — Advisor: mensagem "em breve"

**`components/AdvisorChat.tsx`** (atualizado):
- `useLocale()` importado para detecção de idioma
- Estado `hasHistory` detectado após load: false se sem mensagens anteriores
- Quando `hasHistory = false`: exibe mensagem automática do Advisor como bubble (PT ou EN)
  informando que o recurso está sendo configurado e ficará disponível em breve
- Input desabilitado quando `!hasHistory` com placeholder "Advisor em breve disponível..."
  / "Advisor coming soon..."
- Botão de envio também desabilitado quando `!hasHistory`

### ENTREGA 4 — Páginas legais (LGPD)

**`app/privacidade/page.tsx`** (novo) — Política de Privacidade PT:
8 seções: dados coletados, uso, compartilhamento (tabela de provedores), direitos LGPD,
segurança, cookies, retenção (tabela), contato DPO

**`app/privacy/page.tsx`** (novo) — Privacy Policy EN: mesmas 8 seções em inglês

**`app/termos/page.tsx`** (novo) — Termos de Uso PT:
11 seções: aceitação, serviço, acesso, uso permitido, proibido, PI, isenção, cancelamento,
modificações, foro SP, contato

**`app/terms/page.tsx`** (novo) — Terms of Use EN: mesmas 11 seções em inglês

Email de contato em todos os textos: `contact@taime.tech`

**`lib/i18n/pt.ts`** (atualizado): footerLinks + Privacidade → /privacidade, Termos → /termos

**`lib/i18n/en.ts`** (atualizado): footerLinks + Privacy → /privacy, Terms → /terms

**`app/sobre/page.tsx`** (atualizado): footer com links Privacidade/Privacy e Termos/Terms (locale-aware)

**Build:** `npm run build` → ✓ 0 erros TypeScript, 20 rotas compiladas

---

## [2026-05-22] — TAIME_MASTER_DOC.md criado

### Entrega

**`TAIME_MASTER_DOC.md`** (novo, raiz de `/claude-taime/`):

Documentação mestre e única do projeto. Cobre pipeline e frontend. 10 seções:

1. **O QUE É O TAIME** — posicionamento, missão, problema que resolve
2. **PRODUTO — TRÊS CAMADAS** — relatórios, arquivo histórico, Executive Advisor
3. **FRAMEWORK TAIME** — TAIME Score (5 dimensões), TYPE→ACT→IMPACT→MOVE→EXIT, THEN/NOW/NEXT
4. **PIPELINE TÉCNICO** — todos os scripts com uso e funcionamento
5. **ARQUITETURA DO BANCO** — 9 tabelas, schema, RLS, SQL pendentes
6. **REGRAS EDITORIAIS** — confidencialidade de fontes, paridade PT=EN, revisão humana
7. **ESTRUTURA DE ARQUIVOS** — árvore completa de `/claude-taime/` e `taime-web/`
8. **PLANO DE NEGÓCIO** — Free / Essencial / Estratégico + detalhamento Stripe
9. **ROADMAP** — prioritário + infraestrutura + produto + concluído
10. **STATUS ATUAL** — último relatório, entregas em produção, SQL pendente

---

## [2026-05-21] — generate-report.ts: 2 bugs críticos corrigidos

### BUG 1 — Scores divergentes PT ≠ EN (CRÍTICO) — CORRIGIDO

**Causa:** A chamada EN recebia apenas o `taime_score` total como hint textual suave.
O LLM ignorava a hint e gerava seus próprios scores nas 5 dimensões, resultando em
`taime_score` e `score_dimensions.score` divergentes entre PT e EN para a mesma trend.

**Solução implementada — dois mecanismos em camadas:**

1. **Constraints absolutos no prompt EN** — bloco `MANDATORY SCORE CONSTRAINTS` com todos os
   valores numéricos (taime_score + 5 dimensões) passados como inteiros fixos.
   O LLM recebe instrução explícita de copiar os inteiros e apenas escrever o texto em inglês.

2. **Belt-and-suspenders programático** — `enforceScoresFromPt(en, pt)` sobrescreve todos os
   valores numéricos do EN com os valores canônicos do PT após o parse, independentemente do
   que o LLM retornou. Scores do EN = Scores do PT, garantido.

3. **Verificação pós-geração** — `verifyScores()` detecta e loga qualquer divergência
   (que não deveria mais ocorrer). Output de cada trend mostra `✓ PT=EN` ou `⚠ mismatch`.

4. **`persistReport` usa `p.taime_score` explicitamente** como valor canônico no banco.

**Mudança de assinatura:** `callClaudeTrend(..., ptReference?: TrendAnalysis)` em vez de
`referenceScore?: number` — recebe a análise PT completa para extrair todos os scores.

### BUG 2 — Nomes de fontes em confidence_basis — CORRIGIDO

**Causa:** O schema de exemplo mostrava `'Gartner, HBR, IDC, WEF, Stanford'` como formato esperado.
O LLM reproduzia nomes reais de fontes, revelando o método e comprometendo a independência editorial.

**Solução:** Nova seção no SYSTEM_PROMPT — `CONFIDENCE BASIS — SOURCE CONFIDENTIALITY`:
- Proíbe explicitamente nomes de fontes (Gartner, McKinsey, Forrester, IDC, HBR, MIT, WEF, etc.)
- Instrui a descrever por categoria: "global research institutes", "strategic consulting firms",
  "academic research centers", "technology industry publications", etc.
- Exemplo correto: `"18 signals from global research institutes and strategic consulting firms.
  TAIME Score 87, high convergence across research and consulting categories."`

O schema de exemplo foi atualizado para modelar o formato correto.

### Verificação — relatório 2026-05-01 regenerado

Dados deletados e pipeline re-executado (analyze → generate):

```
  Verificação de scores (PT = EN):
  ✓ Trend 1: PT=87 = EN=87
  ✓ Trend 2: PT=85 = EN=85
  ✓ Trend 3: PT=84 = EN=84
  ✓ Trend 4: PT=83 = EN=83
  ✓ Trend 5: PT=72 = EN=72
  ✓ Todos os scores idênticos PT = EN
```

Relatório publicado: `295d6a42-0f53-414c-9dbe-25267099bc14`
Scores: 87, 85, 84, 83, 72 (média: 82)

---

## [2026-05-21] — Batch Pipeline histórico + Executive Advisor (v1)

### ENTREGA 1 — Batch Pipeline histórico

**Arquivos criados/atualizados no `/claude-taime/`:**

**`period-utils.ts`** (novo) — Utilitário compartilhado de períodos:
- `getPeriodType(year)`: 2000–2014 → monthly, 2015–2021 → biweekly, 2022+ → weekly
- `parsePeriod(periodKey)`: resolve qualquer YYYY-MM-DD ao PeriodInfo completo (start, end, type, labelPt, labelEn)
- `generatePeriods(from, to)`: gera lista completa de períodos no intervalo
- `isHistorical(info)`: retorna true se fim do período > 45 dias atrás
- `toSerperDate(d)`: converte Date para formato MM/DD/YYYY do Serper
- Labels: "Semana 1 de Maio de 2026", "1ª Quinzena de Março de 2018", "Outubro de 2008"

**`collect-signals.ts`** (atualizado):
- Importa `parsePeriod`, `isHistorical`, `toSerperDate` do period-utils
- PERIOD padrão: início do período atual (weekly/biweekly/monthly) conforme o ano
- Serper histórico: `tbs: 'cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY'`
- Serper atual: `tbs: 'qdr:m'` (mantido)
- Metadata de cada signal inclui `period_label`, `period_type`, `period_start`, `period_end`, `is_historical`

**`generate-periods.ts`** (novo):
- Uso: `npx ts-node generate-periods.ts 2026-01-01 2026-05-31`
- Imprime lista agrupada por tipo no terminal
- Salva lista de keys em `batch-periods.json`

**`batch-pipeline.ts`** (novo):
- Lê períodos de `batch-periods.json` ou argumento de data range
- Flag `--resume` retoma de `batch-progress.json`
- Por período: verifica idempotência no banco → collect → analyze → generate
- 15s de delay entre períodos (respeita rate limits)
- Log claro: `[3/24] Processando: Semana 2 de Abril/2026 (2026-04-08)`
- Salva progresso em `batch-progress.json` com `completed/failed/pending`

**`add-period-columns.sql`** (novo, rodar no Supabase SQL Editor):
- Adiciona `period_label TEXT`, `period_type TEXT (check)`, `period_start DATE`, `period_end DATE` à tabela `reports`
- Back-fill automático para relatórios existentes
- Índices em `period_start` e `period_type`

### ENTREGA 2 — Executive Advisor (v1)

**`add-advisor-tables.sql`** (novo, rodar no Supabase SQL Editor):
- Tabela `advisor_profiles`: user_id unique FK, company_name, sector, company_size, annual_revenue, current_infrastructure, strategic_objective, maturity_level, created_at, updated_at
- Tabela `advisory_memory`: user_id FK, session_id, role (user/assistant), content, context_metadata, created_at
- RLS em ambas (usuário vê/edita apenas seus dados)
- Trigger `updated_at` em `advisor_profiles`

**`components/AdvisorOnboarding.tsx`** (novo) — Formulário de 4 etapas:
- Etapa 1: Empresa (nome, setor dropdown, tamanho chip-select, receita opcional)
- Etapa 2: Infraestrutura (texto livre + checkboxes: On-premise, Cloud pública, SaaS, IA em uso, etc.)
- Etapa 3: Objetivo estratégico (textarea + chips clicáveis com sugestões)
- Etapa 4: Maturidade (radio visual: Inicial/Intermediário/Avançado)
- Salva via `supabase.from('advisor_profiles').upsert()`, chama `onComplete()` ao finalizar

**`components/AdvisorChat.tsx`** (novo) — Interface de chat:
- Carrega histórico da última sessão ao montar
- Botão "Novo contexto" inicia nova sessão UUID
- Indicador de "digitando..." com animação de bounce
- Enter para enviar, Shift+Enter para nova linha
- Avatars T (Advisor) e U (usuário)
- Chama `POST /api/advisor/chat`

**`app/api/advisor/chat/route.ts`** (novo):
- Auth obrigatório (Supabase server client)
- Carrega: advisor_profiles + últimas 20 mensagens da sessão + 3 últimos relatórios
- System prompt: perfil do cliente + inteligência TAIME recente + papel de senior advisor
- Detecta idioma da mensagem, responde no mesmo
- Chama Claude claude-sonnet-4-6 (max_tokens: 1024)
- Persiste user msg + assistant reply em `advisory_memory` com `context_metadata`
- TODO: restringir a assinantes pagos quando Stripe estiver ativo

**`app/dashboard/advisor/page.tsx`** + `AdvisorView.tsx` (novos):
- Servidor: auth + load profile → passa para `AdvisorView` (client)
- `AdvisorView`: renderiza `AdvisorOnboarding` (sem perfil) ou `AdvisorChat` (com perfil)
- Header com link de volta ao dashboard

**`app/dashboard/page.tsx`** (atualizado):
- Card "Executive Advisor" antes da lista de relatórios
- Badge "NOVO" por 30 dias após lançamento (2026-05-21)
- CTA dinâmico: "Configurar seu Advisor →" ou "Continuar conversa →"
- Preview da última mensagem do advisor na descrição do card
- Carrega advisor status em paralelo com reports (`Promise.all`)

### i18n — Páginas restantes completadas

**`app/login/page.tsx`** — Atualizado com `useLocale()` + `t.login.*`:
- Todos os textos (labels, placeholders, erros, botões) traduzidos
- Interesses do select vêm de `t.login.interests` (PT/EN)
- Funções de success/sent usam `t.login.successTitle(name)` etc.

**`app/sobre/page.tsx`** — Convertido para Server Component com i18n:
- Lê locale via `cookies().get('taime-locale')`, usa `getTranslations(locale)`
- `generateMetadata()` dinâmico com título e descrição traduzidos
- Todos os textos de `t.sobre.*`, footer usa `t.nav.*`

**`app/planos/page.tsx`** — Atualizado com `useLocale()` + `t.planos.*`:
- Valores booleanos das features separados em `FEATURE_VALUES[]`
- Labels traduzidos via `t.planos.featureLabels`
- Headers da tabela via `t.planos.tableHeaders`
- FAQ, cards de planos e CTA final todos traduzidos

**`app/contato/page.tsx`** — Atualizado com `useLocale()` + `t.contato.*`:
- Formulário, labels, placeholders, estados de sucesso e erro traduzidos
- Footer usa `t.nav.*` e `t.home.footerCopyright`

### Correção de tipos i18n

**`lib/i18n/index.ts`** — Novo tipo `DeepMutable<T>`:
- Remove `readonly` e converte string literals para `string` recursivamente
- Mantém assinaturas de funções (footerCopyright, successTitle, etc.)
- `getTranslations()` retorna `Translations` (cast explícito)

**`lib/i18n/en.ts`** — Tipagem corrigida:
- `en: Translations` em vez de `en: typeof pt` (evita conflito de literal types)

**`app/page.tsx`** — FaqAccordion cast:
- `t.faq.items as unknown as { q: string; a: string }[]` (readonly → mutable)

### Build: ✓ 0 erros TypeScript — 16 rotas registradas

---

## [2026-05-21] — 4 correções: admin, magic link, travessões, generate-report

### CORREÇÃO 1 — Admin /admin/waitlist

**`middleware.ts`** — Detecção de sessão mais robusta:
- `getUser()` como check primário (verifica JWT com Supabase)
- `getSession()` como fallback se `getUser()` falhar por erro de rede
- Sem `?next=` no redirect para login (simplificado)

**`app/admin/waitlist/page.tsx`** — Redirect separado por caso:
- Não autenticado → `/login`
- Autenticado mas não admin → `/` (antes ia para `/login`, causava loop confuso)

**`app/api/admin/approve/route.ts`** — Reescrito com fetch direto:
- Auth via Supabase Auth Admin REST API: `POST {URL}/auth/v1/admin/users`
  com headers `apikey` e `Authorization: Bearer {SERVICE_KEY}`
- Update por email: `PATCH /rest/v1/waitlist?email=eq.{email}`
- Retorna `{ success: true, message: "Acesso liberado" }`
- Trata "already exists" graciosamente

**`app/admin/waitlist/WaitlistAdmin.tsx`** — Response check atualizado:
- Agora aceita `json.success` ou `json.ok` (backward compat)
- Flash text: "magic link" → "link de acesso"

### CORREÇÃO 2 — "magic link" → "link de acesso" (textos visíveis)
- `app/login/page.tsx`: "entrar com magic link" → "Entrar com link de acesso"
- `app/admin/waitlist/WaitlistAdmin.tsx`: flash message atualizado
- Nomes de funções, tipos e variáveis internas mantidos (`handleMagicLink`, `mlEmail`, `'magic-link'`)

### CORREÇÃO 3 — Travessões removidos de frases
- `app/page.tsx`: 9 travessões em frases substituídos por vírgulas ou dois-pontos
- `app/sobre/page.tsx`: 6 travessões substituídos
- `app/planos/page.tsx`: 1 travessão substituído
- Mantidos: datas com en dash (2000–2014, 2015–2021, 2022–hoje)
- Mantido: `—` como indicador visual na tabela de planos

### CORREÇÃO 4 — SYSTEM_PROMPT em `generate-report.ts`
Dois novos blocos adicionados ao final do SYSTEM_PROMPT:

**FRAMEWORK FIELD QUALITY REQUIREMENT**: cada campo de TYPE→ACT→IMPACT→MOVE→EXIT
deve ter frase completa explicando o POR QUÊ (mínimo 20 palavras), não apenas rótulo.
Exemplos de errado/certo incluídos.

**STYLE REQUIREMENT**: proibido usar travessão (—) no meio de frases no output.
Usar ponto ou vírgula. Travessão permitido apenas em intervalos de data (2022–2026).

### Build: ✓ 0 erros TypeScript — 14 rotas registradas

---

## [2026-05-21] — Fix /api/contact: Resend como canal primário, Supabase best-effort

### Problema
`/api/contact` retornava 500 porque a tabela `contacts` não existe no Supabase.
O cliente Supabase JS (PostgREST) não suporta DDL — impossível criar tabela via REST API.

### Solução
Reescrita de `app/api/contact/route.ts` com dois canais:

1. **Resend (primário, garantido)** — `fetch('https://api.resend.com/emails', ...)`
   - FROM: `onboarding@resend.dev` (funciona sem verificação de domínio no Resend)
   - TO: `claudineicanei1@gmail.com`
   - Corpo HTML formatado com nome, email e mensagem
   - Retorna erro 500 somente se o Resend falhar

2. **Supabase REST API (best-effort)** — `fetch('${SUPABASE_URL}/rest/v1/contacts', ...)`
   - Insere com `service_role key` diretamente via HTTP (sem SDK)
   - Usa `.catch(() => {})` — silencia falha se tabela não existir
   - Quando a tabela for criada (SQL abaixo), os dados passarão a ser armazenados

### Tabela contacts (opcional — criar quando conveniente)
```sql
create table if not exists contacts (
  id         uuid        default gen_random_uuid() primary key,
  name       text        not null,
  email      text        not null,
  message    text        not null,
  created_at timestamptz default now()
);
```

### Verificação admin/waitlist
`app/admin/waitlist/page.tsx` e `WaitlistAdmin.tsx` já existiam e estavam corretos.

### Build: ✓ 0 erros TypeScript — 14 rotas registradas

---

## [2026-05-21] — 5 entregas: home rica, /sobre, /contato, /planos, Navbar

### ENTREGA 1 — Home page mais rica (`app/page.tsx`)

4 novas seções inseridas entre "Como funciona" e "Planos":

- **Categorias cobertas** (estática): 8 cards em grid 2×4 com ícone e nome
- **Trends em destaque** (dinâmica): top 3 trends por `taime_score DESC`
  — query paralela a `getLatestReport()` via `Promise.all`
  — card com score, título, preview 120 chars do `executive_snapshot`
  — `scoreRingCls()` helper adicionado
- **Linha do tempo** (estática): 6 marcos de 2000 a 2026 em timeline horizontal
  com dots e conectores via CSS grid
- **FAQ** (client component): 10 accordions com `max-h` transition suave
  — extraído em `components/FaqAccordion.tsx` (client) por ser interativo

Footer atualizado: adicionados links Planos, Sobre, Contato.

### ENTREGA 2 — Página `/sobre` (`app/sobre/page.tsx`)

5 seções: Hero, A Origem, Missão, Como trabalhamos (3 cards), LinkedIn + CTA.
`app/about/page.tsx` criado como redirect para `/sobre`.

### ENTREGA 3 — Página `/contato` (`app/contato/page.tsx`)

- Formulário com nome + email + mensagem + envio para `/api/contact`
- `app/api/contact/route.ts`: POST salva na tabela `contacts` via service_role
- Tabela esperada: `id uuid PK, name text, email text, message text, created_at timestamptz`
- Estado de sucesso com banner verde pós-envio

### ENTREGA 4 — Página `/planos` (`app/planos/page.tsx`)

- Cards de planos (Gratuito / Essencial R$197 / Estratégico R$497) com badge "Mais popular"
- Tabela comparativa completa (12 features × 3 planos) com componente `Check`
- FAQ de 5 perguntas sobre planos com accordion inline (useState no mesmo arquivo)
- CTA final → `/login`

### ENTREGA 5 — Navbar e rodapé atualizados (`components/Navbar.tsx`)

- Novos links desktop + mobile: Como funciona / Planos / Sobre / Contato
- Auth state via `createSupabaseBrowser().auth.getUser()` no `useEffect`
- Logado: mostra "Relatórios" → /dashboard + botão "Sair" (signOut)
- Deslogado: botão "Acessar →" → /login
- Footer da home: links expandidos para 6 destinos

### Novos arquivos
- `components/FaqAccordion.tsx` — FAQ interativo (10 items)
- `app/sobre/page.tsx` — página sobre
- `app/about/page.tsx` — redirect para /sobre
- `app/contato/page.tsx` — formulário de contato
- `app/api/contact/route.ts` — endpoint POST /api/contact
- `app/planos/page.tsx` — comparativo de planos

### Status checklist
- [x] `components/FaqAccordion.tsx` — criado
- [x] `app/page.tsx` — 4 seções adicionadas + footer atualizado
- [x] `components/Navbar.tsx` — novos links + auth state
- [x] `app/sobre/page.tsx` — criado
- [x] `app/about/page.tsx` — redirect
- [x] `app/contato/page.tsx` — criado
- [x] `app/api/contact/route.ts` — criado
- [x] `app/planos/page.tsx` — criado
- [x] Build: ✓ 0 erros TypeScript — 14 rotas, todas registradas

### Ação necessária no Supabase SQL Editor
```sql
create table if not exists contacts (
  id         uuid        default gen_random_uuid() primary key,
  name       text        not null,
  email      text        not null,
  message    text        not null,
  created_at timestamptz default now()
);
```

---

## [2026-05-21] — Página admin /admin/waitlist

### Novos arquivos
- `app/admin/waitlist/page.tsx` — Server Component: autentica, checa email admin, busca waitlist via service_role e passa para WaitlistAdmin
- `app/admin/waitlist/WaitlistAdmin.tsx` — Client Component: tabela completa com filtros e botão de aprovação
- `app/api/admin/approve/route.ts` — POST endpoint: cria usuário no Supabase Auth + marca `contacted = true`
- `middleware.ts` — matcher atualizado com `/admin/:path*`

### Funcionalidades
- Proteção dupla: middleware (autenticação) + checa `user.email === 'claudineicanei1@gmail.com'`
- Filtros: Todos / Pendentes / Aprovados com contagens dinâmicas
- Tabela: Nome, Email, Empresa, Cargo, Interesse, Data, Status (badge), Aprovar acesso
- Aprovação: `auth.admin.createUser({ email_confirm: true })` + `UPDATE waitlist SET contacted = true`
- Flash de confirmação 4s por linha + erro inline por linha
- Handles "already exists" gracefully (usuário já criado antes)

### Status checklist
- [x] `middleware.ts` — `/admin/:path*` adicionado
- [x] `app/api/admin/approve/route.ts` — criado
- [x] `app/admin/waitlist/WaitlistAdmin.tsx` — criado
- [x] `app/admin/waitlist/page.tsx` — criado
- [x] Build: ✓ 0 erros TypeScript — `/admin/waitlist` 2.01 kB, `/api/admin/approve` registrado

---

## [2026-05-21] — 3 correções: preview home, formulário waitlist, erro magic link

### CORREÇÃO 1 — Home page: resumo executivo compacto (`app/page.tsx`)
- `preview` (array de parágrafos) substituído por `previewText` (string de 160 chars + "...")
- Renderização: de múltiplos `<p>` para um único `<p>` — evita textos longos na landing

### CORREÇÃO 2 — Formulário waitlist completo (`app/login/page.tsx`)
Formulário expandido de 1 para 6 campos:
- Nome completo (required)
- Email (required)
- Empresa + Cargo (opcionais, lado a lado em grid-cols-2)
- Principal interesse (dropdown required): Estratégia de Tecnologia, IA & Agentes,
  Cloud & Infraestrutura, Cibersegurança, Inteligência de Mercado, Planejamento / Roadmap

Insert no Supabase: `{ email, name, company, role, interest }` com normalização de email
Confirmação personalizada: "Olá {primeiro_nome}, seu acesso foi solicitado!"

### CORREÇÃO 3 — Erro amigável para email não cadastrado (`app/login/page.tsx`)
- Detecção: `error.status === 422 || error.status === 400` → flag `notFound`
- Quando notFound: card âmbar com "Este email ainda não tem acesso liberado.
  Solicite seu acesso abaixo." + botão para trocar para modo waitlist
- Limpa `notFound` quando o usuário edita o campo de email
- Magic link usa campo separado (`mlEmail`) para não colidir com o email do waitlist

### `waitlist.sql` — Schema atualizado + migration documentada
- Colunas adicionadas: `name`, `company`, `role`, `interest` (todas nullable)
- Migration comentada no arquivo para quem já tem a tabela criada:
  ```sql
  alter table waitlist
    add column if not exists name     text,
    add column if not exists company  text,
    add column if not exists role     text,
    add column if not exists interest text;
  ```

### Build: ✓ 0 erros TypeScript — /login +0.7kB (6 campos + lógica notFound)

---

## [2026-05-21] — Bugfix: 422 no magic link (signInWithOtp)

### Diagnóstico:
O erro 422 `Unprocessable Content` em `POST /auth/v1/otp` tem duas causas possíveis:
1. Email com espaço ou maiúsculas que não bate com o cadastro no Supabase Auth
2. `shouldCreateUser: false` + email não existente no Supabase Auth (422 em vez de silencioso)

O cliente Supabase no browser (`lib/supabase-browser.ts`) estava correto —
usa `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

O `emailRedirectTo` com `window.location.origin` também estava correto.

### Fix aplicado (`app/login/page.tsx`):
```diff
- email: email,
+ email: email.trim().toLowerCase(),
```

### Nota operacional:
Com `shouldCreateUser: false`, o Supabase retorna 422 se o email não existe
em `auth.users`. Para testar em desenvolvimento sem um usuário criado,
é necessário ou mudar para `shouldCreateUser: true` temporariamente,
ou criar um usuário manualmente via Supabase Dashboard → Authentication → Users.

### Build: ✓ 0 erros TypeScript

---

## [2026-05-21] — Bugfix: auth/callback/route.ts (500 → funcionando)

### Problema:
`/auth/callback` retornava 500. O handler usava `Request` genérico ao invés de `NextRequest`, não importava o tipo correto e tinha parâmetro `next` desnecessário que poderia causar open redirect.

### Fix aplicado (`app/auth/callback/route.ts`):
- `Request` → `NextRequest` (import de `next/server`)
- `new URL(request.url)` via `requestUrl` — mais explícito
- Removido parâmetro `next` (open redirect) — sempre redireciona para `/dashboard`
- `console.error` adicionado no path de erro para debug futuro
- Erro mudado para `auth_callback_failed` (mais descritivo)
- Tipo explícito em `setAll` mantido (`Record<string, unknown>` + cast `as any`) — exigido pelo strict mode do TS

### Build: ✓ 0 erros TypeScript

---

## [2026-05-21] — Expansão de fontes: 25 → 50

### Ações realizadas:

1. **`schema.sql`** — Bloco de seed expandido com 25 novas fontes em segundo INSERT separado.
   Categorias adicionadas: `vendor`, `security`. Total de categorias: 8.

2. **`add-sources.ts`** (novo) — Script de migração idempotente:
   - Carrega URLs existentes do banco antes de inserir
   - Skipa duplicatas por URL
   - Exibe resumo: inseridas / já existiam / erros
   - Conta total via `Content-Range` header

3. **`collect-signals.ts`** — `TOPIC_BY_CATEGORY` expandido:
   - `vendor`: `product announcement AI technology enterprise cloud platform`
   - `security`: `threat intelligence cybersecurity enterprise risk vulnerability`

### Resultado da migração (`npx ts-node add-sources.ts`):
```
Fontes no banco antes: 25
Inseridas: 25
Já existiam: 0
Total de fontes no banco agora: 50
```

### Novas fontes por categoria:
- **research (7)**: ISG, Everest Group, 451 Research, IBM Research, Thoughtworks Radar, CNCF Blog, Linux Foundation
- **consulting (1)**: Accenture Technology Vision
- **vendor (7)**: Azure Blog, AWS Blog, Google Cloud Blog, OpenAI News, Anthropic News, NVIDIA Blog, Oracle News, SAP News
  _(nota: são 8 vendors no total incluindo os 2 tier-2)_
- **media (3)**: Reuters Technology, CNBC Technology, InfoQ
- **security (4)**: CrowdStrike Blog, Palo Alto Unit 42, Cisco Talos, Mandiant Blog
- **academic (2)**: arXiv CS & AI, Nature Technology

### Nota sobre contagem:
O user indicou "22 novas fontes" mas a lista especificada contém 25 — todas foram adicionadas.

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [x] frontend / visualização — `taime-web/`
- [x] melhorias frontend (framework, landing, busca, email)
- [x] home institucional + fluxo de acesso antecipado
- [x] expansão de fontes: 25 → 50 (`add-sources.ts`)
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Home institucional completa + fluxo de acesso antecipado

### Contexto do produto revisado:
- Público ampliado: líderes, gestores, consultores, empreendedores e PF que decidem com base em tecnologia — não restrito a PMEs
- Proposta: inteligência decisória estruturada com scoring, framework TYPE→ACT→IMPACT→MOVE→EXIT e memória temporal
- Diferencial único: cobertura de 25 anos com granularidade crescente (mensal → quinzenal → semanal)

### Arquivos criados/modificados:

**Modificados:**
- `app/page.tsx` — Reescrita completa com 9 seções institucionais (ver abaixo)
- `app/login/page.tsx` — Dois estados: waitlist (acesso antecipado) + magic link (usuários com acesso)
- `app/layout.tsx` — Metadata atualizado para refletir proposta ampliada

**Criados:**
- `components/Navbar.tsx` — Client Component com links âncora, botão "Acessar" e hamburger menu mobile
- `claude-taime/waitlist.sql` — SQL para tabela `waitlist`: id, email, created_at, contacted; RLS permite insert anônimo, bloqueia SELECT

### Home page — 9 seções:
1. **Hero**: headline "Do sinal à decisão", subheadline, público, 2 CTAs, badge com "Desde 2000"
2. **A Dor**: 3 cards — Excesso sem estrutura / Decisões sem contexto / Sem memória estratégica
3. **O que é**: 2 colunas — texto descritivo + mini report mockup visual (scores, framework, THEN/NOW/NEXT)
4. **Para quem**: 4 cards de personas — C-level, gestores, consultores, empreendedores
5. **Memória 25 anos**: fundo taime-900, 3 cards de timeline (2000-2014 / 2015-2021 / 2022-hoje), CTA para histórico
6. **Preview do relatório** (`id="preview"`): header taime-900, executive summary (3 §), score dimensions em cards, CTA com nota "assinantes"
7. **Como funciona** (`id="como-funciona"`): 3 passos com texto revisado
8. **Planos** (`id="planos"`): 3 cards (Gratuito / Essencial R$197 / Estratégico R$497), nota Stripe em breve
9. **Footer institucional**: fundo taime-900, brand + tagline, links de navegação, contato@taime.tech, copyright

### Login — 2 estados:
- **Waitlist** (padrão): título "Solicitar acesso ao TAIME", insert em tabela `waitlist`, confirmação verde ✓, link para trocar de estado
- **Magic link**: título "Acessar o TAIME", `signInWithOtp` com `shouldCreateUser: false` (só usuários já aprovados), confirmação ✉️
- Reset de estado ao trocar entre modes; erro 23505 tratado como "email já registrado"

### Decisões técnicas:
- `Navbar` como Client Component separado — importado pelo Server Component `page.tsx` sem problemas (padrão Next.js)
- Âncoras `/#preview`, `/#como-funciona`, `/#planos` — Hero CTA "Ver último relatório" aponta para `#preview`
- `shouldCreateUser: false` no magic link — enforça modelo de acesso antecipado (waitlist → convite → magic link)
- Mini report mockup na seção 3 usa dados estáticos — não depende de API, sempre visível
- Waitlist SQL com RLS bloqueando SELECT do anon key — emails nunca expostos via API pública

### Build:
```
✓ 0 erros TypeScript — 7 páginas geradas
/ (landing)   94.9 kB  [static]   ← +0.7kB (Navbar + 9 seções)
/login        160 kB   [static]   ← +0.5kB (dois estados)
```

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [x] frontend / visualização — `taime-web/`
- [x] melhorias frontend (framework, landing, busca, email)
- [x] home institucional + fluxo de acesso antecipado
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Frontend: 4 melhorias (framework, landing, busca, email)

### Arquivos modificados/criados:

**Modificados:**
- `components/ReportClient.tsx` — `FrameworkPanel` redesenhado: timeline vertical com parsing "Heading — Body", cards coloridos por step, espaço para 2-3 linhas de contexto real
- `app/page.tsx` — Landing enriquecida: hero premium, preview do relatório com score dimensions em cards, seção "Como funciona" com 3 passos, CTA duplo
- `app/dashboard/page.tsx` — Delegado rendering para `DashboardClient` (busca + filtro client-side)

**Criados:**
- `components/DashboardClient.tsx` — Client Component: busca por título, dropdown de períodos, contador de resultados, botão "Limpar filtros"
- `RESEND_SETUP.md` — Guia completo: SMTP customizado no Supabase, verificação de domínio, template HTML do magic link, URL Configuration, rate limits

### Decisões técnicas:

**MELHORIA 1 — FrameworkPanel:**
- Layout mudou de `grid-cols-5` (5 colunas) para timeline vertical — colunas apertadas demais para contexto real
- Regex `([^—–\n]{2,60})\s*[—–]\s*([\s\S]{10,})` extrai "label — descrição" automaticamente, sem quebrar onde o LLM retorna apenas uma frase
- Flag `s` removida do regex (incompatível com o target TS do projeto); substituída por `[\s\S]` equivalente
- Cada step tem cor distinta: taime-600, emerald, blue, amber, zinc
- Conteúdo do JSONB `taime_framework_pt_br/en` exibido integralmente — nada é truncado

**MELHORIA 2 — Landing:**
- Hero: nav sticky com backdrop-blur, badge, H1 em 6xl com line-height 1.08
- Preview: fundo taime-900 no header do relatório, executive summary (3 parágrafos), score dimensions como cards com barra colorida animada
- Score dimensions: query estendida para incluir `taime_framework_pt_br` nas trends; função `avgDimensions()` computa média por dimensão em memória
- "Como funciona": 3 steps com número em 5xl zinc-100, sem dependências pesadas
- CTA duplicado (hero + fim da seção "como funciona")

**MELHORIA 3 — Resend/email:**
- `RESEND_SETUP.md` cobre: verificação DNS, SMTP settings no Supabase, URL Configuration dev/prod, template HTML completo com identidade TAIME, teste e rate limits

**MELHORIA 4 — Dashboard com busca:**
- Server Component mantido para auth check + data fetching (sem mudança de arquitetura)
- `DashboardClient` recebe `reports: Report[]` como prop, filtra client-side com `useMemo` — sem request extra ao banco
- Contador de resultados visível só quando filtros ativos; botão "Limpar filtros" no estado vazio

### Build:
```
✓ 0 erros TypeScript — 7 páginas geradas
/ (landing)        94.2 kB  [static]
/dashboard        160 kB   [dynamic]   ← +1kB (DashboardClient)
/reports/[id]      90.3 kB [dynamic]   ← +0.4kB (FrameworkPanel expandido)
```

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [x] frontend / visualização — `taime-web/`
- [x] melhorias frontend (framework, landing, busca, email)
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Schema SQL + Pipeline de coleta de sinais

### Arquivos criados/modificados:
- `schema.sql` — Schema completo do banco Supabase: 8 tabelas, RLS com `is_active_subscriber()`, índices, triggers de `updated_at`, seed das 25 fontes tier-1
- `collect-signals.ts` — Pipeline de coleta mensal: Serper API → deduplicação por URL → fetch do conteúdo real → insert em `signals`
- `package.json` — Config mínima do projeto Node.js com scripts `collect`, `analyze`, `report`
- `tsconfig.json` — Config TypeScript (target ES2022, strict)
- `.env.example` — Template de variáveis de ambiente necessárias

### Decisões técnicas tomadas:
- `period` salvo como `date` (primeiro dia do mês: `2026-05-01`) — facilita GROUP BY, range queries e joins por período sem ambiguidade
- `signal_ids uuid[]` em `signal_clusters` ao invés de tabela junction — mantém exatamente 8 tabelas conforme spec; suficiente para queries por período
- Fetch nativo sem `@supabase/supabase-js` — usa REST API com `service_role` key diretamente, zero dependências pesadas
- `tbs: 'qdr:m'` no Serper — filtra resultados do último mês alinhado ao ciclo mensal do TAIME
- `AbortSignal.timeout()` para timeout de fetch de artigos — nativo Node ≥ 18, sem `node-fetch`
- `summary: null` na coleta — campo reservado para pipeline LLM separado (`analyze-signals.ts`)
- 700ms de delay entre chamadas Serper — respeita rate limit conservadoramente
- Conteúdo < 200 chars descartado como paywall ou redirect — snippet do Serper ainda fica em `metadata`
- `is_active_subscriber()` como função `security definer` — evita RLS recursivo ao consultar `subscriptions` dentro de policy de `reports`

### Próximos passos:
- `analyze-signals.ts` — LLM clustering: agrupa signals em 3-5 signal_clusters por período
- `generate-report.ts` — LLM geração: produz report_trends com TAIME Score, framework TYPE→ACT→IMPACT→MOVE→EXIT, THEN/NOW/NEXT, implicações org
- Frontend / visualização dos relatórios
- Stripe webhooks para sincronizar `subscriptions`
- Agente consultor com memória histórica (`advisory_memory`)

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [ ] pipeline de análise LLM — `analyze-signals.ts`
- [ ] geração de relatório — `generate-report.ts`
- [ ] frontend / visualização
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Verificação de infraestrutura + Pipeline de análise LLM

### Verificações realizadas:
- Todas as 7 variáveis de ambiente confirmadas no `.env` (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SERPER_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, PERIOD)
- Todas as 8 tabelas confirmadas no Supabase via REST API (HTTP 200)
- Seed das 25 fontes tier-1 confirmado (`Content-Range: 0-24/25`)

### Arquivos criados/modificados:
- `analyze-signals.ts` — Pipeline LLM: lê signals do período → Claude Sonnet 4.6 → identifica 3-5 clusters → salva em `signal_clusters`
- `collect-signals.ts` — Correção: URL do Supabase agora suporta tanto a URL base quanto a URL REST completa (`/rest/v1/`)

### Decisões técnicas tomadas:
- Prompt caching (`anthropic-beta: prompt-caching-2024-07-31`) aplicado ao system prompt com `cache_control: {type: "ephemeral"}` — reutilizado em retries sem custo extra de tokens
- Sinais formatados com apenas `title + snippet + 400 chars de content` para o LLM — evita ultrapassar context window com 250 sinais × 8000 chars
- Idempotência: verifica se clusters já existem antes de re-analisar — evita duplicatas
- Filtro de signal_ids alucinados: valida cada ID retornado pelo LLM contra os IDs reais do banco
- JOIN `sources(name,category)` inline no REST query — evita segunda chamada ao banco
- `PERIOD` lido do `.env` (quando definido) ou calculado como primeiro dia do mês — permite re-processar períodos históricos
- Bug corrigido: `SUPABASE_URL` no `.env` continha `/rest/v1/` — todos os scripts agora fazem `.replace(/\/rest\/v1\/?$/, '')` defensivamente

### Próximos passos:
- `generate-report.ts` — LLM geração: produz `reports` + `report_trends` com TAIME Score, TYPE→ACT→IMPACT→MOVE→EXIT, THEN/NOW/NEXT, implicações org, gatilhos de decisão
- Frontend / visualização dos relatórios
- Stripe webhooks para sincronizar `subscriptions`
- Agente consultor com memória histórica (`advisory_memory`)

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [ ] frontend / visualização
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Frontend Next.js 14 (taime-web)

### Arquivos criados (`taime-web/`):
- `app/page.tsx` — Landing pública: preview do último relatório, score, CTA
- `app/login/page.tsx` — Login via magic link (Supabase Auth, sem senha)
- `app/auth/callback/route.ts` — Troca PKCE code por session
- `app/dashboard/page.tsx` — Lista de relatórios publicados (Server Component)
- `app/reports/[id]/page.tsx` — Relatório completo (Server Component)
- `components/ReportClient.tsx` — Viewer completo com toggle pt-BR/en (Client Component)
- `components/LogoutButton.tsx` — Logout client component
- `lib/types.ts` — Interfaces + helpers (scoreColor, formatPeriod, avgScore...)
- `lib/supabase-server.ts` — Clientes server-side (anon + service key)
- `lib/supabase-browser.ts` — Cliente browser (auth only)
- `middleware.ts` — Proteção de /dashboard e /reports/*
- `app/globals.css` — Tailwind + tokens CSS (btn-primary, card, section-label...)
- `README.md` — Instruções de setup e arquitetura
- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`

### Decisões técnicas:
- **Service key server-side** para leitura de relatórios — bypassa RLS temporariamente enquanto Stripe não está integrado; substituído por `createSupabaseServer()` quando subscription check estiver ativo
- **ReportClient.tsx como Client Component** — recebe ambos os idiomas do servidor, toggle instantâneo sem reload via `useState`
- **Middleware protege** apenas `/dashboard` e `/reports/*` — landing e login são públicos
- **PKCE flow** para magic link — padrão seguro do `@supabase/ssr`
- **next.config.mjs** ao invés de `.ts` — Next.js 14 não suporta `.ts` para config
- **Build limpo**: 0 erros TypeScript, 7 páginas geradas, middleware 82.1kB

### Build output:
```
/ (landing)           94.2 kB  [static]
/login                159 kB   [static]
/auth/callback         0 B     [server]
/dashboard            159 kB   [dynamic]
/reports/[id]          89.9 kB [dynamic]
```

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [x] frontend / visualização — `taime-web/`
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Bugfixes + Pipeline completo rodado com sucesso

### Bugs corrigidos:

**BUG 1 — analyze-signals.ts: alucinação de signal_ids**
- Causa raiz: LLM recebia UUIDs longos e inventava novos em vez de copiar
- Fix: UUIDs nunca chegam ao LLM. Mapeamento `"001"→UUID` feito localmente.
  - `buildIndexMap(signals)` → `Map<"001", uuid>`
  - LLM vê `[001]`, `[042]` etc — zero UUIDs expostos
  - `resolveToUUIDs(indices, indexMap)` reconverte após resposta
  - Índices inválidos descartados silenciosamente

**BUG 2 — generate-report.ts: JSON truncado por limite de tokens**
- Causa raiz: gerar 3-5 trends em uma chamada ultrapassava max_tokens: 8192
- Fix a) `max_tokens: 16000`
- Fix b) Uma chamada LLM por cluster/trend — JSON menor, sem risco de corte
  - `callClaudeTrend()` → um TrendAnalysis por cluster
  - `callClaudeMetadata()` → report_title + executive_summary separados
  - Calls de metadata rodadas em paralelo (pt-BR + en simultaneamente)
- Fix c) `repairJson()` — fecha chaves/colchetes abertos em JSON truncado

### Output do pipeline (2026-05-01):

**analyze-signals.ts:**
- 158 sinais processados
- 5 clusters identificados, 76 sinais cobertos, 82 descartados como ruído
- ✓ Todos os índices resolvidos (zero alucinações)

**generate-report.ts:**
- 12 chamadas Claude (5 pt-BR trends + 5 en trends + 2 metadata)
- Cache hit em 9 das 12 chamadas (9948 tokens cacheados = ~80% dos tokens de input reutilizados)
- Relatório ID: `2f97f49f-f558-4efa-adb8-16eed66ac75e`
- TAIME Scores: 87, 84, 87, 82, 81 (média: 84)
- Título pt-BR: "A Janela Está Fechando: Como a Convergência de IA Agêntica..."
- Título en: "The Execution Imperative: Why 2026 Is the Year AI Advantage..."

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [ ] frontend / visualização
- [ ] Stripe
- [ ] agente consultor

---

## [2026-05-21] — Pipeline de geração do relatório executivo

### Arquivos criados/modificados:
- `generate-report.ts` — Coração do TAIME: lê clusters → 2 chamadas Claude (pt-BR + en) → salva `reports` + `report_trends` com todos os campos
- `collect-signals.ts` — Adicionado `import 'dotenv/config'` (carrega .env automaticamente)
- `analyze-signals.ts` — Adicionado `import 'dotenv/config'` (carrega .env automaticamente)

### Decisões técnicas tomadas:
- **Duas chamadas separadas por idioma** (pt-BR → en), conforme spec — cada idioma gerado nativamente, não traduzido
- **Caching em camadas**: system prompt + bloco de contexto (clusters + signals) têm `cache_control: ephemeral` — idênticos nas duas chamadas → segunda chamada tem cache hit em ~90% dos tokens de entrada
- **Score anchoring**: chamada en recebe os scores do pt-BR como referência explícita ("use exactly these TAIME Scores") — garante consistência dos números entre idiomas
- **Extended JSONB**: `taime_framework_pt_br` / `_en` armazena os 5 campos core + `executive_snapshot`, `score_dimensions`, `confidence_basis`, `limitations` — sem migration, JSONB suporta extensão
- **Idempotência**: checa `reports?period=eq.{PERIOD}` antes de criar — re-execução segura
- **Batch de signals**: busca signals em chunks de 100 IDs via `id=in.(...)` — evita URLs longas demais
- **Positional fallback**: se `cluster_name` do LLM não bate exatamente, usa posição como fallback — robusto contra pequenas variações de nome
- **Status tracking**: relatório criado como `generating` → preenchido com trends → atualizado para `published` com `published_at` — pipeline auditável
- **dotenv em todos os scripts**: `import 'dotenv/config'` carrega `.env` automaticamente, sem precisar de `source .env` manual

### Sistema de prompts (qualidade premium):
- System prompt: ~1800 tokens — cacheável (acima do threshold de 1024 para Sonnet)
- Define 5 dimensões do TAIME Score com escalas de interpretação
- Define TYPE → ACT → IMPACT → MOVE → EXIT com valores concretos
- Define THEN/NOW/NEXT com foco na profundidade histórica
- Qualidade de output: "operadores já estão implantando enquanto incumbentes debatem governance"
- Score anchoring evita drift entre pt-BR e en

### Próximos passos:
- Frontend / visualização dos relatórios (Next.js ou similar)
- Stripe webhooks para sincronizar `subscriptions`
- Agente consultor com memória histórica (`advisory_memory`)

### Status geral:
- [x] schema.sql
- [x] pipeline de coleta (Serper) — `collect-signals.ts`
- [x] pipeline de análise LLM — `analyze-signals.ts`
- [x] geração de relatório — `generate-report.ts`
- [ ] frontend / visualização
- [ ] Stripe
- [ ] agente consultor
