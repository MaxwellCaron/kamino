import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
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
  IconChevronDown,
  IconChevronRight,
  IconDeviceDesktop,
  IconFolderOpen,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PublishPodStepLayout } from "./publish-pod-step-layout"
import { createDefaultPublishPodVmPermissions } from "./publish-pod-form"
import type {
  ColumnDef,
  ExpandedState,
  RowSelectionState,
} from "@tanstack/react-table"
import type {
  PublishPodFormApi,
  PublishPodFormValues,
} from "./publish-pod-form"
import type { PublishPodFolder } from "@/features/pods/api/publish-pod-api"
import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { PermissionScopeSection } from "@/features/inventory/components/permissions/permission-scope-section"
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
  podFolders: Array<PublishPodFolder>
  podFoldersError: Error | null
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
  canUpdatePodTemplates: boolean
  onPermissionChange: (
    vm: PublishPodVM,
    index: number,
    bit: number,
    state: PermissionState
  ) => void
  onResetPermissions: (vm: PublishPodVM, index: number) => void
  onUpdateVirtualMachinesChange: (vmIds: Array<string>) => void
  updateVirtualMachines: Array<string>
  virtualMachines: Array<PublishPodVM>
}

function PublishPodVirtualMachinesTable({
  canUpdatePodTemplates,
  onPermissionChange,
  onResetPermissions,
  onUpdateVirtualMachinesChange,
  updateVirtualMachines,
  virtualMachines,
}: PublishPodVirtualMachinesTableProps) {
  const [expanded, setExpanded] = React.useState<ExpandedState>({})
  const rows = React.useMemo<Array<PublishPodVMRow>>(
    () => virtualMachines.map((vm, index) => ({ index, vm })),
    [virtualMachines]
  )
  const rowSelection = React.useMemo<RowSelectionState>(() => {
    if (!canUpdatePodTemplates) {
      return {}
    }

    return Object.fromEntries(updateVirtualMachines.map((vmId) => [vmId, true]))
  }, [canUpdatePodTemplates, updateVirtualMachines])

  const columns = React.useMemo<Array<ColumnDef<PublishPodVMRow>>>(
    () => [
      ...(canUpdatePodTemplates
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
            <IconDeviceDesktop className="size-4 text-muted-foreground" />
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
        cell: ({ row }) => `${row.original.vm.memoryGb} GB`,
      },
      {
        id: "storage",
        header: "Storage",
        cell: ({ row }) => `${row.original.vm.storageGb} GB`,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          canUpdatePodTemplates &&
          updateVirtualMachines.includes(row.original.vm.id) ? (
            <span className="text-muted-foreground">Queued for update</span>
          ) : (
            <span className="text-muted-foreground">Current</span>
          ),
      },
      {
        id: "expand",
        header: () => <div className="text-right">Permissions</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`${row.getIsExpanded() ? "Hide" : "Show"} permissions for ${row.original.vm.name}`}
              onClick={row.getToggleExpandedHandler()}
            >
              {row.getIsExpanded() ? (
                <>
                  Hide
                  <IconChevronDown data-icon="inline-end" />
                </>
              ) : (
                <>
                  Edit
                  <IconChevronRight data-icon="inline-end" />
                </>
              )}
            </Button>
          </div>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [canUpdatePodTemplates, updateVirtualMachines]
  )

  const table = useReactTable({
    data: rows,
    columns,
    enableRowSelection: canUpdatePodTemplates,
    getExpandedRowModel: getExpandedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.vm.id,
    getRowCanExpand: () => true,
    onExpandedChange: setExpanded,
    onRowSelectionChange: (updater) => {
      const nextSelection =
        typeof updater === "function" ? updater(rowSelection) : updater
      onUpdateVirtualMachinesChange(
        Object.entries(nextSelection).flatMap(([vmId, selected]) =>
          selected ? [vmId] : []
        )
      )
    },
    state: {
      expanded,
      rowSelection,
    },
  })

  return (
    <div className="overflow-hidden rounded-3xl border">
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
              <React.Fragment key={row.id}>
                <TableRow data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                {row.getIsExpanded() ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns.length}>
                      <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pb-4">
                          <div className="min-w-0">
                            <p className="text-lg font-semibold tracking-tight">
                              Permissions for {row.original.vm.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Choose the default access users receive when they
                              clone this VM.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              onResetPermissions(
                                row.original.vm,
                                row.original.index
                              )
                            }
                          >
                            <IconRefresh data-icon="inline-start" />
                            Reset to defaults
                          </Button>
                        </div>
                        <PermissionScopeSection
                          onPermissionChange={(bit, state) =>
                            onPermissionChange(
                              row.original.vm,
                              row.original.index,
                              bit,
                              state
                            )
                          }
                          permissionGroups={publishVmPermissionGroups}
                          principal={createEditingVmPrincipal(row.original.vm)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No Pod VMs found.
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
  podFolders,
  podFoldersError,
}: PublishPodVirtualMachinesStepProps) {
  const [initialPodFolder] = React.useState(() =>
    form.getFieldValue("source_folder")
  )

  const handleVmPermissionChange = React.useCallback(
    (_vm: PublishPodVM, vmIndex: number, bit: number, state: PermissionState) =>
      form.setFieldValue(
        "virtual_machines",
        form.getFieldValue("virtual_machines").map((vm, index) =>
          index === vmIndex
            ? {
                ...vm,
                permissions: setPermissionState(vm.permissions, bit, state),
              }
            : vm
        )
      ),
    [form]
  )

  const handleUpdateVirtualMachinesChange = React.useCallback(
    (vmIds: Array<string>) =>
      form.setFieldValue("update_virtual_machines", vmIds),
    [form]
  )

  const handleResetVmPermissions = React.useCallback(
    (_vm: PublishPodVM, vmIndex: number) =>
      form.setFieldValue(
        "virtual_machines",
        form.getFieldValue("virtual_machines").map((vm, index) =>
          index === vmIndex
            ? {
                ...vm,
                permissions: createDefaultPublishPodVmPermissions(),
              }
            : vm
        )
      ),
    [form]
  )

  return (
    <PublishPodStepLayout form={form}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconDeviceDesktop className="size-5 text-muted-foreground" />
            Pod VMs
          </CardTitle>
          <CardDescription>
            Choose the Pod Folder, review the included VMs, and adjust their
            default permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t pt-6">
          <FieldGroup>
            <form.Field name="source_folder">
              {(field) => {
                const showValidation =
                  field.state.meta.isTouched || submissionAttempts > 0
                const isInvalid = showValidation && !field.state.meta.isValid
                const selectedPodFolder =
                  podFolders.find(
                    (folder) => folder.id === field.state.value
                  ) ?? null
                const canUpdatePodTemplates =
                  isEditing &&
                  !!field.state.value &&
                  field.state.value === initialPodFolder

                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel>Pod Folder</FieldLabel>
                    <FieldDescription>
                      Contains the VMs creators edit and configure. These VMs
                      are untouched and available to make edits whenever needed.
                    </FieldDescription>
                    <FieldContent>
                      <Combobox
                        items={podFolders}
                        itemToStringLabel={(folder) => folder.name}
                        itemToStringValue={(folder) => folder.name}
                        value={selectedPodFolder}
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
                            form.setFieldValue("update_virtual_machines", [])
                          }

                          if (!nextFolderID) {
                            form.setFieldValue("virtual_machines", [])
                            form.setFieldValue("update_virtual_machines", [])
                          }
                        }}
                        autoHighlight
                      >
                        <ComboboxInput
                          name={field.name}
                          placeholder="Select Pod Folder"
                          onBlur={field.handleBlur}
                          aria-invalid={isInvalid || undefined}
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No Pod Folders found.</ComboboxEmpty>
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
                      <FieldError
                        errors={showValidation ? field.state.meta.errors : []}
                      />
                      {podFoldersError ? (
                        <InlineErrorAlert
                          error={podFoldersError}
                          fallback="Failed to load Pod Folders."
                          className="mt-3"
                        />
                      ) : null}
                      <div className="flex flex-col gap-1 pt-4">
                        <p className="font-medium">Pod VMs</p>
                        <span className="pb-3 text-muted-foreground">
                          Default VM access includes view, console, power, and
                          snapshot actions.
                        </span>
                        {field.state.value ? (
                          <form.Subscribe
                            selector={(state) => ({
                              updateVirtualMachines:
                                state.values.update_virtual_machines,
                              virtualMachines: state.values.virtual_machines,
                            })}
                          >
                            {({ updateVirtualMachines, virtualMachines }) => (
                              <>
                                {canUpdatePodTemplates ? (
                                  <Alert className="mb-3">
                                    <IconInfoCircle />
                                    <AlertTitle>
                                      Update Pod Template Folder
                                    </AlertTitle>
                                    <AlertDescription>
                                      Selected Pod VMs will have their Pod
                                      Template VMs rebuilt in the Pod Template
                                      Folder when you save. Existing clones keep
                                      their current Cloned Pod VMs until users
                                      clone the pod again.
                                    </AlertDescription>
                                  </Alert>
                                ) : null}
                                <PublishPodVirtualMachinesTable
                                  canUpdatePodTemplates={canUpdatePodTemplates}
                                  onPermissionChange={handleVmPermissionChange}
                                  onResetPermissions={handleResetVmPermissions}
                                  onUpdateVirtualMachinesChange={
                                    handleUpdateVirtualMachinesChange
                                  }
                                  updateVirtualMachines={updateVirtualMachines}
                                  virtualMachines={virtualMachines}
                                />
                              </>
                            )}
                          </form.Subscribe>
                        ) : (
                          <Empty className="border border-dashed">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <IconFolderOpen className="text-muted-foreground" />
                              </EmptyMedia>
                              <EmptyTitle>No Pod Folder selected</EmptyTitle>
                              <EmptyDescription>
                                Select a Pod Folder to preview the Pod VMs that
                                will be included in this pod.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
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
  )
}
