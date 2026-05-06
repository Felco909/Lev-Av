'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#60B5FF', '#A19AD3', '#34D399', '#FBBF24', '#F87171', '#818CF8', '#FB923C', '#22D3EE'];

interface StatItem {
  id: string | null;
  name: string;
  trips: number;
  profit: number;
  revenue: number;
}

export function TripsBarChart({ data, label }: { data: StatItem[]; label: string }) {
  if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <XAxis type="number" tickLine={false} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
        <Tooltip formatter={(v: number) => v} contentStyle={{ fontSize: 11 }} />
        <Bar dataKey="trips" fill="#60B5FF" name="Заявки" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProfitBarChart({ data }: { data: StatItem[] }) {
  if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <XAxis type="number" tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}к`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
        <Tooltip formatter={(v: number) => new Intl.NumberFormat('ru-RU').format(v) + ' \u058F'} contentStyle={{ fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="revenue" fill="#60B5FF" name="Выручка" radius={[0, 4, 4, 0]} />
        <Bar dataKey="profit" fill="#34D399" name="Прибыль" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TripsPieChart({ data }: { data: StatItem[] }) {
  if (!data || data.length === 0) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет данных</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="trips" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={10}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `${v} заявок`} contentStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
