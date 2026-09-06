import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LabeledList, OutcomeBadge, PageHeader, StatCard, StatusBadge } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assignCallManager,
  getCallDetail,
  processCall,
  retryCallStage,
} from "@/lib/calls.functions";
import { listManagers } from "@/lib/insights.functions";
import { PIPELINE_STEPS, STAGE_LABELS, type PipelineStage } from "@/lib/ai/types";

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
  const retryStageFn = useServerFn(retryCallStage);
  const assignManager = useServerFn(assignCallManager);
  const fetchManagers = useServerFn(listManagers);
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

  const managersQuery = useQuery({
    queryKey: ["managers"],
    queryFn: () => fetchManagers(),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => reprocess({ data: { id: callId } }),
    onSuccess: () => {
      toast.success("Звонок переобработан");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryMutation = useMutation({
    mutationFn: (vars: { stage: PipelineStage; continueAfter: boolean }) =>
      retryStageFn({ data: { id: callId, stage: vars.stage, continueAfter: vars.continueAfter } }),
    onSuccess: () => {
      toast.success("Этап перезапущен");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: (managerId: string | null) => assignManager({ data: { id: callId, managerId } }),
    onSuccess: () => {
      toast.success("Менеджер обновлён, статистика пересчитана");
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Менеджер</span>
          <Select
            value={(call.manager_id as string | null) ?? "none"}
            onValueChange={(value) => assignMutation.mutate(value === "none" ? null : value)}
            disabled={assignMutation.isPending}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Не назначен" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Не назначен</SelectItem>
              {(managersQuery.data ?? []).map((manager) => (
                <SelectItem key={manager.id as string} value={manager.id as string}>
                  {manager.full_name as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      {call.error_message ? (
        <div className="panel mt-4 border-destructive/40 p-4 text-sm text-destructive">
          {call.error_message as string}
        </div>
      ) : null}

      <PipelineProgress status={call.status as string} />

      {data.audioUrl ? (
        <div className="panel mt-6 p-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={audioRef}
            controls
            src={data.audioUrl}
            className="w-full"
            onTimeUpdate={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Позиция {formatMs(currentMs)} · нажмите на реплику в транскрипте, чтобы перейти к моменту
            записи.
          </p>
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
          {Array.isArray(analysis?.key_moments) && analysis.key_moments.length > 0 ? (
            <div className="panel p-5">
              <h2 className="text-lg font-semibold">Ключевые моменты</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {(
                  analysis.key_moments as {
                    moment?: string;
                    quote?: string | null;
                    impact?: string | null;
                    timestamp_ms?: number | null;
                  }[]
                ).map((moment, index) => (
                  <li key={index} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{moment.moment}</p>
                      {moment.timestamp_ms != null && data.audioUrl ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => seekTo(moment.timestamp_ms ?? null)}
                        >
                          {formatMs(moment.timestamp_ms)}
                        </Button>
                      ) : null}
                    </div>
                    {moment.quote ? (
                      <p className="mt-1 italic text-muted-foreground">«{moment.quote}»</p>
                    ) : null}
                    {moment.impact ? (
                      <p className="mt-1 text-xs text-muted-foreground">{moment.impact}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
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
            <div className="panel max-h-[70vh] divide-y divide-border overflow-y-auto">
              {segments.map((segment) => {
                const start = segment.start_ms as number | null;
                const end = segment.end_ms as number | null;
                const active =
                  start != null && currentMs >= start && (end == null || currentMs < end);
                const role = segment.speaker_role as string;
                return (
                  <button
                    key={segment.id as string}
                    type="button"
                    onClick={() => seekTo(start)}
                    className={`flex w-full gap-4 p-4 text-left text-sm transition-colors hover:bg-secondary/60 ${
                      active ? "bg-accent/10" : ""
                    }`}
                  >
                    <div className="w-28 shrink-0 text-xs text-muted-foreground">
                      <p
                        className={`font-medium ${
                          role === "manager" ? "text-primary" : role === "client" ? "text-accent" : "text-foreground"
                        }`}
                      >
                        {role === "manager"
                          ? "Менеджер"
                          : role === "client"
                            ? "Клиент"
                            : ((segment.speaker as string) ?? "—")}
                      </p>
                      <p>{formatMs(start)}</p>
                    </div>
                    <p className={`min-w-0 ${active ? "font-medium" : ""}`}>
                      {segment.text as string}
                    </p>
                  </button>
                );
              })}
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

function PipelineProgress({ status }: { status: string }) {
  const failed = status === "failed";
  const activeIndex = PIPELINE_STEPS.findIndex((step) => step.status === status);
  const doneIndex =
    status === "completed"
      ? PIPELINE_STEPS.length - 1
      : status === "transcribed"
        ? 1
        : status === "processing"
          ? 0
          : activeIndex;

  return (
    <div className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {PIPELINE_STEPS.map((step, index) => {
          const isDone = doneIndex > index;
          const isCurrent = doneIndex === index && !failed;
          return (
            <div key={step.status} className="flex items-center gap-2">
              <span
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                  failed && index === Math.max(doneIndex, 0)
                    ? "bg-destructive/15 text-destructive"
                    : isDone
                      ? "bg-success/15 text-success"
                      : isCurrent
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="size-3" />
                ) : failed && index === Math.max(doneIndex, 0) ? (
                  <AlertCircle className="size-3" />
                ) : isCurrent ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Circle className="size-3" />
                )}
                {step.label}
              </span>
              {index < PIPELINE_STEPS.length - 1 ? (
                <span className="h-px w-6 bg-border" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
