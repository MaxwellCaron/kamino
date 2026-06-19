"use client"

import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers"
import { IconCheck, IconCode, IconCopy } from "@tabler/icons-react"
import { createBundledHighlighter } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import type { BundledLanguage } from "shiki"
import type { CodeOptionsMultipleThemes } from "shiki/core"
import type {
  ComponentProps,
  ComponentType,
  HTMLAttributes,
  ReactNode,
} from "react"

export type { BundledLanguage } from "shiki"

type CodeBlockIcon = ComponentType<{ className?: string }>

function getCodeBlockHeaderIcon(
  value?: string,
  filename?: ReactNode
): CodeBlockIcon | undefined {
  if (value !== undefined) {
    return IconCode
  }

  return typeof filename === "string" && filename.length > 0 ? IconCode : undefined
}

const lineNumberClassNames = cn(
  "[&_code]:[counter-reset:line]",
  "[&_code]:[counter-increment:line_0]",
  "[&_.line]:before:content-[counter(line)]",
  "[&_.line]:before:inline-block",
  "[&_.line]:before:[counter-increment:line]",
  "[&_.line]:before:w-4",
  "[&_.line]:before:mr-4",
  "[&_.line]:before:text-[13px]",
  "[&_.line]:before:text-right",
  "[&_.line]:before:text-muted-foreground/50",
  "[&_.line]:before:font-mono",
  "[&_.line]:before:select-none"
)

const darkModeClassNames = cn(
  "dark:[&_.shiki]:!text-[var(--shiki-dark)]",
  // "dark:[&_.shiki]:!bg-[var(--shiki-dark-bg)]",
  "dark:[&_.shiki]:![font-style:var(--shiki-dark-font-style)]",
  "dark:[&_.shiki]:![font-weight:var(--shiki-dark-font-weight)]",
  "dark:[&_.shiki]:![text-decoration:var(--shiki-dark-text-decoration)]",
  "dark:[&_.shiki_span]:!text-[var(--shiki-dark)]",
  "dark:[&_.shiki_span]:![font-style:var(--shiki-dark-font-style)]",
  "dark:[&_.shiki_span]:![font-weight:var(--shiki-dark-font-weight)]",
  "dark:[&_.shiki_span]:![text-decoration:var(--shiki-dark-text-decoration)]"
)

const lineHighlightClassNames = cn(
  "[&_.line.highlighted]:bg-blue-50",
  "[&_.line.highlighted]:after:bg-blue-500",
  "[&_.line.highlighted]:after:absolute",
  "[&_.line.highlighted]:after:left-0",
  "[&_.line.highlighted]:after:top-0",
  "[&_.line.highlighted]:after:bottom-0",
  "[&_.line.highlighted]:after:w-0.5",
  "dark:[&_.line.highlighted]:!bg-blue-500/10"
)

const lineDiffClassNames = cn(
  "[&_.line.diff]:after:absolute",
  "[&_.line.diff]:after:left-0",
  "[&_.line.diff]:after:top-0",
  "[&_.line.diff]:after:bottom-0",
  "[&_.line.diff]:after:w-0.5",
  "[&_.line.diff.add]:bg-emerald-50",
  "[&_.line.diff.add]:after:bg-emerald-500",
  "[&_.line.diff.remove]:bg-rose-50",
  "[&_.line.diff.remove]:after:bg-rose-500",
  "dark:[&_.line.diff.add]:!bg-emerald-500/10",
  "dark:[&_.line.diff.remove]:!bg-rose-500/10"
)

const lineFocusedClassNames = cn(
  "[&_code:has(.focused)_.line]:blur-[2px]",
  "[&_code:has(.focused)_.line.focused]:blur-none"
)

const wordHighlightClassNames = cn(
  "[&_.highlighted-word]:bg-blue-50",
  "dark:[&_.highlighted-word]:!bg-blue-500/10"
)

const codeBlockClassName = cn(
  "mt-0 bg-muted/50 text-sm",
  "[&_pre]:py-4",
  // "[&_.shiki]:!bg-[var(--shiki-bg)]",
  "[&_.shiki]:!bg-transparent",
  "[&_code]:w-full",
  "[&_code]:grid",
  "[&_code]:overflow-x-auto",
  "[&_code]:bg-transparent",
  "[&_.line]:px-4",
  "[&_.line]:w-full",
  "[&_.line]:relative"
)

