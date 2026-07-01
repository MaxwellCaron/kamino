import { MarkdownContent } from "@workspace/ui/components/markdown-content"

type DocumentationPageProps = {
  content: string
}

export function DocumentationPage({ content }: DocumentationPageProps) {
  return (
    <main className="@container/main flex flex-1 flex-col">
      <article className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12 lg:px-6">
        <MarkdownContent>{content}</MarkdownContent>
      </article>
    </main>
  )
}
