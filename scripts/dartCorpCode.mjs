// OpenDART corpCode.xml(전체 등록 기업 목록) 처리 로직.
// prefetch 스크립트가 node로 실행되므로 TypeScript가 아닌 .mjs로 두고, 테스트도 이 파일을 직접 검증한다.
// 정규화 규칙은 src/competitors.ts의 normalizeCompanyName과 동일하게 유지해야 한다.
// (앱의 이름 매칭과 캐시 선별 기준이 어긋나면 캐시에 있어도 매칭되지 않는다.)

import { inflateRawSync } from "node:zlib";

/** @typedef {{ corpCode: string, corpName: string, stockCode: string, modifyDate: string }} DartCompany */

const normalizeName = (value) =>
  value
    .toLowerCase()
    // 괄호를 지우기 전에 (주)·(유) 같은 법인격 표기를 먼저 제거한다. 순서가 바뀌면 "(주)원진"이 "주원진"이 된다.
    .replace(/\((주|유|재|사|합)\)/g, "")
    .replace(/주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/g, "")
    .replace(/[()\[\]\s㈜.]/g, "");

function readTag(entry, tag) {
  const match = entry.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1].trim() : "";
}

/**
 * corpCode.xml 본문을 회사 레코드 배열로 변환한다.
 * @param {string} xml
 * @returns {DartCompany[]}
 */
export function parseCorpCodeXml(xml) {
  const entries = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
  return entries
    .map((entry) => ({
      corpCode: readTag(entry, "corp_code"),
      corpName: readTag(entry, "corp_name"),
      stockCode: readTag(entry, "stock_code"),
      modifyDate: readTag(entry, "modify_date"),
    }))
    .filter((company) => company.corpCode && company.corpName);
}

/**
 * 전체 목록은 10만 건이 넘어 배포 캐시로 쓰기에는 크다.
 * 상장사(종목코드 보유) 전체와, 벤치마크 목록에 등장하는 비상장사만 남긴다.
 * @param {DartCompany[]} companies
 * @param {string[]} benchmarkNames
 * @returns {DartCompany[]}
 */
export function selectCacheCompanies(companies, benchmarkNames) {
  const wanted = new Set(benchmarkNames.map(normalizeName).filter(Boolean));
  const selected = new Map();

  for (const company of companies) {
    const isListed = Boolean(company.stockCode);
    if (!isListed && !wanted.has(normalizeName(company.corpName))) continue;
    if (!selected.has(company.corpCode)) selected.set(company.corpCode, company);
  }

  return Array.from(selected.values());
}

/**
 * corpCode.xml은 ZIP으로 내려온다. 단일 엔트리만 들어 있으므로 로컬 파일 헤더를 직접 읽어 푼다.
 * (node에는 ZIP 리더가 없고, 이 한 가지 용도로 의존성을 더하지 않는다.)
 * @param {Buffer} zip
 * @returns {string}
 */
export function readSingleEntryZip(zip) {
  if (zip.length < 30 || zip.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("ZIP 로컬 파일 헤더를 찾을 수 없습니다.");
  }

  const method = zip.readUInt16LE(8);
  const compressedSize = zip.readUInt32LE(18);
  const nameLength = zip.readUInt16LE(26);
  const extraLength = zip.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  // 스트리밍으로 쓰인 ZIP은 크기가 0이고 데이터 디스크립터에 들어 있어, 남은 전체를 넘긴다.
  const end = compressedSize > 0 ? start + compressedSize : zip.length;
  const payload = zip.subarray(start, end);

  if (method === 0) return payload.toString("utf8");
  if (method === 8) return inflateRawSync(payload).toString("utf8");
  throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${method}`);
}
