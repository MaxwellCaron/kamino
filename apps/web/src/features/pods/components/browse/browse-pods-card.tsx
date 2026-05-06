import { motion } from "motion/react"
import {
  CutoutCard,
  CutoutCardAction,
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Button } from "@workspace/ui/components/button"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { IconCopy, IconUsers } from "@tabler/icons-react"
import type { Pod } from "../../types/pod-types"

function formatPodCreators(creators: Array<string>) {
  switch (creators.length) {
    case 0:
      return null
    case 1:
      return (
        <div className="flex items-center gap-3">
          <FacehashIcon name={creators[0]} size={32} />
          <span className="text-sm font-medium text-card-foreground">
            {creators[0]}
          </span>
        </div>
      )
    default:
      return (
        <HoverCard>
          <HoverCardTrigger
            className="flex items-center gap-3"
            delay={50}
            closeDelay={150}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary">
              <IconUsers className="size-4" />
            </span>
            <span className="text-sm font-medium text-card-foreground">
              {creators.length} Creators
            </span>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            side="top"
            alignOffset={-10}
            className="space-y-3"
          >
            <p className="text-muted-foreground">Creators</p>
            {creators.map((creator, index) => (
              <div key={index} className="flex items-center gap-3">
                <FacehashIcon name={creator} size={32} />
                <span className="text-sm font-medium text-card-foreground">
                  {creator}
                </span>
              </div>
            ))}
          </HoverCardContent>
        </HoverCard>
      )
  }
}

export function BrowsePodsCard({
  pod,
  onClone,
}: {
  pod: Pod
  onClone: (pod: Pod) => void
}) {
  const stagger = useCutoutContentStaggerVariants()

  return (
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
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              {pod.clones} Clones
            </span>
          </div>
          <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
          <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
        </CutoutCardInsetLabel>
        {pod.isNew && (
          <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md ring-1 shadow-foreground/10 ring-border/30">
            New
            <CutoutCorner
              className="absolute top-0 -left-5.75 -rotate-90 text-primary"
              size={24}
            />
            <CutoutCorner
              className="absolute right-0 -bottom-5.75 -rotate-90 text-primary"
              size={24}
            />
          </CutoutCardPin>
        )}
      </CutoutCardMedia>
      <CutoutCardContent>
        <motion.div
          animate="show"
          className="contents"
          initial="hidden"
          variants={stagger.container}
        >
          <motion.h2
            className="mb-2 text-xl leading-snug font-semibold text-balance text-card-foreground"
            variants={stagger.item}
          >
            {pod.title}
          </motion.h2>
          <motion.p
            className="mb-4 text-sm leading-relaxed text-pretty text-muted-foreground"
            variants={stagger.item}
          >
            {pod.description}
          </motion.p>
          <motion.div variants={stagger.item}>
            <CutoutCardFooter className="border-t border-border/80 pt-4">
              {formatPodCreators(pod.creators)}
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(pod.created_at))}
              </span>
            </CutoutCardFooter>
          </motion.div>
        </motion.div>
      </CutoutCardContent>
      <CutoutCardAction className="bottom-5.5 w-full px-4">
        <div className="rounded-4xl bg-background shadow-md transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]">
          <Button
            className="w-full shadow-none hover:shadow-none active:translate-y-0"
            onClick={() => onClone(pod)}
          >
            <IconCopy data-icon="inline-start" />
            Clone
          </Button>
        </div>
      </CutoutCardAction>
    </CutoutCard>
  )
}
