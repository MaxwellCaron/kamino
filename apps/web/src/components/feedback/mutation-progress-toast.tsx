import { toast } from "sonner"
import { MutationProgressToast } from "@/components/feedback/mutation-progress-toast-view"

export type MutationToastItem = {
  id: string
  name: string
  successDescription?: string
  retry?: () => Promise<unknown>
}

export type MutationResult = {
  succeeded: Array<string>
  failed: Array<{ id: string; error: string }>
}

export function showMutationToast(params: {
  title: string
  items: Array<MutationToastItem>
  runMutation: () => Promise<MutationResult>
}): string | number {
  return toast.custom(
    (id) => (
      <MutationProgressToast
        toastId={id}
        title={params.title}
        items={params.items}
        runMutation={params.runMutation}
      />
    ),
    { duration: Infinity, className: "w-96" }
  )
}

export function showSingleMutationToast(params: {
  title: string
  name: string
  promise: Promise<unknown> | (() => Promise<unknown>)
  successDescription?: string
}): string | number {
  let runSingleMutation: () => Promise<unknown>
  const promise = params.promise

  if (typeof promise === "function") {
    runSingleMutation = promise
  } else {
    runSingleMutation = () => promise
  }

  return showMutationToast({
    title: params.title,
    items: [
      {
        id: "single",
        name: params.name,
        successDescription: params.successDescription,
        retry: typeof promise === "function" ? runSingleMutation : undefined,
      },
    ],
    runMutation: async () => {
      try {
        await runSingleMutation()
        return { succeeded: ["single"], failed: [] }
      } catch (error) {
        return {
          succeeded: [],
          failed: [
            {
              id: "single",
              error: error instanceof Error ? error.message : "Failed",
            },
          ],
        }
      }
    },
  })
}
