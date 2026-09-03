/**
 * One cookie out of a raw `Cookie` header (`a=1; b=2`). A Socket.IO
 * handshake is not an Express request, so `cookie-parser` never sees it and
 * the gateway reads the header itself. The session token is base64url, so
 * decoding is only for form's sake.
 */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    if (part.slice(0, separator).trim() !== name) continue

    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return undefined
}
