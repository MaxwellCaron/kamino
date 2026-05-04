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
import { FacehashIcon } from "@workspace/ui/components/facehash"

export function BrowsePodsCard() {
  const stagger = useCutoutContentStaggerVariants()

  return (
    <CutoutCard className={cutoutCardSurfaceClassName}>
      <CutoutCardMedia className="h-72">
        <CutoutCardImage
          alt="Mountain landscape"
          sizes="(max-width: 768px) 100vw, 448px"
          src="https://media.discordapp.net/attachments/185912981576482816/1497062783890751609/Reverse_Engineering1.png?ex=69f9ff9d&is=69f8ae1d&hm=cb58d2e46d6329eca314770a7bfb50547e514cd1ad37d5c46355988ab5007bf2&=&format=webp&quality=lossless"
        />
        <CutoutCardOverlay />
        <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-5 py-3">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Featured
          </span>
          <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
          <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
        </CutoutCardInsetLabel>
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
            Alpine Adventures
          </motion.h2>
          <motion.p
            className="mb-4 text-sm leading-relaxed text-pretty text-muted-foreground"
            variants={stagger.item}
          >
            Discover breathtaking mountain landscapes and experience the
            serenity of nature at its finest.
          </motion.p>
          <motion.div variants={stagger.item}>
            <CutoutCardFooter className="border-t border-border/80 pt-4">
              <div className="flex items-center gap-3">
                <FacehashIcon name="mcaron" size={32} />
                <span className="text-sm font-medium text-card-foreground">
                  mcaron
                </span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                5 min read
              </span>
            </CutoutCardFooter>
          </motion.div>
        </motion.div>
      </CutoutCardContent>
      <CutoutCardAction className="right-5 bottom-5">
        <Button
          className="shadow-md transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          type="button"
        >
          Read More
        </Button>
      </CutoutCardAction>
    </CutoutCard>
  )
}
