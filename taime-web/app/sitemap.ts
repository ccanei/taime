import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.taime.tech'
  const now = new Date()
  const routes = [
    { path: '',             priority: 1.0 },
    { path: '/sobre',       priority: 0.8 },
    { path: '/about',       priority: 0.8 },
    { path: '/planos',      priority: 0.9 },
    { path: '/contato',     priority: 0.6 },
    { path: '/privacidade', priority: 0.3 },
    { path: '/termos',      priority: 0.3 },
    { path: '/privacy',     priority: 0.3 },
    { path: '/terms',       priority: 0.3 },
  ]
  return routes.map(r => ({
    url:            `${base}${r.path}`,
    lastModified:   now,
    changeFrequency: 'weekly' as const,
    priority:       r.priority,
  }))
}
