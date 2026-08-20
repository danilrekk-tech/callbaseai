import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui-kit";
import { Textarea } from "@/components/ui/textarea";
import { askKnowledge, searchKnowledge } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "AI-поиск по звонкам — Sales Intelligence Мегагруп" },
      {
        name: "description",
        content: "Задайте вопрос базе знаний: ответ формируется из реальных звонков со ссылками на источники.",
      },
      { property: "og:title", content: "AI-поиск по базе знаний звонков" },
      { property: "og:description", content: "Retrieval-ответы с указанием конкретных звонков." },
    ],
  }),
  component: SearchPage,
});

const examples = [
  "Почему клиенты чаще всего отказываются от сайта под ключ?",
  "Какие формулировки лучше всего снимают возражение о цене?",
  "Что отличает звонки с продажей от звонков с отказом?",
];

function SearchPage() {
  const ask = useServerFn(askKnowledge);
  const search = useServerFn(searchKnowledge);
  const [question, setQuestion] = useState("");

  const askMutation = useMutation({
    mutationFn: (value: string) => ask({ data: { question: value } }),
    onError: (error: Error) => toast.error(error.message),
  });
  const searchMutation = useMutation({
    mutationFn: (value: string) => search({ data: { query: value, limit: 12 } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const run = () => {
    if (!question.trim()) {
      toast.error("Введите вопрос");
      return;
    }
    askMutation.mutate(question);
    searchMutation.mutate(question);
  };

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={askMutation.isPending}>
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Источники</p>
              <ul className="mt-2 space-y-2 text-sm">
                {askMutation.data.sources.map((source, index) => (
                  <li key={index} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Источник {index + 1}</Badge>
                      <span>{source.source_type}</span>
                      <span>релевантность {source.similarity.toFixed(3)}</span>
                      {source.manager_name ? <span>{source.manager_name}</span> : null}
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
