import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "./kibo-ui/code-block"
import type { BundledLanguage } from "./kibo-ui/code-block"

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

  if (!block) {
    return (
      <MarkdownCodeBlockFallback className={className} {...props}>
        {children}
      </MarkdownCodeBlockFallback>
    )
  }

  return (
    <CodeBlock
      className={cn("my-6", className)}
      data={[
        {
          language: block.language,
          filename: block.filename ?? block.language,
          code: block.code,
        },
      ]}
      defaultValue={block.language}
    >
      <CodeBlockHeader className="justify-between gap-2 bg-muted pr-1 pl-3">
        <CodeBlockFiles>
          {(item) => (
            <CodeBlockFilename key={item.language} value={item.language}>
              {item.filename}
            </CodeBlockFilename>
          )}
        </CodeBlockFiles>
        <CodeBlockCopyButton
          className="text-muted-foreground"
          size="icon-sm"
          text={block.code}
        />
      </CodeBlockHeader>
      <CodeBlockBody>
        {(item) => (
          <CodeBlockItem key={item.language} value={item.language}>
            <CodeBlockContent
              className="overflow-x-auto"
              language={item.language as BundledLanguage}
            >
              {item.code}
            </CodeBlockContent>
          </CodeBlockItem>
        )}
      </CodeBlockBody>
    </CodeBlock>
  )
}
