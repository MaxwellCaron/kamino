import { FullPageStatus } from "@/components/full-page-status"

export function NotFound() {
  return (
    <FullPageStatus
      statusCode="404"
      title="We can't find that page."
      description="The link may be old, or the page may have moved. Check the URL or head back to somewhere you know."
    />
  )
}
