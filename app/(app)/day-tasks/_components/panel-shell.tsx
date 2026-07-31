'use client';

import type { ReactNode } from 'react';
import { Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react';

export function PanelShell({
  icon,
  title,
  subtitle,
  isExpanded,
  isCollapsed,
  isDimmed,
  onToggleExpand,
  onToggleCollapse,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  isExpanded: boolean;
  isCollapsed: boolean;
  isDimmed: boolean;
  onToggleExpand: () => void;
  onToggleCollapse: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-xl border bg-card shadow-sm transition-opacity ${isDimmed ? 'opacity-60' : ''}`}>
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Развернуть' : 'Свернуть'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? 'Вернуть обычный размер' : 'На всю ширину'}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {isCollapsed ? null : <div className="flex-1 space-y-2 p-4">{children}</div>}
    </section>
  );
}
