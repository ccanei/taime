// Schema.org structured data (JSON-LD) builders.
// Server-side apenas. Nao inventar campos: so dados reais e visiveis na pagina.

export const SITE_URL   = 'https://www.taime.tech'
export const SITE_NAME  = 'TAIME'
export const CONTACT_EMAIL = 'contact@taime.tech'
// Logo raster (Google prefere raster a SVG para logo de Organization).
export const LOGO_URL   = `${SITE_URL}/og-image.png`
// Espelha a meta description do layout raiz.
export const SITE_DESCRIPTION =
  'TAIME turns global technology signals into executive decision intelligence: biweekly reports with scoring, a decision framework, and temporal memory.'

const ORG_ID     = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`

type JsonLdNode = Record<string, unknown>

// Organization: identidade da empresa. sameAs vazio por ora (LinkedIn depois).
export function organizationNode(): JsonLdNode {
  return {
    '@type':       'Organization',
    '@id':         ORG_ID,
    name:          SITE_NAME,
    url:           SITE_URL,
    logo:          { '@type': 'ImageObject', url: LOGO_URL },
    description:   SITE_DESCRIPTION,
    email:         CONTACT_EMAIL,
    sameAs:        [],
  }
}

// WebSite: sem potentialAction/SearchAction, porque a busca da home e client-side
// (fetch para /api/search/text, resultados em memoria) e nao tem URL propria de
// resultados. Assim que a busca ganhar rota com querystring, adicionar SearchAction.
export function websiteNode(): JsonLdNode {
  return {
    '@type':       'WebSite',
    '@id':         WEBSITE_ID,
    name:          SITE_NAME,
    url:           SITE_URL,
    description:   SITE_DESCRIPTION,
    publisher:     { '@id': ORG_ID },
  }
}

// Grafo global para o layout raiz (todas as paginas).
export function globalGraph(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph':   [organizationNode(), websiteNode()],
  }
}

// Organization compacta para reuso como author/publisher em outras paginas.
function orgRef(): JsonLdNode {
  return {
    '@type': 'Organization',
    name:    SITE_NAME,
    url:     SITE_URL,
    logo:    { '@type': 'ImageObject', url: LOGO_URL },
  }
}

// Converte uma data (ISO ou YYYY-MM-DD) para ISO 8601 completo. undefined se invalida.
export function toIsoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export interface ArticleInput {
  headline:      string
  description:   string
  datePublished: string | undefined
  dateModified?: string | undefined
  inLanguage:    'pt-BR' | 'en'
  url:           string
}

// Article para pagina de report PUBLICO. So campos visiveis na propria pagina.
export function articleNode(input: ArticleInput): JsonLdNode {
  const node: JsonLdNode = {
    '@context':         'https://schema.org',
    '@type':            'Article',
    headline:           input.headline.slice(0, 110), // recomendacao Google
    inLanguage:         input.inLanguage,
    url:                input.url,
    mainEntityOfPage:   { '@type': 'WebPage', '@id': input.url },
    author:             orgRef(),
    publisher:          orgRef(),
  }
  if (input.description)   node.description   = input.description
  if (input.datePublished) node.datePublished = input.datePublished
  if (input.dateModified)  node.dateModified  = input.dateModified
  return node
}

// FAQPage a partir das perguntas/respostas reais da pagina /faq.
export function faqNode(items: { q: string; a: string }[], inLanguage: 'pt-BR' | 'en'): JsonLdNode {
  return {
    '@context':   'https://schema.org',
    '@type':      'FAQPage',
    inLanguage,
    mainEntity:   items.map(it => ({
      '@type': 'Question',
      name:    it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }
}
