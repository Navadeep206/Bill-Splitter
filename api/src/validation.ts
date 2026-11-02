import { HTTPException } from 'hono/http-exception'

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' })
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HTTPException(422, { message: 'Expected a JSON object' })
  }
  return body as Record<string, unknown>
}

export function requireText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HTTPException(422, { message: `${field} must be a non-empty string` })
  }
  const text = value.trim()
  if (text.length > maxLength) {
    throw new HTTPException(422, { message: `${field} must be at most ${maxLength} characters` })
  }
  return text
}

export function requireTotalCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new HTTPException(422, { message: 'totalCents must be a positive safe integer' })
  }
  return value
}
