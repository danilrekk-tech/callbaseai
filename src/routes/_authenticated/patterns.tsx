import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { listPatterns } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/patterns")({
  head: () => ({
    meta: [
      { title: "Паттерны продаж — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Повторяющиеся поведенческие паттерны и их связь с результатом сделки.",
      },
      { property: "og:title", content: "Паттерны продаж" },
      { property: "og:description", content: "Что системно ведёт к продаже, а что — к отказу." },
    ],
  }),
  component: PatternsPage,
});

function PatternsPage() {
  const fetchPatterns = useServerFn(listPatterns);
  const { data, isLoading } = useQuery({ queryKey: ["patterns"], queryFn: () => fetchPatterns() });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div>
      <PageHeader
        title="Паттерны"
        description="Каждый паттерн подтверждается конкретными звонками."
      />
      {(data ?? []).length === 0 ? (
        <EmptyState
          title="Паттернов пока нет"
          description="Они появляются автоматически после обработки нескольких звонков."
        />
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((pattern) => {
            const links = (pattern.call_patterns as
              | {
                  evidence: string | null;
                  calls: {
                    id: string;
                    client_name: string | null;
                    call_date: string;
                    outcome: string;
                    managers: { full_name?: string } | null;
                  } | null;
                }[]
              | null) ?? [];
            return (
              <div key={pattern.id as string} className="panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{pattern.name as string}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pattern.description as string}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {pattern.outcome_link ? (
                      <Badge variant="secondary">{pattern.outcome_link as string}</Badge>
                    ) : null}
                    <Badge variant="outline">
                      подтверждений: {pattern.confirmations as number}
                    </Badge>
                    {pattern.success_rate != null ? (
                      <Badge variant="outline">
                        успех {Math.round(Number(pattern.success_rate) * 100)}%
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {links.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm">
                    {links.slice(0, 6).map((link, index) => (
                      <li key={index} className="rounded-lg border border-border p-3">
                        {link.calls ? (
                          <Link
                            to="/calls/$callId"
                            params={{ callId: link.calls.id }}
                            className="font-medium hover:text-accent"
                          >
                            {link.calls.client_name ?? "звонок"} ·{" "}
                            {new Date(link.calls.call_date).toLocaleDateString("ru-RU")} ·{" "}
                            {link.calls.managers?.full_name ?? "—"}
                          </Link>
                        ) : null}
                        {link.evidence ? (
                          <p className="mt-1 italic text-muted-foreground">«{link.evidence}»</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
