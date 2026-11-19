import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  createSnapshotRequestSchema,
  directSnapshotSchema,
  generateSnapshotName,
} from "@/lib/vms/snapshot-form"
import {
  getCreateSnapshotToastOptions,
  getSubmitSnapshotRequestToastOptions,
} from "@/lib/vms/vm-toasts"
import {
  useCreateSnapshot,
  useSubmitInventorySnapshotCreateRequest,
} from "@/hooks/vms/use-vm-actions"
import { Camera01Icon } from "@hugeicons/core-free-icons"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import type { SnapshotDialogMode } from "@/lib/vms/vm-types"
import { formatVmReference } from "@/lib/vms/vm-reference"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useDialogSessionKey } from "@/hooks/dialogs/use-dialog-session-key"
import { useForm } from "@tanstack/react-form"

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
  const sessionKey = useDialogSessionKey({ open })

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
        key={sessionKey}
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

      showSingleMutationToast(
        getCreateSnapshotToastOptions(
          create.mutateAsync({
            itemId,
            snapname: parsed.snapname,
            description: parsed.description || undefined,
            vmstate: isLxc ? false : parsed.vmstate,
          }),
          parsed.snapname
        )
      )
    },
  })

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <AppDialogScrollBody>
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
                    aria-errormessage={
                      isInvalid ? "snapshot-name-error" : undefined
                    }
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {isInvalid && (
                    <FieldError
                      id="snapshot-name-error"
                      errors={field.state.meta.errors}
                    />
                  )}
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
      </AppDialogScrollBody>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton pending={isSubmitting}>
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
  const sessionKey = useDialogSessionKey({ open })

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
        key={sessionKey}
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

      showSingleMutationToast(
        getSubmitSnapshotRequestToastOptions(
          submitCreateRequest.mutateAsync({
            itemId,
            snapname: parsed.snapname,
          }),
          parsed.snapname
        )
      )
    },
  })

  return (
    <form
      action={() => {
        void form.handleSubmit()
      }}
    >
      <AppDialogScrollBody>
        <FieldGroup>
          <form.Field name="snapname">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="request-snapname">
                    Snapshot name
                  </FieldLabel>
                  <Input
                    id="request-snapname"
                    placeholder="snapshot-2026-04-22T15-04-05Z"
                    aria-invalid={isInvalid}
                    aria-errormessage={
                      isInvalid ? "request-snapshot-name-error" : undefined
                    }
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {isInvalid && (
                    <FieldError
                      id="request-snapshot-name-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
      </AppDialogScrollBody>
      <DialogFooter>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <AppDialogPrimaryButton pending={isSubmitting}>
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
