import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth   = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { execSync } = await import('child_process')
    execSync('npx ts-node ../collect-radar.ts', {
      cwd:     process.cwd().replace('/taime-web', ''),
      timeout: 240000,
    })
    return NextResponse.json({ success: true, collected_at: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
