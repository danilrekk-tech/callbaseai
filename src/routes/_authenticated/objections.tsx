import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { EmptyState, LabeledList, PageHeader } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { listObjections } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/objections")({
  head: () => ({
    meta: [
      { title: "Возражения клиентов — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Каталог возражений: частота, качество отработки и лучшие ответы менеджеров.",
      },
      { property: "og:title", content: "Возражения клиентов" },
      { property: "og:description", content: "Что чаще всего мешает сделке и как это отрабатывают." },
    ],
  }),
  component: ObjectionsPage,
});

function ObjectionsPage() {
  const fetchObjections = useServerFn(listObjections);
  const { data, isLoading } = useQuery({
    queryKey: ["objections"],
    queryFn: () => fetchObjections(),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div>
      <PageHeader title="Возражения" description="Собираются из всех обработанных звонков." />
      {(data ?? []).length === 0 ? (
        <EmptyState title="Возражений пока нет" description="Загрузите и обработайте звонки." />
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((objection) => {
            const cases = (objection.call_objections as
              | {
                  quote: string | null;
                  handled: boolean;
                  handling_quality: string | null;
                  manager_response: string | null;
                  calls: {
                    id: string;
                    client_name: string | null;
                    call_date: string;
                    outcome: string;
                    managers: { full_name?: string } | null;
                  } | null;
                }[]
              | null) ?? [];
            const handledRate =
              (objection.occurrences as number) > 0
                ? Math.round(
                    ((objection.handled_count as number) / (objection.occurrences as number)) * 100,
                  )
                : 0;
            return (
              <div key={objection.id as string} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">
                      {objection.title as string}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(objection.description as string) ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {objection.category ? (
                      <Badge variant="secondary">{objection.category as string}</Badge>
                    ) : null}
                    <Badge variant="outline">встреч: {objection.occurrences as number}</Badge>
                    <Badge variant="outline">отработано: {handledRate}%</Badge>
                    <Badge variant="outline">продаж после: {objection.won_count as number}</Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <LabeledList
                    title="Лучшие ответы"
                    items={(objection.best_responses as string[]) ?? []}
                  />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Примеры из звонков
                    </p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {cases.slice(0, 5).map((item, index) => (
                        <li key={index} className="rounded-lg border border-border p-3">
                          {item.calls ? (
                            <Link
                              to="/calls/$callId"
                              params={{ callId: item.calls.id }}
                              className="font-medium hover:text-accent"
                            >
                              {item.calls.client_name ?? "звонок"} ·{" "}
                              {new Date(item.calls.call_date).toLocaleDateString("ru-RU")}
                            </Link>
                          ) : null}
                          {item.quote ? (
                            <p className="mt-1 italic text-muted-foreground">«{item.quote}»</p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.handled ? "отработано" : "не отработано"}
                            {item.handling_quality ? ` · ${item.handling_quality}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
