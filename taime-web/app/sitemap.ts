import type { MetadataRoute } from 'next'

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.taime.tech'
  const now  = new Date()
  const routes: { path: string; priority: number; changeFrequency: ChangeFreq }[] = [
    { path: '',             priority: 1.0, changeFrequency: 'weekly' },
    { path: '/radar',       priority: 0.7, changeFrequency: 'daily'  },
    { path: '/sobre',       priority: 0.8, changeFrequency: 'weekly' },
    { path: '/about',       priority: 0.8, changeFrequency: 'weekly' },
    { path: '/planos',      priority: 0.9, changeFrequency: 'weekly' },
    { path: '/contato',     priority: 0.6, changeFrequency: 'weekly' },
    { path: '/privacidade', priority: 0.3, changeFrequency: 'weekly' },
    { path: '/termos',      priority: 0.3, changeFrequency: 'weekly' },
    { path: '/privacy',     priority: 0.3, changeFrequency: 'weekly' },
    { path: '/terms',       priority: 0.3, changeFrequency: 'weekly' },
  ]
  return routes.map(r => ({
    url:             `${base}${r.path}`,
    lastModified:    now,
    changeFrequency: r.changeFrequency,
    priority:        r.priority,
  }))
}
