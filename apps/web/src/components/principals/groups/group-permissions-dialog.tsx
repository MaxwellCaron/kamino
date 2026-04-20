import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconLockAccess,
  IconSearch,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import type { ApiPrincipal } from "@/lib/queries"
import type {
  ApiManagementPermissionDefinition,
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/lib/management-permissions"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  expandManagementPermissionGrants,
  groupManagementAclQueryOptions,
  normalizeManagementPermissionGrants,
  updateGroupManagementAcl,
} from "@/lib/queries"

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
}

function getAllPermissionKeys(
  sections: Array<ApiManagementPermissionSection>
): Array<ManagementPermissionKey> {
  return sections.flatMap((section) =>
    section.permissions.map((permission) => permission.key)
  )
}

function buildPermissionSearchValues(
  section: ApiManagementPermissionSection,
  permission: ApiManagementPermissionDefinition
) {
  return [
    section.key,
    section.label,
    permission.key,
    permission.label,
    permission.description,
  ]
}

export function GroupManagementAccessDialog({
  group,
  open,
  onOpenChange,
}: {
  group: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [draftGrants, setDraftGrants] = React.useState<
    Array<ManagementPermissionKey>
  >([])
  const [permissionSearch, setPermissionSearch] = React.useState("")

  const accessQuery = useQuery({
    ...groupManagementAclQueryOptions(group.id),
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) {
      setDraftGrants([])
      setPermissionSearch("")
      return
    }

    if (!accessQuery.data) {
      return
    }

    setDraftGrants(accessQuery.data.grants)
  }, [accessQuery.data, open])

  const mutation = useMutation({
    mutationFn: async () => {
      await updateGroupManagementAcl(group.id, draftGrants)
    },
    onSuccess: () => {
      toast.success("Group permissions updated")
      queryClient.invalidateQueries({
        queryKey: ["principals", "groups", group.id, "management-access"],
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const allPermissionKeys = React.useMemo(
    () => getAllPermissionKeys(accessQuery.data?.sections ?? []),
    [accessQuery.data?.sections]
  )
  const effectiveDraftGrants = React.useMemo(
    () => expandManagementPermissionGrants(draftGrants, allPermissionKeys),
    [allPermissionKeys, draftGrants]
  )
  const effectiveDraftGrantSet = React.useMemo(
    () => new Set(effectiveDraftGrants),
    [effectiveDraftGrants]
  )

  const immutable = accessQuery.data?.immutable ?? false
  const canEditBootstrapOnly =
    accessQuery.data?.can_edit_bootstrap_only ?? false
  const controlsDisabled =
    accessQuery.isLoading || accessQuery.isError || mutation.isPending

  const normalizedPermissionSearch = permissionSearch.trim().toLocaleLowerCase()
  const filteredPermissionSections = React.useMemo(() => {
    const sections = accessQuery.data?.sections ?? []
    if (normalizedPermissionSearch === "") {
      return sections
    }

    return sections
      .map((section) => ({
        ...section,
        permissions: section.permissions.filter((permission) =>
          buildPermissionSearchValues(section, permission).some((value) =>
            value.toLocaleLowerCase().includes(normalizedPermissionSearch)
          )
        ),
      }))
      .filter((section) => section.permissions.length > 0)
  }, [accessQuery.data?.sections, normalizedPermissionSearch])

  const filteredPermissionCount = React.useMemo(
    () =>
      filteredPermissionSections.reduce(
        (count, section) => count + section.permissions.length,
        0
      ),
    [filteredPermissionSections]
  )
  const hasChanges = React.useMemo(() => {
    const initial = normalizeManagementPermissionGrants(
      accessQuery.data?.grants ?? []
    )
    const current = normalizeManagementPermissionGrants(draftGrants)
    return initial.join("|") !== current.join("|")
  }, [accessQuery.data?.grants, draftGrants])

  function setPermissionChecked(
    permissionKey: ManagementPermissionKey,
    checked: boolean
  ) {
    setDraftGrants((currentGrants) => {
      if (checked) {
        return normalizeManagementPermissionGrants([
          ...currentGrants,
          permissionKey,
        ])
      }

      return normalizeManagementPermissionGrants(
        currentGrants.filter((grant) => grant !== permissionKey)
      )
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        icon={IconLockAccess}
        title="Customize Permissions"
        description={`Update global management permissions for ${getGroupLabel(group)}.`}
      >
        <InputGroup>
          <InputGroupInput
            placeholder="Search permissions..."
            value={permissionSearch}
            onChange={(event) => setPermissionSearch(event.target.value)}
            aria-label="Search permissions"
          />
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {filteredPermissionCount}{" "}
            {filteredPermissionCount === 1 ? "result" : "results"}
          </InputGroupAddon>
        </InputGroup>

        <AppDialogScrollBody className="-mb-8 px-0">
          {accessQuery.isLoading ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Loading permissions...
            </div>
          ) : accessQuery.isError ? (
            <div className="px-4">
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconAlertTriangle />
                  </EmptyMedia>
                  <EmptyTitle>Could Not Load Permissions</EmptyTitle>
                  <EmptyDescription>
                    {accessQuery.error.message}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : filteredPermissionCount > 0 ? (
            <div className="flex flex-col gap-6">
              {filteredPermissionSections.map((section) => (
                <div key={section.key} className="flex flex-col gap-3 px-4">
                  <div className="px-1">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {section.label}
                    </span>
                  </div>
                  <FieldGroup className="gap-3">
                    {section.permissions.map((permission) => {
                      const rowDisabled =
                        immutable ||
                        controlsDisabled ||
                        (permission.bootstrap_only && !canEditBootstrapOnly)

                      return (
                        <FieldLabel
                          key={permission.key}
                          htmlFor={`management-permission-${permission.key}`}
                          className="flex items-center justify-between gap-4"
                        >
                          <Field
                            orientation="horizontal"
                            data-disabled={rowDisabled || undefined}
                          >
                            <FieldContent>
                              <FieldTitle className="justify-between gap-3">
                                <span>{permission.label}</span>
                                <span className="flex items-center gap-2">
                                  {permission.dangerous && (
                                    <Badge variant="destructive">
                                      Dangerous
                                    </Badge>
                                  )}
                                </span>
                              </FieldTitle>
                              <FieldDescription>
                                {permission.description}
                                {permission.bootstrap_only &&
                                !canEditBootstrapOnly
                                  ? " Only the bootstrap admin group can change this permission."
                                  : ""}
                              </FieldDescription>
                            </FieldContent>
                            <Checkbox
                              id={`management-permission-${permission.key}`}
                              checked={effectiveDraftGrantSet.has(
                                permission.key
                              )}
                              disabled={rowDisabled}
                              onCheckedChange={(checked) =>
                                setPermissionChecked(
                                  permission.key,
                                  checked === true
                                )
                              }
                            />
                          </Field>
                        </FieldLabel>
                      )
                    })}
                  </FieldGroup>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4">
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconSearch />
                  </EmptyMedia>
                  <EmptyTitle>No Matching Permissions</EmptyTitle>
                  <EmptyDescription>
                    No permissions match your search.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </AppDialogScrollBody>

        {immutable ? (
          <p className="text-sm text-muted-foreground">
            This bootstrap group is protected and always has every management
            permission.
          </p>
        ) : null}

        <DialogFooter>
          <AppDialogPrimaryButton
            onClick={() => mutation.mutate()}
            disabled={controlsDisabled || immutable || !hasChanges}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </AppDialogPrimaryButton>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}
