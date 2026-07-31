'use client';

import { CircleDollarSign, FileText, FileCheck, Receipt, CreditCard, AlertOctagon, FileX2, FileWarning, XCircle } from 'lucide-react';
import { PanelShell } from './panel-shell';
import { TaskCategoryBlock } from './task-category-block';
import type { AccountantStage } from './types';

const ICON_MAP: Record<string, typeof FileText> = {
  'Получить документы': FileText,
  'Проверить документы': FileCheck,
  'Выставить счёт': Receipt,
  'Ожидается оплата': CreditCard,
  'Просроченные оплаты': AlertOctagon,
  'Нет счёта': FileX2,
  'Нет акта': FileWarning,
  'Нет закрывающих документов': FileX2,
  'Финансовые ошибки': XCircle,
};

export function AccountantPanel({
  stages,
  isExpanded,
  isCollapsed,
  isDimmed,
  onToggleExpand,
  onToggleCollapse,
  onDismiss,
}: {
  stages: AccountantStage[];
  isExpanded: boolean;
  isCollapsed: boolean;
  isDimmed: boolean;
  onToggleExpand: () => void;
  onToggleCollapse: () => void;
  onDismiss: (id: string) => void;
}) {
  const totalCount = stages.reduce((s, c) => s + c.count, 0);
  return (
    <PanelShell
      icon={<CircleDollarSign className="h-4 w-4 text-emerald-600" />}
      title="Бухгалтер"
      subtitle={`Активных задач: ${totalCount}`}
      isExpanded={isExpanded}
      isCollapsed={isCollapsed}
      isDimmed={isDimmed}
      onToggleExpand={onToggleExpand}
      onToggleCollapse={onToggleCollapse}
    >
      {stages.map((stage) => {
        const Icon = ICON_MAP[stage.stage] ?? FileText;
        return (
          <TaskCategoryBlock
            key={stage.stage}
            icon={<Icon className="h-3.5 w-3.5" />}
            title={stage.stage}
            count={stage.count}
            items={stage.items}
            defaultOpen={stage.count > 0}
            onDismiss={onDismiss}
          />
        );
      })}
    </PanelShell>
  );
}
