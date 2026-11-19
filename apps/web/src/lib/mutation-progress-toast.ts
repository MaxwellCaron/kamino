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
  | { id: string; status: "progress"; description: string }

export type MutationUnitItem = {
  id: string
  name: string
  successDescription?: string
  retry?: () => Promise<unknown>
}

export type MutationUnit = {
  items: Array<MutationUnitItem>
  run: (
    report: (update: MutationItemUpdate) => void
  ) => Promise<{ failed: Array<{ id: string; error: string }> } | void>
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
      const result = await unit.run(report)
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
      const result = await unit.run(() => {})
      const failure = result?.failed.find((entry) => entry.id === item.id)
      if (failure) {
        throw new Error(failure.error)
      }
    }
  }
  return undefined
}

export type UnitMutationToastOptions = {
  title: string
  progressItems?: Array<MutationToastItem>
  units: Array<MutationUnit>
  concurrency?: number
  onSettled?: (result: MutationResult) => void
}

export type SingleMutationToastOptions = {
  title: string
  name: string
  promise: Promise<unknown> | (() => Promise<unknown>)
  successDescription?: string
}

export type MutationToastOptions = {
  title: string
  progressItems?: Array<MutationToastItem>
  items: Array<MutationToastItem>
  runMutation: (
    report: (update: MutationItemUpdate) => void
  ) => Promise<MutationResult>
}

export function getUnitMutationToastOptions(
  params: UnitMutationToastOptions
): MutationToastOptions {
  const concurrency = params.concurrency ?? 6
  const items: Array<MutationToastItem> = params.units.flatMap((unit) =>
    unit.items.map((item) => ({
      id: item.id,
      name: item.name,
      successDescription: item.successDescription,
      retry: resolveItemRetry(unit, item),
    }))
  )

  return {
    title: params.title,
    progressItems: params.progressItems,
    items,
    runMutation: async (report) => {
      const result = await runMutationUnits(params.units, report, concurrency)
      params.onSettled?.(result)
      return result
    },
  }
}

export function getSingleMutationToastOptions(
  params: SingleMutationToastOptions
): MutationToastOptions {
  let runSingleMutation: () => Promise<unknown>
  const promise = params.promise

  if (typeof promise === "function") {
    runSingleMutation = promise
  } else {
    runSingleMutation = () => promise
  }

  return getUnitMutationToastOptions({
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

export type MutationItemState = "processing" | "done" | "error"

export type MutationToastState = {
  itemStates: Record<string, MutationItemState>
  itemErrors: Record<string, string>
  itemDescriptions: Record<string, string>
}

export function applyItemUpdate(
  prev: MutationToastState,
  update: MutationItemUpdate
) {
  if (update.status === "progress") {
    return {
      ...prev,
      itemDescriptions: {
        ...prev.itemDescriptions,
        [update.id]: update.description,
      },
    }
  }
  const nextStates: Record<string, MutationItemState> = {
    ...prev.itemStates,
    [update.id]: update.status,
  }
  const nextErrors = { ...prev.itemErrors }
  if (update.status === "error") nextErrors[update.id] = update.error
  else delete nextErrors[update.id]
  return {
    itemStates: nextStates,
    itemErrors: nextErrors,
    itemDescriptions: prev.itemDescriptions,
  }
}
