import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso, TAIME',
  description: 'Termos e condições de uso da plataforma TAIME.',
  alternates: {
    canonical: 'https://www.taime.tech/termos',
  },
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          Termos de Uso
        </span>

        <h1 className="text-3xl font-bold text-zinc-900 mb-3">
          Termos e condições de uso
        </h1>
        <p className="text-sm text-zinc-400 mb-12">Última atualização: maio de 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-zinc-600">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">1. Aceitação dos termos</h2>
            <p>
              Ao acessar ou usar a plataforma TAIME, você concorda integralmente com estes Termos de Uso.
              Se você não concordar com algum dos termos, não deve usar a plataforma.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">2. O serviço</h2>
            <p>
              O TAIME é uma plataforma de inteligência estratégica em tecnologia que transforma sinais
              de mercado globais em análises estruturadas com scoring, framework decisório e
              inteligência temporal. O serviço inclui relatórios periódicos, acesso ao histórico
              completo e o Executive Advisor, um assistente estratégico baseado em IA com
              contexto da empresa do usuário.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">3. Acesso à plataforma</h2>
            <p className="mb-3">
              O acesso à plataforma é feito mediante cadastro, aprovação manual e assinatura ativa
              (conforme o plano contratado). O TAIME reserva o direito de recusar ou cancelar
              acessos sem obrigação de justificativa.
            </p>
            <p>
              O acesso é pessoal e intransferível. Você é responsável por manter a segurança do
              seu acesso e por todas as atividades realizadas com ele.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">4. Uso permitido</h2>
            <p>
              A plataforma TAIME pode ser usada para fins pessoais e profissionais de inteligência
              estratégica e apoio à tomada de decisão, por executivos, gestores, consultores,
              empreendedores e profissionais de tecnologia.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">5. Uso proibido</h2>
            <p className="mb-3">É expressamente proibido:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Redistribuição, revenda ou sublicenciamento de qualquer conteúdo da plataforma',
                'Scraping automatizado, coleta sistemática ou extração massiva de dados',
                'Uso de qualquer conteúdo para treinar, ajustar ou avaliar modelos de inteligência artificial',
                'Reprodução total ou parcial de relatórios, análises ou frameworks sem autorização expressa por escrito',
                'Qualquer uso que viole leis aplicáveis ou direitos de terceiros',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-red-400 font-bold mt-0.5">✗</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">6. Propriedade intelectual</h2>
            <p className="mb-3">
              Todo o conteúdo da plataforma TAIME, incluindo relatórios, análises, scores,
              frameworks, metodologia e interface, é propriedade exclusiva do TAIME e protegido
              por leis de propriedade intelectual.
            </p>
            <p>
              O framework <strong>TYPE→ACT→IMPACT→MOVE→EXIT</strong>, o <strong>TAIME Score</strong>
              {' '}e a metodologia <strong>THEN/NOW/NEXT</strong> são metodologias proprietárias do TAIME.
              Qualquer reprodução sem autorização constitui violação dos direitos de propriedade intelectual.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">7. Licença de uso e rastreabilidade</h2>
            <p className="mb-3">
              Sua assinatura concede uma licença limitada, pessoal e não exclusiva para usar os
              relatórios e análises na sua própria tomada de decisão e para fins internos da sua
              organização. Ela não transfere a propriedade do conteúdo, que permanece do TAIME.
            </p>
            <p className="mb-3">
              É vedado redistribuir publicamente, revender, republicar ou compartilhar o conteúdo fora
              da sua organização, no todo ou em parte, sem autorização prévia por escrito do TAIME.
            </p>
            <p>
              Para sustentar esta licença, o conteúdo completo exibido a um assinante logado é
              associado à conta do assinante, incluindo um identificador visível, para fins de
              rastreabilidade. A violação destas condições pode resultar em suspensão ou cancelamento
              da conta, sem prejuízo de outras medidas cabíveis.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">8. Isenção de responsabilidade</h2>
            <p className="mb-3">
              As análises e relatórios do TAIME são elaborados para apoio à tomada de decisão
              estratégica e não constituem, em nenhuma hipótese, consultoria jurídica, financeira,
              contábil ou de qualquer outra natureza regulamentada.
            </p>
            <p>
              O TAIME não se responsabiliza por decisões tomadas exclusivamente com base em seu
              conteúdo, nem por perdas ou danos diretos ou indiretos decorrentes do uso da plataforma.
              A responsabilidade pelas decisões é sempre do usuário.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">9. Cancelamento e assinaturas</h2>
            <p className="mb-3">
              Assinaturas podem ser canceladas a qualquer momento pelo próprio usuário. O acesso
              permanece ativo até o fim do período já pago, sem penalidades ou cobranças adicionais.
            </p>
            <p>
              Pagamentos são processados de forma recorrente via Stripe. A cobrança ocorre no
              início de cada período de assinatura. O cancelamento antes da renovação encerra
              o ciclo de pagamentos sem débitos futuros.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">10. Modificações dos termos</h2>
            <p>
              O TAIME pode atualizar estes Termos de Uso a qualquer momento. Alterações
              materiais serão comunicadas com aviso prévio de pelo menos 15 dias por email.
              O uso continuado da plataforma após o aviso constitui aceitação dos novos termos.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">11. Foro e lei aplicável</h2>
            <p>
              Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito
              o foro da Comarca de São Paulo/SP para resolução de quaisquer conflitos decorrentes
              deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">12. Contato</h2>
            <p>
              Para dúvidas sobre estes termos:{' '}
              <a href="mailto:contact@taime.tech" className="text-taime-600 hover:text-taime-700 font-medium">
                contact@taime.tech
              </a>
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  )
}
