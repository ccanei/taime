import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade, TAIME',
  description: 'Como o TAIME coleta, usa e protege seus dados pessoais.',
  alternates: {
    canonical: 'https://www.taime.tech/privacidade',
  },
}

export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          Política de Privacidade
        </span>

        <h1 className="text-3xl font-bold text-zinc-900 mb-3">
          Como protegemos seus dados
        </h1>
        <p className="text-sm text-zinc-400 mb-12">Última atualização: maio de 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-sm leading-relaxed text-zinc-600">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">1. Dados coletados</h2>
            <p>O TAIME coleta apenas os dados estritamente necessários para operar o serviço:</p>
            <ul className="mt-3 space-y-2 list-none pl-0">
              {[
                'Email, autenticação e comunicações sobre o serviço',
                'Nome, empresa, cargo e área de interesse, coletados no cadastro de lista de espera',
                'Histórico de conversas com o Executive Advisor, personalização do serviço',
                'Dados básicos de navegação, logs do servidor para monitoramento de erros e segurança',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">2. Como usamos os dados</h2>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Autenticação e controle de acesso à plataforma',
                'Personalização do Executive Advisor com base no perfil da empresa',
                'Comunicações sobre novos relatórios e atualizações da plataforma',
                'Melhoria contínua do produto e correção de erros',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">3. Compartilhamento de dados</h2>
            <p className="mb-3 font-semibold text-zinc-800">Não vendemos dados para terceiros. Não compartilhamos dados com parceiros comerciais.</p>
            <p className="mb-3">Seus dados podem ser processados pelos seguintes provedores de serviço essenciais, apenas na medida necessária para a operação da plataforma:</p>
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Provedor</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Finalidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ['Supabase', 'Armazenamento de dados e autenticação'],
                    ['Anthropic', 'Processamento de linguagem natural (Executive Advisor)'],
                    ['Vercel', 'Hospedagem da aplicação'],
                  ].map(([provider, purpose]) => (
                    <tr key={provider}>
                      <td className="px-4 py-2.5 font-medium text-zinc-800">{provider}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              Cada provedor possui sua própria política de privacidade e está sujeito às leis de proteção
              de dados aplicáveis nas suas respectivas jurisdições.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">4. Seus direitos (LGPD, Lei 13.709/2018)</h2>
            <p className="mb-3">Em conformidade com a Lei Geral de Proteção de Dados, você tem direito a:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Confirmação da existência de tratamento de dados pessoais',
                'Acesso aos seus dados armazenados',
                'Correção de dados incompletos, inexatos ou desatualizados',
                'Anonimização, bloqueio ou exclusão de dados desnecessários ou excessivos',
                'Portabilidade dos dados a outro fornecedor de serviço',
                'Revogação do consentimento a qualquer momento',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4">
              Para exercer seus direitos, entre em contato:{' '}
              <a href="mailto:contact@taime.tech" className="text-taime-600 hover:text-taime-700 font-medium">
                contact@taime.tech
              </a>
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">5. Segurança</h2>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Dados armazenados com criptografia em trânsito (TLS) e em repouso',
                'Controle de acesso por autenticação de link seguro sem senha',
                'Row Level Security (RLS) no banco de dados, cada usuário acessa apenas seus próprios dados',
                'Acesso ao banco restrito por service_role key para operações administrativas',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">6. Cookies</h2>
            <p className="mb-3">O TAIME utiliza apenas:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Cookie de sessão, autenticação (necessário para o funcionamento)',
                'Cookie de idioma (taime-locale), salva sua preferência de idioma PT/EN',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-medium text-zinc-800">
              Sem cookies de rastreamento, publicidade ou analytics de terceiros.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">7. Retenção de dados</h2>
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Tipo de dado</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Prazo de retenção</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ['Dados de conta (email, perfil)', 'Enquanto a conta estiver ativa'],
                    ['Histórico do Executive Advisor', '12 meses'],
                    ['Logs do servidor', '90 dias'],
                    ['Dados após exclusão de conta', 'Removidos em até 30 dias'],
                  ].map(([type, period]) => (
                    <tr key={type}>
                      <td className="px-4 py-2.5 text-zinc-700">{type}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">8. Contato e DPO</h2>
            <p>
              Para qualquer questão sobre privacidade ou proteção de dados, entre em contato pelo email{' '}
              <a href="mailto:contact@taime.tech" className="text-taime-600 hover:text-taime-700 font-medium">
                contact@taime.tech
              </a>
              . Respondemos em até 5 dias úteis.
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  )
}
