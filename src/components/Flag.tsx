interface FlagProps {
  code: string
  name?: string
  size?: number
}

export default function Flag({ code, name = '', size = 20 }: FlagProps) {
  return (
    <img
      src={`https://flagcdn.com/w${size}/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/w${size * 2}/${code.toLowerCase()}.png 2x`}
      width={size}
      alt={name}
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2 }}
    />
  )
}
