import { Facehash } from "facehash"

export function FacehashIcon({
  name,
  size = 40,
}: {
  name: string
  size?: number
}) {
  return (
    <Facehash
      name={name}
      size={size}
      colors={["#FFB81C"]}
      enableBlink
      className="rotate-y-180 rounded-md text-foreground dark:**:text-background"
    />
  )
}
