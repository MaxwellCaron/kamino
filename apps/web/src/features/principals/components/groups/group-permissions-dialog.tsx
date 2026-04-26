import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconAlertTriangle,
  IconLockAccess,
  IconShieldCheck,
  IconUserCog,
} from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import type { ApiPrincipal } from "@/lib/queries"
import type {
  ApiManagementPermissionDefinition,
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/lib/management-permissions"
import { ManagementPermissionKeys } from "@/lib/management-permissions"
import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  groupManagementAclQueryOptions,
  updateGroupManagementAcl,
} from "@/lib/queries"

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
}

function flattenDefinitions(
  sections: Array<ApiManagementPermissionSection>
): Array<ApiManagementPermissionDefinition> {
  return sections.flatMap((section) => section.permissions)
}

function getRoleDefinitions(
  sections: Array<ApiManagementPermissionSection>
): Array<ApiManagementPermissionDefinition> {
  const byKey = new Map(
    flattenDefinitions(sections).map((definition) => [
      definition.key,
      definition,
    ])
  )

  return [
    byKey.get(ManagementPermissionKeys.manager) ?? {
      key: ManagementPermissionKeys.manager,
      label: "Manager",
      description: "Can review and determine outcomes of request queue items.",
      dangerous: false,
      bootstrap_only: false,
    },
    byKey.get(ManagementPermissionKeys.administrator) ?? {
      key: ManagementPermissionKeys.administrator,
      label: "Administrator",
      description:
        "Full management access, including administration surfaces and management role assignment.",
      dangerous: true,
      bootstrap_only: true,
    },
  ]
}

function directRoleFromGrants(
  grants: Array<ManagementPermissionKey>
): ManagementPermissionKey | "" {
  if (grants.includes(ManagementPermissionKeys.administrator)) {
    return ManagementPermissionKeys.administrator
  }
  if (grants.includes(ManagementPermissionKeys.manager)) {
    return ManagementPermissionKeys.manager
  }

  return ""
}

function formatRoleLabel(role: ManagementPermissionKey | "") {
  switch (role) {
    case ManagementPermissionKeys.administrator:
      return "Administrator"
    case ManagementPermissionKeys.manager:
      return "Manager"
    default:
      return "No management role"
  }
}

export function GroupPermissionsDialog({
  group,
  open,
  onOpenChange,
}: {
  group: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [selectedRole, setSelectedRole] = React.useState<
    ManagementPermissionKey | ""
  >("")

  const accessQuery = useQuery({
    ...groupManagementAclQueryOptions(group.id),
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) {
      setSelectedRole("")
      return
    }

    if (!accessQuery.data) {
      return
    }

    setSelectedRole(directRoleFromGrants(accessQuery.data.grants))
  }, [accessQuery.data, open])

  const mutation = useMutation({
    mutationFn: async () => {
      await updateGroupManagementAcl(
        group.id,
        selectedRole ? [selectedRole] : []
      )
    },
    onSuccess: () => {
      toast.success("Management role updated")
      queryClient.invalidateQueries({
        queryKey: ["principals", "groups", group.id, "management-access"],
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const roleDefinitions = React.useMemo(
    () => getRoleDefinitions(accessQuery.data?.sections ?? []),
    [accessQuery.data?.sections]
  )
  const immutable = accessQuery.data?.immutable ?? false
  const canEditBootstrapOnly =
    accessQuery.data?.can_edit_bootstrap_only ?? false
  const controlsDisabled =
    accessQuery.isLoading || accessQuery.isError || mutation.isPending
  const initialRole = React.useMemo(
    () => directRoleFromGrants(accessQuery.data?.grants ?? []),
    [accessQuery.data?.grants]
  )
  const hasChanges = initialRole !== selectedRole

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={IconLockAccess}
        title="Management Roles"
        description={`Choose the management role for ${getGroupLabel(group)}.`}
      >
        <AppDialogScrollBody className="-mb-6 bg-muted/20 px-6">
          {accessQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading management roles...
            </div>
          ) : accessQuery.isError ? (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconAlertTriangle />
                </EmptyMedia>
                <EmptyTitle>Could Not Load Roles</EmptyTitle>
                <EmptyDescription>{accessQuery.error.message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {immutable ? (
                <Alert>
                  <IconShieldCheck />
                  <AlertTitle>Protected bootstrap group</AlertTitle>
                  <AlertDescription>
                    This group stays administrator-owned and cannot be edited
                    here.
                  </AlertDescription>
                </Alert>
              ) : !canEditBootstrapOnly ? (
                <Alert>
                  <IconUserCog />
                  <AlertTitle>Administrator role is restricted</AlertTitle>
                  <AlertDescription>
                    You can assign the manager role here, but administrator
                    remains reserved for the bootstrap admin group.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-dashed">
                  <CardHeader className="gap-1 pb-3">
                    <CardDescription>Direct grant</CardDescription>
                    <CardTitle className="text-base">
                      {formatRoleLabel(selectedRole)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    Direct grants control what gets written back to the backend.
                  </CardContent>
                </Card>
                <Card className="border-dashed">
                  <CardHeader className="gap-1 pb-3">
                    <CardDescription>Effective access</CardDescription>
                    <CardTitle className="flex flex-wrap gap-2 text-base">
                      {accessQuery.data?.effective_grants.length ? (
                        accessQuery.data.effective_grants.map((grant) => (
                          <Badge key={grant} variant="outline">
                            {grant}
                          </Badge>
                        ))
                      ) : (
                        <span>No management access</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">
                    Administrator implies request queue access automatically.
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-3">
                <div className="px-1">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Available roles
                  </span>
                </div>
                <ToggleGroup
                  value={selectedRole ? [selectedRole] : []}
                  onValueChange={(nextValue) => {
                    const nextRole = nextValue[0] as
                      | ManagementPermissionKey
                      | undefined
                    setSelectedRole(nextRole ?? "")
                  }}
                  orientation="vertical"
                  spacing={2}
                  className="w-full"
                >
                  {roleDefinitions.map((role) => {
                    const roleDisabled =
                      immutable ||
                      controlsDisabled ||
                      (role.bootstrap_only && !canEditBootstrapOnly)

                    return (
                      <ToggleGroupItem
                        key={role.key}
                        value={role.key}
                        disabled={roleDisabled}
                        variant="outline"
                        className="h-auto w-full justify-start rounded-3xl border bg-background px-4 py-4 text-left data-[state=on]:border-primary/30 data-[state=on]:bg-muted"
                      >
                        <div className="flex w-full flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{role.label}</span>
                              {role.dangerous ? (
                                <Badge variant="destructive">Dangerous</Badge>
                              ) : null}
                              {role.bootstrap_only ? (
                                <Badge variant="outline">Reserved</Badge>
                              ) : null}
                            </div>
                            {selectedRole === role.key ? (
                              <Badge variant="secondary">Selected</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {role.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {role.key === ManagementPermissionKeys.administrator
                              ? "Access: request queue, all /admin pages, and management role assignment."
                              : "Access: request queue only. No /admin access and no principal or SDN administration."}
                          </p>
                        </div>
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-3xl border bg-background/90 p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Need to clear access?</p>
                  <p className="text-sm text-muted-foreground">
                    Remove both roles and leave the group without management
                    permissions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={
                    controlsDisabled || immutable || selectedRole === ""
                  }
                  onClick={() => setSelectedRole("")}
                >
                  Clear role
                </Button>
              </div>
            </div>
          )}
        </AppDialogScrollBody>

        <DialogFooter showCloseButton>
          <Button
            disabled={controlsDisabled || immutable || !hasChanges}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}
