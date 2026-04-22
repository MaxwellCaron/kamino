import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import { IconCamera, IconHistory } from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import {
  useCreateSnapshot,
  useSubmitInventorySnapshotCreateRequest,
  useSubmitInventorySnapshotRollbackRequest,
} from "@/hooks/use-vm-actions"
import { formatVmReference } from "@/lib/utils"

const directSnapshotSchema = z.object({
  snapname: z
    .string()
    .min(1, "Snapshot name is required")
    .max(40, "Snapshot name must be 40 characters or less")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Must start with a letter and contain only letters, numbers, hyphens, and underscores"
    ),
  description: z
    .string()
    .max(256, "Description must be 256 characters or less")
    .optional(),
  vmstate: z.boolean().optional(),
})

const rollbackSnapshotRequestSchema = z.object({
  snapname: z.string().trim().min(1, "Snapshot name is required"),
})

export type SnapshotDialogMode = "direct" | "request"

type SnapshotDialogProps = {
  itemId: string
  vmid?: number
  vmName?: string
  mode?: SnapshotDialogMode
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DirectSnapshotDialog({
  itemId,
  vmid,
  vmName,
  open,
  onOpenChange,
}: SnapshotDialogProps) {
  const create = useCreateSnapshot(itemId)

  const form = useForm({
    defaultValues: {
      snapname: "",
      description: "",
      vmstate: false,
    },
    onSubmit: ({ value }) => {
      const parsed = directSnapshotSchema.parse(value)
      const promise = create.mutateAsync({
        itemId,
        snapname: parsed.snapname,
        description: parsed.description || undefined,
        vmstate: parsed.vmstate,
      })

      toast.promise(promise, {
        loading: `Creating snapshot "${parsed.snapname}"…`,
        success: `Snapshot "${parsed.snapname}" created`,
        error: (err: Error) => err.message,
      })

      return promise.then(() => {
        onOpenChange(false)
        form.reset()
      })
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={IconCamera}
      title="Snapshot"
      description={`Take a point-in-time snapshot for ${formatVmReference(
        vmid,
        vmName
      )}.`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="snapname"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  directSnapshotSchema.shape.snapname.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="snapname">Name</FieldLabel>
                <Input
                  id="snapname"
                  placeholder="my-snapshot"
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
          <form.Field
            name="description"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  directSnapshotSchema.shape.description.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <span className="font-mono text-xs text-muted-foreground"></span>
                </div>
                <Textarea
                  id="description"
                  placeholder="Optional description..."
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={255}
                />
                <FieldDescription className="text-right font-mono text-xs">
                  {field.state.value.length}/255
                </FieldDescription>
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
          <form.Field name="vmstate">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="vmstate"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(!!checked)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="vmstate">Include VM state</FieldLabel>
                  <FieldDescription>
                    Save the RAM contents along with the snapshot. Uses more
                    storage.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}

function RequestSnapshotDialog({
  itemId,
  vmid,
  vmName,
  open,
  onOpenChange,
}: SnapshotDialogProps) {
  const [activeTab, setActiveTab] = useState<"create" | "rollback">("create")
  const submitCreateRequest = useSubmitInventorySnapshotCreateRequest()
  const submitRollbackRequest = useSubmitInventorySnapshotRollbackRequest()
  const vmReference = formatVmReference(vmid, vmName)

  const rollbackForm = useForm({
    defaultValues: {
      snapname: "",
    },
    onSubmit: ({ value }) => {
      const parsed = rollbackSnapshotRequestSchema.parse(value)
      const promise = submitRollbackRequest.mutateAsync({
        itemId,
        snapname: parsed.snapname,
      })

      toast.promise(promise, {
        loading: `Submitting rollback request for "${parsed.snapname}"…`,
        success: `Rollback request for "${parsed.snapname}" submitted`,
        error: (err: Error) => err.message,
      })

      return promise.then(() => {
        onOpenChange(false)
        rollbackForm.reset()
        setActiveTab("create")
      })
    },
  })

  const resetState = () => {
    rollbackForm.reset()
    setActiveTab("create")
  }

  const handleSubmitCreateRequest = () => {
    const promise = submitCreateRequest.mutateAsync({ itemId })

    toast.promise(promise, {
      loading: `Submitting snapshot request for ${vmReference}…`,
      success: (request) => {
        const generatedName = request.inventory?.snapshot_name
        return generatedName
          ? `Snapshot request "${generatedName}" submitted`
          : "Snapshot request submitted"
      },
      error: (err: Error) => err.message,
    })

    void promise.then(() => {
      onOpenChange(false)
      resetState()
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={resetState}
      initialFocus={false}
      icon={IconCamera}
      title="Snapshot Request"
      description={`Submit a snapshot request for ${vmReference}. Create requests get a backend-generated UTC name, while rollback requests use the exact snapshot name you enter.`}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "create" | "rollback")}
        className="flex flex-col gap-4"
      >
        <TabsList variant="line" className="w-full">
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="rollback">Rollback</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <div className="flex flex-col gap-4">
            <Alert>
              <IconCamera />
              <AlertTitle>Immutable backend-generated payload</AlertTitle>
              <AlertDescription>
                The snapshot name is generated when you submit the request and
                appears in the queue and detail view. No extra fields are
                required here.
              </AlertDescription>
            </Alert>
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Queue</Badge>
                <p className="text-sm font-medium">
                  Create a point-in-time snapshot
                </p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Reviewers approve the request against the current VM state, then
                the snapshot executes automatically.
              </p>
            </div>
            <DialogFooter>
              <AppDialogPrimaryButton
                disabled={submitCreateRequest.isPending}
                onClick={handleSubmitCreateRequest}
              >
                {submitCreateRequest.isPending
                  ? "Submitting..."
                  : "Submit Request"}
              </AppDialogPrimaryButton>
            </DialogFooter>
          </div>
        </TabsContent>

        <TabsContent value="rollback">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              rollbackForm.handleSubmit()
            }}
          >
            <div className="flex flex-col gap-4">
              <Alert>
                <IconHistory />
                <AlertTitle>Exact snapshot name required</AlertTitle>
                <AlertDescription>
                  If snapshot browsing is available on the VM page, pick the
                  name directly from that list. Otherwise, enter the snapshot
                  name exactly as it appears in Proxmox.
                </AlertDescription>
              </Alert>
              <FieldGroup>
                <rollbackForm.Field
                  name="snapname"
                  validators={{
                    onBlur: ({ value }) => {
                      const result =
                        rollbackSnapshotRequestSchema.shape.snapname.safeParse(
                          value
                        )
                      return result.success
                        ? undefined
                        : result.error.issues[0].message
                    },
                  }}
                >
                  {(field) => (
                    <Field
                      data-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    >
                      <FieldLabel htmlFor="rollback-snapname">
                        Snapshot name
                      </FieldLabel>
                      <Input
                        id="rollback-snapname"
                        placeholder="snapshot-2026-04-22T15-04-05Z"
                        aria-invalid={
                          field.state.meta.errors.length > 0 || undefined
                        }
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        onBlur={field.handleBlur}
                      />
                      <FieldDescription>
                        This value becomes part of the immutable request
                        payload.
                      </FieldDescription>
                      <FieldError>{field.state.meta.errors[0]}</FieldError>
                    </Field>
                  )}
                </rollbackForm.Field>
              </FieldGroup>
              <DialogFooter>
                <rollbackForm.Subscribe
                  selector={(state) => state.isSubmitting}
                >
                  {(isSubmitting) => (
                    <AppDialogPrimaryButton disabled={isSubmitting}>
                      {isSubmitting
                        ? "Submitting..."
                        : "Submit Rollback Request"}
                    </AppDialogPrimaryButton>
                  )}
                </rollbackForm.Subscribe>
              </DialogFooter>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </AppDialog>
  )
}

export function SnapshotDialog(props: SnapshotDialogProps) {
  if (props.mode === "request") {
    return <RequestSnapshotDialog {...props} />
  }

  return <DirectSnapshotDialog {...props} />
}
