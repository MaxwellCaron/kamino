import type { PublishPodFormValues } from "@/lib/pods/publish/publish-pod-form"
import { publishPodFormSchema } from "@/lib/pods/publish/publish-pod-form"
import { useForm } from "@tanstack/react-form"

type UsePublishPodFormOptions = {
  defaultValues: PublishPodFormValues
  onSubmit?: (values: PublishPodFormValues) => Promise<void> | void
}

export function usePublishPodForm({
  defaultValues,
  onSubmit,
}: UsePublishPodFormOptions) {
  return useForm({
    defaultValues,
    validators: {
      onSubmit: publishPodFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit?.(publishPodFormSchema.parse(value))
    },
  })
}

export type PublishPodFormApi = ReturnType<typeof usePublishPodForm>
