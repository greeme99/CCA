import { mkdir, writeFile } from "node:fs/promises";
import { parseCorpCodeXml, readSingleEntryZip, selectCacheCompanies } from "./dartCorpCode.mjs";

const apiKey = process.env.VITE_OPENDART_API_KEY || process.env.OPENDART_API_KEY || "";
const outputPath = new URL("../public/data/opendart-companies.json", import.meta.url);

// 프로파일에 등장하는 비상장 벤치마크. 상장사는 corpCode.xml에서 전부 가져오므로 여기 적지 않는다.
const unlistedBenchmarkNames = [
  "원진",
  "미성포리테크",
  "디지텍시스템즈",
  "이엘케이",
  "OCI파워",
  "다쓰테크",
  "카코뉴에너지",
  "헥스파워시스템",
  "넥스콘테크놀러지",
  "기린전자",
];

async function main() {
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });

  if (!apiKey) {
    await writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), companies: [] }, null, 2));
    console.log("OpenDART key missing; wrote empty company cache.");
    return;
  }

  const url = new URL("https://opendart.fss.or.kr/api/corpCode.xml");
  url.searchParams.set("crtfc_key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenDART corpCode request failed: ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  // 키가 잘못되면 ZIP 대신 status/message가 담긴 XML이 온다.
  if (body.subarray(0, 2).toString("latin1") !== "PK") {
    const text = body.toString("utf8").slice(0, 300);
    throw new Error(`OpenDART returned a non-ZIP response: ${text}`);
  }

  const companies = parseCorpCodeXml(readSingleEntryZip(body));
  if (!companies.length) {
    throw new Error("OpenDART corpCode.xml parsed to zero companies.");
  }

  const selected = selectCacheCompanies(companies, unlistedBenchmarkNames);
  const listedCount = selected.filter((company) => company.stockCode).length;

  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "OpenDART corpCode.xml (listed companies and unlisted benchmark companies)",
    totalRegistered: companies.length,
    companies: selected,
  }, null, 2));

  console.log(`Wrote ${selected.length} companies (listed ${listedCount}, unlisted benchmarks ${selected.length - listedCount}) out of ${companies.length} registered.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
