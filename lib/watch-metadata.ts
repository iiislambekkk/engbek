type CinemetaVideo = {
  title?: string
  season?: number
  episode?: number
  overview?: string
  thumbnail?: string
}

type CinemetaMeta = {
  name?: string
  type?: string
  poster?: string
  background?: string
  description?: string
  releaseInfo?: string
  year?: number
  videos?: CinemetaVideo[]
}

export type WatchCardMetadata = {
  mediaType: "movie" | "series"
  title: string
  poster: string | null
  backdrop: string | null
  overview: string | null
  year: string | null
  episodeTitle: string | null
  episodeOverview: string | null
  episodeThumbnail: string | null
}

const cache = new Map<string, { expiresAt: number; value: WatchCardMetadata | null }>()
const inflight = new Map<string, Promise<WatchCardMetadata | null>>()

async function getMeta(type: "movie" | "series", imdbId: string): Promise<CinemetaMeta | null> {
  try {
    const response = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${encodeURIComponent(imdbId)}.json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3500),
      next: { revalidate: 86400 },
    })
    if (!response.ok) return null
    const result = await response.json() as { meta?: CinemetaMeta }
    return result.meta ?? null
  } catch { return null }
}

export function getWatchCardMetadata(imdbId: string, season: number | null, episode: number | null) {
  if (!/^tt\d{5,12}$/.test(imdbId)) return Promise.resolve(null)
  const key = `${imdbId}:${season ?? ""}:${episode ?? ""}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value)
  const running = inflight.get(key)
  if (running) return running

  const request = (async () => {
    const series = await getMeta("series", imdbId)
    const meta = series?.videos?.length || series?.type === "series" ? series : await getMeta("movie", imdbId) ?? series
    if (!meta) return null
    const isSeries = meta.type === "series" || Boolean(meta.videos?.length)
    const video = isSeries && season !== null && episode !== null
      ? meta.videos?.find(item => item.season === season && item.episode === episode)
      : undefined
    return {
      mediaType: isSeries ? "series" as const : "movie" as const,
      title: typeof meta.name === "string" ? meta.name.slice(0, 300) : "",
      poster: typeof meta.poster === "string" ? meta.poster : null,
      backdrop: typeof meta.background === "string" ? meta.background : null,
      overview: typeof meta.description === "string" ? meta.description.slice(0, 4000) : null,
      year: String(meta.year ?? meta.releaseInfo ?? "").match(/\b\d{4}\b/)?.[0] ?? null,
      episodeTitle: typeof video?.title === "string" ? video.title.slice(0, 300) : null,
      episodeOverview: typeof video?.overview === "string" ? video.overview.slice(0, 2000) : null,
      episodeThumbnail: typeof video?.thumbnail === "string" ? video.thumbnail : null,
    } satisfies WatchCardMetadata
  })().then(value => {
    cache.set(key, { expiresAt: Date.now() + (value ? 86400000 : 300000), value })
    return value
  }).finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}
