import type { Album } from '../data/albums'

interface BottomBarProps {
  album: Album
  isPlaying: boolean
  onPlayPause: () => void
  onPrevious: () => void
  onNext: () => void
}

export default function BottomBar({
  album,
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
}: BottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 w-full h-24 bg-white/80 backdrop-blur-2xl flex items-center justify-between px-10 z-50 border-t border-black/5 shadow-[0_-18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex items-end gap-3 flex-1 min-w-[250px]">
        <h1 className="text-slate-950 text-[32px] font-bold tracking-tight leading-none flex items-center -space-x-1.5 cursor-pointer group">
          Zhao&apos;s Music Library
        </h1>
      </div>

      <div className="flex items-center gap-8 justify-center flex-1">
        <button
          type="button"
          className="text-slate-500 hover:text-slate-950 transition-colors p-2"
          aria-label="Previous"
          onClick={onPrevious}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button
          type="button"
          className="w-12 h-12 rounded-full border border-slate-300 flex items-center justify-center text-slate-950 hover:border-slate-950 hover:scale-105 transition-all disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!album.audioUrl}
          onClick={onPlayPause}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-950 transition-colors p-2"
          aria-label="Next"
          onClick={onNext}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 justify-end flex-1 min-w-[250px]">
        <div className="flex flex-col text-right">
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">
            {album.audioUrl ? 'Now Playing' : 'Preview Only'}
          </span>
          <span className="text-slate-950 text-sm font-semibold tracking-wide">
            {album.title}
          </span>
          <span className="text-slate-500 text-[11px] font-medium">
            {album.artist}
          </span>
        </div>
        <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 border border-black/10 shadow-sm">
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url('${album.imageUrl}')` }}
          />
        </div>
      </div>
    </div>
  )
}
