// Modelo do Assessment de Maturidade TAIME (Parte A). Fonte UNICA e compartilhada
// (client + server): 5 dominios, 20 perguntas (4 por dominio), cada opcao descreve um
// ESTAGIO concreto (nao escala abstrata), pontuando 1 a 4. Linguagem de executivo: o
// cliente RECONHECE a propria situacao numa opcao, nao se autoavalia. Sem imports
// server-side. A Parte B (veredito de atraso vs mercado) NAO vive aqui.

export type Locale = 'pt' | 'en'
export type DomainId = 'data' | 'cloud' | 'ai' | 'security' | 'governance'
export type Level = 1 | 2 | 3 | 4
export type AnswerOrigin = 'conversation' | 'form'

export interface Bilingual { pt: string; en: string }
export interface AssessmentOption { level: Level; pt: string; en: string }
export interface AssessmentQuestion {
  id:      string
  domain:  DomainId
  prompt:  Bilingual
  options: AssessmentOption[]   // exatamente 4, niveis 1..4
}
export interface Domain { id: DomainId; label: Bilingual; short: Bilingual }

export const DOMAINS: Domain[] = [
  { id: 'data',       label: { pt: 'Dados', en: 'Data' }, short: { pt: 'Dados', en: 'Data' } },
  { id: 'cloud',      label: { pt: 'Cloud e Infraestrutura', en: 'Cloud and Infrastructure' }, short: { pt: 'Cloud', en: 'Cloud' } },
  { id: 'ai',         label: { pt: 'IA e Automação', en: 'AI and Automation' }, short: { pt: 'IA', en: 'AI' } },
  { id: 'security',   label: { pt: 'Segurança', en: 'Security' }, short: { pt: 'Segurança', en: 'Security' } },
  { id: 'governance', label: { pt: 'Governança e Modelo Operacional', en: 'Governance and Operating Model' }, short: { pt: 'Governança', en: 'Governance' } },
]

// Helper de escrita concisa: q(id, domain, ptPrompt, enPrompt, [ [pt,en] x4 ] nivel 1..4)
function q(id: string, domain: DomainId, pt: string, en: string, opts: Array<[string, string]>): AssessmentQuestion {
  return { id, domain, prompt: { pt, en }, options: opts.map(([p, e], i) => ({ level: (i + 1) as Level, pt: p, en: e })) }
}

