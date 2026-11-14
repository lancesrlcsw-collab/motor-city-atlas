// Streaming CSV reader (handles .csv and .csv.gz) with an optional row filter so
// large league-wide files never have to sit in memory in full.
import { createReadStream } from 'node:fs'
import zlib from 'node:zlib'
import { parse } from 'csv-parse'

export async function readCsv(file, { filter, map } = {}) {
  if (!file) return []
  const rows = []
  let stream = createReadStream(file)
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip())
  const parser = stream.pipe(parse({ columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true }))
  for await (const row of parser) {
    if (filter && !filter(row)) continue
    rows.push(map ? map(row) : row)
  }
  return rows
}

/** Number or null — nflverse uses "", "NA" and "NaN" for missing values. */
export function num(v) {
  if (v === undefined || v === null || v === '' || v === 'NA' || v === 'NaN') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const n0 = (v) => num(v) ?? 0
