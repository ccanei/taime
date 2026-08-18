import { NextResponse } from 'next/server'
import { getArchiveNumbers, getArchiveByCategory } from '@/lib/archive-stats'

// Numeros do arquivo para a linha de credibilidade da tela de chegada. Publico
// (usado tambem pelo /ask): expoe SO contagens agregadas e faixa de anos, e agora a
// contagem por CATEGORIA (temas cobertos), nunca conteudo de relatorio (titulo,
// periodo, score, link). Fail-safe: cada bloco vira null se falhar; o cliente esconde
// o bloco correspondente sem quebrar.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const [stats, byCategory] = await Promise.all([
    getArchiveNumbers(),
    getArchiveByCategory(),
  ])
  return NextResponse.json({ stats, byCategory })
}
