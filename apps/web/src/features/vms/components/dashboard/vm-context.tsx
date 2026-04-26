import { createContext, useCallback, useContext, useState } from "react"
import type { ReactNode } from "react"

type VmContextValue = {
  selectedVmId: string | null
  selectVm: (id: string | null) => void
}

const VmContext = createContext<VmContextValue | null>(null)

export function VmProvider({ children }: { children: ReactNode }) {
  const [selectedVmId, setSelectedVmId] = useState<string | null>(null)

  const selectVm = useCallback((id: string | null) => {
    setSelectedVmId(id)
  }, [])

  return <VmContext value={{ selectedVmId, selectVm }}>{children}</VmContext>
}

export function useVm() {
  const ctx = useContext(VmContext)
  if (!ctx) throw new Error("useVm must be used within VmProvider")
  return ctx
}
