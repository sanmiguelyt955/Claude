/**
 * The request's JSON body as a plain object, or {} when it is missing,
 * unparseable, `null`, an array or a bare value. Routes then check each
 * field's type themselves, so a body like `null` or `{"url": 123}` gets a
 * 400 with a message instead of a TypeError (an empty 500).
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

/** The field trimmed when it is a string; undefined otherwise (absent, empty or another type). */
export function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value.trim() || undefined : undefined
}
