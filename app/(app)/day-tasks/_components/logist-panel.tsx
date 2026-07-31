'use client';

import { Briefcase, AlertTriangle, Truck, Package, Phone, MapPin, AlertCircle, FileX, Satellite } from 'lucide-react';
import { PanelShell } from './panel-shell';
import { TaskCategoryBlock } from './task-category-block';
import type { LogistCategory } from './types';

const ICON_MAP: Record<string, typeof AlertTriangle> = {
  'alert-triangle': AlertTriangle,
  truck: Truck,
  package: Package,
  phone: Phone,
  'map-pin': MapPin,
  'alert-circle': AlertCircle,
  'file-x': FileX,
  satellite: Satellite,
};

export function LogistPanel({
  categories,
  isExpanded,
  isCollapsed,
  isDimmed,
  onToggleExpand,
  onToggleCollapse,
  onDismiss,
}: {
  categories: LogistCategory[];
  isExpanded: boolean;
  isCollapsed: boolean;
  isDimmed: boolean;
  onToggleExpand: () => void;
  onToggleCollapse: () => void;
  onDismiss: (id: string) => void;
}) {
  const totalCount = categories.reduce((s, c) => s + c.count, 0);
  return (
    <PanelShell
      icon={<Briefcase className="h-4 w-4 text-blue-600" />}
      title="Логист"
      subtitle={`Активных задач: ${totalCount}`}
      isExpanded={isExpanded}
      isCollapsed={isCollapsed}
      isDimmed={isDimmed}
      onToggleExpand={onToggleExpand}
      onToggleCollapse={onToggleCollapse}
    >
      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.icon] ?? AlertCircle;
        return (
          <TaskCategoryBlock
            key={cat.category}
            icon={<Icon className="h-3.5 w-3.5" />}
            title={cat.category}
            count={cat.count}
            items={cat.items}
            defaultOpen={cat.count > 0}
            onDismiss={onDismiss}
          />
        );
      })}
    </PanelShell>
  );
}
