import { NextResponse } from 'next/server'
import { getArchiveNumbers } from '@/lib/archive-stats'

// Numeros do arquivo para a linha de credibilidade da tela de chegada. Publico
// (usado tambem pelo /ask): expoe SO contagens agregadas e faixa de anos, nunca
// conteudo de relatorio. Fail-safe: se falhar, retorna null e o cliente esconde a linha.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const stats = await getArchiveNumbers()
  return NextResponse.json({ stats })
}
