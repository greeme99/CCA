// 내보낸 JSON 파일 가져오기 검증과, 파괴적 동작(초기화·샘플·가져오기) 전 확인이 필요한지 판정.

export type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

export type WorkInput = {
  companyName: string;
  industry: string;
  competitors: Array<{ name: string; position: string; note: string }>;
  swotItems: Array<{ content: string; evidence: string }>;
  suppliers: Array<{ name: string }>;
  actions: Array<{ task: string; owner: string; kpi: string; due: string }>;
};

const workbookKeys = ["companyName", "industry", "role", "purpose", "period", "competitors", "scores", "swot", "suppliers", "actions"];

export function parseStateFile(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 형식이 아닙니다. CCA에서 내보낸 파일인지 확인하세요." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "분석 데이터 객체가 아닙니다. CCA에서 내보낸 JSON 파일을 선택하세요." };
  }

  const value = parsed as Record<string, unknown>;
  if (!workbookKeys.some((key) => key in value)) {
    return { ok: false, message: "CCA 분석 데이터 항목을 찾을 수 없습니다. 다른 앱의 JSON 파일일 수 있습니다." };
  }

  return { ok: true, value };
}

const filled = (value: string) => Boolean(value.trim());

export function hasUserInput(input: WorkInput) {
  return filled(input.companyName)
    || filled(input.industry)
    || input.competitors.some((competitor) => filled(competitor.name) || filled(competitor.position) || filled(competitor.note))
    || input.swotItems.some((item) => filled(item.content) || filled(item.evidence))
    || input.suppliers.some((supplier) => filled(supplier.name))
    || input.actions.some((action) => filled(action.task) || filled(action.owner) || filled(action.kpi) || filled(action.due));
}
