import type { SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number }

function createIcon(name: string, mirrored = false) {
  return function Icon({ size = 24, className = '', ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className={`max-icon${mirrored ? ' max-icon--mirrored' : ''} ${className}`.trim()}
        {...props}
      >
        <use href={`${import.meta.env.BASE_URL}icons/max.svg#${name}`} />
      </svg>
    )
  }
}

export const ArrowLeft = createIcon('icon_arrow_left')
export const ArrowRight = createIcon('icon_arrow_left', true)
export const ArrowSquareOut = createIcon('icon_external_link')
export const CaretDown = createIcon('icon_chevron_down')
export const Message = createIcon('icon_message')
export const Check = createIcon('icon_status_delivered')
export const Checks = createIcon('icon_status_read')
export const Clock = createIcon('icon_clock')
export const Eye = createIcon('icon_eye')
export const EyeSlash = createIcon('icon_eye_crossed')
export const Key = createIcon('icon_key')
export const MagnifyingGlass = createIcon('icon_search')
export const Plus = createIcon('icon_plus')
export const Send = createIcon('icon_send')
export const Question = createIcon('icon_question')
export const Lock = createIcon('icon_password')
export const SignOut = createIcon('icon_arrow_left')
export const SpinnerGap = createIcon('icon_spinner_android')
export const WarningCircle = createIcon('icon_warning')
export const X = createIcon('icon_cross')
export const XCircle = createIcon('icon_cross_round')
