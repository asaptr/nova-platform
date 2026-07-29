'use client'

const PAGE_SIZES = [25, 50, 100, 250]

type Props = {
  total: number
  page: number
  pageSize: number   // 0 = all
  onPage: (p: number) => void
  onPageSize: (s: number) => void
}

export function Pagination({ total, page, pageSize, onPage, onPageSize }: Props) {
  const totalPages = pageSize === 0 ? 1 : Math.ceil(total / pageSize)
  const from = total === 0 ? 0 : pageSize === 0 ? 1 : (page - 1) * pageSize + 1
  const to   = pageSize === 0 ? total : Math.min(page * pageSize, total)

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
      <div className="flex items-center gap-2 text-muted text-xs">
        <span>Tampilkan</span>
        <select
          value={pageSize}
          onChange={e => { onPageSize(Number(e.target.value)); onPage(1) }}
          className="border border-border rounded px-1.5 py-0.5 bg-background text-primary text-xs outline-none focus:border-accent"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value={0}>Semua</option>
        </select>
        <span>baris</span>
        {total > 0 && <span className="ml-2">{from}–{to} dari {total}</span>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            className="px-2 py-1 rounded text-xs text-muted hover:text-primary disabled:opacity-30 hover:bg-background transition-colors"
          >←</button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`dot-${i}`} className="px-1.5 text-muted text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p as number)}
                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                  p === page
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-primary hover:bg-background'
                }`}
              >{p}</button>
            )
          )}
          <button
            disabled={page === totalPages}
            onClick={() => onPage(page + 1)}
            className="px-2 py-1 rounded text-xs text-muted hover:text-primary disabled:opacity-30 hover:bg-background transition-colors"
          >→</button>
        </div>
      )}
    </div>
  )
}
