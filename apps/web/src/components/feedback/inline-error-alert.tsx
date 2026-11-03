import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { AlertCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { formatErrorMessage } from "@/components/forms/form-errors"

type InlineErrorAlertProps = {
  error?: unknown
  fallback: string
  title?: ReactNode
  className?: string
}

export function InlineErrorAlert({
  error,
  fallback,
  title,
  className,
}: InlineErrorAlertProps) {
  return (
    <Alert variant="destructive" className={cn(className)}>
      <HugeiconsIcon icon={AlertCircleIcon} />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{formatErrorMessage(error, fallback)}</AlertDescription>
    </Alert>
  )
}
