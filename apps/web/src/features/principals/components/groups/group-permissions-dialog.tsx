import React from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert01Icon,
  LockPasswordIcon,
  ShieldKeyIcon,
  UserSettings01Icon,
} from "@hugeicons/core-free-icons"
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
  FieldError,
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
import { PreloadOverlay } from "@/components/loading-overlay"
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

type RoleFormValues = {
  role: ManagementPermissionKey | ""
}

function GroupPermissionsForm({
  group,
  initialRole,
  roleDefinitions,
  canEditBootstrapOnly,
  immutable,
  controlsDisabled,
  onOpenChange,
}: {
  group: ApiPrincipal
  initialRole: ManagementPermissionKey | ""
  roleDefinitions: Array<ApiManagementPermissionDefinition>
  canEditBootstrapOnly: boolean
  immutable: boolean
  controlsDisabled: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const baselineRoleRef = React.useRef(initialRole)

  const form = useForm({
    defaultValues: {
      role: initialRole,
    } satisfies RoleFormValues,
    onSubmit: async ({ value }) => {
      try {
        await updateGroupManagementAcl(group.id, value.role ? [value.role] : [])
        toast.success("Management role updated")
        await queryClient.invalidateQueries({
          queryKey: ["principals", "groups", group.id, "management-access"],
        })
        onOpenChange(false)
      } catch (error) {
        toast.error(formatToastError(error))
      }
    },
  })

  React.useEffect(() => {
    baselineRoleRef.current = initialRole
    form.reset({ role: initialRole })
  }, [form, initialRole])

  const selectedRole = useSelector(form.store, (state) => state.values.role)
  const hasChanges = selectedRole !== baselineRoleRef.current
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting)

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <AppDialogScrollBody>
        <div className="flex flex-col">
          {immutable ? (
            <Alert className="mb-3">
              <HugeiconsIcon icon={ShieldKeyIcon} />
              <AlertTitle>Protected bootstrap group</AlertTitle>
              <AlertDescription>
                This group stays administrator-owned and cannot be edited here.
              </AlertDescription>
            </Alert>
          ) : !canEditBootstrapOnly ? (
            <Alert className="mb-3">
              <HugeiconsIcon icon={UserSettings01Icon} />
              <AlertTitle>Administrator role is restricted</AlertTitle>
              <AlertDescription>
                You can assign the manager role here, but administrator remains
                reserved for the bootstrap admin group.
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="w-full">
            <form.Field name="role">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <FieldSet>
                    <RadioGroup
                      name={field.name}
                      value={field.state.value}
                      onValueChange={(value) =>
                        field.handleChange(
                          value as ManagementPermissionKey | ""
                        )
                      }
                      disabled={controlsDisabled || immutable}
                      className="gap-3"
                    >
                      <FieldLabel htmlFor="role-none">
                        <Field
                          orientation="horizontal"
                          data-invalid={isInvalid}
                        >
                          <FieldContent className="cursor-pointer">
                            <FieldTitle>None</FieldTitle>
                            <FieldDescription>
                              Standard operations. No special management
                              permissions.
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem
                            value=""
                            id="role-none"
                            aria-invalid={isInvalid}
                          />
                        </Field>
                      </FieldLabel>

                      {roleDefinitions.map((role) => {
                        const roleDisabled =
                          role.bootstrap_only && !canEditBootstrapOnly

                        return (
                          <FieldLabel
                            key={role.key}
                            htmlFor={`role-${role.key}`}
                          >
                            <Field
                              orientation="horizontal"
                              data-invalid={isInvalid}
                            >
                              <FieldContent className="cursor-pointer">
                                <div className="flex flex-wrap items-center gap-2">
                                  <FieldTitle>{role.label}</FieldTitle>
                                  {role.dangerous && (
                                    <Badge variant="destructive">
                                      Dangerous
                                    </Badge>
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
                                aria-invalid={isInvalid}
                              />
                            </Field>
                          </FieldLabel>
                        )
                      })}
                    </RadioGroup>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldSet>
                )
              }}
            </form.Field>
          </FieldGroup>
        </div>
      </AppDialogScrollBody>

      <DialogFooter>
        <AppDialogPrimaryButton
          disabled={controlsDisabled || immutable || !hasChanges}
          pending={isSubmitting}
          pendingLabel="Saving..."
        >
          Save
        </AppDialogPrimaryButton>
      </DialogFooter>
    </form>
  )
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
  const {
    data: access,
    error: accessError,
    isError: isAccessError,
    isLoading: isAccessLoading,
  } = useQuery({
    ...groupManagementAclQueryOptions(group.id),
    enabled: open,
  })

  const roleDefinitions = React.useMemo(
    () => getRoleDefinitions(access?.sections ?? []),
    [access?.sections]
  )
  const immutable = access?.immutable ?? false
  const canEditBootstrapOnly = access?.can_edit_bootstrap_only ?? false
  const controlsDisabled = isAccessLoading || isAccessError
  const initialRole = React.useMemo(
    () => directRoleFromGrants(access?.grants ?? []),
    [access?.grants]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={LockPasswordIcon}
        title="Management Roles"
        description={`Choose the management role for ${getGroupLabel(group)}.`}
      >
        <div className="relative min-h-[16.5rem]">
          <PreloadOverlay
            active={isAccessLoading}
            label="Loading management roles"
          />
          {isAccessError ? (
            <AppDialogScrollBody>
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon
                      icon={Alert01Icon}
                      className="text-muted-foreground"
                    />
                  </EmptyMedia>
                  <EmptyTitle>Could Not Load Roles</EmptyTitle>
                  <EmptyDescription>{accessError.message}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </AppDialogScrollBody>
          ) : !isAccessLoading ? (
            <GroupPermissionsForm
              key={`${group.id}:${initialRole}`}
              group={group}
              initialRole={initialRole}
              roleDefinitions={roleDefinitions}
              canEditBootstrapOnly={canEditBootstrapOnly}
              immutable={immutable}
              controlsDisabled={controlsDisabled}
              onOpenChange={onOpenChange}
            />
          ) : null}
        </div>
      </AppDialogContent>
    </Dialog>
  )
}
