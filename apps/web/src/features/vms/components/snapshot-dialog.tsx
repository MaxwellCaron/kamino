import { useRef } from "react"
import { useForm } from "@tanstack/react-form"
import { Camera01Icon } from "@hugeicons/core-free-icons"
import { z } from "zod"
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
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import {
  useCreateSnapshot,
  useSubmitInventorySnapshotCreateRequest,
} from "@/features/vms/hooks/use-vm-actions"
import {
  toastCreateSnapshot,
  toastSubmitSnapshotRequest,
} from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/format"

const generateSnapshotName = () =>
  `snapshot-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z`

const snapshotNameSchema = z
  .string()
  .trim()
  .min(1, "Snapshot name is required")
  .max(40, "Snapshot name must be 40 characters or less")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    "Must start with a letter and contain only letters, numbers, hyphens, and underscores"
  )

const directSnapshotSchema = z.object({
  snapname: snapshotNameSchema,
  description: z
    .string()
    .trim()
    .max(256, "Description must be 256 characters or less"),
  vmstate: z.boolean(),
})

const createSnapshotRequestSchema = z.object({
  snapname: snapshotNameSchema,
})

export type SnapshotDialogMode = "direct" | "request"

type SnapshotDialogProps = {
  itemId: string
  vmid?: number
  vmName?: string
  guestType?: "qemu" | "lxc"
  mode?: SnapshotDialogMode
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DirectSnapshotDialog({
  itemId,
  vmid,
  vmName,
  guestType,
  open,
  onOpenChange,
}: SnapshotDialogProps) {
  const sessionKeyRef = useRef(0)
  const prevOpenRef = useRef(open)

  if (open && !prevOpenRef.current) {
    sessionKeyRef.current += 1
  }
  prevOpenRef.current = open

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Camera01Icon}
      title="Snapshot"
      description={`Take a point-in-time snapshot for ${formatVmReference(
        vmid,
        vmName
      )}.`}
    >
      <DirectSnapshotForm
        key={sessionKeyRef.current}
        itemId={itemId}
        guestType={guestType}
        onOpenChange={onOpenChange}
      />
    </AppDialog>
  )
}

function DirectSnapshotForm({
  itemId,
  guestType,
  onOpenChange,
}: Pick<SnapshotDialogProps, "itemId" | "guestType" | "onOpenChange">) {
  const create = useCreateSnapshot(itemId)
  const isLxc = guestType === "lxc"

  const form = useForm({
    defaultValues: {
      snapname: generateSnapshotName(),
      description: "",
      vmstate: false,
    },
    validators: {
      onSubmit: directSnapshotSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = directSnapshotSchema.parse(value)
      onOpenChange(false)

      toastCreateSnapshot(
        create.mutateAsync({
          itemId,
          snapname: parsed.snapname,
          description: parsed.description || undefined,
          vmstate: isLxc ? false : parsed.vmstate,
        }),
        parsed.snapname
      )
    },
  })

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="snapname">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="snapname">Name</FieldLabel>
                <Input
                  id="snapname"
                  placeholder="my-snapshot"
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
        <form.Field name="description">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <CountedTextareaField
                id="description"
                label="Description"
                placeholder="Optional description..."
                isInvalid={isInvalid}
                value={field.state.value}
                onValueChange={field.handleChange}
                onBlur={field.handleBlur}
                maxLength={256}
                className="max-h-100"
                errors={isInvalid ? field.state.meta.errors : []}
              />
            )
          }}
        </form.Field>
        {!isLxc && (
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
        )}
      </FieldGroup>
      <DialogFooter className="mt-6">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton
              pending={isSubmitting}
              pendingLabel="Creating..."
            >
              Create
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

function RequestSnapshotDialog({
  itemId,
  vmid,
  vmName,
  open,
  onOpenChange,
}: SnapshotDialogProps) {
  const sessionKeyRef = useRef(0)
  const prevOpenRef = useRef(open)

  if (open && !prevOpenRef.current) {
    sessionKeyRef.current += 1
  }
  prevOpenRef.current = open

  const vmReference = formatVmReference(vmid, vmName)

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={Camera01Icon}
      title="Snapshot"
      description={`Approval required. Taking a snapshot for ${vmReference} will be added to the queue for review.`}
    >
      <RequestSnapshotForm
        key={sessionKeyRef.current}
        itemId={itemId}
        onOpenChange={onOpenChange}
      />
    </AppDialog>
  )
}

function RequestSnapshotForm({
  itemId,
  onOpenChange,
}: Pick<SnapshotDialogProps, "itemId" | "onOpenChange">) {
  const submitCreateRequest = useSubmitInventorySnapshotCreateRequest()

  const form = useForm({
    defaultValues: {
      snapname: generateSnapshotName(),
    },
    validators: {
      onSubmit: createSnapshotRequestSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = createSnapshotRequestSchema.parse(value)
      onOpenChange(false)

      toastSubmitSnapshotRequest(
        submitCreateRequest.mutateAsync({
          itemId,
          snapname: parsed.snapname,
        }),
        parsed.snapname
      )
    },
  })

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="snapname">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <Input
                  id="request-snapname"
                  placeholder="snapshot-2026-04-22T15-04-05Z"
                  aria-invalid={isInvalid}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
      <DialogFooter className="mt-6">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton
              pending={isSubmitting}
              pendingLabel="Submitting..."
            >
              Submit
            </AppDialogPrimaryButton>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

export function SnapshotDialog(props: SnapshotDialogProps) {
  if (props.mode === "request") {
    return <RequestSnapshotDialog {...props} />
  }

  return <DirectSnapshotDialog {...props} />
}