export const QUESTIONS: AssessmentQuestion[] = [
  // ── DADOS ────────────────────────────────────────────────────────────────
  q('data_1', 'data',
    'Onde vivem os dados que alimentariam uma decisão automatizada?',
    'Where do the data that would feed an automated decision actually live?',
    [
      ['Espalhados em sistemas e planilhas, sem um mapa de onde está o quê', 'Scattered across systems and spreadsheets, with no map of what is where'],
      ['Centralizados em um sistema principal ou um conjunto conhecido de planilhas', 'Centralized in one main system or a known set of spreadsheets'],
      ['Em uma base estruturada, com acesso controlado por área', 'In a structured database, with access controlled by area'],
      ['Base unificada, com governança, linhagem e qualidade monitorada', 'A unified base, with governance, lineage and monitored quality'],
    ]),
  q('data_2', 'data',
    'Quando alguém precisa de um dado para decidir, quanto custa obtê-lo confiável?',
    'When someone needs a datum to decide, how hard is it to get it reliably?',
    [
      ['Depende de pedir a quem conhece o sistema, e pode levar dias', 'It depends on asking whoever knows the system, and can take days'],
      ['Sai de relatórios prontos, mas exige conferência manual', 'It comes from ready reports, but needs manual checking'],
      ['Self-service para as áreas, a partir de fontes definidas', 'Self-service for the teams, from defined sources'],
      ['Em tempo quase real, com confiança na origem e na qualidade', 'Near real time, with trust in the source and the quality'],
    ]),
  q('data_3', 'data',
    'Como vocês lidam com qualidade e duplicação de dados?',
    'How do you deal with data quality and duplication?',
    [
      ['Cada área tem a sua versão; as divergências aparecem nas reuniões', 'Each area has its own version; the divergences surface in meetings'],
      ['Há limpezas pontuais quando um problema estoura', 'There are one-off clean-ups when a problem blows up'],
      ['Regras de qualidade definidas para os dados críticos', 'Quality rules defined for the critical data'],
      ['Qualidade monitorada continuamente, com dono e métricas', 'Quality monitored continuously, with an owner and metrics'],
    ]),
  q('data_4', 'data',
    'Os dados históricos estão acessíveis para análise de tendência?',
    'Is historical data accessible for trend analysis?',
    [
      ['Histórico disperso ou preso em sistemas antigos', 'History scattered or locked in legacy systems'],
      ['Existe, mas extrair uma série histórica dá trabalho', 'It exists, but pulling a historical series is painful'],
      ['Histórico consolidado para os domínios principais', 'History consolidated for the main domains'],
      ['Histórico rico, versionado e pronto para análise e modelos', 'Rich, versioned history, ready for analysis and models'],
    ]),

  // ── CLOUD E INFRAESTRUTURA ────────────────────────────────────────────────
  q('cloud_1', 'cloud',
    'Como vocês usam a nuvem hoje?',
    'How do you use the cloud today?',
    [
      ['Ainda majoritariamente em servidores próprios, ou nuvem como hospedagem básica', 'Still mostly on our own servers, or cloud as basic hosting'],
      ['Migramos o que dava, mas operamos como se fosse datacenter alugado (lift-and-shift)', 'We migrated what we could, but run it like a rented datacenter (lift and shift)'],
      ['Nuvem operada com disciplina: provisionamento automatizado e custo acompanhado', 'Cloud run with discipline: automated provisioning and cost tracked'],
      ['Nuvem como plataforma de produto: elástica, com infraestrutura como código e capacidades novas nascendo nela', 'Cloud as a product platform: elastic, with infrastructure as code and new capabilities born on it'],
    ]),
  q('cloud_2', 'cloud',
    'Como uma nova aplicação ou ambiente é provisionado?',
    'How is a new application or environment provisioned?',
    [
      ['Manualmente, por um time que sabe fazer', 'Manually, by a team that knows how'],
      ['Roteiros semi-manuais, documentados em parte', 'Semi-manual runbooks, partly documented'],
      ['Automação de provisionamento para os casos comuns', 'Provisioning automation for the common cases'],
      ['Infraestrutura como código, versionada, reproduzível e auditável', 'Infrastructure as code, versioned, reproducible and auditable'],
    ]),
  q('cloud_3', 'cloud',
    'Quão previsível é o custo da sua infraestrutura?',
    'How predictable is your infrastructure cost?',
    [
      ['Só descobrimos o custo depois, com pouco controle', 'We only find out the cost afterwards, with little control'],
      ['Acompanhamos a fatura, mas sem otimização ativa', 'We track the bill, but without active optimization'],
      ['Custos monitorados por área ou produto, com alertas', 'Costs monitored by area or product, with alerts'],
      ['FinOps ativo: custo por unidade de negócio e otimização contínua', 'Active FinOps: cost per business unit and continuous optimization'],
    ]),
  q('cloud_4', 'cloud',
    'O que acontece se um componente crítico cai?',
    'What happens if a critical component goes down?',
    [
      ['Corrida manual para restaurar, com tempo de recuperação incerto', 'A manual scramble to restore, with uncertain recovery time'],
      ['Backups existem, mas a recuperação é testada raramente', 'Backups exist, but recovery is rarely tested'],
      ['Redundância nos sistemas críticos, com recuperação testada', 'Redundancy on critical systems, with recovery tested'],
      ['Alta disponibilidade projetada, com failover automático e ensaiado', 'High availability by design, with automatic and rehearsed failover'],
    ]),

  // ── IA E AUTOMAÇÃO ────────────────────────────────────────────────────────
  q('ai_1', 'ai',
    'Onde a IA ou a automação está no seu dia a dia hoje?',
    'Where does AI or automation sit in your day to day today?',
    [
      ['Ainda não usamos, ou apenas experimentos individuais', 'We do not use it yet, or only individual experiments'],
      ['Ferramentas de IA usadas de forma pontual pelas pessoas', 'AI tools used ad hoc by individuals'],
      ['Alguns processos com automação ou IA em produção', 'A few processes with automation or AI in production'],
      ['IA e automação integradas a processos centrais, com medição', 'AI and automation integrated into core processes, with measurement'],
    ]),
  q('ai_2', 'ai',
    'Quando um processo repetitivo aparece, qual é o reflexo da organização?',
    'When a repetitive process shows up, what is the organization reflex?',
    [
      ['Contratar ou alocar mais gente para dar conta', 'Hire or allocate more people to cope'],
      ['Automatizar depende de um projeto e de alguém disponível', 'Automating depends on a project and someone available'],
      ['Há um caminho conhecido para automatizar os casos claros', 'There is a known path to automate the clear cases'],
      ['Automação é o padrão; o humano foca no não repetitivo', 'Automation is the default; humans focus on the non-repetitive'],
    ]),
  q('ai_3', 'ai',
    'Vocês sabem quais ferramentas de IA a equipe usa hoje?',
    'Do you know which AI tools your team uses today?',
    [
      ['Não temos ideia; cada um usa o que quiser, com a conta que tiver', 'No idea; everyone uses whatever they want, on whatever account they have'],
      ['Sabemos das principais, mas há uso informal que não acompanhamos', 'We know the main ones, but there is informal use we do not track'],
      ['Temos um inventário das ferramentas aprovadas, revisado de vez em quando', 'We have an inventory of approved tools, reviewed now and then'],
      ['Inventário mantido, com clareza de que dado cada ferramenta acessa e quem responde por ela', 'Inventory maintained, with clarity on what data each tool accesses and who owns it'],
    ]),
  q('ai_4', 'ai',
    'Quando um agente ou modelo erra, o que acontece?',
    'When an agent or model gets it wrong, what happens?',
    [
      ['Não teríamos como saber que errou', 'We would have no way to know it got it wrong'],
      ['Descobrimos pelo impacto, depois do fato', 'We find out through the impact, after the fact'],
      ['Há supervisão humana nos pontos sensíveis', 'There is human oversight at the sensitive points'],
      ['Monitoramento de qualidade, com trilha e intervenção definida', 'Quality monitoring, with an audit trail and a defined intervention'],
    ]),

  // ── SEGURANÇA ─────────────────────────────────────────────────────────────
  q('security_1', 'security',
    'Quem tem acesso a quê nos seus sistemas?',
    'Who has access to what across your systems?',
    [
      ['Acessos foram sendo concedidos ao longo do tempo, sem revisão', 'Access was granted over time, with no review'],
      ['Conhecemos os acessos principais, revisados esporadicamente', 'We know the main access, reviewed sporadically'],
      ['Acesso por papel, revisado periodicamente', 'Role-based access, reviewed periodically'],
      ['Menor privilégio, com acesso revisado e auditado continuamente', 'Least privilege, with access reviewed and audited continuously'],
    ]),
  q('security_2', 'security',
    'Como vocês saberiam que sofreram um incidente de segurança?',
    'How would you know you suffered a security incident?',
    [
      ['Provavelmente só quando o dano aparecesse', 'Probably only when the damage showed up'],
      ['Pelos alertas básicos que os sistemas já trazem', 'Through the basic alerts the systems already ship with'],
      ['Monitoramento de segurança centralizado nos ativos críticos', 'Security monitoring centralized on the critical assets'],
      ['Detecção e resposta ativas, com processo de resposta ensaiado', 'Active detection and response, with a rehearsed response process'],
    ]),
  q('security_3', 'security',
    'Como os dados sensíveis são protegidos?',
    'How is sensitive data protected?',
    [
      ['Sem política clara; depende de cada área', 'No clear policy; it depends on each area'],
      ['Protegidos onde é obviamente necessário (senhas e afins)', 'Protected where it is obviously needed (passwords and the like)'],
      ['Com classificação de dados e criptografia dos sensíveis', 'With data classification and encryption of the sensitive ones'],
      ['Proteção por design: classificação, criptografia e controle de vazamento', 'Protection by design: classification, encryption and leak control'],
    ]),
  q('security_4', 'security',
    'Se um cliente grande pedisse hoje evidência de como vocês governam dados e IA, o que aconteceria?',
    'If a large client asked today for evidence of how you govern data and AI, what would happen?',
    [
      ['Teríamos que montar tudo do zero, sob pressão', 'We would have to build it all from scratch, under pressure'],
      ['Reuniríamos o que existe, com lacunas visíveis', 'We would gather what exists, with visible gaps'],
      ['Temos o essencial documentado e localizável', 'We have the essentials documented and easy to locate'],
      ['Entregamos evidência atualizada sem esforço extra, porque faz parte do processo', 'We deliver up to date evidence with no extra effort, because it is part of the process'],
    ]),

  // ── GOVERNANÇA E MODELO OPERACIONAL ───────────────────────────────────────
  q('governance_1', 'governance',
    'Quem decide as prioridades de tecnologia?',
    'Who decides the technology priorities?',
    [
      ['Caso a caso: o que grita mais alto ou o urgente do momento', 'Case by case: whatever shouts loudest or the urgency of the moment'],
      ['Um responsável de TI decide, com pouca conexão com o negócio', 'An IT lead decides, with little connection to the business'],
      ['Prioridades alinhadas entre tecnologia e negócio periodicamente', 'Priorities aligned between technology and business periodically'],
      ['Governança clara, com portfólio priorizado por valor de negócio', 'Clear governance, with a portfolio prioritized by business value'],
    ]),
  q('governance_2', 'governance',
    'Como o sucesso de uma iniciativa de tecnologia é medido?',
    'How is the success of a technology initiative measured?',
    [
      ['Pelo entregou ou não, sem métrica de resultado', 'By delivered or not, with no outcome metric'],
      ['Por prazo e orçamento, não por impacto', 'By deadline and budget, not by impact'],
      ['Por métricas de resultado definidas no início', 'By outcome metrics defined at the start'],
      ['Por valor de negócio medido, com revisão e realocação', 'By measured business value, with review and reallocation'],
    ]),
  q('governance_3', 'governance',
    'O conhecimento crítico de como as coisas funcionam está...',
    'The critical knowledge of how things work is...',
    [
      ['Na cabeça de poucas pessoas-chave', 'In the heads of a few key people'],
      ['Parcialmente documentado, e desatualizado', 'Partly documented, and out of date'],
      ['Documentado para os processos principais', 'Documented for the main processes'],
      ['Documentado, versionado e tratado como ativo da empresa', 'Documented, versioned and treated as a company asset'],
    ]),
  q('governance_4', 'governance',
    'Quando surge uma tecnologia nova e relevante, como vocês reagem?',
    'When a new and relevant technology appears, how do you react?',
    [
      ['Reagimos tarde, quando já virou necessidade urgente', 'We react late, once it has become an urgent need'],
      ['Acompanhamos de longe, sem processo', 'We follow from afar, with no process'],
      ['Avaliamos as relevantes com algum método', 'We evaluate the relevant ones with some method'],
      ['Vigilância tecnológica ativa, com experimentação deliberada', 'Active technology watch, with deliberate experimentation'],
    ]),
]

