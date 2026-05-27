import { mkdir, writeFile } from "node:fs/promises";

const apiKey = process.env.VITE_OPENDART_API_KEY || process.env.OPENDART_API_KEY || "";
const outputPath = new URL("../public/data/opendart-companies.json", import.meta.url);

function formatDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
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

  await writeFile(outputPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "OpenDART disclosure list",
    companies: Array.from(companies.values()),
  }, null, 2));
  console.log(`Wrote ${companies.size} OpenDART companies.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
