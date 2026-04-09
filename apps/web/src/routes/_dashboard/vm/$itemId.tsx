import {
  IconCamera,
  IconCpu,
  IconDatabase,
  IconDeviceImac,
  IconHistory,
  IconId,
  IconPackages,
  IconPlus,
  IconPower,
  IconTemplate,
  IconTopologyBus,
  IconTrash,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"
import { useState } from "react"
import type { ReactNode } from "react"
import type { ConfirmConfig } from "@/components/inventory/inventory-confirm-actions"
import { ConfirmDialog } from "@/components/inventory/inventory-confirm-actions"
import { VncConsole } from "@/components/vm/vnc-console"
import { VmOptionsMenu } from "@/components/inventory/inventory-actions"
import {
  findTreeNode,
  inventoryTreeQueryOptions,
  snapshotsQueryOptions,
  vmStatusQueryOptions,
} from "@/lib/queries"
import { useDeleteSnapshot, useRollbackSnapshot } from "@/hooks/use-vm-actions"

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`
}

export const Route = createFileRoute("/_dashboard/vm/$itemId")({
  component: VmPage,
})

function SnapshotsTable({ node, vmid }: { node: string; vmid: number }) {
  const { data: snapshots, isLoading } = useQuery(
    snapshotsQueryOptions(node, vmid)
  )
  const rollback = useRollbackSnapshot(node, vmid)
  const remove = useDeleteSnapshot(node, vmid)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

  const filtered = snapshots?.filter((s) => s.name !== "current") ?? []

  if (isLoading) return null

  if (filtered.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCamera className="size-6" />
            Snapshots
          </CardTitle>
          <CardDescription>No snapshots found.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconCamera className="size-6" />
          Snapshots
        </CardTitle>
        <CardDescription>Point in time snapshots of the VM.</CardDescription>
        <CardAction>
          <Button>
            <IconPlus />
            <span className="hidden lg:block">Create</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="border-b px-0">
        <Table>
          <TableHeader className="bg-muted hover:bg-muted">
            <TableRow>
              <TableHead className="pl-6">Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-24">RAM</TableHead>
              <TableHead className="w-32 pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((snap) => (
              <TableRow key={snap.name}>
                <TableCell className="pl-6 font-medium">{snap.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {snap.description || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {snap.snaptime
                    ? new Date(snap.snaptime * 1000).toLocaleString()
                    : "—"}
                </TableCell>
                <TableCell>
                  {snap.vmstate ? <Badge variant="secondary">Yes</Badge> : "No"}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Rollback"
                      onClick={() =>
                        setConfirm({
                          title: "Rollback Snapshot",
                          description: `Are you sure you want to rollback to snapshot "${snap.name}"? The current VM state will be lost.`,
                          actionLabel: "Rollback",
                          onConfirm: () => {
                            toast.promise(
                              rollback.mutateAsync({
                                node,
                                vmid,
                                snapname: snap.name,
                              }),
                              {
                                loading: `Rolling back to "${snap.name}"…`,
                                success: `Rolled back to "${snap.name}"`,
                                error: (err: Error) => err.message,
                              }
                            )
                          },
                        })
                      }
                    >
                      <IconHistory className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Delete"
                      onClick={() =>
                        setConfirm({
                          title: "Delete Snapshot",
                          description: `Are you sure you want to delete snapshot "${snap.name}"? This action cannot be undone.`,
                          actionLabel: "Delete",
                          variant: "destructive",
                          onConfirm: () => {
                            toast.promise(
                              remove.mutateAsync({
                                node,
                                vmid,
                                snapname: snap.name,
                              }),
                              {
                                loading: `Deleting snapshot "${snap.name}"…`,
                                success: `Snapshot "${snap.name}" deleted`,
                                error: (err: Error) => err.message,
                              }
                            )
                          },
                        })
                      }
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
        {filtered.length} result{filtered.length !== 1 && "s"}
      </CardFooter>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </Card>
  )
}

function VmPage() {
  const { itemId } = Route.useParams()

  const { data: tree, isLoading } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  const node = tree ? findTreeNode(tree, itemId) : null

  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Item not found
      </div>
    )
  }

  if (!node.vm) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        This item is not a virtual machine.
      </div>
    )
  }

  const { vm } = node
  const isTemplate = vm.is_template
  const vmStatus = vmStatuses?.[vm.vmid]

  const stats: Array<{
    icon: ReactNode
    label: string
    value: string
    variant?: "default" | "secondary" | "destructive" | "outline"
  }> = [
    {
      icon: <IconPower className="size-5 text-muted-foreground" />,
      label: "Status",
      value: isTemplate
        ? "Template"
        : vmStatus
          ? vmStatus.charAt(0).toUpperCase() + vmStatus.slice(1)
          : "—",
      variant: isTemplate
        ? "secondary"
        : vmStatus === "running"
          ? "default"
          : vmStatus === "stopped"
            ? "destructive"
            : "secondary",
    },
    {
      icon: <IconPackages className="size-5 text-muted-foreground" />,
      label: "Node",
      value: vm.node,
    },
    {
      icon: <IconId className="size-5 text-muted-foreground" />,
      label: "VMID",
      value: String(vm.vmid),
    },
    {
      icon: <IconCpu className="size-5 text-muted-foreground" />,
      label: "CPU",
      value: vm.cpu_count != null ? `${vm.cpu_count} CPUs` : "—",
    },
    {
      icon: (
        <IconTopologyBus className="size-5 rotate-180 text-muted-foreground" />
      ),
      label: "Memory",
      value: vm.memory_mb != null ? formatMemory(vm.memory_mb) : "—",
    },
    {
      icon: <IconDatabase className="size-5 text-muted-foreground" />,
      label: "Storage",
      value: vm.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
  ]

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isTemplate ? (
                <IconTemplate className="size-8" />
              ) : (
                <IconDeviceImac className="size-8" />
              )}
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                {node.name}
              </h1>
            </CardTitle>
            <CardDescription>
              {isTemplate ? "Template" : "Virtual Machine"}
            </CardDescription>
            <CardAction>
              <VmOptionsMenu
                isTemplate={isTemplate}
                vmid={vm.vmid}
                pveNode={vm.node}
                name={node.name}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 grid-rows-3 gap-4 md:grid-cols-3 md:grid-rows-2 md:gap-6 xl:grid-cols-6 xl:grid-rows-1">
              {stats.map((stat) => (
                <Item key={stat.label} variant="muted">
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{stat.label}</ItemTitle>
                  </ItemContent>
                  <ItemFooter>
                    <Badge variant={stat.variant ?? "default"}>
                      {stat.value}
                    </Badge>
                  </ItemFooter>
                </Item>
              ))}
            </div>
          </CardContent>
        </Card>
        {!isTemplate && (
          <VncConsole
            key={vm.vmid}
            node={vm.node}
            vmid={vm.vmid}
            powerStatus={vmStatus}
          />
        )}
        <SnapshotsTable node={vm.node} vmid={vm.vmid} />
      </div>
    </div>
  )
}
