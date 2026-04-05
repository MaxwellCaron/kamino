import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react"
import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, HTMLAttributes, ReactNode } from "react"

type TreeContextType = {
  expandedIds: Set<string>
  selectedIds: Array<string>
  toggleExpanded: (nodeId: string) => void
  handleSelection: (nodeId: string, ctrlKey: boolean) => void
  selectNode: (nodeId: string) => void
  showLines?: boolean
  showIcons?: boolean
  selectable?: boolean
  multiSelect?: boolean
  indent?: number
  animateExpand?: boolean
  dragEnabled: boolean
  draggedId: string | null
}

const TreeContext = createContext<TreeContextType | undefined>(undefined)

export const useTree = () => {
  const context = useContext(TreeContext)
  if (!context) {
    throw new Error("Tree components must be used within a TreeProvider")
  }
  return context
}

type TreeNodeContextType = {
  nodeId: string
  level: number
  isLast: boolean
  parentPath: Array<boolean>
  isDroppableNode: boolean
}

const TreeNodeContext = createContext<TreeNodeContextType | undefined>(
  undefined
)

export const useTreeNode = () => {
  const context = useContext(TreeNodeContext)
  if (!context) {
    throw new Error("TreeNode components must be used within a TreeNode")
  }
  return context
}

export type TreeProviderProps = {
  children: ReactNode
  defaultExpandedIds?: Array<string>
  showLines?: boolean
  showIcons?: boolean
  selectable?: boolean
  multiSelect?: boolean
  selectedIds?: Array<string>
  onSelectionChange?: (selectedIds: Array<string>) => void
  indent?: number
  animateExpand?: boolean
  className?: string
  onMove?: (sourceId: string, targetId: string) => void
  renderDragOverlay?: (draggedId: string) => ReactNode
}

export const TreeProvider = ({
  children,
  defaultExpandedIds = [],
  showLines = true,
  showIcons = true,
  selectable = true,
  multiSelect = false,
  selectedIds,
  onSelectionChange,
  indent = 20,
  animateExpand = true,
  className,
  onMove,
  renderDragOverlay,
}: TreeProviderProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(defaultExpandedIds)
  )
  const [internalSelectedIds, setInternalSelectedIds] = useState<Array<string>>(
    selectedIds ?? []
  )
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const dragEnabled = !!onMove

  const isControlled =
    selectedIds !== undefined && onSelectionChange !== undefined
  const currentSelectedIds = isControlled ? selectedIds : internalSelectedIds

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }, [])

  const handleSelection = useCallback(
    (nodeId: string, ctrlKey = false) => {
      if (!selectable) {
        return
      }

      let newSelection: Array<string>

      if (multiSelect && ctrlKey) {
        newSelection = currentSelectedIds.includes(nodeId)
          ? currentSelectedIds.filter((id) => id !== nodeId)
          : [...currentSelectedIds, nodeId]
      } else {
        newSelection = currentSelectedIds.includes(nodeId) ? [] : [nodeId]
      }

      if (isControlled) {
        onSelectionChange(newSelection)
      } else {
        setInternalSelectedIds(newSelection)
      }
    },
    [
      selectable,
      multiSelect,
      currentSelectedIds,
      isControlled,
      onSelectionChange,
    ]
  )

  const selectNode = useCallback(
    (nodeId: string) => {
      const newSelection = [nodeId]
      if (isControlled) {
        onSelectionChange(newSelection)
      } else {
        setInternalSelectedIds(newSelection)
      }
    },
    [isControlled, onSelectionChange]
  )

  const contextValue: TreeContextType = {
    expandedIds,
    selectedIds: currentSelectedIds,
    toggleExpanded,
    handleSelection,
    selectNode,
    showLines,
    showIcons,
    selectable,
    multiSelect,
    indent,
    animateExpand,
    dragEnabled,
    draggedId,
  }

  const treeContent = (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full", className)}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )

  return (
    <TreeContext.Provider value={contextValue}>
      {dragEnabled ? (
        <DragDropProvider
          onDragStart={(event) => {
            setDraggedId(String(event.operation.source?.id))
          }}
          onDragEnd={(event) => {
            const sourceId = String(event.operation.source?.id)
            const targetId = event.operation.target?.id

            if (!event.canceled && targetId && sourceId !== String(targetId)) {
              onMove(sourceId, String(targetId))
            }

            setDraggedId(null)
          }}
        >
          {treeContent}
          {renderDragOverlay && (
            <DragOverlay dropAnimation={null}>
              {(source) => renderDragOverlay(String(source.id))}
            </DragOverlay>
          )}
        </DragDropProvider>
      ) : (
        treeContent
      )}
    </TreeContext.Provider>
  )
}

