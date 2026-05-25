import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import { Button } from "@workspace/ui/components/button"
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
} from "@workspace/ui/components/field"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { IconDeviceDesktop, IconFolderOpen, IconSettings } from "@tabler/icons-react"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import { CustomizePermissionsDialog } from "@/features/inventory/components/permissions/customize-permissions-dialog"
import { setPermissionState } from "@/features/inventory/utils/acl-transformers"
import { getInventoryPermissionDefinitionsByGroup } from "@/features/inventory/utils/inventory-permissions"

const frameworks = [
  "Next.js",
  "SvelteKit",
  "Nuxt.js",
  "Remix",
  "Astro",
] as const

const publishVmPermissionGroups = getInventoryPermissionDefinitionsByGroup("vm")

type PublishPodVirtualMachinesStepProps = {
  form: PublishPodFormApi
}

function createEditingVmPrincipal(
  vm: PublishPodFormValues["virtual_machines"][number]
): DraftPrincipal {
  return {
    principalId: vm.id,
    principalName: vm.name,
    self: vm.permissions,
  }
}

export function PublishPodVirtualMachinesStep({
  form,
}: PublishPodVirtualMachinesStepProps) {
  const [editingVmIndex, setEditingVmIndex] = React.useState<number | null>(
    null
  )
  const [editingVmPermissions, setEditingVmPermissions] =
    React.useState<DraftPrincipal | null>(null)

  const closeVmPermissionDialog = React.useCallback(() => {
    setEditingVmIndex(null)
    setEditingVmPermissions(null)
  }, [])

  const handleStartEditingVm = React.useCallback(
    (vm: PublishPodFormValues["virtual_machines"][number], index: number) => {
      setEditingVmIndex(index)
      setEditingVmPermissions(createEditingVmPrincipal(vm))
    },
    []
  )

  const handleVmPermissionChange = React.useCallback(
    (bit: number, state: PermissionState) => {
      if (!editingVmPermissions) return

      setEditingVmPermissions({
        ...editingVmPermissions,
        self: setPermissionState(editingVmPermissions.self, bit, state),
      })
    },
    [editingVmPermissions]
  )

  const handleSaveVmPermissions = React.useCallback(() => {
    if (editingVmIndex === null || !editingVmPermissions) return

    form.setFieldValue(
      "virtual_machines",
      form
        .getFieldValue("virtual_machines")
        .map((vm, index) =>
          index === editingVmIndex
            ? { ...vm, permissions: editingVmPermissions.self }
            : vm
        )
    )

    closeVmPermissionDialog()
  }, [closeVmPermissionDialog, editingVmIndex, editingVmPermissions, form])

  return (
    <>
      <PublishPodStepLayout form={form}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconDeviceDesktop className="size-5 text-muted-foreground" />
              Virtual Machines
            </CardTitle>
            <CardDescription>
              Choose the source folder, review the included virtual machines, and
              adjust their default permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t pt-6">
            <FieldGroup>
              <form.Field name="source_folder">
                {(field) => {
                  const isInvalid = field.state.meta.errors.length > 0

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel>Folder</FieldLabel>
                      <FieldContent>
                        <Combobox
                          items={frameworks}
                          value={field.state.value || null}
                          onValueChange={(value) => field.handleChange(value ?? "")}
                        >
                          <ComboboxInput
                            name={field.name}
                            placeholder="Select source folder"
                            onBlur={field.handleBlur}
                            aria-invalid={isInvalid || undefined}
                          />
                          <ComboboxContent>
                            <ComboboxEmpty>No items found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item) => (
                                <ComboboxItem key={item} value={item}>
                                  {item}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        <FieldDescription className="pt-2">
                          The selected folder provides the base VMs for this pod.
                          Publishing does not modify the source folder.
                        </FieldDescription>
                        <FieldError errors={field.state.meta.errors} />
                        <div className="flex flex-col gap-3 pt-3">
                          <p className="font-medium">Included Virtual Machines</p>
                          {field.state.value ? (
                            <form.Subscribe
                              selector={(state) => state.values.virtual_machines}
                            >
                              {(virtualMachines) => (
                                <div className="space-y-3">
                                  {virtualMachines.map((vm, index) => (
                                    <Item key={vm.id} variant="muted">
                                      <ItemMedia variant="icon">
                                        <IconDeviceDesktop />
                                      </ItemMedia>
                                      <ItemContent>
                                        <ItemTitle>{vm.name}</ItemTitle>
                                        <ItemDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                          <span>{vm.cpuCount} CPUs</span>
                                          <span>{vm.memoryGb}GB RAM</span>
                                          <span>{vm.storageGb}GB Storage</span>
                                        </ItemDescription>
                                      </ItemContent>
                                      <ItemActions>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          aria-label={`Customize permissions for ${vm.name}`}
                                          onClick={() =>
                                            handleStartEditingVm(vm, index)
                                          }
                                        >
                                          <IconSettings data-icon="inline-end" />
                                        </Button>
                                      </ItemActions>
                                    </Item>
                                  ))}
                                </div>
                              )}
                            </form.Subscribe>
                          ) : (
                            <Empty className="border border-dashed">
                              <EmptyHeader>
                                <EmptyMedia variant="icon">
                                  <IconFolderOpen />
                                </EmptyMedia>
                                <EmptyTitle>No folder selected</EmptyTitle>
                                <EmptyDescription>
                                  Select a folder to preview the virtual machines
                                  that will be included in this pod.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          )}
                          <span className="text-muted-foreground">
                            Default VM access includes view, console, power, and
                            snapshot actions.
                          </span>
                        </div>
                      </FieldContent>
                    </Field>
                  )
                }}
              </form.Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </PublishPodStepLayout>

      <CustomizePermissionsDialog
        editingPrincipal={editingVmPermissions}
        onSave={handleSaveVmPermissions}
        onOpenChange={(open) => {
          if (!open) {
            closeVmPermissionDialog()
          }
        }}
        onPermissionChange={handleVmPermissionChange}
        permissionGroups={publishVmPermissionGroups}
        showOverlay={true}
      />
    </>
  )
}
