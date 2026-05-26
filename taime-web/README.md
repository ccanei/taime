# TAIME Web

Frontend Next.js 14 para visualização dos relatórios de inteligência estratégica do TAIME.

## Stack

- **Next.js 14** — App Router, Server Components
- **Supabase** — Auth (magic link) + banco de dados
- **Tailwind CSS** — estilo sem bibliotecas pesadas

## Rotas

| Rota | Acesso | Descrição |
|---|---|---|
| `/` | Público | Landing page com preview do último relatório |
| `/login` | Público | Login via magic link (email) |
| `/auth/callback` | Sistema | Callback do Supabase Auth |
| `/dashboard` | Autenticado | Lista de relatórios publicados |
| `/reports/[id]` | Autenticado | Relatório completo com seletor pt-BR/en |

## Pré-requisitos

- Node.js ≥ 18
- Supabase project configurado (ver `claude-taime/schema.sql`)
- Pelo menos um relatório publicado (ver pipelines em `claude-taime/`)

## Configuração

O arquivo `.env.local` já está configurado com as credenciais do projeto.

Se precisar recriar, use as variáveis abaixo:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # anon key (pública)
SUPABASE_SERVICE_KEY=eyJ...                    # service key (server-only)
```

**Importante:** O `NEXT_PUBLIC_SUPABASE_URL` deve ser a URL base do projeto,
**sem** o sufixo `/rest/v1/`.

## Rodar localmente

```bash
cd taime-web
npm install
npm run dev
```

Acesse: **http://localhost:3000**

## Auth — Supabase Email Redirect

Para o magic link funcionar, configure em:
**Supabase Dashboard → Authentication → URL Configuration**

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

Em produção, substitua pelos domínios reais.

## Acesso a dados — RLS

O frontend usa a **service key** no lado servidor (Server Components / Route Handlers)
para leitura de relatórios, contornando temporariamente o check de subscription no RLS.

Quando a integração Stripe estiver pronta:
1. Substituir `createSupabaseService()` por `createSupabaseServer()` nas pages protegidas
2. O RLS verificará automaticamente a subscription ativa via `is_active_subscriber()`

## Estrutura

```
taime-web/
├── app/
│   ├── layout.tsx            # root layout
│   ├── globals.css           # Tailwind + custom tokens
│   ├── page.tsx              # landing (Server Component)
│   ├── login/page.tsx        # login com magic link (Client Component)
│   ├── auth/callback/        # troca code por session
│   ├── dashboard/page.tsx    # lista de relatórios (Server Component)
│   └── reports/[id]/page.tsx # relatório completo (Server + Client)
├── components/
│   ├── ReportClient.tsx      # viewer completo com language toggle
│   └── LogoutButton.tsx      # client component para logout
├── lib/
│   ├── types.ts              # interfaces + helpers (scoreColor, formatPeriod...)
│   ├── supabase-server.ts    # clientes server-side (anon + service)
│   └── supabase-browser.ts   # cliente browser (auth only)
└── middleware.ts             # proteção de /dashboard e /reports/*
```

## Build de produção

```bash
npm run build
npm start
```
