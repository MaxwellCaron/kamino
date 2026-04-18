import { useEffect, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDeviceImac,
  IconUpload,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperList,
  StepperNext,
  StepperPrev,
  StepperSeparator,
  StepperTrigger,
} from "@workspace/ui/components/stepper"
import {
  CreateVmConfigurationStep,
  CreateVmMethodStep,
  CreateVmSummaryStep,
} from "./create-vm-steps"
import {
  createVmFormOptions,
  createVmFormSchema,
  getSelectedTemplate,
  getVmTemplateOptions,
  toCreateVmParams,
  useCreateVmForm,
} from "./create-vm-form"
import type { CreateVmFormValues } from "./create-vm-form"
import {
  getInventoryFolderOptions,
  getSelectedFolder,
} from "@/lib/inventory-tree"
import {
  cloneVM,
  createVM,
  createVmIsosQueryOptions,
  createVmOptionsQueryOptions,
  inventoryTreeQueryOptions,
  seedInventoryItemCache,
} from "@/lib/queries"

const steps = [
  { value: "method", title: "Method" },
  { value: "configuration", title: "Configuration" },
  { value: "confirmation", title: "Summary" },
] as const

type StepValue = (typeof steps)[number]["value"]

function getTemplateCloneName(
  values: CreateVmFormValues,
  templateName: string | undefined
) {
  return values.name.trim() || templateName || `vm-${values.vmid}`
}

