'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const MONTHS: Record<string, string> = {
  '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр', '05': 'Май', '06': 'Июн',
  '07': 'Июл', '08': 'Авг', '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
};

interface Props {
  data: { month: string; own: number; exp: number; revenue: number; costs: number }[];
}

export default function ReportChart({ data }: Props) {
  const chartData = (data ?? []).map(d => {
    const mm = d.month?.split?.('-')?.[1] ?? '';
    return {
      name: MONTHS[mm] ?? d.month,
      'Собственные': d.own ?? 0,
      'Экспедиция': d.exp ?? 0,
    };
  });

  if (!chartData.length) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="gradOwn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}к`} />
        <Tooltip formatter={(v: number) => new Intl.NumberFormat('ru-RU').format(v) + ' \u058F'} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
        <Area type="monotone" dataKey="Собственные" stroke="#3b82f6" fill="url(#gradOwn)" strokeWidth={2} />
        <Area type="monotone" dataKey="Экспедиция" stroke="#8b5cf6" fill="url(#gradExp)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
