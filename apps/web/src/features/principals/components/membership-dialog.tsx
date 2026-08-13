import * as React from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import {
  Alert01Icon,
  FilterIcon,
  ReloadIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { PrincipalSelectionItem } from "@/components/principals/principal-selection-table"
import { formatPrincipalReference } from "@/components/principals/principal-label"
import { PrincipalSelectionTable } from "@/components/principals/principal-selection-table"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { SearchInputGroup } from "@/components/forms/search-input-group"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { PreloadOverlay } from "@/components/loading-overlay"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import {
  addGroupMember,
  groupMembersQueryOptions,
  groupsQueryOptions,
  removeGroupMember,
  setUserGroups,
  userGroupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"

type MembershipDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  principal: ApiPrincipal
} & ({ mode: "user-groups" } | { mode: "group-members" })

type MembershipOption = PrincipalSelectionItem

type MembershipFilter = "all" | "selected" | "unselected"

function uniqueIds(ids: Array<string>): Array<string> {
  return Array.from(new Set(ids))
}

function sameIds(a: Array<string>, b: Array<string>): boolean {
  const setA = new Set(uniqueIds(a))
  const setB = new Set(uniqueIds(b))
  if (setA.size !== setB.size) return false
  for (const id of setA) {
    if (!setB.has(id)) return false
  }
  return true
}

export function MembershipDialog(props: MembershipDialogProps) {
  const { open, onOpenChange, mode, principal } = props
  const [editorVersion, setEditorVersion] = React.useState(0)

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setEditorVersion((version) => version + 1)}
      icon={UserGroupIcon}
      title={mode === "user-groups" ? "Groups" : "Members"}
      description={
        mode === "user-groups"
          ? `Manage group memberships for ${formatPrincipalReference(principal)}.`
          : `Manage members of ${formatPrincipalReference(principal)}.`
      }
    >
      <MembershipEditor
        key={`${mode}:${principal.id}:${editorVersion}`}
        open={open}
        mode={mode}
        principal={principal}
        onOpenChange={onOpenChange}
      />
    </AppDialog>
  )
}

