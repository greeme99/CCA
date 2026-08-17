import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildRequestUrl, parseKosisMeta, parseKosisPoints, readKosisError, summarizeGrowth } from "./kosisSeries.mjs";

const apiKey = process.env.VITE_KOSIS_API_KEY || process.env.KOSIS_API_KEY || "";
const configPath = new URL("./kosis-series.json", import.meta.url);
const outputPath = new URL("../public/data/kosis-industry.json", import.meta.url);

async function writeCache(series, note) {
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), note, series }, null, 2));
}

async function fetchSeries(entry) {
  const response = await fetch(buildRequestUrl(entry.url, apiKey));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const error = readKosisError(payload);
  if (error) {
    throw new Error(error);
  }

  const rows = payload;
  const points = parseKosisPoints(rows);
  const growth = summarizeGrowth(points);
  if (!growth) {
    throw new Error("수치가 있는 시점이 없습니다.");
  }

  const meta = parseKosisMeta(rows);
  return {
    id: entry.id,
    label: entry.label,
    keywords: entry.keywords || [],
    default: Boolean(entry.default),
    ...meta,
    ...growth,
    // 화면에서 추세를 보여줄 만큼만 남긴다.
    points: points.slice(-6),
    sourceUrl: meta.orgId && meta.tblId ? `https://kosis.kr/statHtml/statHtml.do?orgId=${meta.orgId}&tblId=${meta.tblId}` : "https://kosis.kr/",
  };
}

async function main() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const configured = (config.series || []).filter((entry) => entry.url && entry.url.trim());

  if (!apiKey) {
    await writeCache([], "KOSIS 인증키가 없어 캐시를 생성하지 않았습니다.");
    console.log("KOSIS key missing; wrote empty industry cache.");
    return;
  }

  if (!configured.length) {
    await writeCache([], "scripts/kosis-series.json에 통계표 URL이 없어 캐시를 생성하지 않았습니다.");
    console.log("No KOSIS series configured; wrote empty industry cache.");
    return;
  }

  const series = [];
  const failures = [];

  for (const entry of configured) {
    try {
      series.push(await fetchSeries(entry));
      console.log(`KOSIS ${entry.id}: ok`);
    } catch (error) {
      // 계열 하나가 실패해도 나머지는 살린다. 원인은 로그로 남겨 사용자가 URL을 고칠 수 있게 한다.
      failures.push(`${entry.id}: ${error instanceof Error ? error.message : error}`);
      console.error(`KOSIS ${entry.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  await writeCache(series, failures.length ? `실패한 계열: ${failures.join(" / ")}` : "");
  console.log(`Wrote ${series.length} KOSIS series (${failures.length} failed).`);

  if (!series.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
