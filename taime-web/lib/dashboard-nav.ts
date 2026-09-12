import { Home, Radar, TrendingUp, FileText, MessageSquare, SquareCheck, Building2, type LucideIcon } from 'lucide-react'

// Fonte UNICA dos itens de navegacao do app logado. Reusada pela sidebar do dashboard
// (DashboardSidebar) e pelo menu colapsavel do Advisor (AdvisorNavMenu), para nao
// duplicar a lista de links. Tendencias/Relatorios apontam para ancoras reais do
// dashboard (#tendencias / #arquivo); os demais para rotas existentes.
export interface DashboardNavItem {
  key:     string
  labelPt: string
  labelEn: string
  href:    string
  icon:    LucideIcon
}

export const DASHBOARD_NAV: DashboardNavItem[] = [
  { key: 'inicio',     labelPt: 'Início',            labelEn: 'Home',              href: '/dashboard',            icon: Home },
  { key: 'radar',      labelPt: 'Radar',             labelEn: 'Radar',             href: '/radar',                icon: Radar },
  { key: 'tendencias', labelPt: 'Tendências',        labelEn: 'Trends',            href: '/dashboard#tendencias', icon: TrendingUp },
  { key: 'relatorios', labelPt: 'Relatórios',        labelEn: 'Reports',           href: '/dashboard#arquivo',    icon: FileText },
  { key: 'advisor',    labelPt: 'Executive Advisor', labelEn: 'Executive Advisor', href: '/dashboard/advisor',    icon: MessageSquare },
  { key: 'decision',   labelPt: 'Decision Check',    labelEn: 'Decision Check',    href: '/decision-check',       icon: SquareCheck },
  { key: 'empresa',    labelPt: 'Minha Organização', labelEn: 'My Organization',   href: '/dashboard/empresa',    icon: Building2 },
]
