import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatCard } from "@/components/ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listKnowledge } from "@/lib/insights.functions";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "База знаний — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Единая семантическая база знаний по звонкам: фрагменты, источники и эмбеддинги pgvector.",
      },
      { property: "og:title", content: "База знаний по звонкам" },
      { property: "og:description", content: "Фрагменты знаний с векторными эмбеддингами." },
    ],
  }),
  component: KnowledgePage,
});

const ANY = "any";
const types = [
  ["transcript", "Транскрипт"],
  ["client_profile", "Профиль клиента"],
  ["manager_assessment", "Оценка менеджера"],
  ["call_summary", "Итог звонка"],
  ["objection", "Возражение"],
  ["pattern", "Паттерн"],
] as const;

function KnowledgePage() {
  const fetchKnowledge = useServerFn(listKnowledge);
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState(ANY);

  const params = {
    search: search || undefined,
    sourceType: sourceType === ANY ? undefined : sourceType,
  };
  const { data, isLoading } = useQuery({
    queryKey: ["knowledge", params],
    queryFn: () => fetchKnowledge({ data: params }),
  });

  return (
    <div>
      <PageHeader
        title="База знаний"
        description="Каждый обработанный звонок превращается в семантические фрагменты."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Фрагментов" value={data?.total ?? 0} />
        <StatCard label="Эмбеддингов" value={data?.embeddings ?? 0} tone="accent" />
        <StatCard label="Показано" value={data?.rows.length ?? 0} />
      </div>

      <div className="panel my-6 grid gap-3 p-4 md:grid-cols-3">
        <Input
          className="md:col-span-2"
          placeholder="Поиск по тексту фрагмента…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={sourceType} onValueChange={setSourceType}>
          <SelectTrigger>
            <SelectValue placeholder="Тип источника" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Все типы</SelectItem>
            {types.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="Фрагментов нет" description="Обработайте хотя бы один звонок." />
      ) : (
        <div className="space-y-3">
          {(data?.rows ?? []).map((chunk) => (
            <div key={chunk.id as string} className="panel p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{chunk.source_type as string}</Badge>
                {Array.isArray(chunk.embeddings) && chunk.embeddings.length > 0 ? (
                  <Badge variant="outline">
                    {(chunk.embeddings as { model: string }[])[0]?.model}
                  </Badge>
                ) : (
                  <Badge variant="outline">без эмбеддинга</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(chunk.created_at as string).toLocaleString("ru-RU")}
                </span>
                {chunk.call_id ? (
                  <Link
                    to="/calls/$callId"
                    params={{ callId: chunk.call_id as string }}
                    className="text-xs text-accent hover:underline"
                  >
                    открыть звонок
                  </Link>
                ) : null}
              </div>
              <p className="mt-2 font-medium">{(chunk.title as string) ?? "Фрагмент"}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {(chunk.content as string).slice(0, 900)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
