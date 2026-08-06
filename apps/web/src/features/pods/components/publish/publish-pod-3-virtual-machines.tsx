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
import { Input } from "@workspace/ui/components/input"
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
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ComputerIcon,
  FolderOpenIcon,
  InformationCircleIcon,
  ReloadIcon,
} from "@hugeicons/core-free-icons"
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
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"
import type {
  DraftPrincipal,
  PermissionState,
} from "@/features/inventory/types/inventory-types"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { PermissionScopeSection } from "@/features/inventory/components/permissions/permission-scope-section"
import { setPermissionState } from "@/features/inventory/utils/acl-transformers"
import { getInventoryPermissionDefinitionsByGroup } from "@/features/inventory/utils/inventory-permissions"
import {
  getPublishNetworkProfileLabel,
  getPublishVmNetworkLabel,
} from "@/features/pods/utils/pod-networking"

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
  cloneTargets: Array<PodCloneTarget>
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

function validatePublishPodHostOctetOnBlur(value: number | null | undefined) {
  if (value == null) return undefined
  if (!Number.isInteger(value) || value < 2 || value > 254) {
    return { message: "Host octet must be between 2 and 254." }
  }
  return undefined
}

function PublishPodVmHostOctetField({
  form,
  index,
  vmName,
}: {
  form: PublishPodFormApi
  index: number
  vmName: string
}) {
  return (
    <form.Field
      name={`virtual_machines[${index}].host_octet`}
      validators={{
        onBlur: ({ value }) => validatePublishPodHostOctetOnBlur(value),
      }}
    >
      {(field) => {
        const isInvalid = field.state.meta.errors.length > 0
        const fieldId = `publish-pod-vm-host-octet-${index}`

        return (
          <Field className="w-24 gap-1" data-invalid={isInvalid || undefined}>
            <FieldLabel htmlFor={fieldId} className="sr-only">
              Host octet for {vmName}
            </FieldLabel>
            <Input
              id={fieldId}
              name={field.name}
              type="number"
              min={2}
              max={254}
              step={1}
              placeholder="Optional"
              value={field.state.value ?? ""}
              onBlur={field.handleBlur}
              onChange={(event) => {
                const raw = event.target.value
                field.handleChange(raw === "" ? null : Number(raw))
              }}
              aria-invalid={isInvalid || undefined}
              data-invalid={isInvalid || undefined}
            />
            <FieldError errors={field.state.meta.errors} />
          </Field>
        )
      }}
    </form.Field>
  )
}

type PublishPodVirtualMachinesTableProps = {
  canUpdatePodTemplates: boolean
  form: PublishPodFormApi
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
  form,
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
            <HugeiconsIcon
              icon={ComputerIcon}
              className="size-4 text-muted-foreground"
            />
            <span className="truncate font-medium">{row.original.vm.name}</span>
          </div>
        ),
      },
      {
        id: "network",
        header: "Network",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {getPublishVmNetworkLabel(row.original.vm)}
          </span>
        ),
      },
      {
        id: "host_octet",
        header: "Host octet",
        cell: ({ row }) =>
          row.original.vm.is_router ? (
            <span className="text-muted-foreground" aria-hidden="true">
              —
            </span>
          ) : (
            <PublishPodVmHostOctetField
              form={form}
              index={row.original.index}
              vmName={row.original.vm.name}
            />
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
                  <HugeiconsIcon
                    icon={ChevronDownIcon}
                    data-icon="inline-end"
                  />
                </>
              ) : (
                <>
                  Edit
                  <HugeiconsIcon
                    icon={ChevronRightIcon}
                    data-icon="inline-end"
                  />
                </>
              )}
            </Button>
          </div>
        ),
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [canUpdatePodTemplates, form, updateVirtualMachines]
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
                            <HugeiconsIcon
                              icon={ReloadIcon}
                              data-icon="inline-start"
                            />
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
  cloneTargets,
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
            <HugeiconsIcon
              icon={ComputerIcon}
              className="size-5 text-muted-foreground"
            />
            Pod VMs
          </CardTitle>
          <CardDescription>
            Choose the Pod Folder, review the included VMs, and adjust their
            default permissions and optional host octets.
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
                                    {` · ${getPublishNetworkProfileLabel(folder.network_profile_key)}`}
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
                                    <HugeiconsIcon
                                      icon={InformationCircleIcon}
                                    />
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
                                  form={form}
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
                                <HugeiconsIcon
                                  icon={FolderOpenIcon}
                                  className="text-muted-foreground"
                                />
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

            <form.Field name="clone_target_key">
              {(field) => {
                const defaultTarget =
                  cloneTargets.find((target) => target.is_default) ?? null
                const selectedTarget =
                  cloneTargets.find(
                    (target) => target.key === field.state.value
                  ) ?? defaultTarget

                return (
                  <Field>
                    <FieldLabel>Clone Target</FieldLabel>
                    <FieldDescription>
                      Subnet and bridge that clones of this pod are placed on.
                      Users never choose this.
                    </FieldDescription>
                    <FieldContent>
                      <Combobox
                        items={cloneTargets}
                        itemToStringLabel={(target) => target.label}
                        itemToStringValue={(target) => target.label}
                        value={selectedTarget}
                        onValueChange={(target) =>
                          field.handleChange(target?.key ?? "")
                        }
                        autoHighlight
                      >
                        <ComboboxInput
                          name={field.name}
                          placeholder="Select Clone Target"
                          onBlur={field.handleBlur}
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>
                            No Clone Targets found.
                          </ComboboxEmpty>
                          <ComboboxList>
                            {(target) => (
                              <ComboboxItem key={target.key} value={target}>
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">
                                    {target.label}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {`${target.lan_vnet} · ${target.wan_bridge} · ${target.wan_subnet}`}
                                  </span>
                                </span>
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
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
