import {
  createDefaultCreatePodValues,
  createPodFormSchema,
} from "@/lib/pods/create/create-pod-form"
import type { CreatePodFormValues } from "@/lib/pods/create/create-pod-form"
import { useForm } from "@tanstack/react-form"
import { useMemo } from "react"

type UseCreatePodFormOptions = {
  defaultValues?: CreatePodFormValues
  onSubmit?: (values: CreatePodFormValues) => Promise<void> | void
}

export function useCreatePodForm({
  defaultValues: providedDefaultValues,
  onSubmit,
}: UseCreatePodFormOptions = {}) {
  const fallbackDefaultValues = useMemo(createDefaultCreatePodValues, [])
  const defaultValues = providedDefaultValues ?? fallbackDefaultValues

  return useForm({
    defaultValues,
    validators: {
      onChange: createPodFormSchema,
      onSubmit: createPodFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit?.(createPodFormSchema.parse(value))
    },
  })
}

export type CreatePodFormApi = ReturnType<typeof useCreatePodForm>
