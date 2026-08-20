import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, recomputeAggregates } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Дашборд продаж — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Конверсия, динамика звонков, топ возражений и паттернов отдела продаж Мегагруп.",
      },
      { property: "og:title", content: "Дашборд Sales Intelligence" },
      { property: "og:description", content: "Ключевые метрики звонков и качества работы менеджеров." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const fetchDashboard = useServerFn(getDashboard);
  const recompute = useServerFn(recomputeAggregates);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const refresh = useMutation({
    mutationFn: () => recompute(),
    onSuccess: () => {
      toast.success("Агрегаты пересчитаны");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Дашборд"
        description="Сводная картина по звонкам, менеджерам и знаниям."
        actions={
          <>
            <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
              Пересчитать агрегаты
            </Button>
            <Button asChild>
              <Link to="/upload">Загрузить звонок</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Всего звонков" value={data.totals.calls} />
        <StatCard
          label="Конверсия"
          value={`${Math.round(data.totals.conversion * 100)}%`}
          hint={`${data.totals.sales} продаж / ${data.totals.losses} отказов`}
          tone="success"
        />
        <StatCard
          label="В обработке"
          value={data.totals.inProcessing}
          hint={`${data.totals.completed} обработано`}
          tone="accent"
        />
        <StatCard label="Ошибки обработки" value={data.totals.failed} tone="destructive" />
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="text-lg font-semibold">Динамика по неделям</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.dynamics}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-card-foreground)",
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="calls"
                name="Звонки"
                stroke="var(--color-chart-1)"
                fill="var(--color-chart-1)"
                fillOpacity={0.15}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="Продажи"
                stroke="var(--color-chart-4)"
                fill="var(--color-chart-4)"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="losses"
                name="Отказы"
                stroke="var(--color-chart-5)"
                fill="var(--color-chart-5)"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-lg font-semibold">Причины отказов</h2>
          {data.lossReasons.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Пока нет данных.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.lossReasons.map((item) => (
                <li key={item.reason} className="flex items-center justify-between gap-3">
                  <span className="capitalize">{item.reason}</span>
                  <span className="text-muted-foreground">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-semibold">Причины продаж</h2>
          {data.saleReasons.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Пока нет данных.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.saleReasons.map((item) => (
                <li key={item.reason} className="flex items-center justify-between gap-3">
                  <span className="capitalize">{item.reason}</span>
                  <span className="text-muted-foreground">{item.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Топ менеджеров</h2>
          {data.topManagers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Добавьте менеджеров и звонки.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Менеджер</th>
                  <th className="py-2">Звонки</th>
                  <th className="py-2">Конверсия</th>
                  <th className="py-2">Оценка</th>
                </tr>
              </thead>
              <tbody>
                {data.topManagers.map((manager) => (
                  <tr key={manager.id} className="border-t border-border">
                    <td className="py-2">{manager.name}</td>
                    <td className="py-2">{manager.calls}</td>
                    <td className="py-2">{Math.round(manager.conversion * 100)}%</td>
                    <td className="py-2">{manager.score ? manager.score.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-semibold">Частые возражения</h2>
          {data.objections.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Пока нет данных.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {data.objections.map((objection) => (
                <li key={objection.id as string}>
                  <p className="font-medium">{objection.title as string}</p>
                  <p className="text-xs text-muted-foreground">
                    встречалось {objection.occurrences as number} · отработано{" "}
                    {objection.handled_count as number}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="text-lg font-semibold">Подтверждённые паттерны</h2>
        {data.patterns.length === 0 ? (
          <EmptyState
            title="Паттерны появятся после обработки звонков"
            description="AI выделяет повторяющиеся сценарии и связывает их с результатом сделки."
          />
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.patterns.map((pattern) => (
              <div key={pattern.id as string} className="rounded-lg border border-border p-4">
                <p className="font-medium">{pattern.name as string}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {pattern.description as string}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  подтверждений: {pattern.confirmations as number}
                  {pattern.success_rate != null
                    ? ` · успех ${Math.round(Number(pattern.success_rate) * 100)}%`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
