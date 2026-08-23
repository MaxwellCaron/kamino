export function shouldAnimateGrainient(
  prefersReducedMotion: boolean,
  timeSpeed: number,
  grainAnimated: boolean,
  grainAmount: number
): boolean {
  return (
    !prefersReducedMotion &&
    (timeSpeed !== 0 || (grainAnimated && grainAmount !== 0))
  )
}
