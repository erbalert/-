import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { ParsedStatementRow } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface RawLine {
  y: number
  items: { x: number; str: string }[]
  text: string
}

export type BankId = 'kaspi' | 'halyk'

export interface StatementParser {
  bankId: BankId
  label: string
  /** Heuristic marker check: does this look like the right bank's statement? */
  detect: (pages: RawLine[][]) => boolean
  parse: (pages: RawLine[][]) => ParsedStatementRow[]
  /** Suggested account name derived from the statement (e.g. "Kaspi Gold"). */
  defaultAccountName: (pages: RawLine[][]) => string
}

/** Extract text as lines (grouped by y-coordinate, sorted by x) for each page. */
export async function extractLines(file: File): Promise<RawLine[][]> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: RawLine[][] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const rows = new Map<number, { x: number; str: string }[]>()

    for (const item of content.items) {
      // TextItem has `str` and `transform`; skip marked-content items.
      if (!('str' in item) || !item.str) continue
      const y = Math.round((item.transform[5] as number) / 2) * 2
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y)!.push({ x: item.transform[4] as number, str: item.str })
    }

    const lines: RawLine[] = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, items]) => {
        const sorted = items.sort((a, b) => a.x - b.x)
        return { y, items: sorted, text: sorted.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim() }
      })
      .filter(l => l.text.length > 0)

    pages.push(lines)
  }

  return pages
}

/** Shared helpers for parsers */

// Parses "1 250,00" / "- 20 000,00" / "1 041 667,00" -> number (absolute value).
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.-]/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  // Kazakhstani format uses comma as decimal separator.
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return Math.abs(value)
}

export function allText(pages: RawLine[][]): string {
  return pages.map(page => page.map(l => l.text).join('\n')).join('\n')
}
