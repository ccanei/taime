// ── Classificacao de intencao da pergunta (v5.1) ────────────────────────────
// Modulo PURO (zero dependencias), testavel e ponto UNICO de verdade sobre o tipo
// da pergunta. Antes a classificacao vivia espalhada: isTrajectoryQuestion (para a
// selecao com reserva de recencia + espinha) e um regex ad-hoc em pickMaxTokens
// (para o teto de tokens). Elas dessincronizaram: uma pergunta de NEXT/investimento
// era "pesada" no teto mas NAO "trajetoria" na selecao, entao rodava sem reserva de
// recencia e a resposta ignorava 2025/2026. Aqui unificamos.
//
// - isTrajectoryQuestion: passado/evolucao ("como evoluiu", "desde quando",
//   "historico", "ao longo do tempo"). Usada tambem pelo teaser de profundidade.
// - isProspectiveQuestion: futuro/decisao ("qual o NEXT", "onde investir", "o que
//   priorizar", "veredito", framework then/now/next). Para uma pergunta prospectiva,
//   material RECENTE e ainda mais critico que para historico.
// - isStrategicQuestion = trajetoria OU prospectiva. Gate UNICO da selecao com
//   reserva de recencia + espinha E do teto de tokens pesado.

function normalize(message: string): string {
  return message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Passado / evolucao / timing (PT + EN, sem acentos).
const TRAJECTORY_RE = /(desde quando|ha quanto tempo|quando (?:comec|surg|deve|devo|entr)|e cedo|e tarde|cedo demais|tarde demais|(?:estou|estamos|esta|estao) atrasad|atrasad[oa]s? em|como (?:evolu|mudou|chegou|surgiu|se desenvolv)|evolu(?:iu|cao|ir|indo)|trajetoria|historico|ao longo (?:do tempo|dos anos)|nos ultimos anos|linha do tempo|amadurec|timing|since when|how long|too early|too late|is it (?:too )?(?:early|late)|behind on|are we behind|how (?:did|has|have)\b.{0,40}(?:evolv|chang|develop|matur)|evolv(?:ed|ing|e)\b|evolution|trajectory|over time|history of|in recent years|timeline|when (?:did|should)|maturity of|catch(?:ing)? up)/i

// Futuro / projecao / decisao / investimento / prioridade / framework THEN-NOW-NEXT.
// Inclusivo de proposito: super-classificar como estrategica so ativa reserva de
// recencia + teto maior, ambos seguros; nunca prejudica uma pergunta factual.
const PROSPECTIVE_RE = /(\bnext\b|then\s*now\s*next|then\/now\/next|thennownext|\bframework\b|proximo(?:s)? passo|next (?:move|step)|o que vem (?:a seguir|pela frente|depois)|para onde (?:vai|caminha|ir)|no futuro|\bfuturo\b|\bfuture\b|projec(?:ao|oes)|projection|projetar|forecast|outlook|onde (?:focar|investir|apostar)|where (?:to|should i) (?:focus|invest|bet)|investiment|investment|priorizar|prioridade|prioriti|veredito|verdict|devo (?:seguir|focar|investir|priorizar|apostar)|deveria (?:seguir|focar|investir|priorizar|apostar)|should i\b|o que (?:priorizar|seguir|fazer a seguir)|onde devo|para onde vamos)/i

export function isTrajectoryQuestion(message: string): boolean {
  return TRAJECTORY_RE.test(normalize(message))
}

export function isProspectiveQuestion(message: string): boolean {
  return PROSPECTIVE_RE.test(normalize(message))
}

// Gate unico: qualquer pergunta que exige a selecao estrategica (reserva de
// recencia + espinha) e o teto de tokens pesado.
export function isStrategicQuestion(message: string): boolean {
  const m = normalize(message)
  return TRAJECTORY_RE.test(m) || PROSPECTIVE_RE.test(m)
}
