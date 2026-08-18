// Contagem de fontes ATIVAS (tabela sources), arredondada para baixo a dezena, para
// o card "Fontes validadas" do /sobre e a resposta de FAQ ("Quais fontes o TAIME
// monitora"). Ex.: 175 ativas -> 170 ("mais de 170 fontes globais").
//
// Dinamico com revalidacao DIARIA (Data Cache do Next). Payload minimo (so ids das
// ativas, hoje ~175 linhas). Fail-safe: retorna null se falhar; a UI cai no piso
// honesto estatico (SOURCES_FLOOR).
export const SOURCES_FLOOR = 150

export async function getActiveSourcesRounded(): Promise<number | null> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
    .replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_KEY ?? ''
  if (!url || !key) return null
  try {
    const res = await fetch(`${url}/rest/v1/sources?active=eq.true&select=id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 86_400 }, // revalidacao diaria
    })
    if (!res.ok) return null
    const rows = await res.json() as unknown[]
    const n = Array.isArray(rows) ? rows.length : 0
    if (n <= 0) return null
    return Math.floor(n / 10) * 10
  } catch { return null }
}

// Resolve o numero exibido: a contagem dinamica arredondada, ou o piso honesto.
export function sourcesDisplay(count: number | null): number {
  return count ?? SOURCES_FLOOR
}