export type TreeViewProps = HTMLAttributes<HTMLDivElement>

export const TreeView = ({ className, children, ...props }: TreeViewProps) => (
  <div className={cn("p-2", className)} {...props}>
    {children}
  </div>
)

export type TreeNodeProps = HTMLAttributes<HTMLDivElement> & {
  nodeId?: string
  level?: number
  isLast?: boolean
  parentPath?: Array<boolean>
  children?: ReactNode
  droppable?: boolean
}

export const TreeNode = ({
  nodeId: providedNodeId,
  level = 0,
  isLast = false,
  parentPath = [],
  droppable: isDroppableNode = false,
  children,
  className,
  ...props
}: TreeNodeProps) => {
  const generatedId = useId()
  const nodeId = providedNodeId ?? generatedId

  const currentPath = level === 0 ? [] : [...parentPath]
  if (level > 0 && parentPath.length < level - 1) {
    while (currentPath.length < level - 1) {
      currentPath.push(false)
    }
  }
  if (level > 0) {
    currentPath[level - 1] = isLast
  }

  return (
    <TreeNodeContext.Provider
      value={{
        nodeId,
        level,
        isLast,
        parentPath: currentPath,
        isDroppableNode,
      }}
    >
      <div className={cn("select-none", className)} {...props}>
        {children}
      </div>
    </TreeNodeContext.Provider>
  )
}

export type TreeNodeTriggerProps = ComponentProps<typeof motion.div>

export const TreeNodeTrigger = ({
  children,
  className,
  onClick,
  ...props
}: TreeNodeTriggerProps) => {
  const {
    selectedIds,
    toggleExpanded,
    handleSelection,
    indent,
    dragEnabled,
    draggedId,
  } = useTree()
  const { nodeId, level, isDroppableNode } = useTreeNode()
  const isSelected = !isDroppableNode && selectedIds.includes(nodeId)

  const triggerRef = useRef<HTMLDivElement>(null)
  const { isDragSource } = useDraggable({
    id: nodeId,
    element: triggerRef,
    disabled: !dragEnabled,
  })

  const { isDropTarget } = useDroppable({
    id: `drop-${nodeId}`,
    element: triggerRef,
    disabled: !dragEnabled || !isDroppableNode,
  })

  const isDraggedOver = isDropTarget && draggedId !== nodeId

  return (
    <motion.div
      ref={triggerRef}
      className={cn(
        "group/row relative mx-1 flex cursor-default items-center rounded-3xl px-3 py-1.5 transition-all duration-200",
        "hover:bg-sidebar-accent",
        (isSelected || isDraggedOver) && "bg-sidebar-accent",
        isDragSource && "opacity-25",
        className
      )}
      onClick={(e) => {
        if (draggedId) return
        toggleExpanded(nodeId)
        if (!isDroppableNode) {
          handleSelection(nodeId, e.ctrlKey || e.metaKey)
        }
        onClick?.(e)
      }}
      style={{ paddingLeft: level * (indent ?? 0) + 8 }}
      whileTap={
        dragEnabled ? undefined : { scale: 0.98, transition: { duration: 0.1 } }
      }
      {...props}
    >
      <TreeLines />
      {children as ReactNode}
    </motion.div>
  )
}

