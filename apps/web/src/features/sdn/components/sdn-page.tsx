import { Suspense, lazy, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"

import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import {
  sdnZonesQueryOptions,
  vnetsQueryOptions,
} from "@/features/sdn/api/sdn-api"
import { podCloneTargetsQueryOptions } from "@/features/pods/api/clone-targets-api"
import { CloneTargetsCard } from "@/features/sdn/components/clone-targets-card"
import { SdnHeader } from "@/features/sdn/components/sdn-header"
import { VNetsCard } from "@/features/sdn/components/vnets-card"
import { PreloadOverlay } from "@/components/loading-overlay"

const sdnRouteApi = getRouteApi("/_dashboard/admin/sdn")
const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((module) => ({
    default: module.ConfirmDialog,
  }))
)

export function SdnPage() {
  const { user } = sdnRouteApi.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: vnets,
    isLoading,
    error,
  } = useQuery({
    ...vnetsQueryOptions,
    enabled: canAdminister,
  })
  const { data: zones } = useQuery({
    ...sdnZonesQueryOptions,
    enabled: canAdminister,
  })
  const { data: cloneTargets } = useQuery({
    ...podCloneTargetsQueryOptions,
    enabled: canAdminister,
  })
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isLoading} label="Loading VNets" />
      {!isLoading && (
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <SdnHeader
            zoneCount={zones?.length ?? null}
            vnetCount={error ? null : (vnets?.length ?? null)}
            vlanAwareCount={
              error || !vnets
                ? null
                : vnets.filter((vnet) => vnet.vlanaware).length
            }
            cloneTargetCount={cloneTargets?.length ?? null}
          />

          <CloneTargetsCard
            canAdminister={canAdminister}
            setConfirm={setConfirm}
          />

          <VNetsCard canAdminister={canAdminister} setConfirm={setConfirm} />
        </div>
      )}

      <Suspense fallback={null}>
        {confirm && (
          <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
        )}
      </Suspense>
    </div>
  )
}
