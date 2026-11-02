import type { Video } from './watchModel'
// TikTok and Instagram only offer embedded players: playback progress is not exposed, so status is changed by hand.
export function SocialPlayer({ video, fill = false, autoplay = false, muted = false }: { video: Video; fill?: boolean; autoplay?: boolean; muted?: boolean }) {
  const tiktok = video.platform === 'tiktok'
  const source = tiktok ? `https://www.tiktok.com/player/v1/${video.videoId}?music_info=1&description=1&rel=0${autoplay ? '&autoplay=1' : ''}${autoplay && muted ? '&muted=1' : ''}` : `${video.sourceUrl || `https://www.instagram.com/reel/${video.videoId}/`}embed/`
  return <div className={fill ? 'h-full' : undefined}>
    <iframe title={video.title} src={source} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className={`w-full ${fill ? 'h-full bg-transparent' : 'rounded-[18px] border-2 border-[#15000b] bg-black'} ${fill ? '' : tiktok ? 'aspect-[9/16] max-h-[80svh]' : 'h-[80svh] min-h-[560px]'}`} />
    {!fill && <p className="mt-3 text-sm text-[#55464d]">Playing from {tiktok ? 'TikTok' : 'Instagram'}. {video.sourceUrl && <a className="font-semibold underline underline-offset-4" href={video.sourceUrl} target="_blank" rel="noreferrer noopener">Open original</a>} Progress isn’t tracked for embedded players; use Mark watched when you finish.</p>}
  </div>
}
