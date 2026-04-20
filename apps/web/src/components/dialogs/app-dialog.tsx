import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ComponentType, ReactNode } from "react"

type AppDialogIcon = ComponentType<{
  className?: string
}>

type AppAlertDialogHeaderProps = {
  description: ReactNode
  descriptionProps?: Omit<
    ComponentProps<typeof AlertDialogDescription>,
    "children"
  >
  icon: AppDialogIcon
  title: string
}

export function AppAlertDialogHeader({
  description,
  descriptionProps,
  icon: Icon,
  title,
}: AppAlertDialogHeaderProps) {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <Icon className="text-muted-foreground" />
        <span className="text-2xl font-semibold tracking-tight">{title}</span>
      </AlertDialogTitle>
      <AlertDialogDescription {...descriptionProps}>
        {description}
      </AlertDialogDescription>
    </AlertDialogHeader>
  )
}

type AppAlertDialogContentProps = ComponentProps<typeof AlertDialogContent> &
  AppAlertDialogHeaderProps

export function AppAlertDialogContent({
  children,
  description,
  descriptionProps,
  icon,
  title,
  ...props
}: AppAlertDialogContentProps) {
  return (
    <AlertDialogContent {...props}>
      <AppAlertDialogHeader
        description={description}
        descriptionProps={descriptionProps}
        icon={icon}
        title={title}
      />
      {children}
    </AlertDialogContent>
  )
}

type AppDialogHeaderProps = {
  description: ReactNode
  descriptionProps?: Omit<ComponentProps<typeof DialogDescription>, "children">
  icon: AppDialogIcon
  title: string
}

export function AppDialogHeader({
  description,
  descriptionProps,
  icon: Icon,
  title,
}: AppDialogHeaderProps) {
  return (
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Icon className="text-muted-foreground" />
        <span className="text-2xl font-semibold tracking-tight">{title}</span>
      </DialogTitle>
      <DialogDescription {...descriptionProps}>{description}</DialogDescription>
    </DialogHeader>
  )
}

type AppDialogContentProps = ComponentProps<typeof DialogContent> &
  AppDialogHeaderProps

export function AppDialogContent({
  children,
  description,
  descriptionProps,
  icon,
  title,
  ...props
}: AppDialogContentProps) {
  return (
    <DialogContent {...props}>
      <AppDialogHeader
        description={description}
        descriptionProps={descriptionProps}
        icon={icon}
        title={title}
      />
      {children}
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
      <AppDialogContent {...props} />
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
        "-mx-4 -mb-2 no-scrollbar flex max-h-[60vh] flex-col gap-6 overflow-y-auto border-t p-6",
        className
      )}
      {...props}
    />
  )
}

export function AppDialogPrimaryButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={cn("w-full", className)} {...props} />
}
