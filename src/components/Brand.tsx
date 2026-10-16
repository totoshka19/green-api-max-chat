export function Brand({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`brand-mark${small ? ' brand-mark--small' : ''}`}
      src={`${import.meta.env.BASE_URL}max-logo.svg`}
      width={small ? 35 : 72}
      height={small ? 35 : 72}
      alt=""
      aria-hidden="true"
    />
  )
}
