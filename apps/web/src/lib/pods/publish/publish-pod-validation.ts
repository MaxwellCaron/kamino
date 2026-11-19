import type { AnyFieldLikeMetaBase, DeepKeys } from "@tanstack/react-form"
import type { PublishPodFormValues } from "@/lib/pods/publish/publish-pod-form"
import type { PublishPodStep } from "@/lib/pods/publish/publish-pod-steps"
import { steps } from "@/lib/pods/publish/publish-pod-steps"

type PublishPodFieldPath = DeepKeys<PublishPodFormValues>
type PublishPodValidationErrors = Record<string, unknown>

type PublishPodValidationForm = {
  getFieldMeta: (
    field: PublishPodFieldPath
  ) => { errors: ReadonlyArray<unknown> } | undefined
  setFieldMeta: (
    field: PublishPodFieldPath,
    updater: (meta: AnyFieldLikeMetaBase) => AnyFieldLikeMetaBase
  ) => void
  getFieldValue: (field: "tasks") => PublishPodFormValues["tasks"]
  validate: (
    cause: "submit"
  ) => PublishPodValidationErrors | Promise<PublishPodValidationErrors>
  validateField: (field: PublishPodFieldPath, cause: "submit") => unknown
  validateArrayFieldsStartingFrom: (
    field: "tasks",
    index: number,
    cause: "submit"
  ) => unknown
}

function hasFieldErrors(
  form: PublishPodValidationForm,
  fields: Array<PublishPodFieldPath>
) {
  return fields.some(
    (field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0
  )
}

function markFieldsTouched(
  form: PublishPodValidationForm,
  fields: Array<PublishPodFieldPath>
) {
  fields.forEach((field) => {
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      isTouched: true,
    }))
  })
}

function getTaskFieldPaths(form: PublishPodValidationForm) {
  const tasks = form.getFieldValue("tasks")
  const fields: Array<PublishPodFieldPath> = ["tasks"]

  tasks.forEach((task, taskIndex) => {
    fields.push(
      `tasks[${taskIndex}].title` as PublishPodFieldPath,
      `tasks[${taskIndex}].content` as PublishPodFieldPath
    )

    task.questions.forEach((_, questionIndex) => {
      fields.push(
        `tasks[${taskIndex}].questions[${questionIndex}].title` as PublishPodFieldPath,
        `tasks[${taskIndex}].questions[${questionIndex}].answerOutline` as PublishPodFieldPath,
        `tasks[${taskIndex}].questions[${questionIndex}].hint` as PublishPodFieldPath
      )
    })
  })

  return fields
}

function getSubmitFieldPaths(form: PublishPodValidationForm) {
  const fields = steps.flatMap((s) => s.fields) as Array<PublishPodFieldPath>
  return [...fields, ...getTaskFieldPaths(form)]
}

function firstInvalidStepFromErrors(
  errors: PublishPodValidationErrors
): PublishPodStep {
  const errorKeys = Object.keys(errors)
  const hasErrorFor = (fields: ReadonlyArray<string>) =>
    errorKeys.some((key) =>
      fields.some((field) => key === field || key.startsWith(`${field}[`))
    )

  return steps.find((s) => hasErrorFor(s.fields))?.value ?? "preview"
}

export async function validateFormForSubmit(
  form: PublishPodValidationForm,
  setStep: (step: PublishPodStep) => void
) {
  const errors = await form.validate("submit")

  const tasks = form.getFieldValue("tasks")
  if (tasks.length > 0) {
    await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
  }

  const submitFields = getSubmitFieldPaths(form)
  const isValid =
    Object.keys(errors).length === 0 && !hasFieldErrors(form, submitFields)

  if (!isValid) {
    markFieldsTouched(form, submitFields)
    setStep(firstInvalidStepFromErrors(errors))
  }

  return isValid
}

export async function validateStep(
  form: PublishPodValidationForm,
  step: PublishPodStep
) {
  const fields = (steps.find((s) => s.value === step)?.fields ??
    []) as Array<PublishPodFieldPath>

  await Promise.all(fields.map((field) => form.validateField(field, "submit")))

  if (step === "tasks") {
    const tasks = form.getFieldValue("tasks")
    if (tasks.length > 0) {
      await form.validateArrayFieldsStartingFrom("tasks", 0, "submit")
    }
  }

  const blockingFields = step === "tasks" ? getTaskFieldPaths(form) : fields
  if (hasFieldErrors(form, blockingFields)) {
    markFieldsTouched(form, blockingFields)
    return false
  }

  return true
}
