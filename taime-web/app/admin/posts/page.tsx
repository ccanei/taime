import { redirect } from 'next/navigation'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import { AdminHeader, StatCard, fmtInt } from '@/components/admin/kit'
import ReloadButton from '@/components/admin/ReloadButton'
import PostsAdmin, { type MarketingPost } from './PostsAdmin'

const FULL_SELECT =
  'id, created_at, period, trend_id, trend_title, question, advisor_response, post_pt, post_en, status, published_at, published_pt, published_en, source'
const LEGACY_SELECT =
  'id, created_at, period, trend_id, trend_title, question, advisor_response, post_pt, post_en, status, published_at'

async function getPosts(): Promise<{ rows: MarketingPost[]; missing: boolean }> {
  const supabase = createSupabaseService()

  let data: unknown = null
  let error: { code?: string; message?: string } | null = null

  const full = await supabase
    .from('marketing_posts')
    .select(FULL_SELECT)
    .order('created_at', { ascending: false })
    .limit(200)

  // Migracao dos campos publicados (published_pt/en, source) ainda nao rodada:
  // cai no schema legado para a pagina seguir funcionando sem esses campos.
  const columnMissing = full.error &&
    (full.error.code === '42703' || /column .* does not exist/i.test(full.error.message ?? ''))
  if (columnMissing) {
    const legacy = await supabase
      .from('marketing_posts')
      .select(LEGACY_SELECT)
      .order('created_at', { ascending: false })
      .limit(200)
    data = legacy.data; error = legacy.error
  } else {
    data = full.data; error = full.error
  }

  if (error) {
    // Tabela ainda nao criada (migracao pendente): UI mostra aviso, nao quebra.
    const missing = error.code === '42P01' || /relation|does not exist/i.test(error.message ?? '')
    return { rows: [], missing }
  }

  const rows = ((data as Partial<MarketingPost>[]) ?? []).map(r => ({
    ...r,
    published_pt: r.published_pt ?? null,
    published_en: r.published_en ?? null,
    source:       r.source ?? 'machine',
  })) as MarketingPost[]
  return { rows, missing: false }
}

export default async function AdminPostsPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const { rows, missing } = await getPosts()

  const draft     = rows.filter(r => r.status === 'draft').length
  const approved  = rows.filter(r => r.status === 'approved').length
  const published = rows.filter(r => r.status === 'published').length

  return (
    <div className="min-h-screen bg-zinc-50">
      <AdminHeader title="Posts" active="/admin/posts" />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 mb-1">Rascunhos de LinkedIn</h1>
            <p className="text-sm text-zinc-500">
              Gerados pelo script scripts/generate-advisor-post.ts a partir do uso do Executive Advisor sobre as trends do último período publicado.
            </p>
          </div>
          <ReloadButton />
        </div>

        {!missing && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total" value={fmtInt(rows.length)} />
            <StatCard label="Rascunhos" value={fmtInt(draft)} tone={draft ? 'warn' : undefined} />
            <StatCard label="Aprovados" value={fmtInt(approved)} />
            <StatCard label="Publicados" value={fmtInt(published)} tone="good" />
          </div>
        )}

        {missing ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            A tabela <code className="font-mono">marketing_posts</code> ainda não existe. Rode
            {' '}<code className="font-mono">taime-web/add-marketing-posts.sql</code> no SQL editor do Supabase.
          </div>
        ) : (
          <PostsAdmin initial={rows} />
        )}
      </main>
    </div>
  )
}
