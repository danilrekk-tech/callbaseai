import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui-kit";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { askKnowledge, listSearchFilters, searchKnowledge } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "AI-поиск по звонкам — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content:
          "Задайте вопрос базе знаний: ответ формируется из реальных звонков со ссылками на источники.",
      },
      { property: "og:title", content: "AI-поиск по базе знаний звонков" },
      { property: "og:description", content: "Retrieval-ответы с указанием конкретных звонков." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const examples = [
  "Почему клиенты чаще всего отказываются от сайта под ключ?",
  "Какие формулировки лучше всего снимают возражение о цене?",
  "Что отличает звонки с продажей от звонков с отказом?",
];

const HISTORY_KEY = "ai-search-history";
const ALL = "__all__";

type HistoryItem = {
  question: string;
  managerId: string | null;
  clientName: string | null;
  at: string;
};

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function SearchPage() {
  const ask = useServerFn(askKnowledge);
  const search = useServerFn(searchKnowledge);
  const filtersFn = useServerFn(listSearchFilters);

  const [question, setQuestion] = useState("");
  const [managerId, setManagerId] = useState<string>(ALL);
  const [clientName, setClientName] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const filterOptions = useQuery({
    queryKey: ["search-filters"],
    queryFn: () => filtersFn({}),
  });

  const askMutation = useMutation({
    mutationFn: (payload: { question: string; managerId: string | null; clientName: string | null }) =>
      ask({ data: payload }),
    onError: (error: Error) => toast.error(error.message),
  });
  const searchMutation = useMutation({
    mutationFn: (payload: { query: string; managerId: string | null; clientName: string | null }) =>
      search({ data: { ...payload, limit: 12 } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const persistHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev.filter((entry) => entry.question !== item.question)].slice(0, 20);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  };

  const run = (
    value = question,
    manager = managerId === ALL ? null : managerId,
    client = clientName.trim() || null,
  ) => {
    if (!value.trim()) {
      toast.error("Введите вопрос");
      return;
    }
    setShowSources(false);
    askMutation.mutate({ question: value, managerId: manager, clientName: client });
    searchMutation.mutate({ query: value, managerId: manager, clientName: client });
    persistHistory({ question: value, managerId: manager, clientName: client, at: new Date().toISOString() });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  };

  const managerNameById = (id: string | null) =>
    filterOptions.data?.managers.find((manager) => manager.id === id)?.full_name ?? null;

  return (
    <div>
      <PageHeader
        title="AI-поиск"
        description="Ответы строятся только на данных обработанных звонков."
      />

      <div className="panel p-5">
        <Textarea
          rows={3}
          placeholder="Например: какие боли чаще всего называют клиенты из e-commerce?"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Менеджер</label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Все менеджеры" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все менеджеры</SelectItem>
                {(filterOptions.data?.managers ?? []).map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Клиент</label>
            <Input
              className="mt-1"
              list="search-clients"
              placeholder="Все клиенты"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
            />
            <datalist id="search-clients">
              {(filterOptions.data?.clients ?? []).map((client) => (
                <option key={client} value={client} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => run()} disabled={askMutation.isPending}>
            <Sparkles className="size-4" />
            {askMutation.isPending ? "Ищу ответ…" : "Спросить"}
          </Button>
          {examples.map((example) => (
            <button
              key={example}
              onClick={() => setQuestion(example)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 ? (
        <div className="panel mt-6 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <History className="size-4" /> История запросов
            </h2>
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2 className="size-4" /> Очистить
            </Button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((item) => (
              <li key={`${item.at}-${item.question}`}>
                <button
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-accent"
                  onClick={() => {
                    setQuestion(item.question);
                    setManagerId(item.managerId ?? ALL);
                    setClientName(item.clientName ?? "");
                    run(item.question, item.managerId, item.clientName);
                  }}
                >
                  <span>{item.question}</span>
                  <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{new Date(item.at).toLocaleString("ru-RU")}</span>
                    {item.managerId ? <span>менеджер: {managerNameById(item.managerId) ?? item.managerId}</span> : null}
                    {item.clientName ? <span>клиент: {item.clientName}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {askMutation.data ? (
        <div className="panel mt-6 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Ответ</h2>
            <Badge variant="secondary">
              {askMutation.data.provider} · {askMutation.data.model}
            </Badge>
          </div>
          <p className="mt-3 whitespace-pre-line text-sm">{askMutation.data.answer}</p>

          {askMutation.data.sources.length > 0 ? (
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowSources((prev) => !prev)}>
                {showSources
                  ? "Скрыть источники"
                  : `Показать источники (${askMutation.data.sources.length})`}
              </Button>
              {showSources ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {askMutation.data.sources.map((source, index) => (
                    <li key={index} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Источник {index + 1}</Badge>
                        <span>{source.source_type}</span>
                        <span>релевантность {source.similarity.toFixed(3)}</span>
                        {source.manager_name ? <span>менеджер: {source.manager_name}</span> : null}
                        {source.client_name ? <span>клиент: {source.client_name}</span> : null}
                        {source.outcome ? <span>исход: {source.outcome}</span> : null}
                        {source.call_date ? (
                          <span>{new Date(source.call_date).toLocaleDateString("ru-RU")}</span>
                        ) : null}
                        {source.call_id ? (
                          <Link
                            to="/calls/$callId"
                            params={{ callId: source.call_id }}
                            className="text-accent hover:underline"
                          >
                            открыть звонок
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-2 text-muted-foreground">{source.excerpt}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {searchMutation.data && searchMutation.data.length > 0 ? (
        <div className="panel mt-6 p-5">
          <h2 className="text-lg font-semibold">Семантические совпадения</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {searchMutation.data.map((match) => (
              <li key={match.chunk_id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{match.source_type}</Badge>
                  <span>{match.similarity.toFixed(3)}</span>
                  {match.call?.manager_name ? <span>{match.call.manager_name}</span> : null}
                  {match.call?.client_name ? <span>{match.call.client_name}</span> : null}
                  {match.call_id ? (
                    <Link
                      to="/calls/$callId"
                      params={{ callId: match.call_id }}
                      className="text-accent hover:underline"
                    >
                      звонок
                    </Link>
                  ) : null}
                </div>
                <p className="mt-2">{match.content.slice(0, 500)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
