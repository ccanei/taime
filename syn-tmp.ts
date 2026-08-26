import { processSignalContent } from './content-extract';
const html = `<html><body><article><h1>RPA and security</h1>
<p>Robotic process automation matured in 2016 across enterprise back office.
Featured July 2026 Patch Tuesday: Microsoft Patches 622 Vulnerabilities. Register now.
By 2026 most firms will adopt it. In 2026 the market grows. 2026 outlook strong.</p></article></body></html>`;
// Caso 1: histórico + corpo contaminado (symptom + 2026 repetido) -> deve cair p/ snippet
const r1 = processSignalContent({ rawHtml: html, url: 'https://crowdstrike.com/x', periodEndYear: 2016,
  snippet: 'RPA reached broad enterprise adoption in 2016, reshaping back-office operations.', isHistorical: true, maxChars: 8000, currentYear: 2026 });
console.log('CASO1 source=', r1.contentSource, '| flags=', r1.flags.join(';'), '| suspicious=', r1.suspicious);
console.log('  content:', r1.content.slice(0,90));
// Caso 2: mesmo corpo, mas NÃO histórico -> mantém corpo (não faz fallback)
const r2 = processSignalContent({ rawHtml: html, url: 'https://x.com/y', periodEndYear: 2016,
  snippet: 'snip', isHistorical: false, maxChars: 8000, currentYear: 2026 });
console.log('CASO2 (não-histórico) source=', r2.contentSource, '| flags=', r2.flags.join(';'));
// Caso 3: projeção pontual legítima "by 2027" única, sem symptom -> NÃO deve cair p/ snippet
const html3 = `<html><body><article><p>${'Cloud adoption accelerated through 2016. Analysts expect maturity by 2027 as budgets shift. '.repeat(6)}</p></article></body></html>`;
const r3 = processSignalContent({ rawHtml: html3, url: 'https://x.com/z', periodEndYear: 2016,
  snippet: 'short snippet here for 2016 cloud', isHistorical: true, maxChars: 8000, currentYear: 2026 });
console.log('CASO3 (projeção legítima) source=', r3.contentSource, '| future_years=', r3.futureYears.join(','), '| flags=', r3.flags.join(';'));
