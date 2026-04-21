declare module "@dot-loaders/react" {
  import type { ComponentPropsWithoutRef, ReactElement } from "react"

  export type LoaderProps = ComponentPropsWithoutRef<"span"> & {
    loader: string
    renderer?: "text" | "svg-grid"
    rendererOptions?: {
      cellSize?: number
      gap?: number
      inactiveOpacity?: number
      shape?:
        | "circle"
        | "square"
        | "diamond"
        | "triangle"
        | "star"
        | "heart"
    }
  }

  export function Loader(props: LoaderProps): ReactElement

  export type LoaderInlineProps = LoaderProps & {
    gap?: number
  }

  export function LoaderInline(props: LoaderInlineProps): ReactElement
}
