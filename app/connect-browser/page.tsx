import { ConnectBrowser } from "@/components/connect-browser"

export default async function ConnectBrowserPage({ searchParams }: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  const { code } = await searchParams
  return <ConnectBrowser initialCode={typeof code === "string" ? code.slice(0, 11) : ""} />
}
