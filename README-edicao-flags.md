# Edição inline de campos flagueados

Permite corrigir, na própria tela de revisão, os trechos que o validador flagueou —
editando o texto PT e EN lado a lado, sem regenerar o relatório (zero tokens de geração).

## Arquivos

```
claude-taime/
└── taime-web/
    ├── lib/reportFieldPath.ts                          ← NOVO (helper de field-path)
    └── app/
        ├── admin/reports/
        │   ├── ReportsAdmin.tsx                          ← ATUALIZADO (badge 'stale' + tipo)
        │   └── [id]/
        │       ├── page.tsx                              ← ATUALIZADO (passa trends ao painel)
        │       └── ReviewPanel.tsx                       ← ATUALIZADO (editor por flag)
        └── api/admin/report-edit/
            └── route.ts                                  ← NOVO (grava edição + marca stale)

Supabase SQL Editor:
└── add-stale-verdict.sql                                ← rodar (adiciona veredito 'stale')
```

## Ordem de instalação

1. Rode `add-stale-verdict.sql` no Supabase (adiciona `'stale'` ao CHECK de `validation_verdict`).
2. Substitua/adicione os 5 arquivos web.
3. `cd taime-web && npm run build` (0 erros).

## Como funciona

- Cada flag na tela de detalhe ganha um botão **Corrigir**. Abre dois textareas
  (Português e English) já preenchidos com o texto atual daquele campo.
- Você edita, clica **Salvar correção**. A API:
  - remove em dash do texto (determinístico, não toca hífen);
  - grava PT e EN no campo certo (coluna direta ou chave JSONB);
  - remove da lista os flags daquele campo;
  - marca o relatório como `validation_verdict = 'stale'` e `status = 'pending_review'`.
- **Custo: zero tokens.** A edição só grava no banco.

## Confirmar que limpou (revalidação)

A edição NÃO chama o LLM. Para reconfirmar que as correções zeraram os flags
(e pegar qualquer coisa que a edição tenha introduzido), rode no terminal:

```
PERIOD=<período> npx ts-node validate-report.ts
```

O validador reprocessa o relatório, recalcula os flags e o veredito, e:
- se ficou limpo → veredito `pass` (e, pela lógica do validador, pode auto-publicar);
- se ainda há flags → volta a `pending_review` com a lista atualizada.

> Por que não revalida sozinho na interface: o validador (com as chamadas LLM) vive
> no pipeline, fora do projeto web. Duplicá-lo no web criaria dívida (dois lugares
> para manter o mesmo prompt do juiz) e exigiria a chave Anthropic na Vercel. Manter
> a revalidação no terminal é mais simples, mais barato e sem risco de divergência.

## Limitações conhecidas

- Flags de erro de parsing do validador (`(judge) JSON não parseável`) não têm campo
  editável — aparecem com nota para revisar no relatório abaixo.
- Flags de nível de relatório (título / resumo executivo) não são editáveis inline
  nesta versão (o painel não recebe o objeto report para pré-preencher). Nos seus
  dados atuais isso não ocorre — todos os flags são de trends. Se precisar, edite
  esses dois campos direto no Supabase, ou peça para estender.
- A correção de em dash troca por vírgula (caso mais comum). Em raras frases a
  pontuação ideal seria outra; revise no viewer se notar algo estranho.
