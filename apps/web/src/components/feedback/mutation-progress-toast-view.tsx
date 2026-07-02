import { useEffect, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  CancelIcon,
  CheckmarkCircleIcon,
  LoaderCircle,
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
import { toast } from "sonner"
import type {
  MutationResult,
  MutationToastItem,
} from "@/components/feedback/mutation-progress-toast"

type ItemState = "processing" | "done" | "error"

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

export function MutationProgressToast({
  toastId,
  title,
  items,
  runMutation,
}: {
  toastId: string | number
  title: string
  items: Array<MutationToastItem>
  runMutation: () => Promise<MutationResult>
}) {
  const [toastState, setToastState] = useState(() => ({
    itemStates: Object.fromEntries(
      items.map((item) => [item.id, "processing"])
    ) as Record<string, ItemState>,
    itemErrors: {} as Record<string, string>,
  }))
  const { itemStates, itemErrors } = toastState
  const initialItemsRef = useRef(items)
  const runMutationRef = useRef(runMutation)
  const mutationPromiseRef = useRef<Promise<MutationResult> | null>(null)

  useEffect(() => {
    let cancelled = false
    const mutationItems = initialItemsRef.current
    mutationPromiseRef.current ??= runMutationRef.current()

    mutationPromiseRef.current
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
          <HugeiconsIcon icon={LoaderCircle} className="animate-spin" />
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
        {itemStates[item.id] === "error" ? (
          <AttachmentDescription className="text-destructive">
            {itemErrors[item.id] ?? "Failed"}
          </AttachmentDescription>
        ) : itemStates[item.id] === "done" && item.successDescription ? (
          <AttachmentDescription>
            {item.successDescription}
          </AttachmentDescription>
        ) : null}
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          className="text-muted-foreground"
          onClick={() => toast.dismiss(toastId)}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>
      <AttachmentGroup className="-mx-6 flex max-h-100 scroll-fade flex-col gap-0 overflow-y-auto py-0 firefox:scroll-fade-none">
        {attachments}
      </AttachmentGroup>
    </div>
  )
}
