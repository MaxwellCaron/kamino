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
import { Button } from "@workspace/ui/components/button"
import { IconCopy } from "@tabler/icons-react"
import { FormatPodCreators } from "../creators"
import type { Pod } from "../../types/pod-types"

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
              {FormatPodCreators(pod.creators)}
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
      <CutoutCardAction className="right-6 bottom-5.5">
        <div className="rounded-4xl bg-background shadow-md transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]">
          <Button
            className="shadow-none hover:shadow-none active:translate-y-0"
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
