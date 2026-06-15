import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import type { ComponentProps, ReactNode } from "react"

type AppActionButtonProps = ComponentProps<typeof Button> & {
  pending?: boolean
  pendingLabel?: ReactNode
}

export function AppActionButton({
  pending,
  pendingLabel,
  disabled,
  children,
  ...props
}: AppActionButtonProps) {
  return (
    <Button
      disabled={disabled || pending}
      aria-busy={pending ? "true" : undefined}
      {...props}
    >
      {pending ? (
        <>
          <Spinner data-icon="inline-start" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
