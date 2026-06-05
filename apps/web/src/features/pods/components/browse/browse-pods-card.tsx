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
  CutoutCorner,
  cutoutCardSurfaceClassName,
  useCutoutContentStaggerVariants,
} from "@workspace/ui/components/cutout-card"
import { buttonVariants } from "@workspace/ui/components/button"
import { IconArrowRight } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { Pod } from "@/features/pods/types/pod-types"
import { FormatPodCreatorsShort } from "@/features/pods/components/pod-creators"

export function BrowsePodsCard({ pod }: { pod: Pod }) {
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
              {pod.clone_count} Clones
            </span>
          </div>
          <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
          <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
        </CutoutCardInsetLabel>
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
              {FormatPodCreatorsShort(pod.creators)}
              <span className="pr-1 text-xs text-muted-foreground tabular-nums">
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
        <div className="rounded-4xl bg-card shadow-md transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]">
          <Link
            to="/pods/$podSlug"
            params={{ podSlug: pod.slug }}
            className={`${buttonVariants({ variant: "default" })} cursor-default`}
          >
            Open
            <IconArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </CutoutCardAction>
    </CutoutCard>
  )
}
