import { useEffect, useState } from 'react'
import {
  sampleImageSpineColors,
  type SpineColors,
} from '../utils/spineColor'

/** Sample cover spine gradient colors once per imageUrl; never updated on scroll/rotate. */
export function useSpineColors(imageUrl: string): SpineColors | undefined {
  const [colors, setColors] = useState<SpineColors | undefined>()

  useEffect(() => {
    let cancelled = false
    sampleImageSpineColors(imageUrl)
      .then((c) => {
        if (!cancelled) setColors(c)
      })
      .catch(() => {
        if (!cancelled) setColors(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return colors
}
