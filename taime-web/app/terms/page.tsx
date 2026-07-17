import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Use, TAIME',
  description: 'Terms and conditions for using the TAIME platform.',
  alternates: {
    canonical: 'https://www.taime.tech/terms',
  },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          Terms of Use
        </span>

        <h1 className="text-3xl font-bold text-zinc-900 mb-3">
          Terms and conditions of use
        </h1>
        <p className="text-sm text-zinc-400 mb-12">Last updated: May 2026</p>

        <div className="space-y-10 text-sm leading-relaxed text-zinc-600">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">1. Acceptance of terms</h2>
            <p>
              By accessing or using the TAIME platform, you agree in full to these Terms of Use.
              If you do not agree with any of the terms, you must not use the platform.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">2. The service</h2>
            <p>
              TAIME is a strategic technology intelligence platform that transforms global market
              signals into structured analysis with scoring, a decision framework and temporal
              intelligence. The service includes periodic reports, access to the complete archive,
              and the Executive Advisor, an AI-based strategic assistant with context from the
              user's company profile.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">3. Platform access</h2>
            <p className="mb-3">
              Access to the platform requires registration, manual approval and an active
              subscription (according to the contracted plan). TAIME reserves the right to
              refuse or cancel access without obligation to provide justification.
            </p>
            <p>
              Access is personal and non-transferable. You are responsible for maintaining the
              security of your access and for all activities carried out with it.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">4. Permitted use</h2>
            <p>
              The TAIME platform may be used for personal and professional purposes of strategic
              intelligence and decision support, by executives, managers, consultants,
              entrepreneurs and technology professionals.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">5. Prohibited use</h2>
            <p className="mb-3">The following are expressly prohibited:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Redistribution, resale or sublicensing of any content from the platform',
                'Automated scraping, systematic collection or mass data extraction',
                'Use of any content to train, fine-tune or evaluate artificial intelligence models',
                'Full or partial reproduction of reports, analyses or frameworks without explicit written authorization',
                'Any use that violates applicable laws or the rights of third parties',
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
            <h2 className="text-lg font-bold text-zinc-900 mb-3">6. Intellectual property</h2>
            <p className="mb-3">
              All content on the TAIME platform, including reports, analyses, scores, frameworks,
              methodology and interface, is the exclusive property of TAIME and is protected by
              intellectual property laws.
            </p>
            <p>
              The <strong>TYPE→ACT→IMPACT→MOVE→EXIT</strong> framework, the <strong>TAIME Score</strong>,
              {' '}and the <strong>THEN/NOW/NEXT</strong> methodology are proprietary to TAIME.
              Any reproduction without authorization constitutes a violation of intellectual property rights.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">7. Content license and traceability</h2>
            <p className="mb-3">
              Your subscription grants a limited, personal and non-exclusive license to use the reports
              and analyses for your own decision-making and for the internal purposes of your
              organization. It does not transfer ownership of the content, which remains the property
              of TAIME.
            </p>
            <p className="mb-3">
              You may not publicly redistribute, resell, republish or share the content outside your
              organization, in whole or in part, without prior written authorization from TAIME.
            </p>
            <p>
              To support this license, the full content shown to a logged-in subscriber is associated
              with the subscriber's account, including a visible identifier, for traceability purposes.
              Violation of these conditions may result in suspension or cancellation of the account,
              without prejudice to any other applicable measures.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">8. Disclaimer</h2>
            <p className="mb-3">
              TAIME analyses and reports are prepared to support strategic decision-making and
              do not constitute, under any circumstances, legal, financial, accounting or any
              other regulated professional advice.
            </p>
            <p>
              TAIME is not responsible for decisions made solely on the basis of its content,
              nor for direct or indirect losses or damages resulting from use of the platform.
              Responsibility for decisions always rests with the user.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">9. Cancellation and subscriptions</h2>
            <p className="mb-3">
              Subscriptions can be cancelled at any time by the user. Access remains active until
              the end of the already-paid period, with no penalties or additional charges.
            </p>
            <p>
              Payments are processed on a recurring basis via Stripe. Charges occur at the start
              of each subscription period. Cancellation before renewal ends the payment cycle
              with no future charges.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">10. Modifications to these terms</h2>
            <p>
              TAIME may update these Terms of Use at any time. Material changes will be
              communicated with at least 15 days' notice by email. Continued use of the
              platform after notice constitutes acceptance of the new terms.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">11. Jurisdiction and applicable law</h2>
            <p>
              These terms are governed by the laws of the Federative Republic of Brazil.
              The courts of São Paulo/SP are elected as the venue for resolution of any
              disputes arising from this instrument, with express waiver of any other,
              however privileged.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">12. Contact</h2>
            <p>
              For questions about these terms:{' '}
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