export const TreeLines = () => {
  const { showLines, indent } = useTree()
  const { level, isLast, parentPath } = useTreeNode()

  if (!showLines || level === 0) {
    return null
  }

  return (
    <div className="pointer-events-none absolute top-0 bottom-0 left-0">
      {Array.from({ length: level }, (_, index) => {
        const shouldHideLine = parentPath[index] === true
        if (shouldHideLine && index === level - 1) {
          return null
        }

        return (
          <div
            className="absolute top-0 bottom-0 border-l border-border/40"
            key={index.toString()}
            style={{
              left: index * (indent ?? 0) + 12,
              display: shouldHideLine ? "none" : "block",
            }}
          />
        )
      })}

      <div
        className="absolute top-1/2 border-t border-border/40"
        style={{
          left: (level - 1) * (indent ?? 0) + 12,
          width: (indent ?? 0) - 4,
          transform: "translateY(-1px)",
        }}
      />

      {isLast && (
        <div
          className="absolute top-0 border-l border-border/40"
          style={{
            left: (level - 1) * (indent ?? 0) + 12,
            height: "50%",
          }}
        />
      )}
    </div>
  )
}

export type TreeNodeContentProps = ComponentProps<typeof motion.div> & {
  hasChildren?: boolean
}

export const TreeNodeContent = ({
  children,
  hasChildren = false,
  className,
  ...props
}: TreeNodeContentProps) => {
  const { animateExpand, expandedIds } = useTree()
  const { nodeId } = useTreeNode()
  const isExpanded = expandedIds.has(nodeId)

  return (
    <AnimatePresence>
      {hasChildren && isExpanded && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{
            duration: animateExpand ? 0.3 : 0,
            ease: "easeInOut",
          }}
        >
          <motion.div
            animate={{ y: 0 }}
            className={className}
            exit={{ y: -10 }}
            initial={{ y: -10 }}
            transition={{
              duration: animateExpand ? 0.2 : 0,
              delay: animateExpand ? 0.1 : 0,
            }}
            {...props}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export type TreeExpanderProps = ComponentProps<typeof motion.div> & {
  hasChildren?: boolean
}

export const TreeExpander = ({
  hasChildren = false,
  className,
  onClick,
  ...props
}: TreeExpanderProps) => {
  const { expandedIds, toggleExpanded } = useTree()
  const { nodeId } = useTreeNode()
  const isExpanded = expandedIds.has(nodeId)

  if (!hasChildren) {
    return <div className="mr-1 h-4 w-4" />
  }

  return (
    <motion.div
      animate={{ rotate: isExpanded ? 90 : 0 }}
      className={cn(
        "mr-1 flex h-4 w-4 cursor-default items-center justify-center",
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
        toggleExpanded(nodeId)
        onClick?.(e)
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      {...props}
    >
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </motion.div>
  )
}

export type TreeIconProps = ComponentProps<typeof motion.div> & {
  icon?: ReactNode
  hasChildren?: boolean
}

export const TreeIcon = ({
  icon,
  hasChildren = false,
  className,
  ...props
}: TreeIconProps) => {
  const { showIcons, expandedIds } = useTree()
  const { nodeId } = useTreeNode()
  const isExpanded = expandedIds.has(nodeId)

  if (!showIcons) {
    return null
  }

  const getDefaultIcon = () =>
    hasChildren ? (
      isExpanded ? (
        <FolderOpen className="h-4 w-4" />
      ) : (
        <Folder className="h-4 w-4" />
      )
    ) : (
      <File className="h-4 w-4" />
    )

  return (
    <motion.div
      className={cn(
        "mr-2 flex h-4 w-4 items-center justify-center text-muted-foreground",
        className
      )}
      transition={{ duration: 0.15 }}
      whileHover={{ scale: 1.1 }}
      {...props}
    >
      {icon || getDefaultIcon()}
    </motion.div>
  )
}

export type TreeLabelProps = HTMLAttributes<HTMLSpanElement>

export const TreeLabel = ({ className, ...props }: TreeLabelProps) => (
  <span className={cn("font flex-1 truncate text-sm", className)} {...props} />
)
