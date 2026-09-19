/**
 * Esqueleto do detalhe — player, falas e painel no lugar em que vão ficar.
 * Skeleton, não spinner: a tela já mostra a estrutura enquanto carrega.
 */

export default function Loading() {
  return (
    <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-6 pb-14 pt-6 md:px-8">
        <div className="h-3 w-40 animate-pulse rounded bg-[var(--ops-track)]" />
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="h-6 w-[70%] animate-pulse rounded bg-[var(--ops-track)]" />
            <div className="h-3 w-[45%] animate-pulse rounded bg-[var(--ops-track)]" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-lg bg-[var(--ops-track)]" />
            <div className="h-8 w-32 animate-pulse rounded-lg bg-[var(--ops-track)]" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="aspect-video w-full animate-pulse rounded-[10px] bg-[var(--ops-track)]" />
            <div className="h-[62px] w-full animate-pulse rounded-[10px] bg-[var(--ops-track)]" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--ops-track)]" />
            <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-4">
              {[100, 92, 78, 96, 84].map((w, i) => (
                <div key={i} className="flex flex-col gap-1.5 border-l-2 border-transparent pl-3">
                  <div className="h-2.5 w-24 animate-pulse rounded bg-[var(--ops-track)]" />
                  <div className="h-3.5 animate-pulse rounded bg-[var(--ops-track)]" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {[190, 90, 210].map((h, i) => (
              <div
                key={i}
                className="animate-pulse rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)]"
                style={{ height: h }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
