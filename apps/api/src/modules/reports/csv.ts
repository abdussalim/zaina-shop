export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function escapeCell(value: string | number | null): string {
  if (value === null) return ''
  let text = String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`
  return text
}