function MembershipEditor({
  open,
  mode,
  principal,
  onOpenChange,
}: {
  open: boolean
  mode: "user-groups" | "group-members"
  principal: ApiPrincipal
  onOpenChange: (open: boolean) => void
}) {
  // Current memberships
  const {
    data: members,
    error: membersError,
    isLoading: isMembersLoading,
  } = useQuery({
    ...groupMembersQueryOptions(principal.id),
    enabled: open && mode === "group-members",
  })
  const {
    data: userGroups,
    error: userGroupsError,
    isLoading: isUserGroupsLoading,
  } = useQuery({
    ...userGroupsQueryOptions(principal.id),
    enabled: open && mode === "user-groups",
  })
  // All possible options
  const {
    data: allGroups,
    error: allGroupsError,
    isLoading: isAllGroupsLoading,
  } = useQuery({
    ...groupsQueryOptions,
    enabled: open && mode === "user-groups",
  })
  const {
    data: allUsers,
    error: allUsersError,
    isLoading: isAllUsersLoading,
  } = useQuery({
    ...usersQueryOptions,
    enabled: open && mode === "group-members",
  })
  const isLoading =
    mode === "user-groups"
      ? isUserGroupsLoading || isAllGroupsLoading
      : isMembersLoading || isAllUsersLoading
  const loadError =
    mode === "user-groups"
      ? (userGroupsError ?? allGroupsError)
      : (membersError ?? allUsersError)
  const serverIds = React.useMemo(
    () =>
      uniqueIds(
        (mode === "user-groups" ? userGroups : members)?.map(
          (member) => member.id
        ) ?? []
      ),
    [members, mode, userGroups]
  )

  const options = React.useMemo<Array<MembershipOption>>(() => {
    const type: MembershipOption["type"] =
      mode === "user-groups" ? "group" : "user"

    return (
      (mode === "user-groups" ? allGroups : allUsers)
        ?.map((option) => ({
          description: option.external_id,
          id: option.id,
          label: formatPrincipalReference(option),
          type,
        }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        ) ?? []
    )
  }, [allGroups, allUsers, mode])

  if (loadError) {
    return (
      <InlineErrorAlert
        error={loadError}
        fallback="Failed to load memberships."
      />
    )
  }

  if (isLoading) {
    return (
      <div className="relative min-h-66">
        <PreloadOverlay active label="Loading memberships" />
      </div>
    )
  }

  return (
    <MembershipForm
      key={`${mode}:${principal.id}`}
      mode={mode}
      principal={principal}
      serverIds={serverIds}
      options={options}
      onOpenChange={onOpenChange}
    />
  )
}

function MembershipForm({
  mode,
  principal,
  serverIds,
  options,
  onOpenChange,
}: {
  mode: "user-groups" | "group-members"
  principal: ApiPrincipal
  serverIds: Array<string>
  options: Array<MembershipOption>
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const baselineIdsRef = React.useRef(serverIds)
  const [search, setSearch] = React.useState("")
  const [membershipFilter, setMembershipFilter] =
    React.useState<MembershipFilter>("all")

  const form = useForm({
    defaultValues: {
      selectedIds: serverIds,
    },
    onSubmit: async ({ value }) => {
      try {
        if (mode === "user-groups") {
          await setUserGroups(principal.id, uniqueIds(value.selectedIds))
        } else {
          const serverSet = new Set(baselineIdsRef.current)
          const selectedSet = new Set(value.selectedIds)
          const toAdd = value.selectedIds.filter((id) => !serverSet.has(id))
          const toRemove = baselineIdsRef.current.filter(
            (id) => !selectedSet.has(id)
          )

          if (toAdd.length > 0) {
            await addGroupMember(principal.id, toAdd)
          }

          if (toRemove.length > 0) {
            await removeGroupMember(principal.id, toRemove)
          }
        }
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["principals"] })
      }
    },
  })

  const [, forceRerender] = React.useReducer((tick: number) => tick + 1, 0)
  const serverChanged = !sameIds(serverIds, baselineIdsRef.current)

  const handleReload = () => {
    form.reset({ selectedIds: serverIds })
    baselineIdsRef.current = serverIds
    forceRerender()
  }

  const selectedIds = useSelector(
    form.store,
    (state) => state.values.selectedIds
  )
  const rowSelection = React.useMemo<RowSelectionState>(
    () => Object.fromEntries(selectedIds.map((id) => [id, true])),
    [selectedIds]
  )
  const hasChanges = React.useMemo(() => {
    const serverSet = new Set(baselineIdsRef.current)
    const selectedSet = new Set(selectedIds)
    if (serverSet.size !== selectedSet.size) return true
    for (const id of serverSet) {
      if (!selectedSet.has(id)) return true
    }
    return false
  }, [selectedIds])

  const visibleOptions = React.useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()

    return options.filter((option) => {
      const isSelected = !!rowSelection[option.id]
      const membershipMatches =
        membershipFilter === "all" ||
        (membershipFilter === "selected" && isSelected) ||
        (membershipFilter === "unselected" && !isSelected)

      if (!membershipMatches) return false

      return (
        normalizedSearch.length === 0 ||
        [option.label, option.description, option.type].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch)
        )
      )
    })
  }, [membershipFilter, options, rowSelection, search])

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = (updater) => {
    const nextSelection =
      typeof updater === "function" ? updater(rowSelection) : updater
    const nextSelectedIds: Array<string> = []
    for (const [id, selected] of Object.entries(nextSelection)) {
      if (selected) nextSelectedIds.push(id)
    }
    form.setFieldValue("selectedIds", nextSelectedIds)
  }

  const isGroupsMode = mode === "user-groups"
  const itemName = isGroupsMode ? "group" : "user"
  const itemNamePlural = isGroupsMode ? "groups" : "users"
  const filterLabels: Record<MembershipFilter, string> = isGroupsMode
    ? { all: "All groups", selected: "Assigned", unselected: "Unassigned" }
    : { all: "All users", selected: "Members", unselected: "Non-members" }
  const emptyMessage =
    options.length === 0
      ? `No ${itemNamePlural} are available.`
      : `No ${itemNamePlural} match your search and filter.`

  const setFilterValue = (value: string) => {
    if (value === "all" || value === "selected" || value === "unselected") {
      setMembershipFilter(value)
    }
  }

  const resultLabel = React.useCallback(
    (count: number) => `${count} ${count === 1 ? itemName : itemNamePlural}`,
    [itemName, itemNamePlural]
  )

  return (
    <form
      className="contents"
      action={() => {
        onOpenChange(false)
        showSingleMutationToast({
          title: "Updating memberships",
          name: formatPrincipalReference(principal),
          promise: form.handleSubmit(),
          successDescription: "Memberships updated",
        })
      }}
    >
      {serverChanged && (
        <Alert>
          <HugeiconsIcon icon={Alert01Icon} />
          <AlertTitle>Memberships changed</AlertTitle>
          <AlertDescription>
            Memberships changed on the server while you were editing.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReload}
            >
              <HugeiconsIcon icon={ReloadIcon} />
              Reload
            </Button>
          </AlertAction>
        </Alert>
      )}
      <div className="flex items-center gap-2">
        <SearchInputGroup
          className="min-w-0 flex-1"
          aria-label={`Search ${itemNamePlural}`}
          placeholder={`Search ${itemNamePlural}...`}
          value={search}
          onValueChange={setSearch}
          resultCount={visibleOptions.length}
          resultLabel={resultLabel}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-lg"
                variant={membershipFilter === "all" ? "secondary" : "outline"}
                aria-label={`Filter ${itemNamePlural}: ${filterLabels[membershipFilter]}`}
              >
                <HugeiconsIcon icon={FilterIcon} />
              </Button>
            }
          />
          <DropdownMenuContent className="w-48" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Membership</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={membershipFilter}
                onValueChange={setFilterValue}
              >
                <DropdownMenuRadioItem value="all">
                  {filterLabels.all}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="selected">
                  {filterLabels.selected}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="unselected">
                  {filterLabels.unselected}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AppDialogScrollBody className="-mx-6 -mb-8 p-0">
        <PrincipalSelectionTable
          data={visibleOptions}
          emptyMessage={emptyMessage}
          rowSelection={rowSelection}
          onRowSelectionChange={handleRowSelectionChange}
          selectAllLabel={`Select all visible ${itemNamePlural}`}
        />
      </AppDialogScrollBody>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton
              disabled={!hasChanges}
              pending={isSubmitting}
            >
              Save (<span className="tabular-nums">{selectedIds.length}</span>)
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
