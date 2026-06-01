# Patch cirúrgico em `generate-report.ts`

São **duas mudanças pequenas**. O resto do arquivo fica intocado.

---

## Mudança 1 — `persistReport` NÃO publica mais direto

Hoje, no fim de `persistReport`, existe esta linha:

```ts
await dbPatch('reports', report.id, { status: 'published', published_at: new Date().toISOString() });
return report.id;
```

Troque por (deixa em `generating`; quem decide o status agora é o validador):

```ts
await dbPatch('reports', report.id, { status: 'generating' });
return report.id;
```

> O relatório nasce com `status: 'generating'` no insert e permanece assim até o
> validador rodar. Sem isso, ele iria ao ar sem passar pela curadoria.

---

## Mudança 2 — chamar o validador no fim do `main()`

No topo do arquivo, junto dos outros imports:

```ts
import { validatePersistedReport } from './validate-report';
```

Depois, no `main()`, **guarde os ids** retornados por `persistReport` (hoje eles só
são logados) e valide cada um logo após gerar. No caminho de relatório único:

```ts
const reportId = await persistReport(clusters, ptBrMeta, enMeta, ptBrTrends, enTrends, 1)
console.log(`✓ Relatório persistido: ${reportId}`)

const v = await validatePersistedReport(reportId)
console.log(`  Validação: ${v.verdict.toUpperCase()} · ${v.signalCount} sinais · ${v.flags.length} flags`)
console.log(v.verdict === 'pass' ? '  → AUTO-PUBLICADO' : '  → pending_review (revisar em /admin/reports)')
```

E no caminho dividido (2 relatórios), faça o mesmo para `reportId1` e `reportId2`.

---

## Resultado

- Pipeline roda como sempre (`npx ts-node generate-report.ts`).
- Cada relatório é validado automaticamente ao fim da geração.
- Veredito `pass` limpo → vai ao ar sozinho.
- Qualquer flag → fica em `pending_review`, esperando você em `/admin/reports`.

## Se preferir NÃO acoplar (rodar a validação à parte)

Pule a Mudança 2 e rode o validador como passo separado, como você já faz com o
resto do pipeline:

```bash
PERIOD=2025-06-01 npx ts-node generate-report.ts
PERIOD=2025-06-01 npx ts-node validate-report.ts
```

Nesse modo, **mantenha a Mudança 1** (senão o relatório publica antes de validar).
O `validate-report.ts` pega tudo que estiver em `generating` no período e processa.
