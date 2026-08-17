import { describe, expect, it } from "vitest";
import { buildRequestUrl, parseKosisMeta, parseKosisPoints, readKosisError, summarizeGrowth } from "./kosisSeries.mjs";

const rows = [
  { PRD_DE: "2023", DT: "104.2", UNIT_NM: "2020=100", ITM_NM: "생산지수", C1_NM: "전자부품·컴퓨터·영상·음향 및 통신장비", TBL_NM: "산업생산지수", TBL_ID: "DT_1F31021", ORG_ID: "101", LST_CHN_DE: "2026-07-31" },
  { PRD_DE: "2025", DT: "118.7", UNIT_NM: "2020=100", ITM_NM: "생산지수", C1_NM: "전자부품·컴퓨터·영상·음향 및 통신장비", TBL_NM: "산업생산지수", TBL_ID: "DT_1F31021", ORG_ID: "101", LST_CHN_DE: "2026-07-31" },
  { PRD_DE: "2024", DT: "110.5", UNIT_NM: "2020=100", ITM_NM: "생산지수", C1_NM: "전자부품·컴퓨터·영상·음향 및 통신장비", TBL_NM: "산업생산지수", TBL_ID: "DT_1F31021", ORG_ID: "101", LST_CHN_DE: "2026-07-31" },
  { PRD_DE: "2022", DT: "-", UNIT_NM: "2020=100", ITM_NM: "생산지수", C1_NM: "전자부품", TBL_NM: "산업생산지수" },
];

describe("요청 URL 구성", () => {
  it("KOSIS UI가 생성한 URL의 인증키를 실제 키로 교체한다", () => {
    const url = buildRequestUrl("https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=PLACEHOLDER&orgId=101&tblId=DT_1F31021", "real-key");

    expect(new URL(url).searchParams.get("apiKey")).toBe("real-key");
    expect(new URL(url).searchParams.get("orgId")).toBe("101");
  });

  it("응답 형식을 json으로 강제한다", () => {
    const url = buildRequestUrl("https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&format=xml", "real-key");

    expect(new URL(url).searchParams.get("format")).toBe("json");
    expect(new URL(url).searchParams.get("jsonVD")).toBe("Y");
  });

  it("키가 없으면 실패한다", () => {
    expect(() => buildRequestUrl("https://kosis.kr/openapi/Param/statisticsParameterData.do", "")).toThrow(/인증키/);
  });
});

describe("응답 오류 판별", () => {
  it("정상 배열은 오류가 없다", () => {
    expect(readKosisError(rows)).toBe("");
  });

  it("빈 배열은 데이터 없음으로 본다", () => {
    expect(readKosisError([])).toMatch(/데이터/);
  });

  it("KOSIS 오류 객체는 코드와 메시지를 전달한다", () => {
    expect(readKosisError({ err: "20", errMsg: "인증키가 유효하지 않습니다." })).toMatch(/20.*인증키/);
  });

  it("빈 응답도 오류로 본다", () => {
    expect(readKosisError(null)).toMatch(/비어/);
  });
});

describe("수치 계열 정리", () => {
  it("시점 오름차순으로 정렬한다", () => {
    expect(parseKosisPoints(rows).map((point) => point.period)).toEqual(["2023", "2024", "2025"]);
  });

  it("수치가 없는 행은 버린다", () => {
    expect(parseKosisPoints(rows).some((point) => point.period === "2022")).toBe(false);
  });

  it("통계표 메타데이터를 뽑는다", () => {
    expect(parseKosisMeta(rows)).toMatchObject({ tableName: "산업생산지수", unit: "2020=100", tblId: "DT_1F31021", orgId: "101" });
  });
});

describe("업종 성장세 요약", () => {
  it("최근 시점과 직전 시점으로 증감률을 계산한다", () => {
    const summary = summarizeGrowth(parseKosisPoints(rows));

    expect(summary).toMatchObject({ latestPeriod: "2025", latestValue: 118.7, previousPeriod: "2024" });
    expect(summary?.growthRate).toBe(7.4);
  });

  it("시점이 하나면 증감률을 내지 않는다", () => {
    expect(summarizeGrowth([{ period: "2025", value: 100 }])?.growthRate).toBeUndefined();
  });

  it("데이터가 없으면 요약하지 않는다", () => {
    expect(summarizeGrowth([])).toBeUndefined();
  });
});
