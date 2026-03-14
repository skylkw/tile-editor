import type { ReactNode } from "react"

type PanelCardProps = {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function PanelCard({
  title,
  description,
  action,
  children,
  className = "",
}: PanelCardProps) {
  return (
    <section
      className={`rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
