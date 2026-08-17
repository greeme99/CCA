// KOSIS 통계자료 응답 처리와 업종별 계열 선택 로직.
// KOSIS는 통계표마다 분류코드(objL1)와 항목(itmId)이 달라, 요청 URL은 KOSIS 웹 UI에서 생성한 것을
// scripts/kosis-series.json에 넣어 쓴다. 이 모듈은 그 URL의 응답을 다루는 부분만 담당한다.

/** @typedef {{ period: string, value: number }} KosisPoint */
/** @typedef {{ tableName: string, itemName: string, unit: string, category: string, orgId: string, tblId: string, lastChanged: string }} KosisMeta */

/**
 * KOSIS UI가 생성한 URL에 실제 인증키를 주입하고 JSON 응답을 강제한다.
 * @param {string} rawUrl
 * @param {string} apiKey
 * @returns {string}
 */
export function buildRequestUrl(rawUrl, apiKey) {
  const url = new URL(rawUrl);
  if (!apiKey) throw new Error("KOSIS 인증키가 없습니다.");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("jsonVD", "Y");
  return url.toString();
}

/**
 * KOSIS 응답에서 오류를 판별한다. 오류일 때 메시지를 반환하고 정상이면 빈 문자열을 반환한다.
 * @param {unknown} payload
 * @returns {string}
 */
export function readKosisError(payload) {
  if (!payload) return "KOSIS 응답이 비어 있습니다.";
  if (Array.isArray(payload)) return payload.length ? "" : "KOSIS 응답에 데이터가 없습니다.";
  if (typeof payload === "object") {
    const record = /** @type {Record<string, unknown>} */ (payload);
    const message = record.errMsg || record.ERR_MSG || record.message;
    const code = record.err || record.ERR;
    if (message || code) return `KOSIS 오류${code ? ` (${code})` : ""}: ${message || "원인 미상"}`;
  }
  return "KOSIS 응답 형식을 해석할 수 없습니다.";
}

/**
 * 응답 행을 시점 오름차순 수치 배열로 정리한다. 수치가 없는 행(비공개·미집계)은 버린다.
 * @param {Array<Record<string, unknown>>} rows
 * @returns {KosisPoint[]}
 */
export function parseKosisPoints(rows) {
  return rows
    .map((row) => ({ period: String(row.PRD_DE ?? "").trim(), value: Number(row.DT) }))
    .filter((point) => point.period && Number.isFinite(point.value))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * 응답 행에서 통계표 메타데이터를 뽑는다.
 * @param {Array<Record<string, unknown>>} rows
 * @returns {KosisMeta}
 */
export function parseKosisMeta(rows) {
  const first = rows[0] || {};
  const text = (value) => String(value ?? "").trim();
  return {
    tableName: text(first.TBL_NM),
    itemName: text(first.ITM_NM),
    unit: text(first.UNIT_NM),
    category: text(first.C1_NM),
    orgId: text(first.ORG_ID),
    tblId: text(first.TBL_ID),
    lastChanged: text(first.LST_CHN_DE),
  };
}

/**
 * 최근 시점과 직전 시점을 비교해 업종 성장세를 요약한다.
 * @param {KosisPoint[]} points
 */
export function summarizeGrowth(points) {
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!latest) return undefined;
  const growthRate = previous && previous.value !== 0
    ? Math.round(((latest.value - previous.value) / Math.abs(previous.value)) * 1000) / 10
    : undefined;
  return {
    latestPeriod: latest.period,
    latestValue: latest.value,
    previousPeriod: previous ? previous.period : "",
    previousValue: previous ? previous.value : undefined,
    growthRate,
  };
}

// 업종별 계열 선택은 앱에서만 필요하므로 src/industrySeries.ts에 있다.
