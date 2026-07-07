'use client';

import Link from 'next/link';
import { AlertTriangle, Briefcase, Building2, CheckCircle2, CircleDollarSign, UserCog } from 'lucide-react';
import type { DayTaskItem, DayTaskPanelData } from './types';

function toneClass(tone: DayTaskItem['tone']) {
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-50 text-slate-800';
}

function RoleIcon({ roleTitle }: { roleTitle: string }) {
  if (roleTitle === 'Логист') return <Briefcase className="h-4 w-4 text-blue-600" />;
  if (roleTitle === 'Бухгалтер') return <CircleDollarSign className="h-4 w-4 text-emerald-600" />;
  return <UserCog className="h-4 w-4 text-purple-600" />;
}

export function DayTasksPanels({ panels }: { panels: DayTaskPanelData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {panels.map((panel) => (
        <section key={panel.roleTitle} className="rounded-xl border bg-card p-4 shadow-sm">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <RoleIcon roleTitle={panel.roleTitle} />
                <h2 className="text-base font-semibold">{panel.roleTitle}</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{panel.roleSubtitle}</p>
            </div>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </header>

          <div className="space-y-3">
            {panel.blocks.map((block) => (
              <div key={block.title} className="rounded-lg border p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{block.title}</h3>
                {block.items.length === 0 ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{block.emptyText}</span>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {block.items.map((item) => (
                      <li key={item.id} className={`rounded-md border px-2 py-1.5 text-xs ${toneClass(item.tone)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {item.href ? (
                              <Link href={item.href} className="font-medium hover:underline">
                                {item.label}
                              </Link>
                            ) : (
                              <span className="font-medium">{item.label}</span>
                            )}
                            {item.meta ? <p className="mt-0.5 text-[11px] opacity-90">{item.meta}</p> : null}
                          </div>
                          {item.tone === 'danger' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
