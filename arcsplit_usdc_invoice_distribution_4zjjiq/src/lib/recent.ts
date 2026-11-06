const key = (contract: string) => `arcsplit:recent:${contract.toLowerCase()}`

/** Invoice ids this browser has opened or created. Ids only; data is always re-read from chain. */
export function loadRecent(contract: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(contract)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v)) : []
  } catch {
    return []
  }
}

export function rememberInvoice(contract: string, id: string): string[] {
  const next = [id, ...loadRecent(contract).filter((v) => v !== id)].slice(0, 8)
  try {
    localStorage.setItem(key(contract), JSON.stringify(next))
  } catch {
    // storage unavailable: history is a convenience only
  }
  return next
}
