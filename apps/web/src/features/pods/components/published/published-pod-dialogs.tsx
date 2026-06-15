import { useState } from "react"
import { IconCopy, IconLoader2, IconTrash } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { useQuery } from "@tanstack/react-query"
import type {
  CloneBulkAction,
  PendingCloneBulkAction,
  PendingCloneRow,
} from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"
import {
  AppAlertDialogContent,
  AppDialog,
} from "@/components/dialogs/app-dialog"
import { POD_CLONE_ACTION_CONFIG } from "@/features/pods/utils/pod-clone-actions"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { publishedPodClonesQueryOptions } from "@/features/pods/api/publish-pod-api"

const BULK_CLONE_DIALOG_CONFIG: Record<
  PodCloneAction,
  {
    title: string
    description: (pod: PublishedPodCatalogEntry) => string
    variant: "default" | "destructive"
  }
> = {
  start: {
    title: "Start All Clones?",
    description: (pod) => `Start every cloned instance of "${pod.title}".`,
    variant: "default",
  },
  shutdown: {
    title: "Shutdown All Clones?",
    description: (pod) =>
      `Send a shutdown signal to every cloned instance of "${pod.title}".`,
    variant: "destructive",
  },
  reclone: {
    title: "Re-clone All Clones?",
    description: (pod) =>
      `Delete and recreate VMs for every cloned instance of "${pod.title}". Task progress and question answers stay.`,
    variant: "destructive",
  },
  delete: {
    title: "Delete All Clones?",
    description: (pod) =>
      `Permanently delete every cloned instance of "${pod.title}", including their VMs, inventory folders, and saved task progress.`,
    variant: "destructive",
  },
}

export function DeletePublishedPodDialog({
  isPending,
  onConfirm,
  onOpenChange,
  pod,
}: {
  isPending: boolean
  onConfirm: (pod: PublishedPodCatalogEntry) => void
  onOpenChange: (open: boolean) => void
  pod: PublishedPodCatalogEntry | null
}) {
  return (
    <AlertDialog open={pod !== null} onOpenChange={onOpenChange}>
      <AppAlertDialogContent
        open={pod !== null}
        icon={IconTrash}
        title="Delete Catalog Entry?"
        description={
          pod
            ? `This deletes "${pod.title}" from the published catalog database only. The Pod Folder, Pod Template Folder, and Proxmox VMs are not deleted.`
            : ""
        }
      >
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              if (!pod) return
              onConfirm(pod)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}

export function ManagerCloneDialog({
  pod,
  open,
  onOpenChange,
  pendingRowsByPodId,
  onConfirm,
}: {
  pod: PublishedPodCatalogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingRowsByPodId: Record<string, Array<PendingCloneRow>>
  onConfirm: (
    pod: PublishedPodCatalogEntry,
    principals: Array<PrincipalOption>
  ) => void
}) {
  const [selectedPrincipals, setSelectedPrincipals] = useState<
    Array<PrincipalOption>
  >([])
  const anchor = useComboboxAnchor()

  const { data: users } = useQuery(usersQueryOptions)
  const { data: groups } = useQuery(groupsQueryOptions)
  const { data: existingClones } = useQuery({
    ...publishedPodClonesQueryOptions(pod?.id ?? ""),
    enabled: pod !== null,
  })

  const allOptions = buildPrincipalOptions(users ?? [], groups ?? [])
  const existingOwnerIds = new Set(existingClones?.map((c) => c.owner.id) ?? [])
  const pendingPrincipalIds = new Set(
    (pod ? (pendingRowsByPodId[pod.id] ?? []) : []).map((r) => r.principal.id)
  )
  const availableOptions = allOptions.filter(
    (o) => !existingOwnerIds.has(o.id) && !pendingPrincipalIds.has(o.id)
  )

  const principalOptionMap = new Map(availableOptions.map((o) => [o.id, o]))
  const resolvedSelected = selectedPrincipals
    .map((p) => principalOptionMap.get(p.id))
    .filter((p): p is PrincipalOption => !!p)

  const noAvailable =
    availableOptions.length === 0 && selectedPrincipals.length === 0

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setSelectedPrincipals([])}
      icon={IconCopy}
      title="Clone"
      description={pod ? `Clone "${pod.title}" for selected principals.` : ""}
    >
      {noAvailable ? (
        <p className="py-2 text-sm text-muted-foreground">
          All principals already have a clone of this pod.
        </p>
      ) : (
        <Combobox
          multiple
          autoHighlight
          items={availableOptions}
          itemToStringLabel={(p) => p.label}
          itemToStringValue={(p) => p.label}
          value={resolvedSelected}
          onValueChange={(value) => setSelectedPrincipals(value)}
        >
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(values) => (
                <>
                  {(values as Array<PrincipalOption>).map((p) => (
                    <ComboboxChip key={p.id}>{p.label}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder="Search for users or groups" />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No principals found.</ComboboxEmpty>
            <ComboboxList>
              {(p) => (
                <ComboboxItem key={p.id} value={p}>
                  <span className="flex-1 truncate">{p.label}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                  </Badge>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={noAvailable || resolvedSelected.length === 0}
          onClick={() => {
            if (!pod) return
            onConfirm(pod, resolvedSelected)
            setSelectedPrincipals([])
            onOpenChange(false)
          }}
        >
          Clone
        </Button>
      </DialogFooter>
    </AppDialog>
  )
}

export function BulkCloneActionDialog({
  isPending,
  onConfirm,
  onOpenChange,
  pendingAction,
}: {
  isPending: boolean
  onConfirm: (action: CloneBulkAction) => void
  onOpenChange: (open: boolean) => void
  pendingAction: PendingCloneBulkAction
}) {
  if (!pendingAction) return null

  const baseConfig = POD_CLONE_ACTION_CONFIG[pendingAction.action]
  const dialogConfig = BULK_CLONE_DIALOG_CONFIG[pendingAction.action]

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AppAlertDialogContent
        open
        icon={baseConfig.icon}
        title={dialogConfig.title}
        description={dialogConfig.description(pendingAction.pod)}
      >
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={dialogConfig.variant}
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              onConfirm(pendingAction)
            }}
          >
            {isPending && (
              <IconLoader2 data-icon="inline-start" className="animate-spin" />
            )}
            {isPending ? `${baseConfig.pendingLabel}...` : baseConfig.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
