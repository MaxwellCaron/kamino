import { IconDeviceImac, IconTemplate } from "@tabler/icons-react"

export function VmIcon({
  status,
  isTemplate,
}: {
  status: string | undefined
  isTemplate?: boolean
}) {
  if (isTemplate) {
    return <IconTemplate className="size-4 text-muted-foreground" />
  }

  const color = status
    ? status === "running"
      ? "bg-green-600 dark:bg-green-400"
      : status === "stopped"
        ? "bg-muted-foreground/40"
        : "bg-yellow-600 dark:bg-yellow-400"
    : undefined

  return (
    <span className="relative">
      <IconDeviceImac className="size-4 text-muted-foreground" />
      {color && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background ${color}`}
          title={status}
        />
      )}
    </span>
  )
}
