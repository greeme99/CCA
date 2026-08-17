import { describe, expect, it } from "vitest";
import { isCompanyNameMatch, shouldAutoRefreshCompetitors, type AutoRefreshInput, type CompetitorProfileLike, type NamedRow } from "./competitors";

const profile: CompetitorProfileLike = {
  competitors: [
    { name: "아이티엠반도체" },
    { name: "상신이디피" },
    { name: "신흥에스이씨" },
    { name: "알루코" },
    { name: "넥스콘테크놀러지" },
  ],
};

const otherProfile: CompetitorProfileLike = {
  competitors: [{ name: "효성중공업" }, { name: "OCI파워" }, { name: "다쓰테크" }],
};

const placeholderNames = new Set(["삼성전자", "LG전자", "현대모비스", "두산에너빌리티", "한화솔루션"]);

const profileRows = (): NamedRow[] => profile.competitors.map((competitor) => ({ ...competitor }));

function decide(patch: Partial<AutoRefreshInput> = {}) {
  return shouldAutoRefreshCompetitors({
    competitors: profileRows(),
    candidates: [],
    profile,
    isDefaultProfile: false,
    competitorsAuto: true,
    placeholderNames,
    ...patch,
  });
}

describe("회사명 매칭", () => {
  it("표기가 같으면 매칭한다", () => {
    expect(isCompanyNameMatch("이랜텍", "이랜텍")).toBe(true);
  });

  it("법인격 표기 차이를 흡수한다", () => {
    expect(isCompanyNameMatch("원진", "㈜원진")).toBe(true);
    expect(isCompanyNameMatch("원진", "(주)원진")).toBe(true);
    expect(isCompanyNameMatch("원진", "주식회사 원진")).toBe(true);
    expect(isCompanyNameMatch("주식회사 원진", "원진")).toBe(true);
  });

  it("공백·대소문자 차이를 흡수한다", () => {
    expect(isCompanyNameMatch("SK 하이닉스", "SK하이닉스")).toBe(true);
    expect(isCompanyNameMatch("db하이텍", "DB하이텍")).toBe(true);
  });

  it("이름이 앞부분만 같은 다른 법인은 매칭하지 않는다", () => {
    expect(isCompanyNameMatch("한화솔루션", "한화")).toBe(false);
    expect(isCompanyNameMatch("삼성전자", "삼성전자서비스")).toBe(false);
    expect(isCompanyNameMatch("파트론", "파트론오토모티브")).toBe(false);
    expect(isCompanyNameMatch("LG전자", "LG생활건강")).toBe(false);
  });

  it("빈 이름은 매칭하지 않는다", () => {
    expect(isCompanyNameMatch("", "원진")).toBe(false);
    expect(isCompanyNameMatch("원진", "   ")).toBe(false);
  });
});

describe("경쟁사 목록 자동 갱신 판정", () => {
  it("사용자가 경쟁사 회사명을 수정한 목록은 자동 갱신 대상이 아니다", () => {
    const competitors = profileRows();
    competitors[0] = { name: "ITM반도체" };

    expect(decide({ competitors, competitorsAuto: false })).toBe(false);
  });

  it("사용자가 경쟁사 회사명을 지우는 중인 목록도 자동 갱신 대상이 아니다", () => {
    const competitors = profileRows();
    competitors[0] = { name: "" };

    expect(decide({ competitors, competitorsAuto: false })).toBe(false);
  });

  it("사용자가 직접 입력한 목록은 프로파일이 달라도 유지한다", () => {
    const competitors: NamedRow[] = [{ name: "우리동네정밀" }, { name: "이웃테크" }];

    expect(decide({ competitors, competitorsAuto: false })).toBe(false);
  });

  it("자동 생성 목록은 프로파일이 바뀌면 갱신한다", () => {
    expect(decide({ profile: otherProfile })).toBe(true);
  });

  it("현재 프로파일과 동일한 자동 생성 목록은 갱신하지 않는다", () => {
    expect(decide()).toBe(false);
  });

  it("기본 프로파일 placeholder 이름이 남아 있으면 편집 여부와 무관하게 갱신한다", () => {
    const competitors: NamedRow[] = [{ name: "삼성전자" }];

    expect(decide({ competitors, competitorsAuto: false })).toBe(true);
  });

  it("기본 프로파일에서는 placeholder 목록을 갱신하지 않는다", () => {
    const competitors: NamedRow[] = [{ name: "삼성전자" }, { name: "LG전자" }];

    expect(decide({ competitors, isDefaultProfile: true })).toBe(false);
  });

  it("구버전 가상 회사명은 편집 여부와 무관하게 갱신한다", () => {
    const competitors: NamedRow[] = [{ name: "상장 동종업계 1위" }];

    expect(decide({ competitors, competitorsAuto: false })).toBe(true);
  });

  it("추천 후보에만 남은 구버전 가상 회사명도 갱신 대상이다", () => {
    expect(decide({ candidates: [{ name: "대체재 기업" }], competitorsAuto: false })).toBe(true);
  });
});
