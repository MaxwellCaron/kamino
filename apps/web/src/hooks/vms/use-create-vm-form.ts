import {
  Field,
  createFormHook,
  createFormHookContexts,
  formOptions,
} from "@tanstack/react-form"
import { createVmFormConfig } from "@/lib/vms/create/create-vm-form"

export const createVmFormOptions = formOptions(createVmFormConfig)

const { fieldContext, formContext } = createFormHookContexts()

export const { useAppForm: useCreateVmForm, withForm: withCreateVmForm } =
  createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
      AppField: Field,
    },
    formComponents: {},
  })

export type CreateVmFormApi = ReturnType<typeof useCreateVmForm>
