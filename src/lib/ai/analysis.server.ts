// Structured call analysis through the provider-agnostic chat abstraction.
import type { SupabaseClient } from "@supabase/supabase-js";

import { chatCompletion } from "./registry.server";
import type { AnalysisResult, TranscriptSegmentInput } from "./types";

const SYSTEM_PROMPT = `Ты — старший аналитик отдела продаж компании Мегагруп.
Ты анализируешь расшифровки телефонных звонков менеджеров с клиентами и извлекаешь структурированные знания.
Строго разделяй ФАКТЫ (то, что буквально сказано в транскрипции, с цитатой) и ИНТЕРПРЕТАЦИИ (твои выводы).
Никогда не выдумывай факты, которых нет в тексте. Если данных нет — используй null или пустой массив.
Отвечай ТОЛЬКО валидным JSON без markdown-обёрток. Все текстовые значения — на русском языке.`;

const SCHEMA_HINT = `{
  "language": "ru",
  "outcome": "sale | loss | in_progress | unknown",
  "summary": "краткое резюме звонка (2-4 предложения)",
  "manager_speaker": "идентификатор спикера-менеджера из транскрипции, например speaker_0",
  "client": {
    "client_type": "", "need": "", "motivation": "",
    "pains": [], "choice_criteria": [], "budget_sensitivity": "", "interest_level": "",
    "objections": [], "fears": [], "communication_style": "",
    "buying_signals": [], "refusal_signals": [],
    "facts": [{"statement": "", "evidence": "цитата"}],
    "interpretations": [{"statement": "", "evidence": "на чём основан вывод"}]
  },
  "manager": {
    "conversation_structure": "", "needs_discovery": "", "questions_asked": [],
    "presentation_quality": "", "objection_handling": "", "argumentation": "",
    "empathy_score": 0, "expertise_score": 0, "pressure_score": 0, "overall_score": 0,
    "mistakes": [], "missed_opportunities": [], "good_actions": [], "bad_actions": [],
    "facts": [{"statement": "", "evidence": ""}],
    "interpretations": [{"statement": "", "evidence": ""}]
  },
  "call": {
    "stages": [{"name": "", "description": ""}],
    "key_moments": [{"moment": "", "quote": "", "impact": ""}],
    "sale_reasons": [], "loss_reasons": [], "turning_point": "",
    "effective_phrases": [], "ineffective_phrases": [], "recommendations": [],
    "facts": [{"statement": "", "evidence": ""}],
    "interpretations": [{"statement": "", "evidence": ""}]
  },
  "objections": [{"title": "короткая нормализованная формулировка, напр. Дорого", "category": "цена|доверие|сроки|потребность|конкурент|другое", "quote": "", "handled": true, "handling_quality": "", "manager_response": ""}],
  "patterns": [{"name": "короткое название закономерности", "description": "", "kind": "успешный сценарий|ошибка|поведение клиента", "outcome_link": "sale|loss|neutral", "confidence": 0.7, "evidence": ""}]
}`;

function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Модель вернула ответ, который не является JSON");
  }
}

function scoreOf(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

export async function analyzeTranscript(
  db: SupabaseClient,
  input: {
    segments: TranscriptSegmentInput[];
    fullText: string;
    managerName?: string | null;
    clientName?: string | null;
  },
): Promise<{ analysis: AnalysisResult; provider: string; model: string; raw: string }> {
  const dialogue =
    input.segments.length > 0
      ? input.segments
          .map((segment) => `[${segment.speaker ?? "speaker"}] ${segment.text}`)
          .join("\n")
      : input.fullText;

  const userPrompt = [
    input.managerName ? `Менеджер: ${input.managerName}` : null,
    input.clientName ? `Клиент: ${input.clientName}` : null,
    "Транскрипция звонка (с разделением по спикерам):",
    dialogue.slice(0, 40000),
    "",
    "Верни JSON строго по этой структуре:",
    SCHEMA_HINT,
  ]
    .filter(Boolean)
    .join("\n");

  const { content, provider } = await chatCompletion(
    db,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { jsonMode: true, maxTokens: 6000, temperature: 0.15 },
  );

  const parsed = extractJson(content) as Record<string, unknown>;
  const client = (parsed["client"] ?? {}) as Record<string, unknown>;
  const manager = (parsed["manager"] ?? {}) as Record<string, unknown>;

  const analysis: AnalysisResult = {
    ...(parsed as unknown as AnalysisResult),
    client: {
      ...(client as AnalysisResult["client"]),
    },
    manager: {
      ...(manager as AnalysisResult["manager"]),
      empathy_score: scoreOf(manager["empathy_score"]),
      expertise_score: scoreOf(manager["expertise_score"]),
      pressure_score: scoreOf(manager["pressure_score"]),
      overall_score: scoreOf(manager["overall_score"]),
    },
    call: (parsed["call"] ?? {}) as AnalysisResult["call"],
  };

  return {
    analysis,
    provider: provider.name,
    model: provider.model ?? "unknown",
    raw: content,
  };
}

export async function testAnalysisConnection(
  db: SupabaseClient,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { content, provider } = await chatCompletion(
      db,
      [{ role: "user", content: "Ответь одним словом: работает" }],
      { maxTokens: 20 },
    );
    return {
      ok: true,
      message: `${provider.name} (${provider.model}) ответил: ${content.trim().slice(0, 80)}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
