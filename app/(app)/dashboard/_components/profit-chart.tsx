'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface Props {
  data: { month: string; own: number; exp: number }[];
}

const MONTHS: Record<string, string> = {
  '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр', '05': 'Май', '06': 'Июн',
  '07': 'Июл', '08': 'Авг', '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
};

export default function ProfitChart({ data }: Props) {
  const chartData = (data ?? []).map((d: any) => ({
    name: MONTHS[d?.month?.split?.('-')?.[1] ?? ''] ?? d?.month ?? '',
    'Собственные': d?.own ?? 0,
    'Экспедиция': d?.exp ?? 0,
  }));

  if ((chartData?.length ?? 0) === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}к`} />
        <Tooltip formatter={(v: number) => new Intl.NumberFormat('ru-RU').format(v) + ' \u058F'} contentStyle={{ fontSize: 11 }} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Собственные" fill="#60B5FF" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Экспедиция" fill="#A19AD3" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
