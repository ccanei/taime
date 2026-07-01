/**
 * Teste da sanitização determinística do JSON de metadata do relatório.
 *
 * Importa as funções REAIS de generate-report.ts (não cópias), garantido pelo
 * guard `require.main === module` naquele arquivo, que impede o pipeline de
 * rodar ao importar. Cobre as duas classes de defeito que o Opus produzia e que
 * forçavam --resume: control chars crus e aspas de conteúdo não escapadas.
 *
 * Rodar: npx ts-node test-metadata-parse.ts
 */
import { parseJsonSafe } from './generate-report';

interface Meta { report_title?: string; executive_summary?: string; [k: string]: unknown }

interface Case { name: string; input: string; expectKey?: string; expectVal?: string }

const cases: Case[] = [
  {
    name: 'A_newline_literal',
    input: '{\n  "report_title": "Título do período",\n  "executive_summary": "Par um.\nPar dois.\nPar três."\n}',
  },
  {
    name: 'B_aspas_internas_nao_escapadas',
    input: '{"report_title":"O ano da IA","executive_summary":"A narrativa dominante é o "meta-enredo" da autonomia agêntica."}',
    expectKey: 'report_title', expectVal: 'O ano da IA',
  },
  {
    name: 'C_newline_mais_aspas',
    input: '{"report_title":"Título","executive_summary":"Primeiro parágrafo cita a "corrida armamentista".\nSegundo parágrafo segue."}',
  },
  {
    name: 'D_tab_literal',
    input: '{"report_title":"T\tI","executive_summary":"ok"}',
  },
  {
    name: 'E_aspas_antes_de_virgula_em_prosa',
    input: '{"report_title":"t","executive_summary":"a chamada "corrida armamentista", que domina o período e muda tudo."}',
  },
  {
    name: 'F_json_ja_valido_preservado',
    input: '{"report_title":"O \\"ano\\" da IA","executive_summary":"Par 1.\\nPar 2."}',
    expectKey: 'report_title', expectVal: 'O "ano" da IA',
  },
  {
    name: 'G_estrutura_aninhada_valida',
    input: '{"report_title":"x","arr":["p","q"],"obj":{"d":"e"},"n":3}',
    expectKey: 'report_title', expectVal: 'x',
  },
  {
    name: 'H_url_com_dois_pontos_e_virgula',
    input: '{"report_title":"http://x.com/a,b?q=1","executive_summary":"end"}',
    expectKey: 'report_title', expectVal: 'http://x.com/a,b?q=1',
  },
  {
    name: 'I_truncado_com_aspas_internas',
    input: '{"report_title":"t","executive_summary":"the "meta" story and more text that got cut',
    expectKey: 'report_title', expectVal: 't',
  },
]

let failures = 0
for (const c of cases) {
  try {
    const r = parseJsonSafe<Meta>(c.input, c.name)
    let ok = true
    let detail = ''
    if (c.expectKey) {
      const got = r[c.expectKey]
      if (got !== c.expectVal) { ok = false; detail = `esperado "${c.expectVal}", obtido "${String(got)}"` }
      else detail = `${c.expectKey}="${String(got)}"`
    } else {
      detail = `parseou (${Object.keys(r).length} chaves)`
    }
    if (ok) console.log(`✅ ${c.name}: ${detail}`)
    else { console.log(`❌ ${c.name}: ${detail}`); failures++ }
  } catch (e) {
    console.log(`❌ ${c.name}: ${String(e).split('\n')[0]}`)
    failures++
  }
}

console.log(failures === 0 ? '\nTODOS OS CASOS PASSARAM' : `\n${failures} FALHA(S)`)
if (failures > 0) process.exit(1)
