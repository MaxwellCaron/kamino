import { createContext, useContext, useMemo } from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  ChevronDownIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { useComposedRefs } from "@workspace/ui/lib/compose-refs"
import type { ItemInstance } from "@headless-tree/core"

type ToggleIconType = "chevron" | "plus-minus"

interface TreeContextValue<T = any> {
  indent: number
  currentItem?: ItemInstance<T>
  tree?: any
  toggleIconType?: ToggleIconType
}

const TreeContext = createContext<TreeContextValue>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
  toggleIconType: "plus-minus",
})

function useTreeContext<T = any>() {
  return useContext(TreeContext) as TreeContextValue<T>
}

function renderToggleIcon(isExpanded: boolean, toggleIconType: ToggleIconType) {
  if (toggleIconType === "plus-minus") {
    return isExpanded ? (
      <HugeiconsIcon
        icon={MinusSignIcon}
        className="size-3.5 text-muted-foreground"
        stroke="currentColor"
      />
    ) : (
      <HugeiconsIcon
        icon={Add01Icon}
        className="size-3.5 text-muted-foreground"
        stroke="currentColor"
      />
    )
  }

  return (
    <HugeiconsIcon
      icon={ChevronDownIcon}
      className="size-4 text-muted-foreground in-aria-[expanded=false]:-rotate-90"
    />
  )
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
  ref?: React.Ref<HTMLDivElement>
  tree?: any
  toggleIconType?: ToggleIconType
}

function Tree({
  indent = 20,
  tree,
  className,
  ref,
  toggleIconType = "chevron",
  ...props
}: TreeProps) {
  const containerProps =
    tree && typeof tree.getContainerProps === "function"
      ? tree.getContainerProps()
      : {}
  const mergedProps = { ...props, ...containerProps }

  // Extract style from mergedProps to merge with our custom styles
  const { style: propStyle, ref: treeRef, ...otherProps } = mergedProps
  const composedRef = useComposedRefs(ref, treeRef)

  // Merge styles
  const mergedStyle = {
    ...propStyle,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties

  const contextValue = useMemo(
    () => ({ indent, tree, toggleIconType }),
    [indent, tree, toggleIconType]
  )

  return (
    <TreeContext.Provider value={contextValue}>
      <div
        ref={composedRef}
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
        {...otherProps}
      />
    </TreeContext.Provider>
  )
}

interface TreeItemProps<T = any> extends Omit<
  useRender.ComponentProps<"button">,
  "indent"
> {
  item: ItemInstance<T>
  indent?: number
}

function TreeItem<T = any>({
  item,
  className,
  render,
  children,
  ...props
}: TreeItemProps<T>) {
  const parentContext = useTreeContext<T>()
  const { indent } = parentContext

  const itemProps = typeof item.getProps === "function" ? item.getProps() : {}
  const mergedProps = mergeProps<"button">(itemProps, { ...props, children })

  // Extract style from mergedProps to merge with our custom styles
  const { style: propStyle, ...otherProps } = mergedProps

  // Merge styles
  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as React.CSSProperties

  const defaultProps = {
    "data-slot": "tree-item",
    style: mergedStyle,
    className: cn(
      "z-10 cursor-pointer appearance-none border-0 bg-transparent p-0 ps-(--tree-padding) text-left outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    "data-focus":
      typeof item.isFocused === "function"
        ? item.isFocused() || false
        : undefined,
    "data-folder":
      typeof item.isFolder === "function"
        ? item.isFolder() || false
        : undefined,
    "data-selected":
      typeof item.isSelected === "function"
        ? item.isSelected() || false
        : undefined,
    "data-drag-target":
      typeof item.isDragTarget === "function"
        ? item.isDragTarget() || false
        : undefined,
    "data-search-match":
      typeof item.isMatchingSearch === "function"
        ? item.isMatchingSearch() || false
        : undefined,
    "aria-expanded": item.isExpanded(),
  }

  const contextValue = useMemo(
    () => ({ ...parentContext, currentItem: item }),
    [parentContext, item]
  )

  return (
    <TreeContext.Provider value={contextValue}>
      {useRender({
        defaultTagName: "button",
        render,
        props: mergeProps<"button">(defaultProps, otherProps),
      })}
    </TreeContext.Provider>
  )
}

interface TreeItemLabelProps<
  T = any,
> extends React.HTMLAttributes<HTMLSpanElement> {
  hideToggle?: boolean
  item?: ItemInstance<T>
}

function TreeItemLabel<T = any>({
  hideToggle = false,
  item: propItem,
  children,
  className,
  ...props
}: TreeItemLabelProps<T>) {
  const { currentItem, toggleIconType } = useTreeContext<T>()
  const item = propItem || currentItem

  if (!item) {
    console.warn("TreeItemLabel: No item provided via props or context")
    return null
  }
  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "flex items-center gap-1 transition-colors not-in-data-[folder=true]:ps-7 hover:bg-muted in-focus-visible:ring-[3px] in-focus-visible:ring-ring/50 in-data-[drag-target=true]:bg-muted in-data-[search-match=true]:bg-blue-50! in-data-[selected=true]:bg-sidebar-border! in-data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "rounded-3xl",
        "py-1.5",
        "px-2",
        "text-sm",
        className
      )}
      {...props}
    >
      {item.isFolder() &&
        !hideToggle &&
        renderToggleIcon(item.isExpanded(), toggleIconType ?? "plus-minus")}
      {children ||
        (typeof item.getItemName === "function" ? item.getItemName() : null)}
    </span>
  )
}

interface TreeItemToggleProps<
  T = any,
> extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  item?: ItemInstance<T>
}

function TreeItemToggle<T = any>({
  item: propItem,
  className,
  onClick,
  onDoubleClick,
  onMouseDown,
  ...props
}: TreeItemToggleProps<T>) {
  const { currentItem, toggleIconType } = useTreeContext<T>()
  const item = propItem || currentItem

  if (!item || !item.isFolder()) {
    return null
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`${item.isExpanded() ? "Collapse" : "Expand"} ${item.getItemName()}`}
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted/80",
        className
      )}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onMouseDown?.(event)
      }}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(event)
        if (event.defaultPrevented) {
          return
        }

        if (item.isExpanded()) {
          item.collapse()
          return
        }

        item.expand()
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onDoubleClick?.(event)
      }}
      {...props}
    >
      {renderToggleIcon(item.isExpanded(), toggleIconType ?? "plus-minus")}
    </button>
  )
}

function TreeDragLine({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { tree } = useTreeContext()

  if (!tree || typeof tree.getDragLineStyle !== "function") {
    console.warn(
      "TreeDragLine: No tree provided via context or tree does not have getDragLineStyle method"
    )
    return null
  }

  const dragLine = tree.getDragLineStyle()
  return (
    <div
      style={dragLine}
      className={cn(
        "absolute z-30 -mt-px h-0.5 w-[unset] bg-muted-foreground/50 before:absolute before:-top-0.75 before:left-0 before:size-2 before:border-2 before:border-muted-foreground/70",
        "before:rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Tree, TreeItem, TreeItemLabel, TreeItemToggle, TreeDragLine }
