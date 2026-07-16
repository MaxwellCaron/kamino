import { useEffect, useMemo } from "react"
import { useRouterState } from "@tanstack/react-router"
import { MarkdownContent } from "@workspace/ui/components/markdown-content"
import { DocsToc } from "@/features/documentation/components/docs-toc"
import { extractDocsToc } from "@/features/documentation/utils/docs-toc"

type DocumentationPageProps = {
  content: string
}

export function DocumentationPage({ content }: DocumentationPageProps) {
  const hash = useRouterState({ select: (s) => s.location.hash })
  const tocItems = useMemo(() => extractDocsToc(content), [content])

  useEffect(() => {
    if (!hash) return
    const id = hash.startsWith("#") ? hash.slice(1) : hash
    const el = id ? document.getElementById(id) : null
    el?.scrollIntoView({ block: "start" })
  }, [hash, content])

  return (
    <main className="@container/main flex flex-1 flex-col">
      <div className="grid w-full grid-cols-1 px-4 lg:px-6 xl:grid-cols-[1fr_min(48rem,100%)_1fr]">
        <div className="hidden xl:block" aria-hidden="true" />
        <article className="mx-auto w-full max-w-3xl py-8 md:py-12 xl:col-start-2 xl:mx-0 xl:max-w-none">
          <MarkdownContent>{content}</MarkdownContent>
        </article>
        <aside className="hidden w-56 justify-self-end py-8 md:py-12 xl:col-start-3 xl:row-start-1 xl:block">
          <div className="sticky top-8">
            <DocsToc items={tocItems} />
          </div>
        </aside>
      </div>
    </main>
  )
}
