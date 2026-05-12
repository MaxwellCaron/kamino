import { Link } from "@tanstack/react-router"
import { Image } from "@unpic/react"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ClonedPod } from "../../types/pod-types"

export function ClonedPodCard({ pod }: { pod: ClonedPod }) {
  return (
    <Item
      key={pod.title}
      className="h-30 cursor-default"
      variant="muted"
      role="listitem"
      render={
        <Link to=".">
          <ItemMedia variant="image" className="size-22">
            <Image
              src={pod.image}
              alt={pod.title}
              width={128}
              height={128}
              className="object-cover grayscale"
            />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="line-clamp-1">
              {pod.title} -{" "}
              <span className="text-muted-foreground">
                {pod.creators.join(", ")}
              </span>
            </ItemTitle>
            <ItemDescription>{pod.description}</ItemDescription>
          </ItemContent>
          <ItemContent className="flex-none text-center">
            <ItemDescription>{pod.clones}</ItemDescription>
          </ItemContent>
        </Link>
      }
    />
  )
}
