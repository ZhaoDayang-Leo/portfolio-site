import { forwardRef, type CSSProperties } from 'react'
import type { Album } from '../data/albums'
import { useSpineColors } from '../hooks/useSpineColor'

interface AlbumItemProps {
  album: Album
  onSelect: () => void
}

const AlbumItem = forwardRef<HTMLDivElement, AlbumItemProps>(
  function AlbumItem({ album, onSelect }, ref) {
    const spineColors = useSpineColors(album.imageUrl)

    const wrapperStyle = {
      ...(spineColors
        ? {
            '--spine-c1': spineColors.top,
            '--spine-c2': spineColors.mid,
            '--spine-c3': spineColors.bottom,
            '--spine-color': spineColors.mid,
          }
        : {}),
    } as CSSProperties

    return (
      <div
        ref={ref}
        className="album-item w-[320px] h-[320px] shrink-0 flex flex-col items-center snap-center relative cursor-pointer"
        data-color={album.color}
        onClick={onSelect}
      >
        <div className="track-info w-full absolute -top-32 text-center">
          <h3 className="text-slate-950 text-[15px] font-bold tracking-tight mb-1 leading-tight">
            {album.titleLines ? (
              <>
                {album.titleLines[0]}
                <br />
                {album.titleLines[1]}
              </>
            ) : (
              album.title
            )}
          </h3>
          <p className="text-slate-500 text-[13px] font-medium">{album.artist}</p>
        </div>
        <div className="album-wrapper" style={wrapperStyle}>
          <div className="album-vinyl" aria-hidden>
            <div className="album-vinyl-inner">
              <div
                className="album-vinyl-label"
                style={{ backgroundImage: `url('${album.imageUrl}')` }}
              />
            </div>
          </div>
          <div className="album-cuboid">
            <div
              className="album-face face-front"
              style={{ backgroundImage: `url('${album.imageUrl}')` }}
            >
              <div className={`absolute inset-0 ${album.overlayClass}`} />
            </div>
            <div className="album-face face-spine" aria-hidden />
          </div>
        </div>
      </div>
    )
  },
)

export default AlbumItem
