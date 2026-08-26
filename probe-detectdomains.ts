import { detectDomains } from './taime-web/lib/assessment-model'
const cases: [string, string][] = [
  ['como devo pensar a segurança dos agentes que quero colocar em produção?', 'evidencia: security + ai'],
  ['como está a segurança de acesso aos nossos sistemas? quem tem acesso a quê?', 'so security'],
  ['onde vivem os dados que alimentariam uma decisão automatizada?', 'data (+ai?)'],
  ['qual a melhor estratégia de marketing para o produto?', 'nenhum dominio'],
  ['como reduzir o custo da nossa infraestrutura em nuvem?', 'cloud'],
]
for (const [t, exp] of cases) console.log(`[${exp}] -> ${JSON.stringify(detectDomains(t))}   ("${t.slice(0,45)}")`)
