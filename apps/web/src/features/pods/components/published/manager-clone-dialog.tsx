import { useState } from "react"
import {
  CopyIcon,
  FilterIcon,
  Search01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { useQuery } from "@tanstack/react-query"
import { ManagerClonePrincipalTable } from "./manager-clone-principal-table"
import { managerClonePrincipalColumns } from "./manager-clone-principal-columns"
import type { RowSelectionState } from "@tanstack/react-table"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"
import { AppDialog, AppDialogScrollBody } from "@/components/dialogs/app-dialog"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import { publishedPodClonesQueryOptions } from "@/features/pods/api/publish-pod-api"

export function ManagerCloneDialog({
  pod,
  open,
  onOpenChange,
  pendingPrincipalIdsByPodId,
  onConfirm,
}: {
  pod: PublishedPodCatalogEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingPrincipalIdsByPodId: Record<string, Array<string>>
  onConfirm: (
    pod: PublishedPodCatalogEntry,
    principals: Array<PrincipalOption>
  ) => void
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [search, setSearch] = useState("")
  const [showUsers, setShowUsers] = useState(true)
  const [showGroups, setShowGroups] = useState(true)

  const { data: users } = useQuery(usersQueryOptions)
  const { data: groups } = useQuery(groupsQueryOptions)
  const { data: existingClones } = useQuery({
    ...publishedPodClonesQueryOptions(pod?.id ?? ""),
    enabled: pod !== null,
  })

  const allOptions = buildPrincipalOptions(users ?? [], groups ?? [])
  const existingOwnerIds = new Set(existingClones?.map((c) => c.owner.id) ?? [])
  const pendingPrincipalIds = new Set(
    pod ? (pendingPrincipalIdsByPodId[pod.id] ?? []) : []
  )
  const availableOptions = allOptions.filter(
    (o) => !existingOwnerIds.has(o.id) && !pendingPrincipalIds.has(o.id)
  )

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleOptions = availableOptions.filter((option) => {
    const typeIsVisible = option.type === "user" ? showUsers : showGroups
    if (!typeIsVisible) return false

    return (
      normalizedSearch.length === 0 ||
      [option.label, option.description, option.type].some((value) =>
        value.toLocaleLowerCase().includes(normalizedSearch)
      )
    )
  })

  const resolvedSelected = availableOptions.filter(
    (option) => rowSelection[option.id]
  )

  const noAvailable = availableOptions.length === 0

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        setRowSelection({})
        setSearch("")
        setShowUsers(true)
        setShowGroups(true)
      }}
      icon={CopyIcon}
      title="Clone"
      description={pod ? `Clone "${pod.title}" for selected principals.` : ""}
    >
      <div className="flex items-center gap-2">
        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search principals"
            placeholder="Search..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-lg"
                variant="secondary"
                className="bg-input/50 **:text-muted-foreground"
                aria-label="Filter principals by type"
              >
                <HugeiconsIcon icon={FilterIcon} />
              </Button>
            }
          />
          <DropdownMenuContent className="w-40" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Types</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={showUsers}
                onCheckedChange={setShowUsers}
              >
                <HugeiconsIcon
                  icon={UserIcon}
                  className="text-muted-foreground"
                />
                Users
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showGroups}
                onCheckedChange={setShowGroups}
              >
                <HugeiconsIcon
                  icon={UserGroupIcon}
                  className="text-muted-foreground"
                />
                Groups
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {noAvailable ? (
        <p className="py-2 text-sm text-muted-foreground">
          All principals already have a clone of this pod.
        </p>
      ) : (
        <AppDialogScrollBody className="-mx-6 -mb-8 p-0">
          <ManagerClonePrincipalTable
            columns={managerClonePrincipalColumns}
            data={visibleOptions}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        </AppDialogScrollBody>
      )}
      <DialogFooter>
        <Button
          className="w-full"
          disabled={noAvailable || resolvedSelected.length === 0}
          onClick={() => {
            if (!pod) return
            onConfirm(pod, resolvedSelected)
            setRowSelection({})
            onOpenChange(false)
          }}
        >
          <HugeiconsIcon icon={CopyIcon} data-icon="inline-start" />
          Clone ({resolvedSelected.length})
        </Button>
      </DialogFooter>
    </AppDialog>
  )
}
