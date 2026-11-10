import type {
  MutationToastOptions,
  SingleMutationToastOptions,
  UnitMutationToastOptions,
} from "@/lib/mutation-progress-toast"
import {
  getSingleMutationToastOptions,
  getUnitMutationToastOptions,
} from "@/lib/mutation-progress-toast"
import { MutationProgressToast } from "@/components/feedback/mutation-progress-toast-view"
import { toast } from "sonner"

export function showUnitMutationToast(
  params: UnitMutationToastOptions
): string | number {
  return showMutationToast(getUnitMutationToastOptions(params))
}

export function showSingleMutationToast(
  params: SingleMutationToastOptions
): string | number {
  return showMutationToast(getSingleMutationToastOptions(params))
}

function showMutationToast(params: MutationToastOptions): string | number {
  return toast.custom(
    (id) => (
      <MutationProgressToast
        toastId={id}
        title={params.title}
        progressItems={params.progressItems}
        items={params.items}
        runMutation={params.runMutation}
      />
    ),
    { duration: Infinity, className: "w-96" }
  )
}
