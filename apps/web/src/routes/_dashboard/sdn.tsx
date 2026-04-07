import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { IconNetwork, IconPlus } from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import type { ApiVNet } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import { deleteVNet, vnetsQueryOptions } from "@/lib/queries"
import { VNetDialog } from "@/components/vnet-dialog"
import { getVNetColumns } from "@/components/vnets-columns"
import { DataTable } from "@/components/data-table"

export const Route = createFileRoute("/_dashboard/sdn")({
  component: SdnPage,
})

function SdnPage() {
  const { data: vnets, isLoading, error } = useQuery(vnetsQueryOptions)

  const [createOpen, setCreateOpen] = useState(false)
  const [editVNet, setEditVNet] = useState<ApiVNet | null>(null)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

  const queryClient = useQueryClient()
  const deleteMutation = useMutation({
    mutationFn: deleteVNet,
    onSuccess: () => {
      toast.success("VNet deleted")
      queryClient.invalidateQueries({ queryKey: ["sdn", "vnets"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const columns = useMemo(
    () =>
      getVNetColumns({
        onEditVnet: setEditVNet,
        onDeleteClick: (v) =>
          setConfirm({
            title: "Delete VNet",
            description: `Are you sure you want to delete ${v.vnet}? This will apply the SDN configuration immediately.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => deleteMutation.mutateAsync(v.vnet),
          }),
      }),
    [deleteMutation]
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconNetwork className="size-7" />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                VNets
              </h1>
            </CardTitle>
            <CardDescription>List of VNets in proxmox.</CardDescription>
            <CardAction>
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={isLoading || error !== null}
              >
                <IconPlus data-icon="inline-start" />
                Create VNet
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={vnets || []}
              isLoading={isLoading}
              error={error}
            />
          </CardContent>
        </Card>
      </div>

      <VNetDialog open={createOpen} onOpenChange={setCreateOpen} />

      <VNetDialog
        vnet={editVNet ?? undefined}
        open={!!editVNet}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditVNet(null)
        }}
      />

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
