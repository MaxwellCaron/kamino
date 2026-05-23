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
import {
  IconDeviceDesktop,
  IconFolderOpen,
  IconSettings,
} from "@tabler/icons-react"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import { setPermissionState } from "@/features/inventory/utils/acl-transformers"
import { getInventoryPermissionDefinitionsByGroup } from "@/features/inventory/utils/inventory-permissions"
import { CustomizePermissionsDialog } from "@/features/inventory/components/permissions/customize-permissions-dialog"

const publishVmPermissionGroups = getInventoryPermissionDefinitionsByGroup("vm")

type PublishPodVmSectionProps = {
  folderOptions: ReadonlyArray<string>
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

export function PublishPodVmSection({
  folderOptions,
  form,
}: PublishPodVmSectionProps) {
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDeviceDesktop className="size-5 text-muted-foreground" />
            Virtual Machines
          </CardTitle>
          <CardDescription>
            Select the folder that you want to create a new pod from and assign
            them individual permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
          <div className="flex flex-col gap-6">
            <form.Field name="source_folder">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel>Folder</FieldLabel>
                    <FieldContent>
                      <Combobox
                        items={folderOptions}
                        value={field.state.value || null}
                        onValueChange={(value) =>
                          field.handleChange(value ?? "")
                        }
                      >
                        <ComboboxInput
                          name={field.name}
                          placeholder="Select base folder"
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
                        This folder will be used as the source of truth for the
                        pod. Creating a pod will NOT touch or modify the
                        contents of this folder.
                      </FieldDescription>
                      <FieldError errors={field.state.meta.errors} />
                      <div className="flex flex-col gap-3 pt-3">
                        <p className="font-medium">Virtual Machines</p>
                        {field.state.value ? (
                          <form.Subscribe
                            selector={(state) => state.values.virtual_machines}
                          >
                            {(virtualMachines) => (
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                          <Empty className="min-h-56 rounded-xl border border-dashed">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <IconFolderOpen />
                              </EmptyMedia>
                              <EmptyTitle>No folder selected</EmptyTitle>
                              <EmptyDescription>
                                Select a folder above to preview the virtual
                                machines that will be included in this pod.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                        <span className="text-muted-foreground">
                          By default, users will be able to view, console,
                          manage power status, and create or revert snapshots.
                        </span>
                      </div>
                    </FieldContent>
                  </Field>
                )
              }}
            </form.Field>
          </div>
        </CardContent>
      </Card>

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
