import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  IconDeviceDesktop,
  IconFolderOpen,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PublishPodSourceFolder } from "@/features/pods/api/publish-pod-api"
import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import { CustomizePermissionsDialog } from "@/features/inventory/components/permissions/customize-permissions-dialog"
import { setPermissionState } from "@/features/inventory/utils/acl-transformers"
import { getInventoryPermissionDefinitionsByGroup } from "@/features/inventory/utils/inventory-permissions"

const publishVmPermissionGroups = getInventoryPermissionDefinitionsByGroup("vm")

type PublishPodVM = PublishPodFormValues["virtual_machines"][number]
type PublishPodVMRow = {
  index: number
  vm: PublishPodVM
}

type PublishPodVirtualMachinesStepProps = {
  form: PublishPodFormApi
  isEditing: boolean
  submissionAttempts: number
  sourceFolders: Array<PublishPodSourceFolder>
  sourceFoldersError: Error | null
  sourceFoldersLoading: boolean
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

type PublishPodVirtualMachinesTableProps = {
  canUpdateSourceTemplates: boolean
  onEditPermissions: (vm: PublishPodVM, index: number) => void
  onUpdateVirtualMachinesChange: (vmIds: Array<string>) => void
  updateVirtualMachines: Array<string>
  virtualMachines: Array<PublishPodVM>
}

function PublishPodVirtualMachinesTable({
  canUpdateSourceTemplates,
  onEditPermissions,
  onUpdateVirtualMachinesChange,
  updateVirtualMachines,
  virtualMachines,
}: PublishPodVirtualMachinesTableProps) {
  const rows = React.useMemo<Array<PublishPodVMRow>>(
    () => virtualMachines.map((vm, index) => ({ index, vm })),
    [virtualMachines]
  )
  const rowSelection = React.useMemo<RowSelectionState>(() => {
    if (!canUpdateSourceTemplates) {
      return {}
    }

    return Object.fromEntries(
      updateVirtualMachines.map((vmId) => [vmId, true])
    )
  }, [canUpdateSourceTemplates, updateVirtualMachines])

  const columns = React.useMemo<Array<ColumnDef<PublishPodVMRow>>>(
    () => [
      ...(canUpdateSourceTemplates
        ? [
            {
              id: "update",
              header: ({ table }) => (
                <Checkbox
                  checked={table.getIsAllRowsSelected()}
                  aria-label="Select all VMs to update"
                  onCheckedChange={(checked) =>
                    table.toggleAllRowsSelected(Boolean(checked))
                  }
                />
              ),
              cell: ({ row }) => (
                <Checkbox
                  checked={row.getIsSelected()}
                  aria-label={`Update ${row.original.vm.name}`}
                  onCheckedChange={(checked) =>
                    row.toggleSelected(Boolean(checked))
                  }
                />
              ),
              enableHiding: false,
              enableSorting: false,
            } satisfies ColumnDef<PublishPodVMRow>,
          ]
        : []),
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex min-w-40 items-center gap-2">
            <IconDeviceDesktop className="text-muted-foreground" />
            <span className="truncate font-medium">{row.original.vm.name}</span>
          </div>
        ),
      },
      {
        id: "cpu",
        header: "CPU",
        cell: ({ row }) => `${row.original.vm.cpuCount} CPUs`,
      },
      {
        id: "memory",
        header: "Memory",
        cell: ({ row }) => `${row.original.vm.memoryGb}GB RAM`,
      },
      {
        id: "storage",
        header: "Storage",
        cell: ({ row }) => `${row.original.vm.storageGb}GB`,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          canUpdateSourceTemplates &&
          updateVirtualMachines.includes(row.original.vm.id) ? (
            <span className="text-muted-foreground">Queued for update</span>
          ) : (
            <span className="text-muted-foreground">Current</span>
          ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Customize permissions for ${row.original.vm.name}`}
              onClick={() =>
                onEditPermissions(row.original.vm, row.original.index)
              }
            >
              <IconSettings data-icon="inline-end" />
            </Button>
          </div>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [canUpdateSourceTemplates, onEditPermissions, updateVirtualMachines]
  )

  const table = useReactTable({
    data: rows,
    columns,
    enableRowSelection: canUpdateSourceTemplates,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.vm.id,
    onRowSelectionChange: (updater) => {
      const nextSelection =
        typeof updater === "function" ? updater(rowSelection) : updater
      onUpdateVirtualMachinesChange(
        Object.entries(nextSelection)
          .filter(([, selected]) => selected)
          .map(([vmId]) => vmId)
      )
    },
    state: {
      rowSelection,
    },
  })

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader className="bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No virtual machines found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function PublishPodVirtualMachinesStep({
  form,
  isEditing,
  submissionAttempts,
  sourceFolders,
  sourceFoldersError,
  sourceFoldersLoading,
}: PublishPodVirtualMachinesStepProps) {
  const [editingVmIndex, setEditingVmIndex] = React.useState<number | null>(
    null
  )
  const [editingVmPermissions, setEditingVmPermissions] =
    React.useState<DraftPrincipal | null>(null)
  const initialSourceFolderRef = React.useRef(form.getFieldValue("source_folder"))

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

  const handleUpdateVirtualMachinesChange = React.useCallback(
    (vmIds: Array<string>) =>
      form.setFieldValue("update_virtual_machines", vmIds),
    [form]
  )

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
              Choose the source folder, review the included virtual machines,
              and adjust their default permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t pt-6">
            <FieldGroup>
              <form.Field name="source_folder">
                {(field) => {
                  const showValidation =
                    field.state.meta.isTouched || submissionAttempts > 0
                  const isInvalid = showValidation && !field.state.meta.isValid
                  const selectedSourceFolder =
                    sourceFolders.find(
                      (folder) => folder.id === field.state.value
                    ) ?? null
                  const canUpdateSourceTemplates =
                    isEditing &&
                    !!field.state.value &&
                    field.state.value === initialSourceFolderRef.current

                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel>Folder</FieldLabel>
                      <FieldContent>
                        <Combobox
                          items={sourceFolders}
                          itemToStringLabel={(folder) => folder.name}
                          itemToStringValue={(folder) => folder.name}
                          value={selectedSourceFolder}
                          onValueChange={(folder) => {
                            const nextFolderID = folder?.id ?? ""
                            field.handleChange(nextFolderID)

                            if (
                              nextFolderID &&
                              nextFolderID !== field.state.value
                            ) {
                              form.setFieldValue(
                                "virtual_machines",
                                structuredClone(folder?.virtual_machines ?? [])
                              )
                              form.setFieldValue(
                                "update_virtual_machines",
                                []
                              )
                            }

                            if (!nextFolderID) {
                              form.setFieldValue("virtual_machines", [])
                              form.setFieldValue(
                                "update_virtual_machines",
                                []
                              )
                            }
                          }}
                          disabled={sourceFoldersLoading}
                          autoHighlight
                        >
                          <ComboboxInput
                            name={field.name}
                            placeholder={
                              sourceFoldersLoading
                                ? "Loading folders..."
                                : "Select source folder"
                            }
                            onBlur={field.handleBlur}
                            aria-invalid={isInvalid || undefined}
                          />
                          <ComboboxContent>
                            <ComboboxEmpty>No folders found.</ComboboxEmpty>
                            <ComboboxList>
                              {(folder) => (
                                <ComboboxItem key={folder.id} value={folder}>
                                  <span className="flex min-w-0 flex-col">
                                    <span className="truncate">
                                      {folder.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {folder.virtual_machines.length} VM
                                      {folder.virtual_machines.length === 1
                                        ? ""
                                        : "s"}
                                    </span>
                                  </span>
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                        <FieldDescription className="pt-2">
                          The selected folder provides the base VMs for this
                          pod. Publishing does not modify the source folder.
                        </FieldDescription>
                        <FieldError
                          errors={showValidation ? field.state.meta.errors : []}
                        />
                        {sourceFoldersError ? (
                          <FieldDescription className="text-destructive">
                            Failed to load source folders.
                          </FieldDescription>
                        ) : null}
                        <div className="flex flex-col gap-3 pt-3">
                          <p className="font-medium">
                            Included Virtual Machines
                          </p>
                          {sourceFoldersLoading ? (
                            <div className="flex flex-col gap-3">
                              <Skeleton className="h-16 w-full" />
                              <Skeleton className="h-16 w-full" />
                              <Skeleton className="h-16 w-full" />
                            </div>
                          ) : field.state.value ? (
                            <form.Subscribe
                              selector={(state) => ({
                                updateVirtualMachines:
                                  state.values.update_virtual_machines,
                                virtualMachines:
                                  state.values.virtual_machines,
                              })}
                            >
                              {({
                                updateVirtualMachines,
                                virtualMachines,
                              }) => (
                                <>
                                  {canUpdateSourceTemplates ? (
                                    <Alert>
                                      <IconRefresh />
                                      <AlertTitle>
                                        Update Source templates
                                      </AlertTitle>
                                      <AlertDescription>
                                        Selected VMs will have their Source
                                        templates rebuilt when you save.
                                        Existing clones keep their current VM
                                        copies until users clone the pod again.
                                      </AlertDescription>
                                    </Alert>
                                  ) : null}
                                  <PublishPodVirtualMachinesTable
                                    canUpdateSourceTemplates={
                                      canUpdateSourceTemplates
                                    }
                                    onEditPermissions={handleStartEditingVm}
                                    onUpdateVirtualMachinesChange={
                                      handleUpdateVirtualMachinesChange
                                    }
                                    updateVirtualMachines={
                                      updateVirtualMachines
                                    }
                                    virtualMachines={virtualMachines}
                                  />
                                </>
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
                                  Select a folder to preview the virtual
                                  machines that will be included in this pod.
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
