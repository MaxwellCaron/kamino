import {
  IconCpu,
  IconDatabase,
  IconDeviceImac,
  IconEdit,
  IconId,
  IconInfoCircle,
  IconPackages,
  IconPower,
  IconTemplate,
  IconTopologyBus,
} from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useState } from "react"
import type { ApiTreeNode, ApiTreeNodeVM } from "@/lib/queries"
import type { ReactNode } from "@tabler/icons-react"
import { InventoryPermissionBits, hasInventoryPermission } from "@/lib/queries"
import { LoadingTransition } from "@/components/loading-transition"
import { VmOptionsMenu } from "@/components/inventory/inventory-actions"
import { formatMemory } from "@/lib/utils"
import { VmNotesDialog } from "@/components/vm/vm-notes-dialog"

function buildStats(
  vm: ApiTreeNodeVM | null,
  isTemplate: boolean,
  powerStatus: string | undefined
): Array<{
  icon: ReactNode
  label: string
  value: string
  textStyle?: string
  bgStyle?: string
}> {
  return [
    {
      icon: <IconPower className="size-5 text-muted-foreground" />,
      label: "Status",
      value: isTemplate
        ? "Template"
        : powerStatus
          ? powerStatus.charAt(0).toUpperCase() + powerStatus.slice(1)
          : "—",
      textStyle: isTemplate
        ? undefined
        : powerStatus === "running"
          ? "text-green-600 dark:text-green-400"
          : powerStatus === "stopped"
            ? "text-destructive"
            : undefined,
      bgStyle: isTemplate
        ? undefined
        : powerStatus === "running"
          ? "bg-green-600/5 dark:bg-green-400/5"
          : powerStatus === "stopped"
            ? "bg-destructive/5"
            : undefined,
    },
    {
      icon: <IconPackages className="size-5 text-muted-foreground" />,
      label: "Node",
      value: vm?.node ?? "—",
    },
    {
      icon: <IconId className="size-5 text-muted-foreground" />,
      label: "VMID",
      value: vm ? String(vm.vmid) : "—",
    },
    {
      icon: <IconCpu className="size-5 text-muted-foreground" />,
      label: "CPU",
      value: vm?.cpu_count != null ? `${vm.cpu_count} CPUs` : "—",
    },
    {
      icon: (
        <IconTopologyBus className="size-5 rotate-180 text-muted-foreground" />
      ),
      label: "Memory",
      value: vm?.memory_mb != null ? formatMemory(vm.memory_mb) : "—",
    },
    {
      icon: <IconDatabase className="size-5 text-muted-foreground" />,
      label: "Storage",
      value: vm?.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
  ]
}

export function VmHeader({
  node,
  vm,
  powerStatus,
  isTemplate,
  isLoading,
}: {
  node: ApiTreeNode | null
  vm: ApiTreeNodeVM | null
  powerStatus: string | undefined
  isTemplate: boolean
  isLoading: boolean
}) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const stats = buildStats(vm, isTemplate, powerStatus)
  const canEditNotes = hasInventoryPermission(
    node?.permissions,
    InventoryPermissionBits.renameVm
  )
  const notes = vm?.notes?.trim() ? vm.notes : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isTemplate ? (
            <IconTemplate className="size-7 text-muted-foreground" />
          ) : (
            <IconDeviceImac className="size-7 text-muted-foreground" />
          )}
          <LoadingTransition
            isLoading={isLoading}
            fallback={<Skeleton className="h-10 w-48 rounded-md" />}
          >
            <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
              {node?.name ?? "—"}
            </h1>
          </LoadingTransition>
        </CardTitle>
        <CardDescription>
          {isTemplate ? "Template" : "Virtual Machine"}
        </CardDescription>
        <CardAction>
          {node && (
            <VmOptionsMenu
              nodeId={node.id}
              permissions={node.permissions}
              isTemplate={isTemplate}
              vmid={vm?.vmid}
              pveNode={vm?.node}
              name={node.name}
              isLoading={isLoading}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 grid-rows-3 gap-4 md:grid-cols-3 md:grid-rows-2 md:gap-6 xl:grid-cols-6 xl:grid-rows-1">
          {stats.map((stat) => (
            <Item key={stat.label} variant="muted" className={stat.bgStyle}>
              <ItemMedia>{stat.icon}</ItemMedia>
              <ItemContent>
                <ItemTitle className="text-muted-foreground">
                  {stat.label}
                </ItemTitle>
              </ItemContent>
              <ItemFooter>
                <ItemFooter>
                  <LoadingTransition
                    isLoading={isLoading}
                    fallback={<Skeleton className="h-5 w-16 rounded-md" />}
                  >
                    <h3
                      className={`scroll-m-20 text-2xl font-semibold tracking-tight ${stat.textStyle}`}
                    >
                      {stat.value}
                    </h3>
                  </LoadingTransition>
                </ItemFooter>
              </ItemFooter>
            </Item>
          ))}
        </div>
        <Item variant="muted" className="items-start">
          <ItemMedia variant="icon">
            <IconInfoCircle className="text-muted-foreground" />
          </ItemMedia>
          <ItemContent className="gap-3">
            <ItemTitle>Notes</ItemTitle>
            {!notes ? (
              <ItemDescription>No notes saved for this VM.</ItemDescription>
            ) : (
              <ItemDescription>{notes}</ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            {vm && canEditNotes && (
              <>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setIsNotesOpen(true)}
                >
                  <IconEdit data-icon="inline-start" />
                </Button>
                <VmNotesDialog
                  node={vm.node}
                  vmid={vm.vmid}
                  initialNotes={vm.notes}
                  open={isNotesOpen}
                  onOpenChange={setIsNotesOpen}
                />
              </>
            )}
          </ItemActions>
        </Item>
      </CardContent>
    </Card>
  )
}
