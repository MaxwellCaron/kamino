import { Badge } from "@workspace/ui/components/badge"

export function EnabledBadge({ value }: { value?: boolean | null }) {
  return (
    <Badge variant={value ? "default" : "destructive"}>
      {value ? "Enabled" : "Disabled"}
    </Badge>
  )
}
