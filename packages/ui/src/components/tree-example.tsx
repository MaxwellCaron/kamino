import { IconFile, IconFolder, IconServer } from "@tabler/icons-react"
import { useCallback, useState } from "react"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@workspace/ui/components/tree"
import type { ReactNode } from "react"

type FileNode = {
  id: string
  name: string
  children?: Array<FileNode>
  icon?: ReactNode
}

const initialTree: Array<FileNode> = [
  {
    id: "f-1",
    name: "Public",
    children: [
      {
        id: "f-2",
        name: "Pods",
        children: [
          {
            id: "f-6",
            name: "1001-mcaron-linux",
            children: [
              {
                id: "vm-1",
                name: "Ubuntu",
                icon: <IconServer />,
              },
              {
                id: "vm-2",
                name: "Mint",
                icon: <IconServer />,
              },
              {
                id: "vm-3",
                name: "Arch",
                icon: <IconServer />,
              },
            ],
          },
          {
            id: "f-3",
            name: "1002-mung-linux",
            children: [
              {
                id: "vm-4",
                name: "Ubuntu",
                icon: <IconServer />,
              },
              {
                id: "vm-5",
                name: "Mint",
                icon: <IconServer />,
              },
              {
                id: "vm-6",
                name: "Arch",
                icon: <IconServer />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "f-4",
    name: "Critical",
    children: [
      {
        id: "vm-999",
        name: "mufasa",
        icon: <IconServer />,
      },
      {
        id: "vm-998",
        name: "ursula",
        icon: <IconServer />,
      },
    ],
  },
]

function findNode(nodes: Array<FileNode>, id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

function removeNode(
  nodes: Array<FileNode>,
  id: string
): [Array<FileNode>, FileNode | null] {
  const index = nodes.findIndex((node) => node.id === id)
  if (index !== -1) {
    const removed = nodes[index]
    return [nodes.filter((_, i) => i !== index), removed]
  }

  let removed: FileNode | null = null
  const result = nodes.map((node) => {
    if (!node.children || removed) return node
    const [newChildren, found] = removeNode(node.children, id)
    if (found) {
      removed = found
      return { ...node, children: newChildren }
    }
    return node
  })

  return [result, removed]
}

function isDescendant(
  nodes: Array<FileNode>,
  parentId: string,
  childId: string
): boolean {
  const parent = findNode(nodes, parentId)
  if (!parent?.children) return false
  for (const child of parent.children) {
    if (child.id === childId) return true
    if (child.children && isDescendant([child], child.id, childId)) return true
  }
  return false
}

function sortNodes(nodes: Array<FileNode>): Array<FileNode> {
  return [...nodes]
    .sort((a, b) => {
      // Folders first, then files, both alphabetical
      const aIsFolder = a.children !== undefined ? 0 : 1
      const bIsFolder = b.children !== undefined ? 0 : 1
      if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder
      return a.name.localeCompare(b.name)
    })
    .map((node) =>
      node.children ? { ...node, children: sortNodes(node.children) } : node
    )
}

function insertIntoNode(
  nodes: Array<FileNode>,
  targetId: string,
  nodeToInsert: FileNode
): Array<FileNode> {
  return nodes.map((node) => {
    if (node.id === targetId) {
      return {
        ...node,
        children: [...(node.children ?? []), nodeToInsert],
      }
    }
    if (node.children) {
      return {
        ...node,
        children: insertIntoNode(node.children, targetId, nodeToInsert),
      }
    }
    return node
  })
}

function renderTree(
  nodes: Array<FileNode>,
  level: number,
  parentPath: Array<boolean>
): ReactNode {
  return nodes.map((node, index) => {
    const isLast = index === nodes.length - 1
    const isFolder = node.children !== undefined
    const hasChildren = isFolder && node.children!.length > 0

    return (
      <TreeNode
        key={node.id}
        droppable={isFolder}
        isLast={isLast}
        level={level}
        nodeId={node.id}
        parentPath={parentPath}
      >
        <TreeNodeTrigger>
          <TreeExpander hasChildren={isFolder} />
          <TreeIcon hasChildren={isFolder} icon={node.icon} />
          <TreeLabel>{node.name}</TreeLabel>
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren>
            {renderTree(
              node.children!,
              level + 1,
              level === 0 ? [] : [...parentPath.slice(0, level - 1), isLast]
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  })
}

export default function TreeExample() {
  const [tree, setTree] = useState<Array<FileNode>>(initialTree)

  const handleMove = useCallback(
    (sourceId: string, rawTargetId: string) => {
      // targetId comes prefixed with "drop-" from the droppable wrapper
      const targetId = rawTargetId.startsWith("drop-")
        ? rawTargetId.slice(5)
        : rawTargetId

      if (sourceId === targetId) return
      if (isDescendant(tree, sourceId, targetId)) return

      const [treeWithoutSource, removedNode] = removeNode(tree, sourceId)
      if (!removedNode) return

      const updated = insertIntoNode(treeWithoutSource, targetId, removedNode)
      setTree(sortNodes(updated))
    },
    [tree]
  )

  const renderOverlay = useCallback(
    (draggedId: string) => {
      const node = findNode(tree, draggedId)
      if (!node) return null

      const hasChildren = !!node.children

      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 opacity-50 shadow-xl shadow-black/20">
          <span className="text-muted-foreground">
            {hasChildren ? (
              <IconFolder />
            ) : node.icon ? (
              node.icon
            ) : (
              <IconFile />
            )}
          </span>
          <span className="text-sm font-medium">{node.name}</span>
        </div>
      )
    },
    [tree]
  )

  return (
    <TreeProvider
      defaultExpandedIds={["f-1", "f-2"]}
      indent={12}
      onMove={handleMove}
      renderDragOverlay={renderOverlay}
    >
      <TreeView className="p-0">{renderTree(tree, 0, [])}</TreeView>
    </TreeProvider>
  )
}
