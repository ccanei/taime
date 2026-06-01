// ============================================================
// app/api/reading-progress/route.ts
// ENTREGA 1 — grava progresso de leitura (upsert idempotente)
// ============================================================
import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { reportId?: string; scrollPct?: number; completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const { reportId, scrollPct, completed } = body;
  if (!reportId) {
    return NextResponse.json({ error: 'reportId required' }, { status: 400 });
  }

  const pct = Math.min(100, Math.max(0, Math.round(scrollPct ?? 0)));

  const { error } = await supabase
    .from('reading_progress')
    .upsert(
      {
        user_id: user.id,
        report_id: reportId,
        scroll_pct: pct,
        completed: completed ?? false,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,report_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
