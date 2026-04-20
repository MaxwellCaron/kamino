import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { IconLockAccess } from "@tabler/icons-react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import type { ApiPrincipal } from "@/lib/queries"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import {
  ManagementPermissionBits,
  groupManagementAclQueryOptions,
  normalizeManagementPermissionMask,
  updateGroupManagementAcl,
} from "@/lib/queries"

const managementOptions = [
  {
    bit: ManagementPermissionBits.viewSdn,
    label: "View SDN",
    description: "Allows access to SDN tables and read-only actions.",
  },
  {
    bit: ManagementPermissionBits.manageSdn,
    label: "Manage SDN",
    description: "Allows creating, editing, and deleting SDN resources.",
  },
  {
    bit: ManagementPermissionBits.viewPrincipals,
    label: "View Principals",
    description: "Allows reading users and groups.",
  },
  {
    bit: ManagementPermissionBits.managePrincipals,
    label: "Manage Principals",
    description: "Allows principal CRUD and membership updates.",
  },
  {
    bit: ManagementPermissionBits.manageAccess,
    label: "Manage Access",
    description: "Allows editing management access on groups.",
  },
] as const

function getGroupLabel(group: ApiPrincipal) {
  return group.name ?? group.external_id
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
  const [mask, setMask] = useState(0)

  const accessQuery = useQuery({
    ...groupManagementAclQueryOptions(group.id),
    enabled: open,
  })

  useEffect(() => {
    if (!open) {
      setMask(0)
      return
    }
    if (!accessQuery.data) return
    setMask(accessQuery.data.permissions.allowed_mask)
  }, [accessQuery.data, open])

  const mutation = useMutation({
    mutationFn: async () => {
      await updateGroupManagementAcl(group.id, mask)
    },
    onSuccess: () => {
      toast.success("Management access updated")
      queryClient.invalidateQueries({
        queryKey: ["principals", "groups", group.id, "management-access"],
      })
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const immutable = accessQuery.data?.immutable ?? false
  const normalizedMask = normalizeManagementPermissionMask(mask)
  const controlsDisabled =
    immutable ||
    accessQuery.isLoading ||
    accessQuery.isError ||
    mutation.isPending

  function togglePermission(bit: number, checked: boolean) {
    setMask((currentMask) => {
      const nextMask = checked ? currentMask | bit : currentMask & ~bit
      return normalizeManagementPermissionMask(nextMask)
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={IconLockAccess}
      title="Edit Access"
      description={`Configure coarse management access for ${getGroupLabel(group)}. These permissions only apply to groups.`}
    >
      <FieldGroup>
        {managementOptions.map((option) => (
          <FieldLabel
            key={option.bit}
            htmlFor={`management-permission-${option.bit}`}
            className="flex items-center justify-between gap-4"
          >
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{option.label}</FieldTitle>
                <FieldDescription>{option.description}</FieldDescription>
              </FieldContent>
              <Checkbox
                id={`management-permission-${option.bit}`}
                checked={(normalizedMask & option.bit) === option.bit}
                disabled={controlsDisabled}
                onCheckedChange={(checked) =>
                  togglePermission(option.bit, checked === true)
                }
              />
            </Field>
          </FieldLabel>
        ))}
      </FieldGroup>

      {immutable && (
        <p className="text-sm text-muted-foreground">
          This group is protected and always has full access.
        </p>
      )}
      {accessQuery.isError && (
        <p className="text-sm text-destructive">{accessQuery.error.message}</p>
      )}

      <DialogFooter>
        <AppDialogPrimaryButton
          onClick={() => mutation.mutate()}
          disabled={controlsDisabled}
        >
          {mutation.isPending ? "Saving..." : "Save"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </AppDialog>
  )
}
