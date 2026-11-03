import * as React from "react"
import { SourceCodeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@workspace/ui/lib/utils"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@workspace/ui/components/code-block"
import { useHighlightedCode } from "@workspace/ui/hooks/use-highlighted-code"

type MarkdownCodeElementProps = {
  children?: React.ReactNode
  className?: string
  node?: {
    data?: {
      meta?: unknown
    }
  }
}

function getCodeBlockFilename(meta: unknown) {
  if (typeof meta !== "string") {
    return undefined
  }

  const match = meta.match(/(?:^|\s)file:(?:"([^"]+)"|'([^']+)'|(\S+))/)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function extractCodeBlock(children: React.ReactNode) {
  const child =
    React.Children.count(children) === 1 ? React.Children.only(children) : null

  if (!React.isValidElement<MarkdownCodeElementProps>(child)) {
    return null
  }

  const className = child.props.className ?? ""
  const language = className.match(/language-([^\s]+)/)?.[1]
  const codeChildren = child.props.children
  const code = Array.isArray(codeChildren)
    ? codeChildren.join("")
    : String(codeChildren ?? "")

  return {
    code: code.replace(/\n$/, ""),
    filename: getCodeBlockFilename(child.props.node?.data?.meta),
    language: language ?? "text",
  }
}

function MarkdownCodeBlockFallback({
  children,
  className,
  defaultValue: _defaultValue,
  ...props
}: React.ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "my-6 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-normal",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  )
}

export function MarkdownCodeBlock({
  children,
  className,
  defaultValue: _defaultValue,
  ...props
}: React.ComponentProps<"pre">) {
  const block = extractCodeBlock(children)
  const lines = useHighlightedCode(block?.code ?? "", block?.language ?? "text")

  if (!block) {
    return (
      <MarkdownCodeBlockFallback className={className} {...props}>
        {children}
      </MarkdownCodeBlockFallback>
    )
  }

  return (
    <CodeBlock className={cn("my-6", className)}>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <HugeiconsIcon icon={SourceCodeIcon} aria-hidden="true" />
          {block.filename ?? block.language}
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton value={block.code} />
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent {...props} lineNumbers>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
    </CodeBlock>
  )
}
