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
  FieldSet,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type {
  ApiManagementPermissionDefinition,
  ApiManagementPermissionSection,
  ManagementPermissionKey,
} from "@/features/auth/utils/management-permissions"
import { ManagementPermissionKeys } from "@/features/auth/utils/management-permissions"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  groupManagementAclQueryOptions,
  updateGroupManagementAcl,
} from "@/features/principals/api/principals-api"
import { formatToastError } from "@/features/shared/utils/format"

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
      toast.error(formatToastError(error))
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
        <AppDialogScrollBody className="-mb-6">
          {accessQuery.isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading management roles...
            </div>
          ) : accessQuery.isError ? (
            <Empty className="border border-dashed">
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
              <FieldGroup className="w-full">
                <FieldSet>
                  <RadioGroup
                    value={selectedRole}
                    onValueChange={(value) =>
                      setSelectedRole(value as ManagementPermissionKey | "")
                    }
                    disabled={controlsDisabled || immutable}
                    className="gap-3"
                  >
                    <FieldLabel htmlFor="role-none">
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>None</FieldTitle>
                          <FieldDescription>
                            Standard operations. No special management
                            permissions.
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value="" id="role-none" />
                      </Field>
                    </FieldLabel>

                    {roleDefinitions.map((role) => {
                      const roleDisabled =
                        role.bootstrap_only && !canEditBootstrapOnly

                      return (
                        <FieldLabel key={role.key} htmlFor={`role-${role.key}`}>
                          <Field orientation="horizontal">
                            <FieldContent>
                              <div className="flex flex-wrap items-center gap-2">
                                <FieldTitle>{role.label}</FieldTitle>
                                {role.dangerous && (
                                  <Badge variant="destructive">Dangerous</Badge>
                                )}
                              </div>
                              <FieldDescription>
                                {role.description}
                              </FieldDescription>
                            </FieldContent>
                            <RadioGroupItem
                              value={role.key}
                              id={`role-${role.key}`}
                              disabled={roleDisabled}
                            />
                          </Field>
                        </FieldLabel>
                      )
                    })}
                  </RadioGroup>
                </FieldSet>
              </FieldGroup>
            </div>
          )}
        </AppDialogScrollBody>

        <DialogFooter>
          <AppDialogPrimaryButton
            disabled={controlsDisabled || immutable || !hasChanges}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </AppDialogPrimaryButton>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}
