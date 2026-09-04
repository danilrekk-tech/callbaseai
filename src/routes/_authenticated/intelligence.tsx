import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, StatCard } from "@/components/ui-kit";
import { getIntelligence } from "@/lib/insights.functions";
import { INSIGHT_KIND_LABELS, PATTERN_MIN_CONFIRMATIONS } from "@/lib/ai/types";

export const Route = createFileRoute("/_authenticated/intelligence")({
  head: () => ({
    meta: [
      { title: "AI Intelligence — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content:
          "Новые закономерности отдела продаж: подтверждённые паттерны, гипотезы, факты и интерпретации из звонков.",
      },
      { property: "og:title", content: "AI Intelligence" },
      {
        property: "og:description",
        content: "Что система узнала о клиентах, менеджерах и причинах продаж.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntelligencePage,
});

type CallRef = {
  id: string;
  client_name: string | null;
  call_date: string;
  outcome: string;
  managers: { full_name?: string } | null;
} | null;

function IntelligencePage() {
  const fetchIntelligence = useServerFn(getIntelligence);
  const { data, isLoading } = useQuery({
    queryKey: ["intelligence"],
    queryFn: () => fetchIntelligence(),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;

  const confirmed = data.patterns.filter((p) => p.status === "confirmed");
  const candidates = data.patterns.filter((p) => p.status !== "confirmed");

  return (
    <div>
      <PageHeader
        title="AI Intelligence"
        description={`Система накапливает знание из звонков: гипотеза становится закономерностью после ${PATTERN_MIN_CONFIRMATIONS} независимых подтверждений.`}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Звонков всего" value={data.coverage.total} />
        <StatCard label="Проанализировано" value={data.coverage.analyzed} />
        <StatCard label="Подтверждённые закономерности" value={confirmed.length} tone="accent" />
        <StatCard label="Гипотезы в проверке" value={candidates.length} />
      </div>

      <Tabs defaultValue="confirmed" className="mt-6">
        <TabsList>
          <TabsTrigger value="confirmed">Закономерности</TabsTrigger>
          <TabsTrigger value="candidates">Гипотезы</TabsTrigger>
          <TabsTrigger value="insights">Факты и интерпретации</TabsTrigger>
          <TabsTrigger value="objections">Возражения</TabsTrigger>
        </TabsList>

        <TabsContent value="confirmed" className="mt-4">
          <PatternList items={confirmed} emptyTitle="Пока нет подтверждённых закономерностей" />
        </TabsContent>

        <TabsContent value="candidates" className="mt-4">
          <PatternList items={candidates} emptyTitle="Новых гипотез нет" />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          {data.insights.length === 0 ? (
            <EmptyState
              title="Знаний пока нет"
              description="Они появляются после обработки звонков."
            />
          ) : (
            <div className="space-y-3">
              {data.insights.map((insight) => {
                const call = insight.calls as CallRef;
                return (
                  <div key={insight.id as string} className="panel p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={insight.kind === "fact" ? "secondary" : "outline"}>
                        {INSIGHT_KIND_LABELS[insight.kind as string] ?? (insight.kind as string)}
                      </Badge>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {insight.category as string}
                      </span>
                      {call ? (
                        <Link
                          to="/calls/$callId"
                          params={{ callId: call.id }}
                          className="text-xs text-primary underline"
                        >
                          {call.client_name ?? "звонок"} ·{" "}
                          {new Date(call.call_date).toLocaleDateString("ru-RU")}
                        </Link>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{insight.statement as string}</p>
                    {insight.evidence ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        «{insight.evidence as string}»
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="objections" className="mt-4">
          {data.objections.length === 0 ? (
            <EmptyState title="Возражений пока нет" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.objections.map((objection) => {
                const occurrences = Number(objection.occurrences ?? 0);
                const handled = Number(objection.handled_count ?? 0);
                const won = Number(objection.won_count ?? 0);
                return (
                  <div key={objection.id as string} className="panel p-4">
                    <p className="font-medium">{objection.title as string}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {objection.category as string}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Встречалось {occurrences} · отработано {handled} · привело к продаже {won}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PatternList({
  items,
  emptyTitle,
}: {
  items: Awaited<ReturnType<typeof getIntelligence>>["patterns"];
  emptyTitle: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description="Обработайте больше звонков — система найдёт повторяющееся поведение сама."
      />
    );
  }
  return (
    <div className="space-y-4">
      {items.map((pattern) => {
        const links =
          (pattern.call_patterns as { evidence: string | null; calls: CallRef }[] | null) ?? [];
        return (
          <div key={pattern.id as string} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{pattern.name as string}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {(pattern.description as string) ?? ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={pattern.status === "confirmed" ? "default" : "outline"}>
                  {pattern.status === "confirmed" ? "Подтверждено" : "Гипотеза"}
                </Badge>
                <Badge variant="secondary">Подтверждений: {Number(pattern.confirmations ?? 0)}</Badge>
                {pattern.success_rate != null ? (
                  <Badge variant="secondary">
                    Успех {Math.round(Number(pattern.success_rate) * 100)}%
                  </Badge>
                ) : null}
              </div>
            </div>
            {links.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm">
                {links.slice(0, 5).map((link, index) =>
                  link.calls ? (
                    <li key={`${pattern.id as string}-${index}`}>
                      <Link
                        to="/calls/$callId"
                        params={{ callId: link.calls.id }}
                        className="text-primary underline"
                      >
                        {link.calls.client_name ?? "Звонок"} ·{" "}
                        {new Date(link.calls.call_date).toLocaleDateString("ru-RU")}
                      </Link>
                      {link.evidence ? (
                        <span className="text-muted-foreground"> — «{link.evidence}»</span>
                      ) : null}
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
