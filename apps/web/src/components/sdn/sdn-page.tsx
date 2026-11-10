import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/lib/auth/management-permissions"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import { sdnZonesQueryOptions, vnetsQueryOptions } from "@/lib/sdn/sdn-api"
import { CloneTargetsCard } from "@/components/sdn/clone-targets-card"
import type { ConfirmConfig } from "@/lib/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { SdnHeader } from "@/components/sdn/sdn-header"
import { VNetsCard } from "@/components/sdn/vnets-card"
import { podCloneTargetsQueryOptions } from "@/lib/pods/clone-targets-api"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

const sdnRouteApi = getRouteApi("/_dashboard/admin/sdn")

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

      {confirm && (
        <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  )
}
