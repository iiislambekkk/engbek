import { WatchReaderRoute } from "@/components/watch-reader-route"

export default async function WatchMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Older watch links may carry an already URL-encoded media ID.
  let mediaId = id
  try {
    mediaId = decodeURIComponent(id)
  } catch {
    // Keep the original ID if it contains a malformed escape sequence.
  }
  return <WatchReaderRoute mediaId={mediaId} />
}
