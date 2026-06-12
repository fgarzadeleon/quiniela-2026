interface FlagProps {
  code: string
  name?: string
  size?: number
}

export default function Flag({ code, name = '', size = 20 }: FlagProps) {
  const h = Math.round(size * 0.75)
  return (
    <img
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w80/${code.toLowerCase()}.png 2x`}
      width={size}
      height={h}
      alt={name}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: 2,
        width: size,
        height: h,
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
  )
}
