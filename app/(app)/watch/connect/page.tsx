import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { WatchSetup } from "@/components/watch-setup"

export default function WatchConnectPage() {
  return <><Link href="/watch" className="mx-auto mb-6 flex max-w-3xl items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Back to Watch</Link><WatchSetup /></>
}
