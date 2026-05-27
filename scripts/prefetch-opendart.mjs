import { mkdir, writeFile } from "node:fs/promises";

const apiKey = process.env.VITE_OPENDART_API_KEY || process.env.OPENDART_API_KEY || "";
const outputPath = new URL("../public/data/opendart-companies.json", import.meta.url);
const seedCompanies = [
  { corpName: "드림텍", stockCode: "192650", industryCode: "전자부품·PBA 모듈" },
  { corpName: "파트론", stockCode: "091700", industryCode: "카메라모듈·전자부품" },
  { corpName: "비에이치", stockCode: "090460", industryCode: "FPCB·전자부품" },
  { corpName: "인터플렉스", stockCode: "051370", industryCode: "연성인쇄회로기판" },
  { corpName: "대덕전자", stockCode: "353200", industryCode: "PCB·반도체 패키지기판" },
  { corpName: "다쓰테크", stockCode: "", industryCode: "태양광 인버터 전문" },
  { corpName: "윌링스", stockCode: "313760", industryCode: "태양광 인버터·ESS PCS" },
  { corpName: "카코뉴에너지", stockCode: "", industryCode: "태양광 인버터 제조" },
  { corpName: "헥스파워시스템", stockCode: "", industryCode: "계통연계 PV 인버터" },
  { corpName: "LS ELECTRIC", stockCode: "010120", industryCode: "전력기기·태양광/ESS PCS" },
];

function formatDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function mergeSeedCompanies(companies) {
  const existingNames = new Set(Array.from(companies.values()).map((company) => company.corpName));
  for (const company of seedCompanies) {
    if (existingNames.has(company.corpName)) continue;
    const seedCode = `seed-${company.stockCode || company.corpName}`;
    companies.set(seedCode, {
      corpCode: seedCode,
      corpName: company.corpName,
      stockCode: company.stockCode,
      modifyDate: "seed",
      industryCode: company.industryCode,
    });
  }
}

async function main() {
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });

  if (!apiKey) {
    await writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), companies: [] }, null, 2));
    console.log("OpenDART key missing; wrote empty company cache.");
    return;
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(endDate.getMonth() - 3);
  const companies = new Map();

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://opendart.fss.or.kr/api/list.json");
    url.searchParams.set("crtfc_key", apiKey);
    url.searchParams.set("bgn_de", formatDate(startDate));
    url.searchParams.set("end_de", formatDate(endDate));
    url.searchParams.set("corp_cls", "Y");
    url.searchParams.set("page_no", String(page));
    url.searchParams.set("page_count", "100");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OpenDART request failed: ${response.status}`);
    }
    const data = await response.json();
    if (data.status && data.status !== "000" && data.status !== "013") {
      throw new Error(data.message || "OpenDART API error");
    }

    for (const item of data.list || []) {
      if (!companies.has(item.corp_code)) {
        companies.set(item.corp_code, {
          corpCode: item.corp_code || "",
          corpName: item.corp_name || "",
          stockCode: item.stock_code || "",
          modifyDate: item.rcept_dt || "",
        });
      }
    }
  }

  mergeSeedCompanies(companies);

  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "OpenDART disclosure list with benchmark company seeds",
    companies: Array.from(companies.values()),
  }, null, 2));
  console.log(`Wrote ${companies.size} OpenDART companies.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
