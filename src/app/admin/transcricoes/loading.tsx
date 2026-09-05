/**
 * Esqueleto da biblioteca — a FORMA da tela, não um spinner. O usuário vê
 * onde as coisas vão aparecer enquanto o servidor responde.
 */

export default function Loading() {
  return (
    <div className="-m-4 flex min-h-[100dvh] md:-m-6 lg:-m-8">
      <aside className="hidden w-[236px] shrink-0 flex-col gap-2 border-r border-[var(--ops-border)] bg-[var(--ops-card)] p-3 lg:flex">
        <div className="h-3 w-16 animate-pulse rounded bg-[var(--ops-track)]" />
        <div className="mt-1 flex flex-col gap-1.5">
          {[92, 72, 84, 64, 78, 68].map((w, i) => (
            <div key={i} className="h-[22px] animate-pulse rounded bg-[var(--ops-track)]" style={{ width: `${w}%` }} />
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-[var(--ops-page)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-6 pb-14 pt-7 md:px-8">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-2">
              <div className="h-6 w-40 animate-pulse rounded bg-[var(--ops-track)]" />
              <div className="h-3 w-64 animate-pulse rounded bg-[var(--ops-track)]" />
            </div>
            <div className="flex-1" />
            <div className="h-8 w-36 animate-pulse rounded-lg bg-[var(--ops-track)]" />
          </div>

          <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--ops-track)]" />

          <div className="flex gap-2">
            {[150, 130, 120].map((w, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--ops-track)]" style={{ width: w }} />
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]">
                <div className="aspect-video w-full animate-pulse bg-[var(--ops-track)]" />
                <div className="flex flex-col gap-2 p-3.5">
                  <div className="h-3.5 w-[85%] animate-pulse rounded bg-[var(--ops-track)]" />
                  <div className="h-3 w-[55%] animate-pulse rounded bg-[var(--ops-track)]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
