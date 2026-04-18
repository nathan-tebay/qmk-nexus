export function nanoid(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}
