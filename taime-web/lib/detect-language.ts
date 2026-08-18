// Deteccao de idioma (PT/EN) para o Advisor logado e para o /ask anonimo.
// UNICO lugar, extensivel. Camadas:
//   1) Sinal forte: qualquer acento do portugues -> pt.
//   2) STOPLIST: remove nomes proprios e termos consagrados (iguais/ambiguos nos
//      dois idiomas) ANTES de contar, para nao enviesar (ex.: "TAIME Executive
//      Advisor" nao deve pesar como ingles).
//   3) Conta palavras funcionais fortes de cada idioma (sem preposicoes que colidem,
//      tipo "do/a/o/e").
//   4) Empate / baixa confianca: vies configuravel (biasPt no /ask anonimo, ICP Brasil).
//
// A PRECEDENCIA da preferencia do usuario logado NAO mora aqui: e aplicada na rota
// (a preferencia prevalece sobre esta heuristica; a heuristica so decide quando nao
// ha preferencia). Ver app/api/advisor/chat/route.ts.

export type Lang = 'pt' | 'en'

// Extensivel: basta adicionar o termo em minusculo. Frases multi-palavra sao
// casadas por limite de palavra (\b...\b) com prioridade para as mais longas.
export const LANG_STOPLIST: string[] = [
  // Produto e framework TAIME
  'taime executive advisor', 'executive advisor', 'taime',
  'then now next', 'then, now, next', 'type act impact move exit',
  // Termos tecnicos consagrados (iguais em PT/EN)
  'agentic ai', 'ai agents', 'ai agent', 'generative ai', 'genai', 'gen ai',
  'machine learning', 'deep learning', 'reinforcement learning',
  'zero trust', 'cloud', 'multicloud', 'hybrid cloud', 'sovereign cloud',
  'finops', 'devops', 'devsecops', 'mlops', 'llmops', 'observability',
  'kubernetes', 'serverless', 'edge computing', 'edge ai', 'data mesh',
  'data lakehouse', 'data lake', 'data warehouse', 'lakehouse', 'data center',
  'blockchain', 'quantum computing', 'post-quantum', 'confidential computing',
  'ransomware', 'phishing', 'malware', 'endpoint', 'firewall', 'xdr', 'edr',
  'siem', 'soar', 'saas', 'paas', 'iaas', 'api', 'apis', 'sdk', 'roi', 'kpi',
  'okr', 'ciso', 'cto', 'cio', 'ceo', 'cfo', 'llm', 'llms', 'rag', 'iot',
  'copilot', 'chatgpt', 'openai', 'nvidia', 'microsoft', 'google', 'amazon',
  'aws', 'azure', 'gcp', 'spatial computing', 'mixed reality', 'digital twin',
  'ai governance', 'ai trism', 'ai security', 'data governance',
]

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Longest-first para "taime executive advisor" casar antes de "taime"/"advisor".
const STOP_RE = new RegExp(
  '\\b(' + [...LANG_STOPLIST].sort((a, b) => b.length - a.length).map(escapeRe).join('|') + ')\\b',
  'gi',
)

// Palavras funcionais fortes. NUNCA incluir preposicoes/artigos ambiguos ("do", "a",
// "o", "e") que colidem entre os idiomas e causam o bug do nome do produto.
const PT_RE = /\b(voce|nao|esta|estao|sao|seja|que|qual|quais|como|porque|para|pra|com|sem|empresa|estrategia|estrategico|relatorio|posso|quero|preciso|devo|vale|deveria|fazer|sobre|isso|aquilo|agora|onde|quando|quanto|meu|minha|nosso|nossa|seu|sua|dos|das|numa|num|pelo|pela|esperar|espero|investir|investimento|governanca|seguranca|mercado|tendencia|tendencias|proximo|proxima|em|no|na|desde|hoje|historico|evolucao|foco|focar|base|entre|dele|dela|deles)\b/g
const EN_RE = /\b(the|what|how|should|shall|would|could|company|strategy|report|can|cannot|want|need|please|which|with|without|about|this|that|these|those|why|does|are|is|am|my|our|your|you|where|when|expect|from|into|than|invest|investment|market|governance|security|trend|trends|now|next|worth|going|about)\b/g

export function detectLanguage(text: string, opts?: { biasPt?: boolean }): Lang {
  const lower = (text ?? '').toLowerCase()
  // 1) Sinal forte: acento portugues.
  if (/[ãõçáàâéêíóôúäü]/.test(lower)) return 'pt'
  // 2) Remove a stoplist antes de contar.
  const scrubbed = lower.replace(STOP_RE, ' ')
  // 3) Conta palavras funcionais.
  const ptHits = (scrubbed.match(PT_RE) ?? []).length
  const enHits = (scrubbed.match(EN_RE) ?? []).length
  if (ptHits > enHits) return 'pt'
  if (enHits > ptHits) return 'en'
  // 4) Empate / baixa confianca.
  return opts?.biasPt ? 'pt' : 'en'
}
