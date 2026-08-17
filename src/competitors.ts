// 경쟁사 목록 자동 갱신 판정 로직.
// main.tsx는 모듈 로드 시 createRoot를 실행하므로 단위 테스트가 불가능해 이 파일로 분리한다.

export type NamedRow = { name: string };
export type CompetitorProfileLike = { competitors: Array<{ name: string }> };

export type AutoRefreshInput = {
  /** 현재 경쟁사 목록 */
  competitors: NamedRow[];
  /** 현재 Top5 추천 후보 목록 */
  candidates: NamedRow[];
  /** 회사명·산업으로 매칭된 프로파일 */
  profile: CompetitorProfileLike;
  /** 매칭 실패로 기본 프로파일이 선택된 경우 */
  isDefaultProfile: boolean;
  /** 목록이 앱 자동 생성물이면 true, 사용자가 편집했으면 false */
  competitorsAuto: boolean;
  /** 기본 프로파일이 채워 넣는 placeholder 회사명 */
  placeholderNames: Set<string>;
};

export const normalizeCompanyName = (value: string) =>
  value
    .toLowerCase()
    .replace(/주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/g, "")
    .replace(/[()\[\]\s㈜.]/g, "");

const legacyGenericCompetitorNames = new Set(["상장 동종업계 1위", "고성장 비상장사", "원가 경쟁사", "기술 차별화 기업", "대체재 기업"]);

export function hasLegacyGenericNames(rows: NamedRow[]) {
  return rows.some((row) => legacyGenericCompetitorNames.has(row.name.trim()));
}

/**
 * 경쟁사 목록을 현재 프로파일 기준으로 자동 교체할지 판정한다.
 * 사용자가 편집한 목록(`competitorsAuto === false`)은 앱이 만든 placeholder가 남아 있는 경우에만 교체한다.
 */
export function shouldAutoRefreshCompetitors(input: AutoRefreshInput) {
  const rows = [...input.competitors, ...input.candidates];

  // 구버전이 남긴 가상 회사명은 사용자 편집 여부와 무관하게 실제 회사명으로 교체한다.
  if (hasLegacyGenericNames(rows)) return true;

  // 기본 프로파일에서는 교체 대상 목록이 곧 현재 목록이므로 갱신하지 않는다(재귀 갱신 방지).
  if (input.isDefaultProfile) return false;

  // 기본 프로파일 placeholder가 남아 있으면 구체적인 프로파일 목록으로 교체한다.
  if (rows.some((row) => input.placeholderNames.has(row.name.trim()))) return true;

  // 사용자가 편집한 목록은 건드리지 않는다. 교체는 "경쟁사 조사" 버튼으로만 한다.
  if (!input.competitorsAuto) return false;

  // 자동 생성 목록은 프로파일이 바뀌었을 때만 새 프로파일 목록으로 교체한다.
  const profileNames = new Set(input.profile.competitors.map((competitor) => normalizeCompanyName(competitor.name)));
  return input.competitors.some((row) => !profileNames.has(normalizeCompanyName(row.name)));
}