const highlightLanguageLoaders = {
  bash: () => import("shiki/langs/bash.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
}

const highlightThemeLoaders = {
  "github-dark-default": () => import("shiki/themes/github-dark-default.mjs"),
  "github-light": () => import("shiki/themes/github-light.mjs"),
}

type HighlightLanguage = keyof typeof highlightLanguageLoaders
type HighlightTheme = keyof typeof highlightThemeLoaders

const languageAliases: Record<string, HighlightLanguage> = {
  dockerfile: "docker",
  js: "javascript",
  md: "markdown",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
}

const createHighlighter = createBundledHighlighter<
  HighlightLanguage,
  HighlightTheme
>({
  engine: () => createJavaScriptRegexEngine(),
  langs: highlightLanguageLoaders,
  themes: highlightThemeLoaders,
})

const highlighterPromises = new Map<
  HighlightLanguage,
  ReturnType<typeof createHighlighter>
>()

function getHighlighter(language: HighlightLanguage) {
  const existingHighlighter = highlighterPromises.get(language)

  if (existingHighlighter) {
    return existingHighlighter
  }

  const nextHighlighter = createHighlighter({
    langs: [language],
    langAlias: languageAliases,
    themes: ["github-light", "github-dark-default"],
  })
  highlighterPromises.set(language, nextHighlighter)

  return nextHighlighter
}

function getHighlightLanguage(language?: string): HighlightLanguage | null {
  const normalized = language?.toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized in highlightLanguageLoaders) {
    return normalized as HighlightLanguage
  }

  return languageAliases[normalized] ?? null
}

const highlight = (
  html: string,
  language?: BundledLanguage,
  themes?: CodeOptionsMultipleThemes["themes"]
) => {
  const highlightLanguage = getHighlightLanguage(language)

  if (!highlightLanguage) {
    return Promise.resolve(null)
  }

  return getHighlighter(highlightLanguage).then((highlighter) =>
    highlighter.codeToHtml(html, {
      lang: highlightLanguage,
      themes: themes ?? {
        light: "github-light",
        dark: "github-dark-default",
      },
      transformers: [
        transformerNotationDiff({
          matchAlgorithm: "v3",
        }),
        transformerNotationHighlight({
          matchAlgorithm: "v3",
        }),
        transformerNotationWordHighlight({
          matchAlgorithm: "v3",
        }),
        transformerNotationFocus({
          matchAlgorithm: "v3",
        }),
        transformerNotationErrorLevel({
          matchAlgorithm: "v3",
        }),
      ],
    })
  )
}

type CodeBlockData = {
  language: string
  filename: string
  code: string
}

type CodeBlockContextType = {
  value: string | undefined
  onValueChange: ((value: string) => void) | undefined
  data: Array<CodeBlockData>
}

const CodeBlockContext = createContext<CodeBlockContextType>({
  value: undefined,
  onValueChange: undefined,
  data: [],
})

export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  data: Array<CodeBlockData>
}

export const CodeBlock = ({
  value: controlledValue,
  onValueChange: controlledOnValueChange,
  defaultValue,
  className,
  data,
  ...props
}: CodeBlockProps) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "")

  useEffect(() => {
    if (controlledValue !== undefined) {
      setUncontrolledValue(controlledValue)
    }
  }, [controlledValue])

  const value = controlledValue ?? uncontrolledValue

  const onValueChange = useCallback(
    (nextValue: string) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(nextValue)
      }

      controlledOnValueChange?.(nextValue)
    },
    [controlledOnValueChange, controlledValue]
  )

  const contextValue = useMemo(
    () => ({ value, onValueChange, data }),
    [data, onValueChange, value]
  )

  return (
    <CodeBlockContext.Provider value={contextValue}>
      <div
        className={cn("size-full overflow-hidden rounded-md border", className)}
        {...props}
      />
    </CodeBlockContext.Provider>
  )
}

export type CodeBlockHeaderProps = HTMLAttributes<HTMLDivElement>

export const CodeBlockHeader = ({
  className,
  ...props
}: CodeBlockHeaderProps) => (
  <div
    className={cn(
      "flex flex-row items-center border-b bg-secondary p-1",
      className
    )}
    {...props}
  />
)

export type CodeBlockFilesProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: (item: CodeBlockData) => ReactNode
}

export const CodeBlockFiles = ({
  className,
  children,
  ...props
}: CodeBlockFilesProps) => {
  const { data } = useContext(CodeBlockContext)

  return (
    <div
      className={cn("flex grow flex-row items-center gap-2", className)}
      {...props}
    >
      {data.map(children)}
    </div>
  )
}

export type CodeBlockFilenameProps = HTMLAttributes<HTMLDivElement> & {
  icon?: CodeBlockIcon
  value?: string
}

export const CodeBlockFilename = ({
  className,
  icon,
  value,
  children,
  ...props
}: CodeBlockFilenameProps) => {
  const { value: activeValue } = useContext(CodeBlockContext)
  const defaultIcon = getCodeBlockHeaderIcon(value, children)
  const Icon = icon ?? defaultIcon

  if (value !== activeValue) {
    return null
  }

  return (
    <div
      className="flex items-center gap-2 bg-muted px-4 py-1.5 text-xs text-muted-foreground"
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 truncate">{children}</span>
    </div>
  )
}

export type CodeBlockSelectProps = Omit<
  ComponentProps<typeof Select>,
  "defaultValue" | "onValueChange" | "value"
> & {
  onValueChange?: (value: string) => void
}

