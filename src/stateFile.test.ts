import { describe, expect, it } from "vitest";
import { hasUserInput, parseStateFile, type WorkInput } from "./stateFile";

const emptyWork: WorkInput = {
  companyName: "",
  industry: "",
  competitors: [{ name: "", position: "", note: "" }],
  swotItems: [{ content: "", evidence: "" }],
  suppliers: [{ name: "" }],
  actions: [{ task: "", owner: "", kpi: "", due: "" }],
};

describe("내보내기 파일 파싱", () => {
  it("정상 파일은 그대로 통과한다", () => {
    const result = parseStateFile(JSON.stringify({ companyName: "한빛정밀", industry: "자동차 부품 제조" }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.companyName).toBe("한빛정밀");
  });

  it("일부 필드만 있는 파일도 통과한다", () => {
    expect(parseStateFile(JSON.stringify({ scores: {} })).ok).toBe(true);
  });

  it("깨진 JSON은 거부한다", () => {
    const result = parseStateFile("{ companyName: ");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/JSON/);
  });

  it("빈 파일은 거부한다", () => {
    expect(parseStateFile("").ok).toBe(false);
  });

  it("객체가 아닌 JSON은 거부한다", () => {
    expect(parseStateFile("[1,2,3]").ok).toBe(false);
    expect(parseStateFile('"문자열"').ok).toBe(false);
    expect(parseStateFile("null").ok).toBe(false);
  });

  it("CCA 필드가 하나도 없는 객체는 거부한다", () => {
    const result = parseStateFile(JSON.stringify({ foo: 1, bar: 2 }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/CCA/);
  });
});

describe("작업 내용 유무 판정", () => {
  it("초기 상태는 작업 내용이 없다", () => {
    expect(hasUserInput(emptyWork)).toBe(false);
  });

  it("회사명만 입력해도 작업 내용으로 본다", () => {
    expect(hasUserInput({ ...emptyWork, companyName: "한빛정밀" })).toBe(true);
  });

  it("공백만 입력한 경우는 작업 내용이 아니다", () => {
    expect(hasUserInput({ ...emptyWork, companyName: "   ", industry: "\n" })).toBe(false);
  });

  it("경쟁사·SWOT·SCM·실행과제 입력을 각각 인식한다", () => {
    expect(hasUserInput({ ...emptyWork, competitors: [{ name: "대성모빌리티", position: "", note: "" }] })).toBe(true);
    expect(hasUserInput({ ...emptyWork, swotItems: [{ content: "", evidence: "1개사 의존도 68%" }] })).toBe(true);
    expect(hasUserInput({ ...emptyWork, suppliers: [{ name: "동원소재" }] })).toBe(true);
    expect(hasUserInput({ ...emptyWork, actions: [{ task: "", owner: "", kpi: "", due: "2026-09" }] })).toBe(true);
  });
});
