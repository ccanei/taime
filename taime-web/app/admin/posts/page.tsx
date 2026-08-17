import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServer, createSupabaseService } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/isAdmin'
import AdminNav from '@/components/AdminNav'
import PostsAdmin, { type MarketingPost } from './PostsAdmin'

async function getPosts(): Promise<{ rows: MarketingPost[]; missing: boolean }> {
  const supabase = createSupabaseService()
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('id, created_at, period, trend_id, trend_title, question, advisor_response, post_pt, post_en, status, published_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    // Tabela ainda nao criada (migracao pendente): UI mostra aviso, nao quebra.
    const missing = error.code === '42P01' || /relation|does not exist/i.test(error.message ?? '')
    return { rows: [], missing }
  }
  return { rows: (data as MarketingPost[]) ?? [], missing: false }
}

export default async function AdminPostsPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!await isAdmin(user.email ?? '')) redirect('/')

  const { rows, missing } = await getPosts()

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
              ← Dashboard
            </Link>
            <span className="text-zinc-200">/</span>
            <span className="text-sm font-semibold text-zinc-900">Posts</span>
            <AdminNav active="/admin/posts" />
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-taime-50 text-taime-700 font-semibold border border-taime-100">
            Admin
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 mb-1">Rascunhos de LinkedIn</h1>
          <p className="text-sm text-zinc-500">
            Gerados pelo script scripts/generate-advisor-post.ts a partir do uso do Executive Advisor sobre as trends do último período publicado.
          </p>
        </div>

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
