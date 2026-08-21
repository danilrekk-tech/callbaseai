// Shared, client-safe types for the AI processing layer.

export type CallStatus =
  | "uploaded"
  | "processing"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "indexing"
  | "completed"
  | "failed";

export const CALL_STATUSES: CallStatus[] = [
  "uploaded",
  "processing",
  "transcribing",
  "transcribed",
  "analyzing",
  "indexing",
  "completed",
  "failed",
];

/** Ordered pipeline stages shown to the user. */
export const PIPELINE_STEPS: { status: CallStatus; label: string }[] = [
  { status: "uploaded", label: "Загружен" },
  { status: "transcribing", label: "Транскрибация" },
  { status: "analyzing", label: "Анализ" },
  { status: "indexing", label: "Индексация" },
  { status: "completed", label: "Готово" },
];

export type CallOutcome = "sale" | "loss" | "in_progress" | "unknown";

export const CALL_OUTCOMES: CallOutcome[] = ["sale", "loss", "in_progress", "unknown"];

export const OUTCOME_LABELS: Record<string, string> = {
  sale: "Продажа",
  loss: "Потеря",
  in_progress: "В работе",
  unknown: "Не определён",
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "Загружен",
  processing: "Обработка",
  transcribing: "Транскрибация",
  transcribed: "Транскрибирован",
  analyzing: "Анализ",
  indexing: "Индексация",
  completed: "Готово",
  failed: "Ошибка",
};

/** Knowledge kinds: facts come from the call, inferences from the model,
 *  patterns only exist once several calls confirm them. */
export type InsightKind = "fact" | "inference" | "pattern";

export const INSIGHT_KIND_LABELS: Record<string, string> = {
  fact: "ФАКТ",
  inference: "ИНТЕРПРЕТАЦИЯ",
  pattern: "ЗАКОНОМЕРНОСТЬ",
};

/** A pattern becomes "confirmed" only after this many independent calls. */
export const PATTERN_MIN_CONFIRMATIONS = 3;

export type ProviderKind = "transcription" | "analysis" | "embedding";

export const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "mp4",
  "aac",
  "ogg",
  "oga",
  "opus",
  "webm",
  "flac",
  "amr",
  "aiff",
] as const;

export const MAX_AUDIO_BYTES = 1_000_000_000; // ElevenLabs Scribe accepts up to ~1 GB

export type TranscriptSegmentInput = {
  idx: number;
  speaker: string | null;
  speaker_role: string | null;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
  words?: { text: string; start_ms: number | null; end_ms: number | null }[];
};

export type TranscriptionResult = {
  provider: string;
  model: string;
  language: string | null;
  languageProbability: number | null;
  fullText: string;
  wordsCount: number;
  durationSeconds: number | null;
  segments: TranscriptSegmentInput[];
  raw: unknown;
};

export type FactOrInterpretation = {
  statement: string;
  evidence?: string | null;
};

export type AnalysisResult = {
  language?: string | null;
  outcome?: string | null;
  summary?: string | null;
  manager_speaker?: string | null;
  confidence?: number | null;
  client: {
    client_type?: string | null;
    need?: string | null;
    motivation?: string | null;
    pains?: string[];
    choice_criteria?: string[];
    budget_sensitivity?: string | null;
    interest_level?: string | null;
    objections?: string[];
    fears?: string[];
    communication_style?: string | null;
    buying_signals?: string[];
    refusal_signals?: string[];
    facts?: FactOrInterpretation[];
    interpretations?: FactOrInterpretation[];
  };
  manager: {
    conversation_structure?: string | null;
    needs_discovery?: string | null;
    questions_asked?: string[];
    presentation_quality?: string | null;
    objection_handling?: string | null;
    argumentation?: string | null;
    empathy_score?: number | null;
    expertise_score?: number | null;
    pressure_score?: number | null;
    overall_score?: number | null;
    mistakes?: string[];
    missed_opportunities?: string[];
    good_actions?: string[];
    bad_actions?: string[];
    actions?: string[];
    facts?: FactOrInterpretation[];
    interpretations?: FactOrInterpretation[];
  };
  call: {
    stages?: { name: string; description?: string | null }[];
    key_moments?: {
      moment: string;
      quote?: string | null;
      impact?: string | null;
      timestamp_ms?: number | null;
    }[];
    turning_points?: { moment: string; quote?: string | null; impact?: string | null }[];
    sale_reasons?: string[];
    loss_reasons?: string[];
    sale_reason?: string | null;
    loss_reason?: string | null;
    turning_point?: string | null;
    effective_phrases?: string[];
    ineffective_phrases?: string[];
    recommendations?: string[];
    facts?: FactOrInterpretation[];
    interpretations?: FactOrInterpretation[];
  };
  objections?: {
    title: string;
    category?: string | null;
    quote?: string | null;
    handled?: boolean;
    handling_quality?: string | null;
    manager_response?: string | null;
  }[];
  patterns?: {
    name: string;
    description?: string | null;
    kind?: string | null;
    outcome_link?: string | null;
    confidence?: number | null;
    evidence?: string | null;
  }[];
};

export type ProviderHealth = {
  id: string;
  name: string;
  kind: string;
  model: string | null;
  enabled: boolean;
  status: string;
  priority: number;
  last_error: string | null;
  last_error_at: string | null;
  last_success_at: string | null;
  last_latency_ms: number | null;
  avg_latency_ms: number | null;
  request_count: number;
  success_count: number;
  error_count: number;
  secret_name: string | null;
};
