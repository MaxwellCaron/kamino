import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CancelIcon,
  CheckmarkCircleIcon,
  Refresh03Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@workspace/ui/components/attachment"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "sonner"
import type {
  MutationItemUpdate,
  MutationResult,
  MutationToastItem,
} from "@/components/feedback/mutation-progress-toast"

type ItemState = "processing" | "done" | "error"

const mutationSessions = new Map<string | number, Promise<MutationResult>>()
const liveReporters = new Map<
  string | number,
  (update: MutationItemUpdate) => void
>()

function dismissWhenComplete(
  toastId: string | number,
  nextStates: Record<string, ItemState>
) {
  if (Object.values(nextStates).every((state) => state === "done")) {
    setTimeout(() => {
      toast.dismiss(toastId)
    }, 3000)
  }
}

function applyItemUpdate(
  prev: {
    itemStates: Record<string, ItemState>
    itemErrors: Record<string, string>
  },
  update: MutationItemUpdate,
  toastId: string | number
) {
  const nextStates: Record<string, ItemState> = {
    ...prev.itemStates,
    [update.id]: update.status,
  }
  const nextErrors = { ...prev.itemErrors }
  if (update.status === "error") nextErrors[update.id] = update.error
  else delete nextErrors[update.id]
  dismissWhenComplete(toastId, nextStates)
  return { itemStates: nextStates, itemErrors: nextErrors }
}

export function MutationProgressToast({
  toastId,
  title,
  items,
  runMutation,
}: {
  toastId: string | number
  title: string
  items: Array<MutationToastItem>
  runMutation: (
    report: (update: MutationItemUpdate) => void
  ) => Promise<MutationResult>
}) {
  const [toastState, setToastState] = useState<{
    itemStates: Record<string, ItemState>
    itemErrors: Record<string, string>
  }>(() => ({
    itemStates: Object.fromEntries(
      items.map((item) => [item.id, "processing"])
    ),
    itemErrors: {},
  }))
  const { itemStates, itemErrors } = toastState
  const initialItemsRef = useRef(items)
  const runMutationRef = useRef(runMutation)
  runMutationRef.current = runMutation

  useEffect(() => {
    liveReporters.set(toastId, (update) => {
      setToastState((prev) => applyItemUpdate(prev, update, toastId))
    })

    return () => {
      liveReporters.delete(toastId)
    }
  }, [toastId])

  useEffect(() => {
    let cancelled = false
    const mutationItems = initialItemsRef.current
    const report = (update: MutationItemUpdate) => {
      liveReporters.get(toastId)?.(update)
    }

    let promise = mutationSessions.get(toastId)
    if (!promise) {
      promise = runMutationRef.current(report)
      mutationSessions.set(toastId, promise)
      void promise.finally(() => {
        mutationSessions.delete(toastId)
      })
    }

    promise
      .then(({ succeeded, failed }) => {
        if (cancelled) return
        setToastState((prev) => {
          const nextStates = { ...prev.itemStates }
          const nextErrors = { ...prev.itemErrors }
          for (const id of succeeded) nextStates[id] = "done"
          for (const { id } of failed) nextStates[id] = "error"
          for (const id of succeeded) delete nextErrors[id]
          for (const { id, error } of failed) nextErrors[id] = error
          dismissWhenComplete(toastId, nextStates)
          return { itemStates: nextStates, itemErrors: nextErrors }
        })
      })
      .catch((error) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "Failed"
        setToastState((prev) => {
          const nextStates = { ...prev.itemStates }
          const nextErrors = { ...prev.itemErrors }
          for (const item of mutationItems) {
            nextStates[item.id] = "error"
            nextErrors[item.id] = message
          }
          return { itemStates: nextStates, itemErrors: nextErrors }
        })
      })

    return () => {
      cancelled = true
    }
  }, [toastId])

  async function handleRetry(item: MutationToastItem) {
    if (!item.retry) return

    setToastState((prev) => {
      const nextErrors = { ...prev.itemErrors }
      delete nextErrors[item.id]
      return {
        itemStates: { ...prev.itemStates, [item.id]: "processing" },
        itemErrors: nextErrors,
      }
    })

    try {
      await item.retry()
      setToastState((prev) => {
        const next: Record<string, ItemState> = {
          ...prev.itemStates,
          [item.id]: "done",
        }
        dismissWhenComplete(toastId, next)
        const nextErrors = { ...prev.itemErrors }
        delete nextErrors[item.id]
        return { itemStates: next, itemErrors: nextErrors }
      })
    } catch (error) {
      setToastState((prev) => ({
        itemStates: { ...prev.itemStates, [item.id]: "error" },
        itemErrors: {
          ...prev.itemErrors,
          [item.id]: error instanceof Error ? error.message : "Failed",
        },
      }))
    }
  }

  const attachments = items.map((item) => (
    <Attachment
      key={item.id}
      state={itemStates[item.id]}
      className="w-full rounded-none border-0 border-b border-border! px-6! last:border-b-0"
    >
      <AttachmentMedia>
        {itemStates[item.id] === "processing" ? (
          <Spinner className="motion-reduce:animate-none" />
        ) : itemStates[item.id] === "done" ? (
          <HugeiconsIcon
            icon={CheckmarkCircleIcon}
            className="text-emerald-600 dark:text-emerald-400"
          />
        ) : itemStates[item.id] === "error" ? (
          <HugeiconsIcon icon={CancelIcon} className="text-destructive" />
        ) : null}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{item.name}</AttachmentTitle>
        {itemStates[item.id] === "processing" ? (
          <AttachmentDescription>Processing</AttachmentDescription>
        ) : itemStates[item.id] === "error" ? (
          <AttachmentDescription className="first-letter:uppercase">
            {itemErrors[item.id] ?? "Failed"}
          </AttachmentDescription>
        ) : (
          <AttachmentDescription className="first-letter:uppercase">
            {item.successDescription ?? "Done"}
          </AttachmentDescription>
        )}
      </AttachmentContent>
      <AttachmentActions>
        {itemStates[item.id] === "error" && item.retry && (
          <AttachmentAction
            aria-label={`Retry ${item.name}`}
            onClick={() => {
              void handleRetry(item)
            }}
          >
            <HugeiconsIcon icon={Refresh03Icon} />
          </AttachmentAction>
        )}
      </AttachmentActions>
    </Attachment>
  ))

  return (
    <div className="flex w-full flex-col gap-3 rounded-4xl bg-card px-6 py-4 shadow ring-1 ring-border">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground"
          onClick={() => toast.dismiss(toastId)}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>
      <AttachmentGroup className="-mx-6 flex max-h-100 scroll-fade flex-col gap-0 overflow-y-auto rounded-md py-0 firefox:scroll-fade-none">
        {attachments}
      </AttachmentGroup>
    </div>
  )
}
