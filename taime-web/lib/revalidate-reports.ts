import { revalidatePath, revalidateTag } from 'next/cache'

// Revalidacao das superficies publicas que exibem reports.
//
// Estrategia: cache sob demanda com fallback periodico.
//   - As leituras publicas de report (home: hero "Ultima analise", showcase
//     "E assim que a resposta se parece", tendencias recentes, faixa de prova)
//     marcam a tag REPORTS_TAG e usam revalidate=REPORTS_REVALIDATE_SECONDS.
//   - O fluxo de publicacao do admin (report-action, report-edit) chama
//     revalidateReportSurfaces() apos gravar, invalidando a tag NA HORA.
//   - O revalidate periodico e a rede de seguranca para mudancas que NAO passam
//     pelo app: auto-publish do pipeline (validate-report) e o toggle manual de
//     is_public no Supabase (nao existe rota de admin para is_public).
//
// Paginas dinamicas (que leem cookies/headers, como /reports/[id] e /r/[id]) ja
// renderizam por request; o revalidatePath delas e um no-op seguro e mantido para
// o caso de virarem cacheadas no futuro.
export const REPORTS_TAG = 'reports'
export const REPORTS_REVALIDATE_SECONDS = 300

export function revalidateReportSurfaces(reportId?: string): void {
  // Next 16: revalidateTag exige o 2o argumento de profile; "max" e o substituto
  // oficial do antigo revalidateTag(tag) de argumento unico (purga a tag agora).
  revalidateTag(REPORTS_TAG, 'max')
  revalidatePath('/') // home: hero, showcase, tendencias recentes, faixa de prova
  if (reportId) {
    revalidatePath(`/reports/${reportId}`) // report publico
    revalidatePath(`/r/${reportId}`)       // amostra publica (is_public)
  }
}
