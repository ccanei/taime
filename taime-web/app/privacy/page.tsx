import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy, TAIME',
  description: 'How TAIME collects, uses and protects your personal data.',
  alternates: {
    canonical: 'https://www.taime.tech/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-3xl mx-auto px-6 pt-24 pb-20">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold
                         bg-taime-50 text-taime-600 ring-1 ring-taime-100 mb-8">
          Privacy Policy
        </span>

        <h1 className="text-3xl font-bold text-zinc-900 mb-3">
          How we protect your data
        </h1>
        <p className="text-sm text-zinc-400 mb-12">Last updated: May 2026</p>

        <div className="prose prose-zinc max-w-none space-y-10 text-sm leading-relaxed text-zinc-600">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">1. Data collected</h2>
            <p>TAIME collects only the data strictly necessary to operate the service:</p>
            <ul className="mt-3 space-y-2 list-none pl-0">
              {[
                'Email, authentication and service communications',
                'Name, company, job title and area of interest, collected during waitlist registration',
                'Conversation history with the Executive Advisor, service personalization',
                'Basic navigation data, server logs for error monitoring and security',
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
            <h2 className="text-lg font-bold text-zinc-900 mb-3">2. How we use your data</h2>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Authentication and access control to the platform',
                'Executive Advisor personalization based on your company profile',
                'Communications about new reports and platform updates',
                'Continuous product improvement and bug fixing',
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
            <h2 className="text-lg font-bold text-zinc-900 mb-3">3. Data sharing</h2>
            <p className="mb-3 font-semibold text-zinc-800">We do not sell data to third parties. We do not share data with commercial partners.</p>
            <p className="mb-3">Your data may be processed by the following essential service providers, only to the extent necessary for platform operation:</p>
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Provider</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ['Supabase', 'Data storage and authentication'],
                    ['Anthropic', 'Natural language processing (Executive Advisor)'],
                    ['Vercel', 'Application hosting'],
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
              Each provider has its own privacy policy and is subject to applicable data protection
              laws in their respective jurisdictions.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">4. Your rights (LGPD, Brazilian Data Protection Law 13.709/2018)</h2>
            <p className="mb-3">In accordance with Brazilian data protection law, you have the right to:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Confirmation that personal data processing exists',
                'Access to your stored data',
                'Correction of incomplete, inaccurate or outdated data',
                'Anonymization, blocking or deletion of unnecessary or excessive data',
                'Data portability to another service provider',
                'Withdrawal of consent at any time',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4">
              To exercise your rights, contact us at:{' '}
              <a href="mailto:contact@taime.tech" className="text-taime-600 hover:text-taime-700 font-medium">
                contact@taime.tech
              </a>
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">5. Security</h2>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Data stored with encryption in transit (TLS) and at rest',
                'Access control via passwordless secure link authentication',
                'Row Level Security (RLS) in the database, each user accesses only their own data',
                'Database access restricted by service_role key for administrative operations',
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
            <p className="mb-3">TAIME uses only:</p>
            <ul className="space-y-2 list-none pl-0">
              {[
                'Session cookie, authentication (required for the platform to function)',
                'Language cookie (taime-locale), saves your PT/EN language preference',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="shrink-0 text-taime-600 font-bold mt-0.5">·</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 font-medium text-zinc-800">
              No tracking cookies, advertising, or third-party analytics.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">7. Data retention</h2>
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Data type</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-zinc-700">Retention period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {[
                    ['Account data (email, profile)', 'While the account is active'],
                    ['Executive Advisor history', '12 months'],
                    ['Server logs', '90 days'],
                    ['Data after account deletion', 'Removed within 30 days'],
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
            <h2 className="text-lg font-bold text-zinc-900 mb-3">8. Contact and DPO</h2>
            <p>
              For any privacy or data protection questions, contact us at{' '}
              <a href="mailto:contact@taime.tech" className="text-taime-600 hover:text-taime-700 font-medium">
                contact@taime.tech
              </a>
              . We respond within 5 business days.
            </p>
          </section>

        </div>
      </main>

      <Footer />
    </div>
  )
}