export const CodeBlockSelect = ({
  onValueChange: onValueChangeProp,
  ...props
}: CodeBlockSelectProps) => {
  const { value, onValueChange } = useContext(CodeBlockContext)

  return (
    <Select
      {...props}
      onValueChange={(nextValue) => {
        if (nextValue != null) {
          const nextStringValue = nextValue as string
          onValueChange?.(nextStringValue)
          onValueChangeProp?.(nextStringValue)
        }
      }}
      value={value}
    />
  )
}

export type CodeBlockSelectTriggerProps = ComponentProps<typeof SelectTrigger>

export const CodeBlockSelectTrigger = ({
  className,
  ...props
}: CodeBlockSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      "w-fit border-none text-xs text-muted-foreground shadow-none",
      className
    )}
    {...props}
  />
)

export type CodeBlockSelectValueProps = ComponentProps<typeof SelectValue>

export const CodeBlockSelectValue = (props: CodeBlockSelectValueProps) => (
  <SelectValue {...props} />
)

export type CodeBlockSelectContentProps = Omit<
  ComponentProps<typeof SelectContent>,
  "children"
> & {
  children: (item: CodeBlockData) => ReactNode
}

export const CodeBlockSelectContent = ({
  children,
  ...props
}: CodeBlockSelectContentProps) => {
  const { data } = useContext(CodeBlockContext)

  return (
    <SelectContent {...props}>
      <SelectGroup>{data.map(children)}</SelectGroup>
    </SelectContent>
  )
}

export type CodeBlockSelectItemProps = ComponentProps<typeof SelectItem>

export const CodeBlockSelectItem = ({
  className,
  ...props
}: CodeBlockSelectItemProps) => (
  <SelectItem className={cn("text-sm", className)} {...props} />
)

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  text?: string
  timeout?: number
}

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  text,
  timeout = 2000,
  children,
  className,
  onClick,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const { data, value } = useContext(CodeBlockContext)
  const code =
    text ??
    data.find((item) => item.language === value || item.filename === value)
      ?.code ??
    (data.length === 1 ? data[0]?.code : undefined)

  const handleCopySuccess = () => {
    setIsCopied(true)
    onCopy?.()

    setTimeout(() => setIsCopied(false), timeout)
  }

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !code) {
      return
    }

    try {
      await navigator.clipboard.writeText(code)
      handleCopySuccess()
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error("Failed to copy code to clipboard")
      )
    }
  }

  const Icon = isCopied ? IconCheck : IconCopy
  const handleClick: NonNullable<ComponentProps<typeof Button>["onClick"]> = (
    event
  ) => {
    onClick?.(event)

    if (!event.defaultPrevented) {
      void copyToClipboard()
    }
  }

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={handleClick}
      size="icon"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon className="text-muted-foreground" />}
    </Button>
  )
}

type CodeBlockFallbackProps = HTMLAttributes<HTMLDivElement>

const CodeBlockFallback = ({ children, ...props }: CodeBlockFallbackProps) => (
  <div {...props}>
    <pre className="w-full">
      <code>
        {children
          ?.toString()
          .split("\n")
          .map((line, i) => (
            <span className="line" key={i}>
              {line}
            </span>
          ))}
      </code>
    </pre>
  </div>
)

export type CodeBlockBodyProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  children: (item: CodeBlockData) => ReactNode
}

export const CodeBlockBody = ({ children, ...props }: CodeBlockBodyProps) => {
  const { data } = useContext(CodeBlockContext)

  return <div {...props}>{data.map(children)}</div>
}

export type CodeBlockItemProps = HTMLAttributes<HTMLDivElement> & {
  value: string
  lineNumbers?: boolean
}

export const CodeBlockItem = ({
  children,
  lineNumbers = true,
  className,
  value,
  ...props
}: CodeBlockItemProps) => {
  const { value: activeValue } = useContext(CodeBlockContext)

  if (value !== activeValue) {
    return null
  }

  return (
    <div
      className={cn(
        codeBlockClassName,
        lineHighlightClassNames,
        lineDiffClassNames,
        lineFocusedClassNames,
        wordHighlightClassNames,
        darkModeClassNames,
        lineNumbers && lineNumberClassNames,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockContentProps = HTMLAttributes<HTMLDivElement> & {
  themes?: CodeOptionsMultipleThemes["themes"]
  language?: BundledLanguage
  syntaxHighlighting?: boolean
  children: string
}

export const CodeBlockContent = ({
  children,
  themes,
  language,
  syntaxHighlighting = true,
  ...props
}: CodeBlockContentProps) => {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!syntaxHighlighting) {
      return
    }

    highlight(children as string, language, themes)
      .then(setHtml)
      .catch(() => setHtml(null))
  }, [children, themes, syntaxHighlighting, language])

  if (!(syntaxHighlighting && html)) {
    return <CodeBlockFallback>{children}</CodeBlockFallback>
  }

  return (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: "Kinda how Shiki works"
      dangerouslySetInnerHTML={{ __html: html }}
      {...props}
    />
  )
}
