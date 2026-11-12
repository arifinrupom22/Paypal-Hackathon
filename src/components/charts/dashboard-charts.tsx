"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TEAL = "var(--color-teal)";
const CRIMSON = "var(--color-crimson)";
const AMBER = "var(--color-amber)";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--color-ink)",
} as const;

export interface StreamDatum {
  label: string;
  authorized: number;
  blocked: number;
  approval: number;
}

export function AuthorizationStreamChart({ data }: { data: StreamDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="stream-authorized" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
            <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-line-soft)" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={5} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--color-ink-secondary)" }}
        />
        <Area
          type="monotone"
          dataKey="authorized"
          name="Authorized"
          stroke={TEAL}
          strokeWidth={1.75}
          fill="url(#stream-authorized)"
        />
        <Area
          type="monotone"
          dataKey="blocked"
          name="Blocked"
          stroke={CRIMSON}
          strokeWidth={1.5}
          fill="transparent"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface DailyDatum {
  label: string;
  authorized: number;
  blocked: number;
  approval: number;
}

export function DecisionBarChart({ data }: { data: DailyDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--color-line-soft)" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--color-ink-secondary)" }}
          cursor={{ fill: "rgba(148,163,184,0.12)" }}
        />
        <Bar dataKey="authorized" name="Authorized" fill={TEAL} radius={[2, 2, 0, 0]} maxBarSize={22} />
        <Bar dataKey="approval" name="Step-up" fill={AMBER} radius={[2, 2, 0, 0]} maxBarSize={22} />
        <Bar dataKey="blocked" name="Blocked" fill={CRIMSON} radius={[2, 2, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = [
  "var(--color-teal)",
  "#0ea5a0",
  "var(--color-emerald)",
  "var(--color-amber)",
  "var(--color-violet)",
  "var(--color-crimson)",
];

export function CategoryPie({
  data,
}: {
  data: { category: string; amount: number; share: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="category" innerRadius={44} outerRadius={64} paddingAngle={2} stroke="none">
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}
