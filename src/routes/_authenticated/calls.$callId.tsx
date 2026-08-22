import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LabeledList, OutcomeBadge, PageHeader, StatCard, StatusBadge } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCallDetail, processCall } from "@/lib/calls.functions";

export const Route = createFileRoute("/_authenticated/calls/$callId")({
  head: () => ({
    meta: [
      { title: "Разбор звонка — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content:
          "Транскрипт с разделением спикеров, профиль клиента, оценка менеджера, возражения и рекомендации.",
      },
      { property: "og:title", content: "Разбор звонка" },
      { property: "og:description", content: "Полный AI-анализ одного звонка отдела продаж." },
    ],
  }),
  component: CallDetail,
});

function formatMs(ms: number | null) {
  if (ms == null) return "";
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function CallDetail() {
  const { callId } = Route.useParams();
  const fetchDetail = useServerFn(getCallDetail);
  const reprocess = useServerFn(processCall);
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentMs, setCurrentMs] = useState(0);

  const seekTo = (ms: number | null) => {
    if (ms == null || !audioRef.current) return;
    audioRef.current.currentTime = ms / 1000;
    void audioRef.current.play();
  };

  const { data, isLoading } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => fetchDetail({ data: { id: callId } }),
    refetchInterval: (query) => {
      const status = (query.state.data?.call as { status?: string } | undefined)?.status;
      return status && !["completed", "failed"].includes(status) ? 5000 : false;
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: () => reprocess({ data: { id: callId } }),
    onSuccess: () => {
      toast.success("Звонок переобработан");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;

  const { call, transcript, segments, clientProfile, assessment, analysis, objections, patterns, jobs } =
    data;

  return (
    <div>
      <PageHeader
        title={(call.client_name as string) || (call.file_name as string)}
        description={`${(call.managers as { full_name?: string } | null)?.full_name ?? "менеджер не указан"} · ${new Date(call.call_date as string).toLocaleString("ru-RU")}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/calls">Назад</Link>
            </Button>
            <Button onClick={() => reprocessMutation.mutate()} disabled={reprocessMutation.isPending}>
              {reprocessMutation.isPending ? "Обработка…" : "Переобработать"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Результат" value={(call.outcome as string) ?? "—"} />
        <StatCard label="Статус" value={(call.status as string) ?? "—"} />
        <StatCard
          label="Оценка менеджера"
          value={assessment?.overall_score ? Number(assessment.overall_score).toFixed(1) : "—"}
          tone="accent"
        />
        <StatCard
          label="Язык / слов"
          value={`${(transcript?.language as string) ?? "—"} / ${(transcript?.words_count as number) ?? 0}`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={call.outcome as string} />
        <StatusBadge status={call.status as string} />
        {call.client_type ? <Badge variant="secondary">{call.client_type as string}</Badge> : null}
      </div>

      {call.error_message ? (
        <div className="panel mt-4 border-destructive/40 p-4 text-sm text-destructive">
          {call.error_message as string}
        </div>
      ) : null}

      {data.audioUrl ? (
        <div className="panel mt-6 p-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={data.audioUrl} className="w-full" />
        </div>
      ) : null}

      <Tabs defaultValue="summary" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="summary">Итог</TabsTrigger>
          <TabsTrigger value="client">Клиент</TabsTrigger>
          <TabsTrigger value="manager">Менеджер</TabsTrigger>
          <TabsTrigger value="transcript">Транскрипт</TabsTrigger>
          <TabsTrigger value="signals">Возражения и паттерны</TabsTrigger>
          <TabsTrigger value="jobs">Обработка</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Краткое резюме</h2>
            <p className="mt-2 whitespace-pre-line text-sm">
              {(analysis?.summary as string) || (call.summary as string) || "Анализ ещё не выполнен."}
            </p>
            {analysis?.turning_point ? (
              <p className="mt-4 text-sm">
                <span className="font-medium">Переломный момент:</span>{" "}
                {analysis.turning_point as string}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel space-y-4 p-5">
              <LabeledList title="Причины продажи" items={analysis?.sale_reasons as string[]} />
              <LabeledList title="Причины потери" items={analysis?.loss_reasons as string[]} />
              <LabeledList title="Рекомендации" items={analysis?.recommendations as string[]} />
            </div>
            <div className="panel space-y-4 p-5">
              <LabeledList
                title="Работающие формулировки"
                items={analysis?.effective_phrases as string[]}
              />
              <LabeledList
                title="Неудачные формулировки"
                items={analysis?.ineffective_phrases as string[]}
              />
            </div>
          </div>
          {Array.isArray(analysis?.stages) && analysis.stages.length > 0 ? (
            <div className="panel p-5">
              <h2 className="text-lg font-semibold">Этапы разговора</h2>
              <ol className="mt-3 space-y-3 text-sm">
                {(analysis.stages as { name?: string; description?: string; quality?: string }[]).map(
                  (stage, index) => (
                    <li key={index} className="rounded-lg border border-border p-3">
                      <p className="font-medium">
                        {index + 1}. {stage.name}
                        {stage.quality ? (
                          <span className="ml-2 text-xs text-muted-foreground">{stage.quality}</span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-muted-foreground">{stage.description}</p>
                    </li>
                  ),
                )}
              </ol>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="client" className="mt-4">
          {clientProfile ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="panel space-y-4 p-5">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Тип клиента</p>
                  <p className="text-sm">{(clientProfile.client_type as string) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Потребность</p>
                  <p className="text-sm">{(clientProfile.need as string) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Мотивация</p>
                  <p className="text-sm">{(clientProfile.motivation as string) ?? "—"}</p>
                </div>
                <LabeledList title="Боли" items={clientProfile.pains as string[]} />
                <LabeledList
                  title="Критерии выбора"
                  items={clientProfile.choice_criteria as string[]}
                />
              </div>
              <div className="panel space-y-4 p-5">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">
                    бюджет: {(clientProfile.budget_sensitivity as string) ?? "—"}
                  </Badge>
                  <Badge variant="secondary">
                    интерес: {(clientProfile.interest_level as string) ?? "—"}
                  </Badge>
                  <Badge variant="secondary">
                    стиль: {(clientProfile.communication_style as string) ?? "—"}
                  </Badge>
                </div>
                <LabeledList title="Возражения" items={clientProfile.objections as string[]} />
                <LabeledList title="Страхи" items={clientProfile.fears as string[]} />
                <LabeledList
                  title="Сигналы к покупке"
                  items={clientProfile.buying_signals as string[]}
                />
                <LabeledList
                  title="Сигналы отказа"
                  items={clientProfile.refusal_signals as string[]}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Профиль клиента ещё не сформирован.</p>
          )}
        </TabsContent>

        <TabsContent value="manager" className="mt-4">
          {assessment ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="panel space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Эмпатия", assessment.empathy_score],
                    ["Экспертность", assessment.expertise_score],
                    ["Давление", assessment.pressure_score],
                    ["Итого", assessment.overall_score],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-lg border border-border p-3">
                      <p className="text-xs uppercase text-muted-foreground">{label as string}</p>
                      <p className="font-display text-xl font-semibold">
                        {value != null ? Number(value).toFixed(1) : "—"}
                      </p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Структура разговора</p>
                  <p className="text-sm">{(assessment.conversation_structure as string) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Выявление потребностей</p>
                  <p className="text-sm">{(assessment.needs_discovery as string) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Работа с возражениями</p>
                  <p className="text-sm">{(assessment.objection_handling as string) ?? "—"}</p>
                </div>
              </div>
              <div className="panel space-y-4 p-5">
                <LabeledList title="Ошибки" items={assessment.mistakes as string[]} />
                <LabeledList
                  title="Упущенные возможности"
                  items={assessment.missed_opportunities as string[]}
                />
                <LabeledList title="Сильные действия" items={assessment.good_actions as string[]} />
                <LabeledList
                  title="Заданные вопросы"
                  items={assessment.questions_asked as string[]}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Оценка менеджера ещё не сформирована.</p>
          )}
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {(transcript?.full_text as string) || "Транскрипт отсутствует."}
            </p>
          ) : (
            <div className="panel divide-y divide-border">
              {segments.map((segment) => (
                <div key={segment.id as string} className="flex gap-4 p-4 text-sm">
                  <div className="w-28 shrink-0 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {(segment.speaker_role as string) === "manager"
                        ? "Менеджер"
                        : (segment.speaker_role as string) === "client"
                          ? "Клиент"
                          : ((segment.speaker as string) ?? "—")}
                    </p>
                    <p>{formatMs(segment.start_ms as number | null)}</p>
                  </div>
                  <p className="min-w-0">{segment.text as string}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signals" className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Возражения</h2>
            {objections.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Не зафиксированы.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {objections.map((item) => (
                  <li key={item.id as string} className="rounded-lg border border-border p-3">
                    <p className="font-medium">
                      {(item.objections as { title?: string } | null)?.title}
                    </p>
                    {item.quote ? (
                      <p className="mt-1 italic text-muted-foreground">«{item.quote as string}»</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.handled ? "отработано" : "не отработано"}
                      {item.handling_quality ? ` · ${item.handling_quality as string}` : ""}
                    </p>
                    {item.manager_response ? (
                      <p className="mt-1 text-xs">Ответ: {item.manager_response as string}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Паттерны</h2>
            {patterns.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Не зафиксированы.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {patterns.map((item) => (
                  <li key={item.id as string} className="rounded-lg border border-border p-3">
                    <p className="font-medium">
                      {(item.patterns as { name?: string } | null)?.name}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {(item.patterns as { description?: string } | null)?.description}
                    </p>
                    {item.evidence ? (
                      <p className="mt-1 text-xs italic">«{item.evidence as string}»</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Этап</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Провайдер</th>
                  <th className="px-4 py-3">Начало</th>
                  <th className="px-4 py-3">Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id as string} className="border-t border-border">
                    <td className="px-4 py-3">{job.stage as string}</td>
                    <td className="px-4 py-3">{job.status as string}</td>
                    <td className="px-4 py-3">
                      {(job.provider as string) ?? "—"}
                      {job.model ? ` · ${job.model as string}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(job.started_at as string).toLocaleString("ru-RU")}
                    </td>
                    <td className="px-4 py-3 text-destructive">{(job.error as string) ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
