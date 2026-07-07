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

export type MutationItemUpdate =
  | { id: string; status: "done" }
  | { id: string; status: "error"; error: string }

export type MutationUnitItem = {
  id: string
  name: string
  successDescription?: string
  retry?: () => Promise<unknown>
}

export type MutationUnit = {
  items: Array<MutationUnitItem>
  run: () => Promise<{ failed: Array<{ id: string; error: string }> } | void>
}

export async function runMutationUnits(
  units: Array<MutationUnit>,
  report: (update: MutationItemUpdate) => void,
  concurrency: number
): Promise<MutationResult> {
  const succeeded: Array<string> = []
  const failed: Array<{ id: string; error: string }> = []
  let nextIndex = 0

  async function runUnit(unit: MutationUnit) {
    try {
      const result = await unit.run()
      const errorsById = new Map(
        (result?.failed ?? []).map((entry) => [entry.id, entry.error])
      )

      for (const item of unit.items) {
        const error = errorsById.get(item.id)
        if (error) {
          failed.push({ id: item.id, error })
          report({ id: item.id, status: "error", error })
        } else {
          succeeded.push(item.id)
          report({ id: item.id, status: "done" })
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed"
      for (const item of unit.items) {
        failed.push({ id: item.id, error: message })
        report({ id: item.id, status: "error", error: message })
      }
    }
  }

  const workerCount = Math.min(concurrency, units.length)
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= units.length) {
        return
      }
      await runUnit(units[index])
    }
  })

  await Promise.all(workers)
  return { succeeded, failed }
}

function resolveItemRetry(
  unit: MutationUnit,
  item: MutationUnitItem
): (() => Promise<unknown>) | undefined {
  if ("retry" in item) {
    return item.retry
  }
  if (unit.items.length === 1) {
    return async () => {
      const result = await unit.run()
      const failure = result?.failed.find((entry) => entry.id === item.id)
      if (failure) {
        throw new Error(failure.error)
      }
    }
  }
  return undefined
}

export function showUnitMutationToast(params: {
  title: string
  units: Array<MutationUnit>
  concurrency?: number
  onSettled?: (result: MutationResult) => void
}): string | number {
  const concurrency = params.concurrency ?? 6
  const items: Array<MutationToastItem> = params.units.flatMap((unit) =>
    unit.items.map((item) => ({
      id: item.id,
      name: item.name,
      successDescription: item.successDescription,
      retry: resolveItemRetry(unit, item),
    }))
  )

  return showMutationToast({
    title: params.title,
    items,
    runMutation: async (report) => {
      const result = await runMutationUnits(params.units, report, concurrency)
      params.onSettled?.(result)
      return result
    },
  })
}

function showMutationToast(params: {
  title: string
  items: Array<MutationToastItem>
  runMutation: (report: (update: MutationItemUpdate) => void) => Promise<MutationResult>
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

  return showUnitMutationToast({
    title: params.title,
    units: [
      {
        items: [
          typeof promise === "function"
            ? {
                id: "single",
                name: params.name,
                successDescription: params.successDescription,
              }
            : {
                id: "single",
                name: params.name,
                successDescription: params.successDescription,
                retry: undefined,
              },
        ],
        run: async () => {
          try {
            await runSingleMutation()
          } catch (error) {
            return {
              failed: [
                {
                  id: "single",
                  error: error instanceof Error ? error.message : "Failed",
                },
              ],
            }
          }
        },
      },
    ],
  })
}
