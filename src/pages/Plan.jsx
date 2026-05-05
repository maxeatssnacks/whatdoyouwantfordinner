import { useIsMobile } from '../hooks/useIsMobile'
import { PlanMobile } from './PlanMobile'
import { PlanDesktop } from './PlanDesktop'

export function Plan() {
  const isMobile = useIsMobile()
  return isMobile ? <PlanMobile /> : <PlanDesktop />
}
