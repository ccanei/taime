---
name: linkedin-content
description: Gera posts LinkedIn para a marca TAIME a partir dos dados reais do pipeline (relatórios publicados, radar_signals). Aciona o script `scripts/generate-linkedin-post.ts` que grava o draft em `output/linkedin/` para revisão humana antes de publicar.
---

# linkedin-content

Geração de posts LinkedIn para o TAIME a partir dos dados reais do pipeline. Sempre passa por um gerador (script) que materializa o draft em arquivo, nunca publica em lugar nenhum.

## Quando usar

Aciona esta skill sempre que o usuário pedir, em qualquer idioma:

- "post linkedin", "post do linkedin", "linkedin post"
- "conteúdo da quinzena", "post da quinzena"
- "post do radar", "post pro radar", "radar pulse"
- "post de trend", "trend spotlight"
- "post then-now-next", "post de trajetória"
- "post de score", "score breakdown"
- "post da última trend", "post do último relatório"

Se o pedido for ambíguo (apenas "faz um post" sem formato), sugere os 4 formatos abaixo e pede o usuário escolher.

## Regras editoriais invioláveis

Estas regras herdam do pipeline e nunca podem ser relaxadas. Quem mexer no `system prompt` do script tem que preservá-las.

1. **Nunca citar fontes por nome.** Proibido: Gartner, McKinsey, Forrester, EY, Accenture, Deloitte, BCG, KPMG, CB Insights, PitchBook, IDC, Omdia, etc. Permitido apenas: "consultorias globais", "relatórios de mercado", "casas de pesquisa", "publicações de tier 1".

2. **Empresas como SUJEITO do fato são permitidas.** "Microsoft lançou X" é OK porque é fato verificável. "Segundo a McKinsey, X" é proibido porque vaza a fonte editorial do TAIME.

3. **PROIBIDO em dash (U+2014).** Sem exceções. Usar vírgula, dois pontos, ponto. O script faz `replace(/—/g, ', ')` no output final como rede de segurança, mas o prompt já força o LLM a evitar.

4. **Só fatos presentes nos dados.** Os números (score, dimensões, contagem de sinais, datas) saem do banco. Zero alucinação, zero "achismo" sobre tamanho de mercado ou ROI inventado.

5. **Sem hindsight.** O post fala do momento do dado. Para um relatório de 2025-02, não use vocabulário ou eventos posteriores como contexto.

6. **Idioma padrão EN.** Alcance internacional. Só gera PT-BR se o usuário pedir explicitamente ("post em português", "PT-BR").

## Formatos suportados

| Formato | Quando usar | Estrutura |
|---|---|---|
| **trend-spotlight** | Anunciar a trend de maior score do último relatório publicado | Hook + 2 insights densos + score + CTA para a amostra pública `/r/[id]` |
| **then-now-next** | Mostrar a trajetória de uma trend específica em 3 linhas curtas (a leitura temporal do TAIME) | Hook + "THEN: ...", "NOW: ...", "NEXT: ..." + CTA |
| **radar-pulse** | Resumo de 3 sinais quentes das últimas 48h do radar | Hook + 3 bullets de 1 linha + leitura do TAIME (1 frase) + CTA `/radar` |
| **score-breakdown** | Explicar as 5 dimensões de uma trend em linguagem executiva | Hook + dimensão por linha (Pressão Competitiva, Impacto Estratégico, etc.) + score geral + CTA |

## Estrutura obrigatória de todo post

- **Hook na primeira linha**: máx 12 palavras. Direto. Sem clickbait vazio ("You won't believe..." é proibido).
- **Corpo**: 60 a 150 palavras totais, parágrafos de 1 a 2 linhas (mobile-first no LinkedIn).
- **1 dado concreto sempre**: score, número de sinais, janela temporal, ou contagem de movimentos do relatório.
- **CTA final**: link para
  - `https://www.taime.tech/radar` (formato radar-pulse)
  - `https://www.taime.tech/r/<sample_report_id>` (qualquer formato que mencione um relatório específico)
  Quando em dúvida, usa o sample público; o ID está em `PUBLIC_SAMPLE_REPORT_ID` em `taime-web/app/page.tsx` (`48c29bb6-6dee-46a1-987b-bb08bd775ab0` no momento).
- **3 a 5 hashtags no fim**, em ordem: `#TechIntelligence #AI #StrategicForesight` + 1 ou 2 específicas do tema (`#Cybersecurity`, `#CloudInfrastructure`, `#AgenticAI`, `#DataGovernance`, etc.).
- **Tom**: executivo, direto, conciso. **Máximo 1 a 2 emojis** no post inteiro (preferência por nenhum). Sem jargão de growth hacker ("hot take", "🚀🚀🚀", "this changes everything", "let's gooo").

## Como acionar

```bash
# Executa no root do repositório (taime-CLEAN)
npx ts-node scripts/generate-linkedin-post.ts --format trend-spotlight
npx ts-node scripts/generate-linkedin-post.ts --format radar-pulse
npx ts-node scripts/generate-linkedin-post.ts --format then-now-next --trend-id <uuid>
npx ts-node scripts/generate-linkedin-post.ts --format score-breakdown --trend-id <uuid>

# Opcional: --report-id força um relatório específico (em vez do último publicado)
npx ts-node scripts/generate-linkedin-post.ts --format trend-spotlight --report-id <uuid>

# Opcional: --lang pt-BR força português (default: en)
npx ts-node scripts/generate-linkedin-post.ts --format trend-spotlight --lang pt-BR
```

O script:
1. Busca os dados reais via Supabase REST (service key do `.env.local`).
2. Gera o draft via Claude Sonnet 4.6 (mesmo cliente do `generate-report.ts`).
3. Aplica enforcement em código: replace de U+2014 → vírgula como rede de segurança.
4. Salva o draft em `output/linkedin/post-YYYY-MM-DD-{format}.md` com o post principal + 1 variação alternativa de hook.
5. **NÃO publica.** O arquivo fica para o humano copiar, revisar e colar no LinkedIn.

## Saída esperada (exemplo de estrutura do arquivo)

```markdown
# LinkedIn post — trend-spotlight — 2026-06-11

## Main post

[Hook em 1 linha]

[Corpo de 60-150 palavras em parágrafos curtos]

[CTA com link]

#TechIntelligence #AI #StrategicForesight #SpecificTag

## Alternative hook

[Variação do hook para A/B test]

## Metadata

- Format: trend-spotlight
- Source trend: <uuid> (score X, period YYYY-MM-DD)
- Generated: 2026-06-11T...
- Language: en
```

## O que esta skill NÃO faz

- Não publica em LinkedIn, Buffer, Hootsuite, ou qualquer API de redes sociais.
- Não traduz o post automaticamente (gera no idioma pedido, uma versão por execução).
- Não comenta nem responde DMs.
- Não faz análise de performance de posts anteriores.
- Não inventa números: se o dado não estiver no banco, o post não usa.
