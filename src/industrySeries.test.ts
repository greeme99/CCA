import { describe, expect, it } from "vitest";
import { describeIndustryGrowth, getGrowthMarketAdjustment, selectSeriesForIndustry, type IndustrySeries } from "./industrySeries";

const series: IndustrySeries = {
  id: "electronics-production",
  label: "전자부품·통신장비 생산지수",
  keywords: ["전자부품", "PCB"],
  tableName: "산업생산지수",
  itemName: "생산지수",
  unit: "2020=100",
  category: "전자부품·컴퓨터·영상·음향 및 통신장비",
  orgId: "101",
  tblId: "DT_1F31021",
  lastChanged: "2026-07-31",
  latestPeriod: "2025",
  latestValue: 118.7,
  previousPeriod: "2024",
  previousValue: 110.5,
  growthRate: 7.4,
  points: [{ period: "2024", value: 110.5 }, { period: "2025", value: 118.7 }],
  sourceUrl: "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1F31021",
};

describe("업종별 계열 선택", () => {
  const candidates = [
    { id: "electronics", keywords: ["전자부품", "반도체", "PCB"] },
    { id: "battery", keywords: ["배터리팩", "이차전지"] },
    { id: "manufacturing", keywords: [], default: true },
  ];

  it("업종 키워드가 겹치는 계열을 고른다", () => {
    expect(selectSeriesForIndustry(candidates, "배터리팩·BMS")?.id).toBe("battery");
  });

  it("표기 차이를 무시하고 맞춘다", () => {
    expect(selectSeriesForIndustry(candidates, "PCB 어셈블리")?.id).toBe("electronics");
  });

  it("겹치는 계열이 없으면 기본 계열을 쓴다", () => {
    expect(selectSeriesForIndustry(candidates, "화장품 ODM")?.id).toBe("manufacturing");
  });

  it("업종이 비어 있으면 기본 계열을 쓴다", () => {
    expect(selectSeriesForIndustry(candidates, "")?.id).toBe("manufacturing");
  });

  it("캐시가 비어 있으면 아무것도 고르지 않는다", () => {
    expect(selectSeriesForIndustry([], "배터리팩")).toBeUndefined();
  });

  it("기본 계열도 없으면 아무것도 고르지 않는다", () => {
    expect(selectSeriesForIndustry([{ id: "battery", keywords: ["배터리팩"] }], "식품")).toBeUndefined();
  });
});

describe("업종 성장세 근거 문구", () => {
  it("통계표·시점·수치·증감률을 모두 담는다", () => {
    expect(describeIndustryGrowth(series)).toBe("KOSIS 산업생산지수 생산지수 2025 118.7 2020=100 (2024 대비 +7.4%)");
  });

  it("직전 시점이 없으면 증감률을 주장하지 않는다", () => {
    expect(describeIndustryGrowth({ ...series, growthRate: undefined })).toMatch(/직전 시점 없음/);
  });
});

describe("성장세의 시장 축 보정", () => {
  it("성장 업종은 시장 축을 올린다", () => {
    expect(getGrowthMarketAdjustment(series)).toBe(1);
  });

  it("역성장 업종은 시장 축을 내린다", () => {
    expect(getGrowthMarketAdjustment({ ...series, growthRate: -5.2 })).toBe(-1);
  });

  it("정체 업종은 보정하지 않는다", () => {
    expect(getGrowthMarketAdjustment({ ...series, growthRate: 1.1 })).toBe(0);
  });

  it("계열이 없으면 보정하지 않는다", () => {
    expect(getGrowthMarketAdjustment(undefined)).toBe(0);
  });
});
