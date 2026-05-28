import React from "react"
import { Button } from "@workspace/ui/components/button"
import { IconPlus } from "@tabler/icons-react"
import { CreatePodFormSection } from "./create-pod-form-section"
import { useCreatePodForm } from "./create-pod-form"
import { CreatePodPersonalizeSection } from "./create-pod-personalize-section"
import { CreatePodReviewSection } from "./create-pod-review-section"
import { CreatePodVirtualMachinesSection } from "./create-pod-virtual-machines-section"

export function CreatePodPage() {
  const [submissionAttempts, setSubmissionAttempts] = React.useState(0)
  const form = useCreatePodForm()

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-balance">
            Create Pod
          </h1>
          <p className="text-muted-foreground">
            Initialize a foundation for your pod by using virutal machine
            templates, simplified networking configurations, and more.
          </p>
        </div>
        <form
          className="flex w-full max-w-5xl flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmissionAttempts((attempts) => attempts + 1)
            form.handleSubmit()
          }}
        >
          <CreatePodFormSection number={1} title="Personalize">
            <CreatePodPersonalizeSection
              form={form}
              submissionAttempts={submissionAttempts}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={2} title="Virtual Machines">
            <CreatePodVirtualMachinesSection
              form={form}
              submissionAttempts={submissionAttempts}
            />
          </CreatePodFormSection>

          <CreatePodFormSection number={3} title="Review" isLast>
            <CreatePodReviewSection form={form} />
          </CreatePodFormSection>

          <div className="flex justify-end pl-12">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconPlus data-icon="inline-start" />
                  {isSubmitting ? "Creating..." : "Create"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  )
}