export const TOTAL_QUESTIONS = QUESTIONS.length      // 20
export const QUESTIONS_PER_DOMAIN = 4
export const SCORE_MIN_ANSWERS = 3                   // dominio so pontua com >= 3 de 4

const BY_ID = new Map(QUESTIONS.map(q => [q.id, q]))
export function questionById(id: string): AssessmentQuestion | undefined { return BY_ID.get(id) }
export function questionsByDomain(d: DomainId): AssessmentQuestion[] { return QUESTIONS.filter(q => q.domain === d) }
export function domainById(id: DomainId): Domain | undefined { return DOMAINS.find(d => d.id === id) }

export interface AnswerValue { level: Level; origin: AnswerOrigin; at: string }
export type Answers = Record<string, AnswerValue>

export interface DomainScore {
  domain:   DomainId
  answered: number       // 0..4
  total:    number       // 4
  score:    number | null // 0..100 (media x 25) quando answered >= 3, senao null
  scored:   boolean      // answered >= 3 (tem nota)
  complete: boolean      // answered === 4 (dominio completo)
}

// Pontuacao por dominio: media dos niveis respondidos x 25 (escala 0-100, mesma regua
// do TAIME Score). Nunca pontua um dominio com menos de 3 respostas (fica incompleto).
export function computeDomainScore(domain: DomainId, answers: Answers): DomainScore {
  const qs = questionsByDomain(domain)
  const levels = qs.map(q => answers[q.id]?.level).filter((l): l is Level => l === 1 || l === 2 || l === 3 || l === 4)
  const answered = levels.length
  const scored = answered >= SCORE_MIN_ANSWERS
  const score = scored ? Math.round((levels.reduce((s, l) => s + l, 0) / answered) * 25) : null
  return { domain, answered, total: qs.length, score, scored, complete: answered === qs.length }
}
export function computeScores(answers: Answers): DomainScore[] {
  return DOMAINS.map(d => computeDomainScore(d.id, answers))
}
export function completedDomains(answers: Answers): DomainId[] {
  return computeScores(answers).filter(s => s.complete).map(s => s.domain)
}
export function answeredCount(answers: Answers): number {
  return QUESTIONS.reduce((n, q) => n + (answers[q.id] ? 1 : 0), 0)
}
export function overallStatus(answers: Answers): 'in_progress' | 'complete' {
  return answeredCount(answers) === TOTAL_QUESTIONS ? 'complete' : 'in_progress'
}