export function CreateVmDialog({
  open,
  onOpenChange,
  initialFolderId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialFolderId: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<StepValue>("method")
  const didPrefillTargetFolder = useRef(false)

  const form = useCreateVmForm({
    ...createVmFormOptions,
    onSubmit: ({ value }) => {
      const parsed = createVmFormSchema.parse(value)
      const selectedTemplate = getSelectedTemplate(
        templateOptions,
        parsed.template_id ?? ""
      )

      const promise =
        parsed.method === "template"
          ? (() => {
              if (!selectedTemplate) {
                throw new Error("Select a template before cloning.")
              }

              return mutation.mutateAsync(parsed)
            })()
          : parsed.method === "iso"
            ? mutation.mutateAsync(parsed)
            : Promise.reject(
                new Error("Upload-backed VM creation is not implemented yet.")
              )

      toast.promise(promise, {
        loading:
          parsed.method === "template"
            ? `Cloning template ${selectedTemplate?.name ?? "template"}…`
            : parsed.method === "iso"
              ? `Creating VM…`
              : "Preparing upload workflow…",
        success: (result) => {
          if (parsed.method === "template") {
            return `Template cloned to ${result.vmid}`
          }
          if (parsed.method === "iso") {
            return `VM ${result.vmid} created`
          }
          return "Upload workflow ready"
        },
        error: (error: Error) => error.message,
      })
    },
  })

  const method = useStore(form.store, (state) => state.values.method)
  const selectedIsoStorage = useStore(
    form.store,
    (state) => state.values.iso_storage ?? ""
  )

  function resetDialog() {
    form.reset()
    setStep("method")
  }

  const { data: inventoryTree = [] } = useQuery({
    ...inventoryTreeQueryOptions,
    enabled: open,
  })
  const templateOptions = getVmTemplateOptions(inventoryTree)
  const folderOptions = getInventoryFolderOptions(inventoryTree)
  const { data: createOptions } = useQuery({
    ...createVmOptionsQueryOptions,
    enabled: open,
  })
  const { data: isos } = useQuery({
    ...createVmIsosQueryOptions(selectedIsoStorage),
    enabled: open && !!selectedIsoStorage,
  })
  const nodes = createOptions?.nodes ?? []
  const diskStorages = createOptions?.disk_storages ?? []
  const isoStorages = createOptions?.iso_storages ?? []
  const networks = createOptions
    ? { bridges: createOptions.bridges, vnets: createOptions.vnets }
    : undefined

  const mutation = useMutation({
    mutationFn: async (values: CreateVmFormValues) => {
      if (values.method === "template") {
        const selectedTemplate = getSelectedTemplate(
          templateOptions,
          values.template_id ?? ""
        )

        if (!selectedTemplate) {
          throw new Error("Select a template before cloning.")
        }

        return cloneVM({
          node: selectedTemplate.node,
          vmid: selectedTemplate.vmid,
          newid: values.vmid,
          name: getTemplateCloneName(values, selectedTemplate.name),
          full: values.full_clone,
          target: values.node || undefined,
          target_folder_id: values.target_folder_id,
        })
      }

      if (values.method === "iso") {
        return createVM(toCreateVmParams(values))
      }

      throw new Error("Upload-backed VM creation is not implemented yet.")
    },
    onSuccess: (result) => {
      seedInventoryItemCache(queryClient, result.item_id, result.item)
      onOpenChange(false)
      navigate({ to: "/vm/$itemId", params: { itemId: result.item_id } })
    },
  })

  useEffect(() => {
    if (!open) {
      didPrefillTargetFolder.current = false
      resetDialog()
    }
  }, [form, open])

  useEffect(() => {
    if (!open || didPrefillTargetFolder.current) return

    form.setFieldValue(
      "target_folder_id",
      getSelectedFolder(folderOptions, initialFolderId)?.id ?? ""
    )
    didPrefillTargetFolder.current = true
  }, [folderOptions, form, initialFolderId, open])

  function handleCreate() {
    if (method === "upload") {
      toast.error("Upload-backed VM creation is not implemented yet.")
      return
    }

    form.handleSubmit()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) {
          resetDialog()
        }
      }}
    >
      <DialogContent initialFocus={false}>
        <Stepper
          value={step}
          onValueChange={(value) => setStep(value as StepValue)}
          onValidate={async (value) => {
            if (step !== "configuration" || value !== "confirmation") {
              return true
            }

            const errors = await form.validate("submit")
            return Object.keys(errors).length === 0
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconDeviceImac className="size-5" />
              Create Virtual Machine
            </DialogTitle>
            <DialogDescription>
              Select a provisioning path, configure the VM, and review the final
              payload before Kamino submits it to Proxmox.
            </DialogDescription>
          </DialogHeader>

          <StepperList className="px-2">
            {steps.map((entry) => (
              <StepperItem key={entry.value} value={entry.value}>
                <StepperTrigger aria-label={entry.title}>
                  <StepperIndicator />
                </StepperTrigger>
                <StepperSeparator />
              </StepperItem>
            ))}
          </StepperList>

          <form
            onSubmit={(event) => {
              event.preventDefault()
            }}
          >
            <div className="no-scrollbar h-[40vh] overflow-y-auto border-y px-1 py-4">
              <StepperContent value="method">
                <CreateVmMethodStep form={form} />
              </StepperContent>

              <StepperContent value="configuration">
                <CreateVmConfigurationStep
                  form={form}
                  templateOptions={templateOptions}
                  nodes={nodes}
                  diskStorages={diskStorages}
                  isoStorages={isoStorages}
                  isos={isos ?? []}
                  networks={networks}
                />
              </StepperContent>

              <StepperContent value="confirmation">
                <CreateVmSummaryStep
                  form={form}
                  folderOptions={folderOptions}
                  templateOptions={templateOptions}
                />
              </StepperContent>
            </div>

            <DialogFooter className="mt-4 grid w-full grid-cols-3 items-center">
              <StepperPrev
                render={
                  <Button type="button" size="icon" variant="outline">
                    <IconArrowLeft />
                  </Button>
                }
              />

              <div className="flex justify-center">
                {step === "confirmation" ? (
                  <Button
                    type="button"
                    disabled={mutation.isPending || method === "upload"}
                    onClick={handleCreate}
                    className="w-full"
                  >
                    {method === "template" ? (
                      <IconCopy data-icon="inline-start" />
                    ) : method === "iso" ? (
                      <IconCheck data-icon="inline-start" />
                    ) : (
                      <IconUpload data-icon="inline-start" />
                    )}
                    {mutation.isPending ? "Creating..." : "Create"}
                  </Button>
                ) : null}
              </div>

              <div className="flex justify-end">
                <StepperNext
                  render={
                    <Button type="button" size="icon" variant="outline">
                      <IconArrowRight />
                    </Button>
                  }
                />
              </div>
            </DialogFooter>
          </form>
        </Stepper>
      </DialogContent>
    </Dialog>
  )
}
