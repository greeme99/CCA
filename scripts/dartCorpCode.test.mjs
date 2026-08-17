import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseCorpCodeXml, readSingleEntryZip, selectCacheCompanies } from "./dartCorpCode.mjs";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<result>
  <list>
    <corp_code>00126380</corp_code>
    <corp_name>삼성전자</corp_name>
    <stock_code>005930</stock_code>
    <modify_date>20250701</modify_date>
  </list>
  <list>
    <corp_code>00356361</corp_code>
    <corp_name>이랜텍</corp_name>
    <stock_code>054210</stock_code>
    <modify_date>20250612</modify_date>
  </list>
  <list>
    <corp_code>00999001</corp_code>
    <corp_name>㈜원진</corp_name>
    <stock_code> </stock_code>
    <modify_date>20240102</modify_date>
  </list>
  <list>
    <corp_code>00999002</corp_code>
    <corp_name>이름없는비상장</corp_name>
    <stock_code></stock_code>
    <modify_date>20240103</modify_date>
  </list>
  <list>
    <corp_code></corp_code>
    <corp_name>코드없음</corp_name>
    <stock_code>000000</stock_code>
    <modify_date>20240104</modify_date>
  </list>
</result>`;

function buildZip(content, { method = 8 } = {}) {
  const name = Buffer.from("CORPCODE.xml");
  const body = method === 8 ? deflateRawSync(Buffer.from(content, "utf8")) : Buffer.from(content, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name, body]);
}

describe("corpCode.xml 파싱", () => {
  it("list 항목을 회사 레코드로 변환한다", () => {
    const companies = parseCorpCodeXml(xml);

    expect(companies).toHaveLength(4);
    expect(companies[0]).toEqual({ corpCode: "00126380", corpName: "삼성전자", stockCode: "005930", modifyDate: "20250701" });
  });

  it("corp_code나 corp_name이 없는 항목은 버린다", () => {
    expect(parseCorpCodeXml(xml).some((company) => company.corpName === "코드없음")).toBe(false);
  });

  it("공백만 있는 종목코드는 빈 문자열로 정리한다", () => {
    const unlisted = parseCorpCodeXml(xml).find((company) => company.corpName === "㈜원진");

    expect(unlisted?.stockCode).toBe("");
  });

  it("빈 입력에서도 깨지지 않는다", () => {
    expect(parseCorpCodeXml("")).toEqual([]);
    expect(parseCorpCodeXml("<result></result>")).toEqual([]);
  });
});

describe("배포 캐시 대상 선별", () => {
  const companies = parseCorpCodeXml(xml);

  it("상장사는 모두 포함한다", () => {
    const names = selectCacheCompanies(companies, []).map((company) => company.corpName);

    expect(names).toContain("삼성전자");
    expect(names).toContain("이랜텍");
  });

  it("벤치마크에 없는 비상장사는 제외해 캐시 크기를 유지한다", () => {
    const names = selectCacheCompanies(companies, []).map((company) => company.corpName);

    expect(names).not.toContain("㈜원진");
    expect(names).not.toContain("이름없는비상장");
  });

  it("벤치마크 목록에 있는 비상장사는 포함한다", () => {
    const names = selectCacheCompanies(companies, ["원진"]).map((company) => company.corpName);

    expect(names).toContain("㈜원진");
    expect(names).not.toContain("이름없는비상장");
  });

  it("같은 회사를 중복으로 담지 않는다", () => {
    const selected = selectCacheCompanies(companies, ["삼성전자"]);

    expect(selected.filter((company) => company.corpName === "삼성전자")).toHaveLength(1);
  });
});

describe("ZIP 해제", () => {
  it("deflate 압축된 단일 엔트리를 푼다", () => {
    expect(readSingleEntryZip(buildZip(xml))).toBe(xml);
  });

  it("무압축(stored) 엔트리도 읽는다", () => {
    expect(readSingleEntryZip(buildZip(xml, { method: 0 }))).toBe(xml);
  });

  it("ZIP이 아니면 명확히 실패한다", () => {
    expect(() => readSingleEntryZip(Buffer.from("this is not a zip file at all"))).toThrow(/ZIP/);
  });
});
