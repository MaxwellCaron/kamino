import { Image } from "@unpic/react"
import { cn } from "@workspace/ui/lib/utils"

type PodCoverImageProps = {
  alt: string
  className?: string
  loading?: "eager" | "lazy"
  sizes: string
  src: string
}

export function PodCoverImage({
  alt,
  className,
  loading = "lazy",
  sizes,
  src,
}: PodCoverImageProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-input/50 outline -outline-offset-1 outline-foreground/10",
        className
      )}
    >
      <Image
        alt={alt}
        className="size-full object-contain"
        layout="fullWidth"
        loading={loading}
        sizes={sizes}
        src={src}
      />
    </div>
  )
}
