// Shared, client-safe types for the AI processing layer.

export type CallStatus =
  | "uploaded"
  | "processing"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "completed"
  | "failed";

export const CALL_STATUSES: CallStatus[] = [
  "uploaded",
  "processing",
  "transcribing",
  "transcribed",
  "analyzing",
  "completed",
  "failed",
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
  completed: "Готово",
  failed: "Ошибка",
};

export type ProviderKind = "transcription" | "analysis" | "embedding";

export type TranscriptSegmentInput = {
  idx: number;
  speaker: string | null;
  speaker_role: string | null;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
};

export type TranscriptionResult = {
  provider: string;
  model: string;
  language: string | null;
  languageProbability: number | null;
  fullText: string;
  wordsCount: number;
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
    facts?: FactOrInterpretation[];
    interpretations?: FactOrInterpretation[];
  };
  call: {
    stages?: { name: string; description?: string | null }[];
    key_moments?: { moment: string; quote?: string | null; impact?: string | null }[];
    sale_reasons?: string[];
    loss_reasons?: string[];
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
