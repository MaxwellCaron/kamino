import { m } from "motion/react"
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardFooter,
  CutoutCardImage,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardPin,
  CutoutCorner,
  cutoutCardSurfaceClassName,
  useCutoutContentStaggerVariants,
} from "@workspace/ui/components/cutout-card"
import { Link } from "@tanstack/react-router"
import type { Pod } from "@/features/pods/types/pod-types"
import { FormatPodCreatorsShort } from "@/features/pods/components/pod-creators"

const podDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
  year: "numeric",
})

type BrowsePodsCardProps = {
  pod: Pod
  hasClonedInstance: boolean
}

export function BrowsePodsCard({
  pod,
  hasClonedInstance,
}: BrowsePodsCardProps) {
  const stagger = useCutoutContentStaggerVariants()

  return (
    <Link
      to="/pods/$podSlug"
      params={{ podSlug: pod.slug }}
      aria-label={`Open ${pod.title}${hasClonedInstance ? ", cloned" : ""}`}
      className="block rounded-[28px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <CutoutCard className={cutoutCardSurfaceClassName}>
        <CutoutCardMedia className="h-72">
          <CutoutCardImage
            alt={pod.title}
            sizes="(max-width: 768px) 100vw, 448px"
            src={pod.image}
          />
          <CutoutCardOverlay />
          <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-5 py-3">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {pod.clone_count} Clones
              </span>
            </div>
            <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
            <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
          </CutoutCardInsetLabel>
          {hasClonedInstance ? (
            <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-md ring-1 shadow-foreground/10 ring-border/30">
              Cloned
              <CutoutCorner
                className="absolute top-0 -left-5.75 -rotate-90 text-foreground"
                size={24}
              />
              <CutoutCorner
                className="absolute right-0 -bottom-5.75 -rotate-90 text-foreground"
                size={24}
              />
            </CutoutCardPin>
          ) : null}
        </CutoutCardMedia>
        <CutoutCardContent>
          <m.div
            animate="show"
            className="contents"
            initial="hidden"
            variants={stagger.container}
          >
            <m.h2
              className="mb-2 text-xl leading-snug font-semibold text-balance text-card-foreground"
              variants={stagger.item}
            >
              {pod.title}
            </m.h2>
            <m.p
              className="mb-4 text-sm leading-relaxed text-pretty text-muted-foreground"
              variants={stagger.item}
            >
              {pod.description}
            </m.p>
            <m.div variants={stagger.item}>
              <CutoutCardFooter className="border-t border-border/80 pt-4">
                {FormatPodCreatorsShort(pod.creators)}
                <span className="pr-1 text-xs text-muted-foreground tabular-nums">
                  {podDateFormatter.format(new Date(pod.created_at))}
                </span>
              </CutoutCardFooter>
            </m.div>
          </m.div>
        </CutoutCardContent>
      </CutoutCard>
    </Link>
  )
}
