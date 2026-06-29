import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { useRef } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ComponentProps, ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { AppActionButton } from "@/components/actions/app-action-button"

function Freeze({
  freeze,
  children,
}: {
  freeze: boolean
  children: ReactNode
}) {
  const frozen = useRef(children)
  if (!freeze) frozen.current = children
  return <>{freeze ? frozen.current : children}</>
}

type AppDialogIcon = IconSvgElement

type AppDialogVariant = "default" | "child"

export const nestedDialogAnimationClassName =
  "top-[calc(50%+1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[nested-dialog-open]:after:absolute data-[nested-dialog-open]:after:inset-0 data-[nested-dialog-open]:after:rounded-[inherit] data-[nested-dialog-open]:after:bg-black/5 data-[starting-style]:scale-90 data-[starting-style]:opacity-0"

type AppAlertDialogHeaderProps = {
  description: ReactNode
  descriptionProps?: Omit<
    ComponentProps<typeof AlertDialogDescription>,
    "children"
  >
  icon?: AppDialogIcon
  title: string
  variant?: AppDialogVariant
}

function AppAlertDialogHeader({
  description,
  descriptionProps,
  icon: Icon,
  title,
  variant = "default",
}: AppAlertDialogHeaderProps) {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        {variant === "child" ? (
          <>
            {Icon ? <HugeiconsIcon icon={Icon} /> : null}
            <span>{title}</span>
          </>
        ) : (
          <>
            {Icon ? (
              <HugeiconsIcon icon={Icon} className="text-muted-foreground" />
            ) : null}
            <span className="text-2xl font-semibold tracking-tight">
              {title}
            </span>
          </>
        )}
      </AlertDialogTitle>
      <AlertDialogDescription {...descriptionProps}>
        {description}
      </AlertDialogDescription>
    </AlertDialogHeader>
  )
}

type AppAlertDialogContentProps = ComponentProps<typeof AlertDialogContent> &
  AppAlertDialogHeaderProps & {
    open?: boolean
  }

export function AppAlertDialogContent({
  children,
  description,
  descriptionProps,
  icon,
  title,
  variant = "default",
  open,
  className,
  ...props
}: AppAlertDialogContentProps) {
  return (
    <AlertDialogContent className={cn("sm:max-w-xl", className)} {...props}>
      <Freeze freeze={open === false}>
        <AppAlertDialogHeader
          description={description}
          descriptionProps={descriptionProps}
          icon={icon}
          title={title}
          variant={variant}
        />
        {children}
      </Freeze>
    </AlertDialogContent>
  )
}

type AppDialogHeaderProps = {
  description: ReactNode
  descriptionProps?: Omit<ComponentProps<typeof DialogDescription>, "children">
  icon?: AppDialogIcon
  title: string
  variant?: AppDialogVariant
}

export function AppDialogHeader({
  description,
  descriptionProps,
  icon: Icon,
  title,
  variant = "default",
}: AppDialogHeaderProps) {
  return (
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        {variant === "child" ? (
          <>
            {Icon ? <HugeiconsIcon icon={Icon} /> : null}
            <span>{title}</span>
          </>
        ) : (
          <>
            {Icon ? (
              <HugeiconsIcon icon={Icon} className="text-muted-foreground" />
            ) : null}
            <span className="text-2xl font-semibold tracking-tight">
              {title}
            </span>
          </>
        )}
      </DialogTitle>
      <DialogDescription {...descriptionProps}>{description}</DialogDescription>
    </DialogHeader>
  )
}

type AppDialogContentProps = ComponentProps<typeof DialogContent> &
  AppDialogHeaderProps & {
    open?: boolean
  }

export function AppDialogContent({
  children,
  description,
  descriptionProps,
  icon,
  title,
  variant = "default",
  open,
  className,
  ...props
}: AppDialogContentProps) {
  return (
    <DialogContent className={cn("sm:max-w-xl", className)} {...props}>
      <Freeze freeze={open === false}>
        <AppDialogHeader
          description={description}
          descriptionProps={descriptionProps}
          icon={icon}
          title={title}
          variant={variant}
        />
        {children}
      </Freeze>
    </DialogContent>
  )
}

type AppDialogProps = AppDialogContentProps & {
  onClosed?: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function AppDialog({
  onClosed,
  onOpenChange,
  open,
  ...props
}: AppDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          onClosed?.()
        }
      }}
    >
      <AppDialogContent open={open} {...props} />
    </Dialog>
  )
}

export function AppDialogScrollBody({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "-mx-4 -mb-2 no-scrollbar flex max-h-[60vh] scroll-fade flex-col gap-6 overflow-y-auto border-t p-6",
        className
      )}
      {...props}
    />
  )
}

type AppDialogPrimaryButtonProps = ComponentProps<typeof AppActionButton> & {
  type?: "submit" | "button" | "reset"
}

export function AppDialogPrimaryButton({
  className,
  type = "submit",
  ...props
}: AppDialogPrimaryButtonProps) {
  return (
    <AppActionButton
      className={cn("w-full", className)}
      type={type}
      {...props}
    />
  )
}
