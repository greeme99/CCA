// 배포 캐시(public/data/kosis-industry.json)에 담긴 KOSIS 업종 통계 계열에서
// 분석 대상 업종에 맞는 계열을 고른다. 캐시가 없으면 아무것도 고르지 않고, 화면은 내부 규칙만 쓴다.

export type IndustrySeries = {
  id: string;
  label: string;
  keywords: string[];
  default?: boolean;
  tableName: string;
  itemName: string;
  unit: string;
  category: string;
  orgId: string;
  tblId: string;
  lastChanged: string;
  latestPeriod: string;
  latestValue: number;
  previousPeriod: string;
  previousValue?: number;
  growthRate?: number;
  points: Array<{ period: string; value: number }>;
  sourceUrl: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[()\[\]{}.,/\-·_\s㈜]/g, "");

export function selectSeriesForIndustry<T extends { keywords?: string[]; default?: boolean }>(series: T[], industryText: string): T | undefined {
  const text = normalize(industryText);
  if (text) {
    const matched = series
      .map((item) => {
        const hits = (item.keywords || []).map(normalize).filter((keyword) => keyword && text.includes(keyword));
        return { item, hits: hits.length, longest: hits.reduce((max, keyword) => Math.max(max, keyword.length), 0) };
      })
      .filter((entry) => entry.hits > 0)
      .sort((a, b) => (b.longest - a.longest) || (b.hits - a.hits));
    if (matched.length) return matched[0].item;
  }
  return series.find((item) => item.default);
}

/** 업종 성장세를 한 줄 근거로 표현한다. 수치와 출처 시점을 함께 남겨 검증 가능하게 한다. */
export function describeIndustryGrowth(series: IndustrySeries) {
  const value = `${series.latestPeriod} ${series.latestValue}${series.unit ? ` ${series.unit}` : ""}`;
  const growth = typeof series.growthRate === "number"
    ? `${series.previousPeriod} 대비 ${series.growthRate > 0 ? "+" : ""}${series.growthRate}%`
    : "직전 시점 없음";
  return `KOSIS ${series.tableName || series.label} ${series.itemName ? `${series.itemName} ` : ""}${value} (${growth})`;
}

/** 업종 성장세를 시장·채널 축 보정에 반영한다. 규칙을 하나로 두어 화면에서 근거를 그대로 설명할 수 있게 한다. */
export function getGrowthMarketAdjustment(series: IndustrySeries | undefined) {
  if (!series || typeof series.growthRate !== "number") return 0;
  if (series.growthRate >= 3) return 1;
  if (series.growthRate <= -3) return -1;
  return 0;
}
