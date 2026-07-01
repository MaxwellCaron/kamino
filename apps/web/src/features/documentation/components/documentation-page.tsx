import { useEffect } from "react"
import { useRouterState } from "@tanstack/react-router"
import { MarkdownContent } from "@workspace/ui/components/markdown-content"

type DocumentationPageProps = {
  content: string
}

export function DocumentationPage({ content }: DocumentationPageProps) {
  const hash = useRouterState({ select: (s) => s.location.hash })

  useEffect(() => {
    if (!hash) return
    const id = hash.startsWith("#") ? hash.slice(1) : hash
    const el = id ? document.getElementById(id) : null
    el?.scrollIntoView({ block: "start" })
  }, [hash, content])

  return (
    <main className="@container/main flex flex-1 flex-col">
      <article className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12 lg:px-6">
        <MarkdownContent>{content}</MarkdownContent>
      </article>
    </main>
  )
}
