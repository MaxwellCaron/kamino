export const animateContainer = {
  hidden: {
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
  show: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0,
      staggerDirection: 1,
    },
  },
}

export const animateChild = {
  hidden: { opacity: 0, scale: 0.4, y: 12 },
  show: { opacity: 1, scale: 1, y: 0 },
}

export const animateTableRow = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export const nestedDialogAnimationClassName =
  "top-[calc(50%+1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[nested-dialog-open]:after:absolute data-[nested-dialog-open]:after:inset-0 data-[nested-dialog-open]:after:rounded-[inherit] data-[nested-dialog-open]:after:bg-black/5 data-[starting-style]:scale-90 data-[starting-style]:opacity-0"
