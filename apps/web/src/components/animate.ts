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
