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
      colors={["#2c975a"]}
      enableBlink
      className="cursor-pointer rounded-full text-foreground dark:**:text-background"
    />
  )
}
