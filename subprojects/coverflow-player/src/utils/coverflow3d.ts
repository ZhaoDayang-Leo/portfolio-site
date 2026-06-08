/** Front face width (px) */
export const CARD_WIDTH = 320
/** Album sleeve depth / spine width (px) - matches CSS --box-depth */
export const CARD_DEPTH = 4
/** Horizontal gap between album items (px); keeps the center pitch at 20% of the old 280px spacing. */
export const CARD_GAP = -264
/** Center-to-center pitch used for distance normalization */
export const ITEM_PITCH = CARD_WIDTH + CARD_GAP

export function getRotation(distance: number): number {
  const absDist = Math.abs(distance)
  const maxRotation = 88
  const coverHold = 0.12
  const flipSpread = 0.9
  const normalizedDist = Math.min(Math.max(absDist - coverHold, 0) / flipSpread, 1)
  const easeOut = 1 - Math.pow(1 - normalizedDist, 3)
  const rotation = maxRotation * easeOut
  return distance > 0 ? -rotation : rotation
}

export function updateAlbumTransforms(
  container: HTMLElement,
  items: HTMLElement[],
  featuredIndex: number | null = null,
): void {
  const containerCenter = container.scrollLeft + container.clientWidth / 2
  items.forEach((item, index) => {
    const isFeatured = featuredIndex === index
    if (featuredIndex !== null && !isFeatured) {
      item.dataset.featured = 'false'
      const info = item.querySelector<HTMLElement>('.track-info')
      if (info) {
        info.style.opacity = '0'
        info.style.visibility = 'hidden'
      }
      return
    }

    const itemCenter = item.offsetLeft + item.offsetWidth / 2
    const distancePx = itemCenter - containerCenter
    const distanceNormalized = distancePx / ITEM_PITCH

    const rotateY = isFeatured ? 0 : distanceNormalized >= 0 ? -90 : 90
    const zOffset = isFeatured ? 260 : Math.abs(distanceNormalized) * -24
    const scale = isFeatured ? 1.18 : 1
    const frontness = isFeatured ? 1 : 0

    const wrapper = item.querySelector<HTMLElement>('.album-wrapper')
    if (wrapper) {
      const featureOffset = isFeatured ? 'translateX(clamp(-520px, -26vw, -260px)) ' : ''
      wrapper.style.transform = `${featureOffset}rotateY(${rotateY}deg) translateZ(${zOffset}px) scale(${scale})`
      wrapper.style.setProperty('--frontness', String(frontness))
      updateSpineFace(wrapper, rotateY)
    }

    item.dataset.featured = isFeatured ? 'true' : 'false'
    item.style.zIndex = String(isFeatured ? 5000 : Math.max(1, 200 - Math.round(Math.abs(distanceNormalized) * 10)))

    const info = item.querySelector<HTMLElement>('.track-info')
    if (info) {
      const opacity = Math.max(0, 1 - Math.abs(distanceNormalized) * 3.2)
      info.style.opacity = String(opacity)
      info.style.visibility = opacity > 0.02 ? 'visible' : 'hidden'
      info.style.zIndex = String(Math.round(opacity * 100))
    }
  })
}

/** Attach spine to outer long edge (away from carousel center) with hinge toward viewer */
function updateSpineFace(wrapper: HTMLElement, rotateY: number): void {
  const spine = wrapper.querySelector<HTMLElement>('.face-spine')
  if (!spine) return

  spine.style.display = 'block'
  spine.style.borderRadius = '0'

  if (rotateY > 0) {
    wrapper.dataset.spineSide = 'left'
    spine.style.left = `-${CARD_DEPTH}px`
    spine.style.right = 'auto'
    spine.style.transformOrigin = '100% 50%'
    spine.style.transform = 'rotateY(-90deg)'
    spine.style.boxShadow = 'inset 3px 0 8px rgba(0, 0, 0, 0.45)'
  } else {
    wrapper.dataset.spineSide = 'right'
    spine.style.left = 'auto'
    spine.style.right = `-${CARD_DEPTH}px`
    spine.style.transformOrigin = '0% 50%'
    spine.style.transform = 'rotateY(90deg)'
    spine.style.boxShadow = 'inset -3px 0 8px rgba(0, 0, 0, 0.45)'
  }
}

export function scrollToAlbumIndex(
  container: HTMLElement,
  item: HTMLElement,
  behavior: ScrollBehavior = 'auto',
): void {
  const scrollPos =
    item.offsetLeft - container.clientWidth / 2 + item.offsetWidth / 2
  container.scrollTo({ left: scrollPos, behavior })
}
