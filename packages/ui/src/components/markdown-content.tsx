import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"
import type { Components } from "react-markdown"

const remarkPlugins = [remarkGfm]

export const markdownComponents: Components = {
  h1: ({ className, node: _node, ...props }) => (
    <h1
      className={cn(
        "mt-10 scroll-m-20 text-4xl font-extrabold tracking-tight text-balance first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2
      className={cn(
        "mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
        className
      )}
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn(
        "mt-8 scroll-m-20 text-2xl font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, node: _node, ...props }) => (
    <h4
      className={cn(
        "mt-8 scroll-m-20 text-xl font-semibold tracking-tight",
        className
      )}
      {...props}
    />
  ),
  h5: ({ className, node: _node, ...props }) => (
    <h5
      className={cn("mt-8 scroll-m-20 text-lg font-semibold", className)}
      {...props}
    />
  ),
  h6: ({ className, node: _node, ...props }) => (
    <h6
      className={cn("mt-8 scroll-m-20 text-base font-semibold", className)}
      {...props}
    />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p
      className={cn("leading-7 [&:not(:first-child)]:mt-6", className)}
      {...props}
    />
  ),
  a: ({ className, node: _node, ...props }) => (
    <a
      className={cn(
        "font-medium text-primary underline underline-offset-4",
        className
      )}
      {...props}
    />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul
      className={cn(
        "my-6 ml-6 list-disc [&_input]:mr-2 [&.contains-task-list]:ml-0 [&.contains-task-list]:list-none [&>li]:mt-2",
        className
      )}
      {...props}
    />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol
      className={cn("my-6 ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li className={cn("pl-1", className)} {...props} />
  ),
  code: ({ className, node: _node, ...props }) => (
    <code
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
        className
      )}
      {...props}
    />
  ),
  pre: ({ className, node: _node, ...props }) => (
    <pre
      className={cn(
        "my-6 overflow-x-auto rounded-lg border bg-muted p-4 text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-normal",
        className
      )}
      {...props}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className={cn("w-full", className)} {...props} />
    </div>
  ),
  tr: ({ className, node: _node, ...props }) => (
    <tr
      className={cn("m-0 border-t p-0 even:bg-muted", className)}
      {...props}
    />
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      className={cn(
        "border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td
      className={cn(
        "border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right",
        className
      )}
      {...props}
    />
  ),
  img: ({ className, node: _node, ...props }) => (
    <img
      className={cn(
        "mx-auto my-6 max-h-80 w-auto max-w-full rounded-md border object-contain sm:max-h-96",
        className
      )}
      {...props}
    />
  ),
  input: ({ className, node: _node, type, ...props }) => (
    <input
      type={type}
      className={cn(
        type === "checkbox" &&
          "size-4 align-middle accent-primary disabled:cursor-default",
        className
      )}
      {...props}
    />
  ),
  hr: ({ className, node: _node }) => (
    <Separator className={cn("my-8", className)} />
  ),
}

export type MarkdownContentProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  children: string
  components?: Components
}

function MarkdownContent({
  children,
  className,
  components,
  ...props
}: MarkdownContentProps) {
  return (
    <div
      data-slot="markdown-content"
      className={cn(
        "min-w-0 text-sm wrap-break-word text-foreground/90",
        className
      )}
      {...props}
    >
      <ReactMarkdown
        components={
          components
            ? { ...markdownComponents, ...components }
            : markdownComponents
        }
        remarkPlugins={remarkPlugins}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export { MarkdownContent }
