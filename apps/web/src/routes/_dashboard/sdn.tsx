import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import {
  IconNetwork,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import type { ApiVNet } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import { deleteVNet, vnetsQueryOptions } from "@/lib/queries"
import { VNetDialog } from "@/components/vnet-dialog"

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

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            {error.message}
          </div>
        )}

        {vnets && vnets.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No virtual networks found. Create one to get started.
            </CardContent>
          </Card>
        )}

        {vnets && vnets.length > 0 && (
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
                <Button onClick={() => setCreateOpen(true)}>
                  <IconPlus data-icon="inline-start" />
                  Create VNet
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="border-y px-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>VLAN Tag</TableHead>
                    <TableHead>Alias</TableHead>
                    <TableHead className="w-24 pr-6 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vnets.map((v) => (
                    <TableRow key={v.vnet}>
                      <TableCell className="pl-6 font-medium">
                        {v.vnet}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{v.zone}</Badge>
                      </TableCell>
                      <TableCell>{v.tag ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.alias || "—"}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setEditVNet(v)}
                            title="Edit"
                          >
                            <IconPencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setConfirm({
                                title: "Delete VNet",
                                description: `Are you sure you want to delete ${v.vnet}? This will apply the SDN configuration immediately.`,
                                actionLabel: "Delete",
                                variant: "destructive",
                                onConfirm: () =>
                                  deleteMutation.mutateAsync(v.vnet),
                              })
                            }
                            title="Delete"
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="justify-end text-muted-foreground">
              {vnets.length} results{vnets.length !== 1 && "s"}
            </CardFooter>
          </Card>
        )}
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
