import { useIsMobile } from '../hooks/useIsMobile'
import { DashboardMobile } from './DashboardMobile'
import { DashboardDesktop } from './DashboardDesktop'

export function Dashboard() {
  const isMobile = useIsMobile()
  return isMobile ? <DashboardMobile /> : <DashboardDesktop />
}
