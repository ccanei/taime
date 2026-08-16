// Remove marcacao de markdown de um trecho para exibir como TEXTO puro (ex: o
// snippet da ultima conversa do Advisor no dashboard). O Advisor responde em
// markdown, que e renderizado no chat; aqui e so um preview de uma linha, entao
// tiramos negrito/titulos/listas/links/codigo cru e normalizamos o espaco.
export function stripMarkdown(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .replace(/```[\s\S]*?```/g, ' ')          // blocos de codigo
    .replace(/`([^`]+)`/g, '$1')               // codigo inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // imagens
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // links -> texto
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // titulos ###
    .replace(/^\s{0,3}>\s?/gm, '')             // blockquote
    .replace(/^\s{0,3}[-*+]\s+/gm, '')         // itens de lista
    .replace(/^\s{0,3}\d+\.\s+/gm, '')         // listas numeradas
    .replace(/(\*\*|__)(.*?)\1/g, '$2')        // negrito
    .replace(/(\*|_)(.*?)\1/g, '$2')           // italico
    .replace(/~~(.*?)~~/g, '$1')               // riscado
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')     // regua horizontal
    .replace(/\s+/g, ' ')                       // colapsa espaco/quebras
    .trim()
}

// Rede de seguranca contra travessao (em dash, U+2014). Regra editorial inviolavel
// do TAIME: nunca sai travessao ao usuario. O prompt e a defesa primaria; isto
// garante que um deslize do modelo nunca chega ao render. Substitui por virgula.
export function stripEmDash(input: string): string {
  if (!input) return input
  return input
    .replace(/\s*—\s*/g, ', ')  // travessao com espacos ao redor -> ", "
    .replace(/,\s*([.;:!?])/g, '$1')  // limpa ", ." acidental em fim de oracao
}

// Normaliza texto livre do perfil montado por concatenacao de campos: colapsa
// espacos, junta pontuacao duplicada ("Reduzir custos. . Implementar" -> "Reduzir
// custos. Implementar"), remove espaco antes de pontuacao e ponto final orfao.
export function tidyProfileText(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/\s+/g, ' ')                  // colapsa espacos e quebras
    .replace(/(?:\s*\.\s*){2,}/g, '. ')    // ". ." / ".." / ". . " -> ". "
    .replace(/\s+([,;:.!?])/g, '$1')       // remove espaco antes de pontuacao
    .replace(/([,;:])\1+/g, '$1')          // pontuacao repetida (,, ;;) -> uma
    .replace(/\s*\.\s*$/, '.')             // final: um ponto sem espaco sobrando
    .trim()
}

// Trunca em `max` caracteres sem cortar palavra no meio, adicionando reticencias.
export function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '...'
}
