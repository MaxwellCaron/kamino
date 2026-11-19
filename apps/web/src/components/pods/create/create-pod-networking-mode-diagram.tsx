import { Image } from "@unpic/react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useTheme } from "@workspace/ui/components/theme-provider"

type NetworkingModeDiagramSource = {
  src: string
  width: number
  height: number
}

type NetworkingModeDiagramProps = {
  light: NetworkingModeDiagramSource
  dark: NetworkingModeDiagramSource
  alt: string
  className?: string
}

export function NetworkingModeDiagram({
  light,
  dark,
  alt,
  className,
}: NetworkingModeDiagramProps) {
  const { resolvedTheme } = useTheme()

  if (!resolvedTheme) {
    return (
      <Skeleton
        className={className}
        style={{ aspectRatio: `${light.width} / ${light.height}` }}
      />
    )
  }

  const source = resolvedTheme === "dark" ? dark : light

  return (
    <Image
      key={source.src}
      src={source.src}
      width={source.width}
      height={source.height}
      layout="constrained"
      alt={alt}
      loading="lazy"
      className={className}
    />
  )
}
