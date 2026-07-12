import { ICON_PATHS } from './icons'
import type { IconName } from './icons'

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export default function Icon({ name, size = 20, className, strokeWidth = 1.9 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  )
}
