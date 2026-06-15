import { IconAlertCircle } from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { cn } from "@workspace/ui/lib/utils"
import type { ReactNode } from "react"
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
      <IconAlertCircle />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{formatErrorMessage(error, fallback)}</AlertDescription>
    </Alert>
  )
}