// ── Deteccao barata de dominio pelo texto (para a captura incremental) ───────
// Palavras-chave PT + EN por dominio. Retorna o dominio com mais acertos, ou null.
const DOMAIN_KEYWORDS: Record<DomainId, RegExp> = {
  data:       /\bdados?\b|\bdata\b|planilha|spreadsheet|banco de dados|database|data ?warehouse|data ?lake|linhagem|lineage|qualidade de dado|dataset|\bETL\b|integra[cç][aã]o de dados/i,
  cloud:      /\bnuvem\b|\bcloud\b|infraestrutura|\binfra\b|servidor|on[- ]?premise|\bAWS\b|\bAzure\b|\bGCP\b|kubernetes|container|provisionamento|escalabilidade|finops|data ?center|latac|\bIaC\b/i,
  ai:         /\bIA\b|intelig[eê]ncia artificial|\bAI\b|automa[cç][aã]o|automation|\bagente\b|\bagentes\b|\bagent\b|\bmodelo\b|machine learning|\bML\b|\bLLM\b|copiloto|copilot|\bRPA\b|automatizar/i,
  security:   /seguran[cç]a|security|\bacesso\b|\bacessos\b|\baccess\b|criptografia|encryption|incidente|vulnerabilidade|\bSIEM\b|compliance|\bLGPD\b|\bGDPR\b|privacidade|amea[cç]a|\bbreach\b|zero ?trust|identidade/i,
  governance: /governan[cç]a|governance|prioriza[cç][aã]o|prioridade|modelo operacional|operating model|documenta[cç][aã]o|\bprocesso\b|\bKPI\b|m[eé]trica|portf[oó]lio|roadmap|tomada de decis[aã]o|vigil[aâ]ncia tecnol/i,
}
export function detectDomain(text: string): DomainId | null {
  if (!text) return null
  let best: DomainId | null = null
  let bestN = 0
  for (const d of DOMAINS) {
    const m = text.match(DOMAIN_KEYWORDS[d.id])
    const n = m ? m.length : 0
    if (n > bestN) { bestN = n; best = d.id }
  }
  return bestN > 0 ? best : null
}

// Proxima pergunta ainda nao respondida de um dominio (para a captura incremental).
export function nextUnansweredInDomain(domain: DomainId, answers: Answers): AssessmentQuestion | null {
  return questionsByDomain(domain).find(q => !answers[q.id]) ?? null
}
