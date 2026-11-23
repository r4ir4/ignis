export type TitleKind = 'movie' | 'tv'
export type TitleStatus = 'watchlist' | 'watching' | 'finished'
export type WatchedEpisode = { season: number; episode: number; watchedAt: string; runtime?: number | null }
export type Title = {
  id: string; mediaType: TitleKind; tmdbId: number; title: string; releaseDate: string; overview: string; posterUrl: string
  voteAverage: number | null; status: TitleStatus; rating: number; favorite: boolean; watchedAt: string | null; addedAt: string
  runtimeMinutes: number | null; genres: string[]; providers: string[]; episodeTotal: number | null; episodes: WatchedEpisode[]
}
export type SearchResult = { mediaType: TitleKind; tmdbId: number; title: string; releaseDate: string; overview: string; posterUrl: string; voteAverage: number | null }
export type SeasonInfo = { number: number; name: string; episodeCount: number; airDate: string }
export type EpisodeInfo = { number: number; name: string; airDate: string; runtime: number | null; overview: string }

export const statusLabel: Record<TitleStatus, string> = { watchlist: 'Watchlist', watching: 'Watching', finished: 'Finished' }

export const titleYear = (date: string) => date.slice(0, 4)

/** Episodes watched out of the total, for the card; null when there is nothing to show (a film, or a series with no known total). */
export function progressText(title: Pick<Title, 'mediaType' | 'episodes' | 'episodeTotal'>) {
  if (title.mediaType !== 'tv' || !title.episodeTotal) return null
  const done = Math.min(title.episodes.length, title.episodeTotal)
  return { fraction: done / title.episodeTotal, label: `${done}/${title.episodeTotal} eps` }
}

export function filterTitles(titles: Title[], tab: TitleStatus | 'all' | 'favorites', query: string) {
  const needle = query.trim().toLowerCase()
  return titles.filter(title => (tab === 'all' || (tab === 'favorites' ? title.favorite : title.status === tab)) && (!needle || title.title.toLowerCase().includes(needle)))
}

export function sortTitles(titles: Title[], sort: 'added' | 'title' | 'rating' | 'year') {
  const copy = [...titles]
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'rating') copy.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title))
  else if (sort === 'year') copy.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
  else copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  return copy
}
