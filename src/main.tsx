import { StrictMode, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Building2, ClipboardList, Download, ExternalLink, Factory, FileText, Network, Plus, Printer, RefreshCw, Search, ShieldCheck, Target, Trash2, TrendingUp, Users, Wand2 } from "lucide-react";
import "./styles.css";

type AxisKey = "strategy" | "profit" | "scm" | "market" | "operation" | "finance";
type Risk = "낮음" | "보통" | "높음";
type Score = { own: number; peer: number; note: string };
type Competitor = { name: string; position: string; note: string };
type Supplier = { name: string; dependence: number; leadTime: number; risk: Risk };
type Action = { task: string; owner: string; kpi: string; due: string };
type LiveCompany = { corpCode: string; corpName: string; stockCode: string; modifyDate: string; ceo?: string; address?: string; industryCode?: string };
type CompetitorCandidate = { name: string; industryField: string; reason: string; source: "DART/KOSIS" | "업종 키워드"; industryMatch?: boolean };
type ResearchProfile = {
  label: string;
  keywords: string[];
  competitors: Competitor[];
  peerScores: Record<AxisKey, number>;
};
type AppState = {
  companyName: string;
  industry: string;
  purpose: string;
  period: string;
  competitors: Competitor[];
  scores: Record<AxisKey, Score>;
  swot: { strengths: string; weaknesses: string; opportunities: string; threats: string };
  suppliers: Supplier[];
  actions: Action[];
  liveCompetitors: LiveCompany[];
  competitorCandidates: CompetitorCandidate[];
  researchStatus: string;
};

const appName = "CCA(기업경쟁력분석)";
const envOpenDartKey = import.meta.env.VITE_OPENDART_API_KEY || "";
const envKosisKey = import.meta.env.VITE_KOSIS_API_KEY || "";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const dartCacheUrl = `${import.meta.env.BASE_URL}data/opendart-companies.json`;

const axes = [
  { key: "strategy", label: "전략", hint: "성장 방향, 포지셔닝, 의사결정 속도", icon: Target },
  { key: "profit", label: "수익구조", hint: "마진, 반복매출, 가격 방어력", icon: TrendingUp },
  { key: "scm", label: "SCM", hint: "공급처 다변화, 리드타임, 재고회전", icon: Network },
  { key: "market", label: "시장·채널", hint: "고객 기반, 채널 접근성, 브랜드 신뢰", icon: Users },
  { key: "operation", label: "조직·운영", hint: "인재, 프로세스, 디지털 활용", icon: Factory },
  { key: "finance", label: "재무건전성", hint: "현금흐름, 부채, 투자 여력", icon: ShieldCheck },
] as const;

const defaultState: AppState = {
  companyName: "",
  industry: "",
  purpose: "시장점유 방어",
  period: "최근 3년",
  competitors: [{ name: "", position: "", note: "" }],
  scores: {
    strategy: { own: 5, peer: 6, note: "" },
    profit: { own: 5, peer: 6, note: "" },
    scm: { own: 5, peer: 6, note: "" },
    market: { own: 5, peer: 6, note: "" },
    operation: { own: 5, peer: 6, note: "" },
    finance: { own: 5, peer: 6, note: "" },
  },
  swot: { strengths: "", weaknesses: "", opportunities: "", threats: "" },
  suppliers: [{ name: "", dependence: 30, leadTime: 14, risk: "보통" }],
  actions: [{ task: "", owner: "", kpi: "", due: "" }],
  liveCompetitors: [],
  competitorCandidates: [],
  researchStatus: "",
};

const sampleState: AppState = {
  companyName: "한빛정밀",
  industry: "자동차 부품 제조",
  purpose: "SCM 안정화",
  period: "최근 3년",
  competitors: [
    { name: "대성모빌리티", position: "저가 대량 생산", note: "중국 협력사 활용" },
    { name: "세진테크", position: "품질 프리미엄", note: "전장 부품 인증 우위" },
    { name: "우진파트너스", position: "빠른 납기", note: "수도권 물류 거점" },
  ],
  scores: {
    strategy: { own: 7, peer: 8, note: "고객 다변화 전략은 있으나 실행 속도 보완 필요" },
    profit: { own: 6, peer: 7, note: "원자재 가격 전가율이 낮음" },
    scm: { own: 5, peer: 8, note: "핵심 소재 1개사 의존도 68%" },
    market: { own: 7, peer: 6, note: "장기 거래처 관계는 강점" },
    operation: { own: 6, peer: 7, note: "생산 계획 자동화 미흡" },
    finance: { own: 8, peer: 6, note: "차입 부담 낮고 설비 투자 여력 있음" },
  },
  swot: {
    strengths: "장기 고객사와 품질 신뢰\n낮은 부채비율\n핵심 가공 기술 내재화",
    weaknesses: "핵심 소재 공급처 의존도 높음\n생산계획 수작업 비중 높음\n후계자 중심 의사결정 체계 미완성",
    opportunities: "전장 부품 수요 확대\n정부 스마트공장 지원\n경쟁사 납기 지연 이슈",
    threats: "완성차 단가 인하 압박\n원자재 가격 변동\n해외 저가 업체 진입",
  },
  suppliers: [
    { name: "동원소재", dependence: 68, leadTime: 21, risk: "높음" },
    { name: "한서정공", dependence: 22, leadTime: 12, risk: "보통" },
  ],
  actions: [
    { task: "핵심 소재 대체 공급처 2곳 인증", owner: "구매팀장", kpi: "의존도 45% 이하", due: "2026-09" },
    { task: "주간 생산계획 자동화 대시보드 구축", owner: "후계자", kpi: "계획 소요시간 50% 절감", due: "2026-08" },
  ],
  liveCompetitors: [],
  competitorCandidates: [],
  researchStatus: "",
};

const researchProfiles: ResearchProfile[] = [
  {
    label: "배터리팩·BMS",
    keywords: ["이랜텍", "배터리팩", "배터리 팩", "bms", "ess", "전동공구", "로봇배터리", "모빌리티 배터리"],
    competitors: [
      { name: "파워로직스", position: "배터리팩·BMS", note: "하이브리드차, 전기이륜차, ESS 등 배터리팩/BMS 사업을 전개해 이랜텍의 중대형 배터리팩 확장과 직접 비교 가능" },
      { name: "아모그린텍", position: "ESS·BMS 토털솔루션", note: "LFP 기반 ESS, BMS, 냉각시스템 등 토털솔루션 사업으로 ESS/BMS 역량 비교 가능" },
      { name: "신흥에스이씨", position: "2차전지 부품·팩모듈", note: "전기차 배터리 안전부품과 팩모듈 영역을 보유해 배터리 모듈/팩 가치사슬 관점의 비교 대상" },
      { name: "블루시그마", position: "EV·ESS 배터리팩·BMS", note: "EV/ESS용 배터리팩과 BMS 개발·운영 경험이 있어 응용시장별 기술 경쟁력 비교 가능" },
      { name: "배터리파워솔루션", position: "산업용 리튬 배터리팩", note: "ESS, UPS, AGV, 물류로봇 등 산업용 배터리팩과 자체 BMS를 보유해 로봇·산업용 팩 시장 비교 가능" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 7, market: 7, operation: 8, finance: 7 },
  },
  {
    label: "자동차 부품 제조",
    keywords: ["자동차", "모빌리티", "부품", "전장", "정밀"],
    competitors: [
      { name: "현대모비스", position: "모듈·전장 대형사", note: "DART 사업보고서, IR, 고객 포트폴리오 확인 권장" },
      { name: "HL만도", position: "제동·조향 기술", note: "기술 투자, 수주잔고, 해외 매출 비중 확인 권장" },
      { name: "현대위아", position: "부품·공작기계", note: "생산거점, 설비투자, 원가구조 확인 권장" },
      { name: "한온시스템", position: "열관리 시스템", note: "전기차 열관리 제품군과 글로벌 고객사 확인 권장" },
      { name: "서연이화", position: "내장 부품", note: "완성차 고객 의존도와 해외 법인 매출 확인 권장" },
    ],
    peerScores: { strategy: 8, profit: 7, scm: 8, market: 7, operation: 8, finance: 7 },
  },
  {
    label: "반도체·전자부품",
    keywords: ["반도체", "전자", "pcb", "디스플레이", "장비"],
    competitors: [
      { name: "삼성전자", position: "종합 반도체", note: "DART, IR, 사업부문별 매출 추이 확인 권장" },
      { name: "SK하이닉스", position: "메모리 반도체", note: "CAPEX, 재고, 가격 사이클 확인 권장" },
      { name: "DB하이텍", position: "파운드리", note: "가동률, 고객 다변화, 공정 포트폴리오 확인 권장" },
      { name: "리노공업", position: "테스트 부품", note: "수익성, 제품 믹스, 글로벌 고객 기반 확인 권장" },
      { name: "원익IPS", position: "반도체 장비", note: "수주잔고, 장비 라인업, 고객 집중도 확인 권장" },
    ],
    peerScores: { strategy: 8, profit: 8, scm: 7, market: 8, operation: 8, finance: 8 },
  },
  {
    label: "태양광 인버터·전력변환",
    keywords: ["동양이엔피", "태양광", "태양광 인버터", "pv inverter", "solar inverter", "인버터", "pcs", "ess용 pcs", "전력변환", "신재생", "스마트그리드"],
    competitors: [
      { name: "다쓰테크", position: "태양광 인버터 전문", note: "태양광 인버터 전문기업으로 스트링·센트럴 인버터와 대용량 발전소 시장 대응 역량을 보유해 동양이엔피의 태양광 인버터 사업과 직접 비교 가능" },
      { name: "윌링스", position: "태양광 인버터·ESS PCS", note: "태양광 발전용 인버터와 ESS용 PCS 공급 실적이 있어 전력변환 기술, 프로젝트 수주, 발전소 고객 대응력 비교 가능" },
      { name: "카코뉴에너지", position: "태양광 인버터 제조", note: "태양광 발전용 인버터 개발·제조·판매를 주력으로 해 국내 발전소·상업용 인버터 시장의 직접 비교 대상" },
      { name: "헥스파워시스템", position: "계통연계 PV 인버터", note: "단상 소용량부터 삼상 대용량 인버터까지 생산하는 태양광 인버터 전문 제조사로 제품 라인업과 A/S 역량 비교 가능" },
      { name: "LS ELECTRIC", position: "전력기기·태양광/ESS PCS", note: "전력기기, 스마트그리드, 태양광·ESS 전력변환 솔루션을 보유해 대형 프로젝트와 계통 연계 관점의 벤치마크 가능" },
    ],
    peerScores: { strategy: 8, profit: 7, scm: 7, market: 8, operation: 8, finance: 7 },
  },
  {
    label: "PBA·PCB 어셈블리",
    keywords: ["에스제이아이", "pba", "pcb", "pcb assembly", "인쇄회로기판", "어셈블리", "전자부품 조립", "ems"],
    competitors: [
      { name: "드림텍", position: "전자부품·PBA 모듈", note: "스마트폰·의료기기·자동차 전장용 모듈 제조 역량을 보유해 PBA/EMS 제조 경쟁력 비교 가능" },
      { name: "파트론", position: "카메라모듈·전자부품", note: "전자부품 모듈 양산, 고객사 대응, 생산 효율 관점에서 벤치마크 가능" },
      { name: "비에이치", position: "FPCB·전자부품", note: "모바일·전장용 인쇄회로기판 제품군과 글로벌 고객 기반을 보유해 PCB 가치사슬 비교 가능" },
      { name: "인터플렉스", position: "연성인쇄회로기판", note: "FPCB 제조와 고객사 납품 경험이 있어 품질·납기·수율 관리 비교 대상" },
      { name: "대덕전자", position: "PCB·반도체 패키지기판", note: "PCB와 패키지기판 양산 역량, 설비투자, 고객 포트폴리오 측면에서 비교 가능" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 8, market: 7, operation: 8, finance: 7 },
  },
  {
    label: "바이오·제약",
    keywords: ["바이오", "제약", "의약", "헬스케어", "의료"],
    competitors: [
      { name: "삼성바이오로직스", position: "CDMO", note: "수주잔고, 생산능력, 글로벌 고객사 확인 권장" },
      { name: "셀트리온", position: "바이오시밀러", note: "제품 파이프라인, 해외 허가, 직접판매망 확인 권장" },
      { name: "유한양행", position: "전통 제약·R&D", note: "기술수출, 전문의약품 매출, 연구개발비 확인 권장" },
      { name: "한미약품", position: "신약 개발", note: "파이프라인, 기술이전, 임상 진행 상황 확인 권장" },
      { name: "종근당", position: "전문의약품", note: "주요 품목 성장률, 영업망, 연구개발비 확인 권장" },
    ],
    peerScores: { strategy: 8, profit: 7, scm: 6, market: 8, operation: 7, finance: 7 },
  },
  {
    label: "화장품·소비재",
    keywords: ["화장품", "뷰티", "소비재", "생활용품", "브랜드"],
    competitors: [
      { name: "아모레퍼시픽", position: "브랜드 포트폴리오", note: "브랜드별 매출, 해외 채널, 온라인 전환 확인 권장" },
      { name: "LG생활건강", position: "생활용품·뷰티", note: "제품 믹스, 채널 경쟁력, 마진 추이 확인 권장" },
      { name: "코스맥스", position: "ODM", note: "고객 다변화, 해외 법인, 생산능력 확인 권장" },
      { name: "한국콜마", position: "ODM·제약", note: "ODM 수주, 원가율, 사업 포트폴리오 확인 권장" },
      { name: "클리오", position: "색조 브랜드", note: "온라인 채널, 해외 매출, 히트 제품 지속성 확인 권장" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 7, market: 8, operation: 7, finance: 7 },
  },
  {
    label: "식품 제조",
    keywords: ["식품", "음료", "가공식품", "외식", "푸드"],
    competitors: [
      { name: "CJ제일제당", position: "식품·바이오 대형사", note: "제품군별 매출, 원재료 민감도, 해외 성장 확인 권장" },
      { name: "오뚜기", position: "가공식품", note: "브랜드 충성도, 가격 전가력, 유통 채널 확인 권장" },
      { name: "대상", position: "소재·식품", note: "소재 사업 비중, B2B 고객, 원가구조 확인 권장" },
      { name: "농심", position: "라면·스낵", note: "해외 매출, 브랜드 파워, 생산거점 확인 권장" },
      { name: "풀무원", position: "신선·건강식", note: "채널 믹스, 물류 경쟁력, 수익성 개선 확인 권장" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 8, market: 8, operation: 7, finance: 7 },
  },
  {
    label: "음향부품·스피커",
    keywords: ["이엠텍", "emtech", "em-tech", "스피커", "마이크로스피커", "음향부품", "음향", "이어폰", "헤드폰", "리시버", "마이크로폰", "mems마이크", "사운드 솔루션"],
    competitors: [
      { name: "비에스이", position: "마이크로스피커·MEMS 마이크로폰", note: "마이크로 스피커, MEMS 마이크로폰, 이어폰용 드라이버 등 음향부품 기반의 직접 경쟁사로 제품군·고객사 비교에 적합합니다" },
      { name: "에스텍", position: "스피커·이어폰 부품 제조", note: "스피커·이어폰·헤드폰 관련 부품을 자동차·TV·가전·휴대폰 시장에 공급하는 직접·인접 경쟁사로 응용처 다변화 비교에 적합합니다" },
      { name: "와이솔", position: "피에조 음향모듈·화면진동 스피커", note: "피에조 기반 음향 모듈과 화면 진동형 스피커/리시버 기술을 보유한 기술 대체 경쟁사로 차세대 음향 기술 경쟁력 비교에 적합합니다" },
      { name: "크레신", position: "이어폰·헤드폰·음향기기 제조", note: "이어폰·헤드폰·음향기기를 제조하는 중견 음향기업으로 채널·브랜드 경쟁력 비교에 적합한 인접 경쟁사입니다" },
      { name: "기린전자", position: "마이크로스피커·다이내믹 리시버 (현재 폐업 확인)", note: "마이크로 스피커·다이내믹 리시버 전문 이력이 있으나 현재 폐업 상태로 확인되어, 직접 비교보다는 시장 재편·구조조정 리스크를 점검하는 참고 사례로 활용을 권장합니다" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 7, market: 7, operation: 8, finance: 6 },
  },
  {
    label: "전자담배·베이퍼라이저 부품",
    keywords: ["전자담배", "베이프", "베이핑", "vape", "vaping", "무화기", "카트리지", "액상형", "히팅", "궐련형", "atomizer", "e-cigarette", "이엠텍"],
    competitors: [
      { name: "이엠텍", position: "전자담배 ODM·기기 개발", note: "KT&G 릴 기기 개발·생산 경험과 전자담배 ODM 기술/IP 이력을 보유한 가장 강한 직접 비교 대상입니다" },
      { name: "아이티엠반도체", position: "전자담배 기기·카트리지 부품", note: "KT&G向 전자담배 기기·카트리지 생산 비중이 커지고 있는 핵심 직접 경쟁사입니다" },
      { name: "파트론", position: "전자담배 OEM·전자부품", note: "전자담배 OEM 매출 확대가 확인되는 코스닥 전자부품사로 생산 효율·고객 다변화 비교에 적합합니다" },
      { name: "KH바텍", position: "메탈·기구부품(전자담배 인접)", note: "전자담배 관련 특허·신제품 개발 이력과 금속/기구물 제조역량을 보유한 인접 경쟁사입니다" },
      { name: "SMOORE International", position: "글로벌 전자담배·무화 기술", note: "세계적인 전자담배·무화 기술 제조사로 글로벌 제조역량과 기술 격차를 점검하는 벤치마크 대상입니다" },
    ],
    peerScores: { strategy: 8, profit: 7, scm: 8, market: 7, operation: 8, finance: 7 },
  },
];

const defaultResearchProfile: ResearchProfile = {
  label: "일반 제조·서비스",
  keywords: [],
  competitors: [
    { name: "삼성전자", position: "국내 대표 제조·전자", note: "상장 대형사의 매출 규모, 글로벌 공급망, 제품 포트폴리오를 비교 기준으로 삼을 수 있습니다." },
    { name: "LG전자", position: "전자·가전·B2B 솔루션", note: "B2C/B2B 채널 운영, 브랜드 경쟁력, 제조 운영 효율을 벤치마크할 수 있습니다." },
    { name: "현대모비스", position: "자동차 부품·모듈", note: "부품 제조, 고객사 대응, 품질·납기·SCM 관리 역량을 비교하기 좋습니다." },
    { name: "두산에너빌리티", position: "산업재·플랜트", note: "중후장대 제조업의 수주, 생산, 프로젝트 리스크 관리 관점에서 참고할 수 있습니다." },
    { name: "한화솔루션", position: "소재·에너지", note: "소재·에너지 사업 포트폴리오, 투자 여력, 시장 전환 대응을 비교할 수 있습니다." },
  ],
  peerScores: { strategy: 7, profit: 7, scm: 7, market: 7, operation: 7, finance: 7 },
};
const legacyGenericCompetitorNames = new Set(["상장 동종업계 1위", "고성장 비상장사", "원가 경쟁사", "기술 차별화 기업", "대체재 기업"]);
const defaultGenericCompetitorNames = new Set(defaultResearchProfile.competitors.map((competitor) => competitor.name));

const researchSites = [
  { name: "DART", description: "공시·사업보고서", url: "https://dart.fss.or.kr/" },
  { name: "KIND", description: "상장사 공시·시장정보", url: "https://kind.krx.co.kr/" },
  { name: "SMINFO", description: "중소기업 현황", url: "https://sminfo.mss.go.kr/cm/sv/CSV001R0.do" },
  { name: "KOSIS", description: "산업 통계", url: "https://kosis.kr/" },
  { name: "NICE BizLINE", description: "기업 신용·거래 정보", url: "https://www.nicebizline.com/" },
];

const storageKey = "succession-competitiveness-workbench";
const clone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const firstLine = (value: string, fallback: string) => value.split("\n").map((line) => line.trim()).filter(Boolean)[0] || fallback;
const splitLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const fallback = (value: string, label: string) => value.trim() || label;
const normalizeCompanyName = (value: string) =>
  value
    .toLowerCase()
    .replace(/주식회사|유한회사|합자회사|합명회사|재단법인|사단법인/g, "")
    .replace(/[()\[\]\s㈜.]/g, "");

function matchProfileByText(text: string) {
  if (!text) return undefined;

  // 키워드가 서로의 부분 문자열인 경우(예: "전자" vs "전자담배")
  // 배열 내 등장 순서가 아니라 "가장 길게 일치하는 키워드"를 가진 프로파일을 우선한다.
  // 이렇게 하면 더 구체적인(긴) 키워드를 가진 프로파일이 일반적인(짧은) 키워드를 가진
  // 프로파일보다 항상 우선 매칭되어, "전자담배"가 "반도체·전자부품"으로 오매칭되는 문제를 방지한다.
  let bestProfile: ResearchProfile | undefined;
  let bestMatchLength = 0;

  for (const profile of researchProfiles) {
    const competitorNames = profile.competitors.map((competitor) => competitor.name.toLowerCase());
    const candidates = [...profile.keywords.map((keyword) => keyword.toLowerCase()), ...competitorNames];
    for (const candidate of candidates) {
      if (candidate && text.includes(candidate) && candidate.length > bestMatchLength) {
        bestMatchLength = candidate.length;
        bestProfile = profile;
      }
    }
  }

  return bestProfile;
}

function getResearchProfile(companyName: string, industry: string) {
  // 사업 다각화 기업(예: 배터리 제조사가 전자담배 사업도 영위)에서는 회사명 키워드보다
  // 사용자가 입력한 "산업/사업 분야" 텍스트가 더 구체적인 신호이므로 먼저 우선 매칭한다.
  // 산업 입력으로 매칭되는 프로파일이 없을 때만 회사명+산업 통합 텍스트로 보조 매칭한다.
  const industryOnlyMatch = matchProfileByText(industry.trim().toLowerCase());
  if (industryOnlyMatch) return industryOnlyMatch;

  return matchProfileByText(`${companyName} ${industry}`.toLowerCase()) || defaultResearchProfile;
}

function getResearchQuery(companyName: string, industry: string) {
  return encodeURIComponent(`${companyName || industry || "기업"} ${industry || "동종업계"} 경쟁사 매출 시장점유율`);
}

function getResearchUrl(siteUrl: string, companyName: string, industry: string) {
  return `${siteUrl}?q=${getResearchQuery(companyName, industry)}`;
}

function getCompetitorReason(competitor: Competitor, index: number, companyName: string, industry: string) {
  const basis = [
    "DART 공시에서 사업영역과 상장사 비교 가능성이 확인되는 후보입니다.",
    "KOSIS 산업분류와 시장 통계로 업종 규모 비교가 가능한 후보입니다.",
    "매출 규모, 고객군, 제품 포지션이 자사와 비교 가능한 후보입니다.",
    "SCM·생산거점·채널 경쟁력을 벤치마크하기 좋은 후보입니다.",
    "대체재 또는 인접시장 관점에서 전략 리스크를 확인할 후보입니다.",
  ];
  return `${index + 1}. ${competitor.name}: ${competitor.position || "경쟁사"}로 분류했습니다. ${basis[index % basis.length]} ${companyName ? `${companyName}과 비교해` : "우리회사와 비교해"} ${industry ? `${industry} 업종 내 경쟁구도` : "동종·인접 시장 경쟁구도"}를 확인하는 데 활용합니다.`;
}

function buildCandidate(
  competitor: Competitor,
  index: number,
  companyName: string,
  industry: string,
  source: CompetitorCandidate["source"] = "DART/KOSIS",
  liveCompany?: LiveCompany,
  ownCompany?: LiveCompany,
): CompetitorCandidate {
  const reasonTemplates = [
    "DART 공시 기준 사업영역이 유사하고, KOSIS 산업분류상 동일·인접 업종 비교가 가능합니다.",
    "주요 제품/서비스 포지션이 기준 회사와 겹쳐 매출·수익성·채널 경쟁력 비교에 적합합니다.",
    "시장 내 규모와 고객군이 비교 가능해 전략·재무·운영 벤치마크 기준점으로 사용할 수 있습니다.",
    "공급망, 생산거점, 납기 역량 등 SCM 경쟁력 차이를 확인하기 좋은 경쟁사입니다.",
    "대체재 또는 인접시장 관점에서 가격·채널·고객 이탈 리스크를 점검할 수 있습니다.",
  ];
  const baseCompany = companyName.trim() || "우리회사";
  const industryMatch = Boolean(liveCompany?.industryCode && ownCompany?.industryCode && liveCompany.industryCode === ownCompany.industryCode);
  const evidence = industryMatch
    ? `DART 등록 기준 업종코드 ${liveCompany?.industryCode}가 ${baseCompany}와 일치해 동일 업종 등록 데이터로 직접 비교가 가능한 후보입니다.`
    : reasonTemplates[index % reasonTemplates.length];
  const liveTag = liveCompany
    ? [liveCompany.stockCode ? `종목코드 ${liveCompany.stockCode}` : "비상장", liveCompany.industryCode ? `업종코드 ${liveCompany.industryCode}` : ""].filter(Boolean).join(" · ")
    : "";

  return {
    name: competitor.name,
    industryField: competitor.position || industry || "동종·인접 산업",
    reason: `${baseCompany}의 경쟁력 기준점으로 선정했습니다. ${evidence}${liveTag ? ` (DART 확인: ${liveTag})` : ""} ${competitor.note ? `추가 근거: ${competitor.note}` : ""}`.trim(),
    source,
    industryMatch,
  };
}

function buildCandidates(
  competitors: Competitor[],
  companyName: string,
  industry: string,
  source: CompetitorCandidate["source"] = "DART/KOSIS",
  liveCompanies: LiveCompany[] = [],
  ownCompany?: LiveCompany,
) {
  const normalizedCompanyName = normalizeCompanyName(companyName);
  return competitors
    .filter((competitor) => {
      const normalizedCompetitorName = normalizeCompanyName(competitor.name);
      return competitor.name.trim() && normalizedCompetitorName !== normalizedCompanyName;
    })
    .slice(0, 5)
    .map((competitor, index) => {
      const liveCompany = liveCompanies.find((company) => isCompanyNameMatch(competitor.name, company.corpName));
      return buildCandidate(competitor, index, companyName, industry, source, liveCompany, ownCompany);
    })
    .sort((a, b) => Number(b.industryMatch) - Number(a.industryMatch));
}

function hasLegacyGenericNames(rows: Array<{ name: string }>) {
  return rows.some((row) => legacyGenericCompetitorNames.has(row.name.trim()));
}

function shouldRefreshGeneratedCompetitors(rows: Array<{ name: string; position?: string; industryField?: string }>, profile: ResearchProfile) {
  if (!rows.length || profile === defaultResearchProfile) return false;

  const profileNames = new Set(profile.competitors.map((competitor) => normalizeCompanyName(competitor.name)));
  const allNamesAlreadyCurrent = rows.every((row) => profileNames.has(normalizeCompanyName(row.name)));
  if (allNamesAlreadyCurrent) return false;
  if (rows.some((row) => defaultGenericCompetitorNames.has(row.name.trim()))) return true;

  const profilePositions = new Set(profile.competitors.map((competitor) => competitor.position));
  const positionMatches = rows.filter((row) => profilePositions.has(row.position || row.industryField || "")).length;
  return positionMatches >= Math.min(3, rows.length);
}

function isCompanyNameMatch(targetName: string, corpName: string) {
  const target = normalizeCompanyName(targetName);
  const corp = normalizeCompanyName(corpName);
  if (!target || !corp) return false;
  if (target === corp) return true;
  return target.length >= 4 && (corp.startsWith(target) || target.startsWith(corp));
}

async function resolveLiveCompetitors(competitors: Competitor[], apiKey: string) {
  const corpCodes = await fetchOpenDartCompanies(apiKey);
  const liveCompanies = await Promise.all(
    corpCodes
      .filter((company) => competitors.some((competitor) => isCompanyNameMatch(competitor.name, company.corpName)))
      .slice(0, 5)
      .map((company) => fetchOpenDartCompanyOverview(apiKey, company)),
  );

  return competitors.map((competitor) => {
    const liveCompany = liveCompanies.find((company) => isCompanyNameMatch(competitor.name, company.corpName));
    if (!liveCompany) return competitor;
    return {
      ...competitor,
      name: liveCompany.corpName,
      note: [
        competitor.note,
        liveCompany.ceo ? `대표 ${liveCompany.ceo}` : "",
        liveCompany.industryCode ? `DART 업종코드 ${liveCompany.industryCode}` : "",
        liveCompany.stockCode ? `종목코드 ${liveCompany.stockCode}` : "",
      ].filter(Boolean).join(" · "),
    };
  }).map((competitor) => ({ competitor, liveCompany: liveCompanies.find((company) => isCompanyNameMatch(competitor.name, company.corpName)) }));
}

async function resolveLiveCompany(companyName: string, apiKey: string) {
  if (!companyName.trim()) return undefined;
  const corpCodes = await fetchOpenDartCompanies(apiKey);
  const company = corpCodes.find((corpCode) => isCompanyNameMatch(companyName, corpCode.corpName));
  return company ? fetchOpenDartCompanyOverview(apiKey, company) : undefined;
}

function getKosisAxisWeights(industry: string, purpose: string): Record<AxisKey, number> {
  const target = `${industry} ${purpose}`.toLowerCase();
  const weights: Record<AxisKey, number> = { strategy: 0, profit: 0, scm: 0, market: 0, operation: 0, finance: 0 };

  if (target.includes("pba") || target.includes("pcb") || target.includes("전자") || target.includes("부품")) {
    weights.scm += 1;
    weights.operation += 1;
  }
  if (target.includes("자동차") || target.includes("모빌리티")) {
    weights.scm += 1;
    weights.market += 1;
  }
  if (target.includes("반도체") || target.includes("바이오") || target.includes("제약")) {
    weights.strategy += 1;
    weights.profit += 1;
  }
  if (target.includes("시장") || target.includes("점유") || target.includes("브랜드")) {
    weights.market += 1;
    weights.strategy += 1;
  }
  if (target.includes("원가") || target.includes("수익")) {
    weights.profit += 1;
    weights.operation += 1;
  }
  if (target.includes("scm") || target.includes("공급") || target.includes("납기")) {
    weights.scm += 1;
    weights.operation += 1;
  }
  if (target.includes("m&a") || target.includes("재무")) {
    weights.finance += 1;
    weights.strategy += 1;
  }

  return weights;
}

function getOwnCompanyAxisAdjustment(axisKey: AxisKey, industry: string, purpose: string) {
  const target = `${industry} ${purpose}`.toLowerCase();
  const adjustments: Record<AxisKey, number> = {
    strategy: -1,
    profit: -1,
    scm: -1,
    market: -1,
    operation: -1,
    finance: -1,
  };

  if ((target.includes("pba") || target.includes("pcb") || target.includes("전자") || target.includes("부품")) && (axisKey === "scm" || axisKey === "operation")) {
    return 0;
  }
  if (target.includes("시장") && (axisKey === "market" || axisKey === "strategy")) {
    return 0;
  }
  if (target.includes("scm") && (axisKey === "scm" || axisKey === "operation")) {
    return 0;
  }
  if (target.includes("원가") && (axisKey === "profit" || axisKey === "operation")) {
    return 0;
  }
  if (target.includes("m&a") && (axisKey === "finance" || axisKey === "strategy")) {
    return 0;
  }

  return adjustments[axisKey];
}

function buildDartKosisScores(
  currentScores: Record<AxisKey, Score>,
  profile: ResearchProfile,
  competitors: Competitor[],
  liveCompanies: LiveCompany[],
  ownCompany: LiveCompany | undefined,
  companyName: string,
  industry: string,
  purpose: string,
) {
  const competitorNames = competitors.map((competitor) => competitor.name).filter(Boolean).join(", ") || "Top5 경쟁사";
  const liveBoost = Math.min(1, Math.floor(liveCompanies.length / 2));
  const coverageBoost = Math.min(1, Math.floor(Math.max(1, competitors.length) / 4));
  const ownLiveBoost = ownCompany ? 1 : 0;
  const kosisWeights = getKosisAxisWeights(industry, purpose);
  const sourceLabel = liveCompanies.length ? `DART ${isLocalHost ? "공시목록/회사개황" : "배포 캐시"} ${liveCompanies.length}개 매칭` : "DART 직접 매칭 없음";
  const ownSourceLabel = ownCompany ? `DART ${isLocalHost ? "회사개황" : "배포 캐시"} 확인` : "회사명 직접 매칭 없음";

  return Object.fromEntries(
    axes.map((axis) => {
      const kosisBoost = kosisWeights[axis.key];
      const profileScore = profile.peerScores[axis.key];
      const nextPeer = Math.min(10, Math.max(1, profileScore + coverageBoost + liveBoost + kosisBoost));
      const ownAdjustment = getOwnCompanyAxisAdjustment(axis.key, industry, purpose);
      const nextOwn = Math.min(10, Math.max(1, profileScore + ownAdjustment + ownLiveBoost + Math.min(1, kosisBoost)));
      const note = `${companyName || "우리회사"} ${axis.label} 점수는 ${nextOwn}점으로 산정했습니다. 근거: ${ownSourceLabel}, KOSIS ${industry || profile.label} 업종 관점, 분석 목적 ${purpose}. ${competitorNames} 기준 경쟁사 평균은 ${nextPeer}점입니다. 근거: ${sourceLabel}. 내부 실적 지표 입력 후 보정하세요.`;

      return [axis.key, { ...currentScores[axis.key], own: nextOwn, peer: nextPeer, note }];
    }),
  ) as Record<AxisKey, Score>;
}

function sanitizeResearchStatus(status?: string) {
  if (!status) return "";
  if (status.includes("API 키") || status.includes(".env") || status.includes("CORS") || status.includes("Failed to fetch")) {
    return "DART 공시와 KOSIS 산업통계 관점으로 Top5 경쟁사를 재정리했습니다. 회사별 선정 이유는 아래 요약을 확인하세요.";
  }
  return status.replaceAll("OpenDART", "DART");
}

function hydrateState(saved: Partial<AppState>): AppState {
  const profile = getResearchProfile(saved.companyName || "", saved.industry || "");
  const savedCompetitors = saved.competitors?.length ? saved.competitors : clone(defaultState.competitors);
  const competitors = hasLegacyGenericNames(savedCompetitors) || shouldRefreshGeneratedCompetitors(savedCompetitors, profile) ? clone(profile.competitors) : savedCompetitors;
  const savedCandidates = saved.competitorCandidates || [];
  const competitorCandidates = hasLegacyGenericNames(savedCandidates) || shouldRefreshGeneratedCompetitors(savedCandidates, profile)
    ? buildCandidates(profile.competitors, saved.companyName || "", saved.industry || "", "업종 키워드")
    : savedCandidates;

  return {
    ...clone(defaultState),
    ...saved,
    competitors,
    scores: { ...clone(defaultState.scores), ...saved.scores },
    swot: { ...clone(defaultState.swot), ...saved.swot },
    suppliers: saved.suppliers?.length ? saved.suppliers : clone(defaultState.suppliers),
    actions: saved.actions?.length ? saved.actions : clone(defaultState.actions),
    liveCompetitors: saved.liveCompetitors || [],
    competitorCandidates,
    researchStatus: sanitizeResearchStatus(saved.researchStatus),
  };
}

async function fetchOpenDartCompanies(apiKey: string) {
  if (!isLocalHost) {
    const response = await fetch(dartCacheUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`DART 배포 캐시 조회 실패 (${response.status})`);
    }
    const data = await response.json();
    return ((data.companies || []) as LiveCompany[]).filter((company) => company.corpName);
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(endDate.getMonth() - 3);
  const formatDate = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  const companies = new Map<string, LiveCompany>();

  for (let page = 1; page <= 5; page += 1) {
    const url = new URL("/api/opendart/list", window.location.origin);
    url.searchParams.set("bgn_de", formatDate(startDate));
    url.searchParams.set("end_de", formatDate(endDate));
    url.searchParams.set("corp_cls", "Y");
    url.searchParams.set("page_no", String(page));
    url.searchParams.set("page_count", "100");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OpenDART 공시목록 조회 실패 (${response.status})`);
    }
    const data = await response.json();
    if (data.status && data.status !== "000" && data.status !== "013") {
      throw new Error(data.message || "OpenDART API 오류");
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

  return Array.from(companies.values()).filter((company) => company.corpCode && company.corpName);
}

async function fetchOpenDartCompanyOverview(apiKey: string, company: LiveCompany): Promise<LiveCompany> {
  if (!isLocalHost || !apiKey) return company;

  try {
    const url = `/api/opendart/company?corp_code=${encodeURIComponent(company.corpCode)}`;
    const response = await fetch(url);
    if (!response.ok) return company;
    const data = await response.json();
    if (data.status && data.status !== "000") return company;
    return {
      ...company,
      ceo: data.ceo_nm || "",
      address: data.adres || "",
      industryCode: data.induty_code || "",
    };
  } catch {
    return company;
  }
}

function readState() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? hydrateState(JSON.parse(saved) as Partial<AppState>) : clone(defaultState);
  } catch {
    return clone(defaultState);
  }
}

function Radar({ scores }: { scores: Record<AxisKey, Score> }) {
  const points = (kind: "own" | "peer") =>
    axes.map((axis, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length;
      const radius = 38 * (scores[axis.key][kind] / 10);
      return `${50 + Math.cos(angle) * radius},${50 + Math.sin(angle) * radius}`;
    }).join(" ");

  return (
    <svg className="radar" viewBox="0 0 100 100" role="img" aria-label="6축 경쟁력 레이더 차트">
      {[16, 24, 32, 40].map((radius) => <circle key={radius} cx="50" cy="50" r={radius} />)}
      {axes.map((axis, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / axes.length;
        return <line key={axis.key} x1="50" y1="50" x2={50 + Math.cos(angle) * 42} y2={50 + Math.sin(angle) * 42} />;
      })}
      <polygon className="peer" points={points("peer")} />
      <polygon className="own" points={points("own")} />
    </svg>
  );
}

function ScoreRing({ value }: { value: number }) {
  return <div className="score-ring" style={{ "--score": `${value * 3.6}deg` } as CSSProperties}><span>{value}</span></div>;
}

function buildMarkdownReport(state: AppState, scoreAverage: number, biggestGap: { label: string; gap: number }, tows: string[][]) {
  const scoreRows = axes
    .map((axis) => `| ${axis.label} | ${state.scores[axis.key].own} | ${state.scores[axis.key].peer} | ${state.scores[axis.key].note || "-"} |`)
    .join("\n");
  const competitorRows = state.competitors
    .filter((competitor) => competitor.name || competitor.position || competitor.note)
    .map((competitor) => `| ${fallback(competitor.name, "-")} | ${fallback(competitor.position, "-")} | ${fallback(competitor.note, "-")} |`)
    .join("\n");
  const supplierRows = state.suppliers
    .filter((supplier) => supplier.name || supplier.dependence || supplier.leadTime)
    .map((supplier) => `| ${fallback(supplier.name, "-")} | ${supplier.dependence}% | ${supplier.leadTime}일 | ${supplier.risk} |`)
    .join("\n");
  const actionRows = state.actions
    .filter((action) => action.task || action.owner || action.kpi || action.due)
    .map((action) => `| ${fallback(action.task, "-")} | ${fallback(action.owner, "-")} | ${fallback(action.kpi, "-")} | ${fallback(action.due, "-")} |`)
    .join("\n");

  return `# ${fallback(state.companyName, "우리 회사")} 경쟁력 분석 보고서

## 경영진 요약
- 산업: ${fallback(state.industry, "미입력")}
- 분석 목적: ${state.purpose}
- 분석 기간: ${state.period}
- 종합 경쟁력 점수: ${scoreAverage}점
- 우선 개선축: ${biggestGap.label} (${biggestGap.gap}점 차이)

## 6축 진단
| 축 | 우리 회사 | 경쟁사 평균 | 판단 근거 |
| --- | ---: | ---: | --- |
${scoreRows}

## 경쟁사 벤치마크
| 회사 | 포지션 | 관찰 메모 |
| --- | --- | --- |
${competitorRows || "| - | - | - |"}

## SWOT/TOWS
- 강점: ${splitLines(state.swot.strengths).join(", ") || "-"}
- 약점: ${splitLines(state.swot.weaknesses).join(", ") || "-"}
- 기회: ${splitLines(state.swot.opportunities).join(", ") || "-"}
- 위협: ${splitLines(state.swot.threats).join(", ") || "-"}

${tows.map(([label, text]) => `- ${label}: ${text}`).join("\n")}

## SCM 리스크
| 공급처 | 의존도 | 리드타임 | 위험도 |
| --- | ---: | ---: | --- |
${supplierRows || "| - | - | - | - |"}

## 90일 실행 과제
| 과제 | 책임자 | KPI | 기한 |
| --- | --- | --- | --- |
${actionRows || "| - | - | - | - |"}
`;
}

function App() {
  const [state, setState] = useState<AppState>(readState);
  const [active, setActive] = useState("overview");
  const [saved, setSaved] = useState(true);
  const [isComparing, setIsComparing] = useState(false);

  useEffect(() => {
    document.title = appName;
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
    setSaved(false);
    const timer = window.setTimeout(() => setSaved(true), 300);
    return () => window.clearTimeout(timer);
  }, [state]);

  const scoreAverage = useMemo(() => Math.round(avg(axes.map((axis) => state.scores[axis.key].own)) * 10), [state.scores]);
  const biggestGap = useMemo(
    () => axes.map((axis) => ({ label: axis.label, gap: Math.max(0, state.scores[axis.key].peer - state.scores[axis.key].own) })).sort((a, b) => b.gap - a.gap)[0],
    [state.scores],
  );
  const tows = [
    ["SO", `${firstLine(state.swot.strengths, "강점")}을 활용해 ${firstLine(state.swot.opportunities, "기회")}를 선점합니다.`],
    ["ST", `${firstLine(state.swot.strengths, "강점")}으로 ${firstLine(state.swot.threats, "위협")}의 영향을 낮춥니다.`],
    ["WO", `${firstLine(state.swot.opportunities, "기회")}를 활용해 ${firstLine(state.swot.weaknesses, "약점")}을 90일 개선 과제로 전환합니다.`],
    ["WT", `${firstLine(state.swot.weaknesses, "약점")}과 ${firstLine(state.swot.threats, "위협")}이 만나는 영역을 리스크 등록부에 올립니다.`],
  ];
  const highRiskSuppliers = state.suppliers.filter((supplier) => supplier.risk === "높음" || supplier.dependence >= 50);
  const validActions = state.actions.filter((action) => action.task || action.owner || action.kpi || action.due);
  const researchProfile = useMemo(() => getResearchProfile(state.companyName, state.industry), [state.companyName, state.industry]);
  const validCompetitors = state.competitors.filter((competitor) => competitor.name.trim());
  const displayCandidates = state.competitorCandidates.length ? state.competitorCandidates : buildCandidates(validCompetitors, state.companyName, state.industry);
  const markdownReport = useMemo(() => buildMarkdownReport(state, scoreAverage, biggestGap, tows), [biggestGap, scoreAverage, state, tows]);
  const tabs = [
    ["overview", ClipboardList, "개요"],
    ["scorecard", BarChart3, "6축 진단"],
    ["swot", FileText, "SWOT/TOWS"],
    ["scm", Network, "SCM"],
    ["actions", Target, "실행 KPI"],
    ["report", FileText, "보고서"],
  ] as const;

  useEffect(() => {
    if (
      !hasLegacyGenericNames(state.competitors)
      && !hasLegacyGenericNames(state.competitorCandidates)
      && !shouldRefreshGeneratedCompetitors(state.competitors, researchProfile)
      && !shouldRefreshGeneratedCompetitors(state.competitorCandidates, researchProfile)
    ) return;

    setState((current) => {
      const profile = getResearchProfile(current.companyName, current.industry);
      return {
        ...current,
        competitors: hasLegacyGenericNames(current.competitors) || shouldRefreshGeneratedCompetitors(current.competitors, profile) ? profile.competitors : current.competitors,
        liveCompetitors: [],
        competitorCandidates: buildCandidates(profile.competitors, current.companyName, current.industry, "업종 키워드"),
        researchStatus: `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 실제 회사명으로 다시 제안했습니다. DART 공시와 KOSIS 산업통계 관점의 비교 가능성을 기준으로 선정했습니다.`,
      };
    });
  }, [researchProfile, state.companyName, state.competitors, state.competitorCandidates, state.industry]);

  const update = (patch: Partial<AppState>) => setState((current) => ({ ...current, ...patch }));
  const updateScore = (key: AxisKey, patch: Partial<Score>) => setState((current) => ({ ...current, scores: { ...current.scores, [key]: { ...current.scores[key], ...patch } } }));
  const replaceCompetitor = (index: number, patch: Partial<Competitor>) => update({ competitors: state.competitors.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
  const replaceSupplier = (index: number, patch: Partial<Supplier>) => update({ suppliers: state.suppliers.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
  const replaceAction = (index: number, patch: Partial<Action>) => update({ actions: state.actions.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
  const researchCompetitors = async () => {
    const suggestedCompetitors = researchProfile.competitors;
    const openDartKey = envOpenDartKey;
    const canUseDartData = !isLocalHost || Boolean(openDartKey);
    if (!canUseDartData) {
      setState((current) => ({
        ...current,
        competitors: suggestedCompetitors,
        liveCompetitors: [],
        competitorCandidates: buildCandidates(suggestedCompetitors, current.companyName, current.industry, "업종 키워드"),
        researchStatus: `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 제안했습니다. 로컬 .env에 DART 키가 없어 업종 키워드와 KOSIS 산업통계 관점의 비교 가능성을 기준으로 선정했습니다.`,
      }));
      return;
    }

    setState((current) => ({
      ...current,
      competitors: suggestedCompetitors,
      competitorCandidates: buildCandidates(suggestedCompetitors, current.companyName, current.industry, "업종 키워드"),
      liveCompetitors: [],
      researchStatus: isLocalHost
        ? `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 조사 중입니다. DART 공시목록·회사개황과 KOSIS 산업통계 관점을 함께 사용합니다.`
        : `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 조사 중입니다. 배포 환경에서는 GitHub Actions가 미리 생성한 DART 공시 캐시와 KOSIS 산업통계 관점을 함께 사용합니다.`,
    }));

    try {
      const corpCodes = await fetchOpenDartCompanies(openDartKey);
      const targetNames = suggestedCompetitors.map((competitor) => competitor.name.replace(/\s/g, ""));
      const matched = corpCodes
        .filter((company) => targetNames.some((name) => isCompanyNameMatch(name, company.corpName)))
        .slice(0, 5);
      const liveCompanies = await Promise.all(matched.map((company) => fetchOpenDartCompanyOverview(openDartKey, company)));
      const ownCompany = await resolveLiveCompany(state.companyName, openDartKey);
      const nextCompetitors = suggestedCompetitors.map((competitor) => {
        const liveCompany = liveCompanies.find((company) => isCompanyNameMatch(competitor.name, company.corpName));
        if (!liveCompany) return competitor;
        return {
          ...competitor,
          name: liveCompany.corpName,
          note: [competitor.note, liveCompany.ceo ? `대표 ${liveCompany.ceo}` : "", liveCompany.industryCode ? `DART 업종코드 ${liveCompany.industryCode}` : "", liveCompany.stockCode ? `종목코드 ${liveCompany.stockCode}` : ""].filter(Boolean).join(" · "),
        };
      });
      const candidates = buildCandidates(nextCompetitors, state.companyName, state.industry, liveCompanies.length ? "DART/KOSIS" : "업종 키워드", liveCompanies, ownCompany);
      const industryMatchCount = candidates.filter((candidate) => candidate.industryMatch).length;

      setState((current) => ({
        ...current,
        competitors: nextCompetitors,
        liveCompetitors: liveCompanies,
        competitorCandidates: candidates,
        researchStatus: liveCompanies.length
          ? `${state.companyName || "우리회사"} 기준 Top5 경쟁사 중 DART ${isLocalHost ? "공시/회사개황" : "배포 캐시"}에서 ${liveCompanies.length}개 회사를 확인했습니다.${industryMatchCount ? ` 이 중 ${industryMatchCount}개사는 ${ownCompany?.industryCode ? `업종코드 ${ownCompany.industryCode}` : "동일 업종코드"}가 일치해 등록 데이터 기준으로 직접 비교가 가능합니다.` : " KOSIS 산업통계는 시장규모·업종 추세를 보정하는 근거로 함께 사용합니다."}`
          : `${state.companyName || "우리회사"} 기준으로 DART 공시목록 직접 매칭이 어려워 업종 키워드와 KOSIS 산업분류 관점으로 Top5 경쟁사를 제안했습니다.`,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        competitors: suggestedCompetitors,
        liveCompetitors: [],
        competitorCandidates: buildCandidates(suggestedCompetitors, current.companyName, current.industry, "업종 키워드"),
        researchStatus: `${error instanceof Error ? error.message : "실시간 조회 실패"} 현재는 ${current.companyName || "우리회사"} 기준 Top5 경쟁사를 업종 키워드와 DART/KOSIS 선정 기준에 맞춰 표시합니다.`,
      }));
    }
  };
  const compareCompetitiveness = async () => {
    if (isComparing) return;

    const baseCompetitors = validCompetitors.length && !shouldRefreshGeneratedCompetitors(validCompetitors, researchProfile) ? validCompetitors : researchProfile.competitors;
    const openDartKey = envOpenDartKey;
    const canUseDartData = !isLocalHost || Boolean(openDartKey);

    setIsComparing(true);
    setState((current) => ({
      ...current,
      competitors: baseCompetitors,
      liveCompetitors: [],
      competitorCandidates: current.competitorCandidates.length
        ? current.competitorCandidates
        : buildCandidates(baseCompetitors, current.companyName, current.industry, canUseDartData ? "DART/KOSIS" : "업종 키워드"),
      researchStatus: canUseDartData
        ? `${current.companyName || "우리회사"} 기준 경쟁력 비교를 진행 중입니다. DART ${isLocalHost ? "실시간 공시목록과" : "배포 캐시와"} KOSIS 업종 관점으로 6축 경쟁사 평균을 산정합니다.`
        : `${current.companyName || "우리회사"} 기준 경쟁력 비교를 진행 중입니다. 로컬 DART 키가 없어 KOSIS 업종 관점과 입력된 경쟁사 정보로 비교합니다.`,
    }));

    try {
      const liveResults = canUseDartData ? await resolveLiveCompetitors(baseCompetitors, openDartKey) : [];
      const nextCompetitors = liveResults.length ? liveResults.map((result) => result.competitor) : baseCompetitors;
      const liveCompanies = liveResults.map((result) => result.liveCompany).filter(Boolean) as LiveCompany[];
      const ownCompany = canUseDartData ? await resolveLiveCompany(state.companyName, openDartKey) : undefined;
      const nextScores = buildDartKosisScores(
        state.scores,
        researchProfile,
        nextCompetitors,
        liveCompanies,
        ownCompany,
        state.companyName,
        state.industry,
        state.purpose,
      );

      setState((current) => ({
        ...current,
        competitors: nextCompetitors,
        liveCompetitors: liveCompanies,
        competitorCandidates: buildCandidates(nextCompetitors, current.companyName, current.industry, canUseDartData ? "DART/KOSIS" : "업종 키워드", liveCompanies, ownCompany),
        scores: nextScores,
        researchStatus: liveCompanies.length
          ? `${current.companyName || "우리회사"} 기준 경쟁력 비교를 완료했습니다. DART ${isLocalHost ? "공시목록/회사개황" : "배포 캐시"}에서 경쟁사 ${liveCompanies.length}개${ownCompany ? "와 우리회사" : ""}를 확인했고, KOSIS ${current.industry || researchProfile.label} 업종 관점으로 우리회사와 경쟁사 평균을 함께 보정했습니다.${ownCompany?.industryCode ? ` 업종코드 ${ownCompany.industryCode} 일치 후보는 추천 목록 상단에 우선 배치했습니다.` : ""}`
          : `${current.companyName || "우리회사"} 기준 경쟁력 비교를 완료했습니다. DART 직접 매칭이 부족해 회사명·산업·분석목적과 KOSIS ${current.industry || researchProfile.label} 업종 관점으로 우리회사와 경쟁사 평균을 산정했습니다.`,
        actions: current.actions.some((action) => action.task)
          ? current.actions
          : [
              { task: "Top5 경쟁사 DART 공시·재무·채널 자료 검증", owner: "후계자", kpi: "경쟁사별 근거 3개 이상", due: "" },
              { task: "KOSIS 업종 지표와 6축 점수 보정 회의", owner: "경영기획", kpi: "벤치마크 점수 확정", due: "" },
            ],
      }));
    } catch (error) {
      const nextScores = buildDartKosisScores(
        state.scores,
        researchProfile,
        baseCompetitors,
        [],
        undefined,
        state.companyName,
        state.industry,
        state.purpose,
      );

      setState((current) => ({
        ...current,
        competitors: baseCompetitors,
        competitorCandidates: buildCandidates(baseCompetitors, current.companyName, current.industry, "업종 키워드"),
        scores: nextScores,
        researchStatus: `${error instanceof Error ? error.message : "DART/KOSIS 비교 조회 실패"} KOSIS 업종 관점과 입력된 회사/경쟁사 정보로 6축 점수를 산정했습니다.`,
      }));
    } finally {
      setIsComparing(false);
      setActive("scorecard");
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.companyName || "competitive-analysis"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const exportMarkdown = () => {
    const blob = new Blob([markdownReport], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.companyName || "competitive-analysis"}-report.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Building2 size={24} /></div><div><strong>{appName}</strong><span>경영후계자용 분석 앱</span></div></div>
        <nav aria-label="분석 단계">
          {tabs.map(([id, Icon, label]) => <button className={active === id ? "active" : ""} key={id} onClick={() => setActive(id)} type="button"><Icon size={18} />{label}</button>)}
        </nav>
        <div className="sidebar-actions">
          <button type="button" onClick={() => setState(clone(sampleState))}><RefreshCw size={17} />샘플</button>
          <button type="button" onClick={() => setState(clone(defaultState))}><Trash2 size={17} />초기화</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Successor Strategy Cockpit</p><h1>우리 회사의 경쟁력을 비교하고, 후계 실행 과제로 연결하세요</h1></div>
          <div className="topbar-actions"><span className="save-pill">{saved ? "저장됨" : "저장 중"}</span><button type="button" onClick={exportJson} aria-label="JSON 내보내기"><Download size={19} /></button><button type="button" onClick={exportMarkdown} aria-label="Markdown 보고서 내보내기"><FileText size={19} /></button><button type="button" onClick={() => window.print()} aria-label="보고서 인쇄"><Printer size={19} /></button></div>
        </header>

        {active === "overview" && (
          <Panel eyebrow="Step 1" title="분석 범위 설정">
            <div className="metric-strip"><strong>{scoreAverage}</strong><span>종합점수</span><strong>{biggestGap.label}</strong><span>개선축</span><strong>{state.actions.filter((action) => action.task).length}</strong><span>과제</span></div>
            <div className="form-grid">
              <label>회사명<input value={state.companyName} onChange={(event) => update({ companyName: event.target.value, competitorCandidates: [], researchStatus: "" })} placeholder="예: 한빛정밀" /></label>
              <label>산업<input value={state.industry} onChange={(event) => update({ industry: event.target.value, competitorCandidates: [], researchStatus: "" })} placeholder="예: 자동차 부품 제조" /></label>
              <label>분석 목적<select value={state.purpose} onChange={(event) => update({ purpose: event.target.value })}>{["시장점유 방어", "신사업 진입", "원가경쟁력 개선", "SCM 안정화", "M&A 타당성"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>분석 기간<select value={state.period} onChange={(event) => update({ period: event.target.value })}>{["최근 3년", "최근 1년", "향후 6개월", "향후 12개월"].map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <section className="research-card">
              <div>
                <p className="eyebrow">Competitor Discovery</p>
                <h3>비교 대상군 찾기</h3>
                <p>{state.companyName ? `${state.companyName} 기준 Top5 경쟁사를 제안합니다.` : "회사명을 입력하면 해당 회사를 기준으로 Top5 경쟁사를 제안합니다."} 산업을 함께 입력하면 DART·KOSIS 업종 관점의 선정사유가 더 정확해집니다.</p>
              </div>
              <div className="research-actions">
                <button className="primary" type="button" onClick={researchCompetitors}><Search size={17} />경쟁사 조사</button>
                <button className="secondary" type="button" onClick={compareCompetitiveness} disabled={isComparing}><Wand2 size={17} />{isComparing ? "비교 중" : "경쟁력 비교"}</button>
              </div>
              <div className="research-summary">
                <strong>DART·KOSIS 기반 조사</strong>
                <p>{state.researchStatus || (isLocalHost
                  ? `경쟁사 조사를 누르면 입력한 회사명을 기준으로 DART 공시목록·회사개황과 KOSIS 산업통계 관점의 Top5 경쟁사를 제안합니다. API 키 상태: DART ${envOpenDartKey ? "연결됨" : "미입력"}, KOSIS ${envKosisKey ? "연결됨" : "미입력"}`
                  : "경쟁사 조사를 누르면 입력한 회사명을 기준으로 GitHub Actions가 미리 생성한 DART 공시 캐시와 KOSIS 산업통계 관점의 Top5 경쟁사를 제안합니다.")}</p>
              </div>
              {displayCandidates.length > 0 && (
                <div className="candidate-panel">
                  <div className="candidate-heading">
                    <strong>Top5 경쟁사</strong>
                    <span>회사명 · 주요 산업분야 · 선정사유</span>
                  </div>
                  {displayCandidates.map((candidate, index) => (
                    <article className="candidate-row" key={`${candidate.name}-${index}`}>
                      <div>
                        <small>{String(index + 1).padStart(2, "0")}</small>
                        <strong>{candidate.name}</strong>
                        {candidate.industryMatch && <span className="match-badge" title="DART 등록 업종코드가 우리회사와 일치하는 후보입니다">업종코드 일치</span>}
                      </div>
                      <span>{candidate.industryField}</span>
                      <p>{candidate.reason}</p>
                      <em>{candidate.source}</em>
                    </article>
                  ))}
                </div>
              )}
              {state.liveCompetitors.length > 0 && (
                <div className="live-result-list">
                  {state.liveCompetitors.map((company) => (
                    <article key={company.corpCode}>
                      <strong>{company.corpName}</strong>
                      <span>{company.stockCode || "비상장/코드 없음"} · {company.ceo || "대표 미확인"} · {company.industryCode || "업종코드 미확인"}</span>
                    </article>
                  ))}
                </div>
              )}
              <div className="source-list" aria-label="기업정보 조회사이트">
                {researchSites.map((site) => (
                  <a key={site.name} href={getResearchUrl(site.url, state.companyName, state.industry)} target="_blank" rel="noreferrer">
                    <span>{site.name}</span>
                    <small>{site.description}</small>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </section>
            <EditableList title="벤치마크 경쟁사" addLabel="경쟁사" rows={state.competitors} onAdd={() => update({ competitors: [...state.competitors, { name: "", position: "", note: "" }] })} onRemove={(index) => update({ competitors: state.competitors.filter((_, rowIndex) => rowIndex !== index) })}>
              {(competitor, index) => <>
                <label>회사명<input value={competitor.name} onChange={(event) => replaceCompetitor(index, { name: event.target.value })} placeholder="경쟁사명" /></label>
                <label>포지션<input value={competitor.position} onChange={(event) => replaceCompetitor(index, { position: event.target.value })} placeholder="저가, 품질, 납기" /></label>
                <label>관찰 메모<input value={competitor.note} onChange={(event) => replaceCompetitor(index, { note: event.target.value })} placeholder="근거와 출처" /></label>
              </>}
            </EditableList>
          </Panel>
        )}

        {active === "scorecard" && (
          <Panel eyebrow="Step 2" title="경영자 관점 6축 진단" action={<button className="secondary" type="button" onClick={() => setState((current) => ({ ...current, scores: Object.fromEntries(axes.map((axis) => [axis.key, { ...current.scores[axis.key], peer: Math.min(10, current.scores[axis.key].own + 1) }])) as Record<AxisKey, Score> }))}>경쟁사 평균 적용</button>}>
            <div className="score-layout">
              <div className="axis-list">
                {axes.map((axis) => {
                  const Icon = axis.icon;
                  const score = state.scores[axis.key];
                  return <article className="axis-card" key={axis.key}><div className="axis-title"><Icon size={20} /><div><strong>{axis.label}</strong><span>{axis.hint}</span></div></div><div className="range-grid"><label>우리 회사 <b>{score.own}</b><input type="range" min="1" max="10" value={score.own} onChange={(event) => updateScore(axis.key, { own: Number(event.target.value) })} /></label><label>경쟁사 평균 <b>{score.peer}</b><input type="range" min="1" max="10" value={score.peer} onChange={(event) => updateScore(axis.key, { peer: Number(event.target.value) })} /></label></div><input value={score.note} onChange={(event) => updateScore(axis.key, { note: event.target.value })} placeholder="판단 근거와 출처" /></article>;
                })}
              </div>
              <div className="chart-panel"><ScoreRing value={scoreAverage} /><Radar scores={state.scores} /><div className="legend"><span className="own-dot">우리 회사</span><span className="peer-dot">경쟁사 평균</span></div></div>
            </div>
          </Panel>
        )}

        {active === "swot" && (
          <Panel eyebrow="Step 3" title="SWOT에서 TOWS 전략으로">
            <div className="swot-grid">
              <label className="swot-card strength">강점<textarea value={state.swot.strengths} onChange={(event) => update({ swot: { ...state.swot, strengths: event.target.value } })} placeholder="기술력, 장기 고객, 원가 우위" /></label>
              <label className="swot-card weakness">약점<textarea value={state.swot.weaknesses} onChange={(event) => update({ swot: { ...state.swot, weaknesses: event.target.value } })} placeholder="후계 체계, 설비 노후화, 의존도" /></label>
              <label className="swot-card opportunity">기회<textarea value={state.swot.opportunities} onChange={(event) => update({ swot: { ...state.swot, opportunities: event.target.value } })} placeholder="정책 지원, 신규 수요, 경쟁사 이슈" /></label>
              <label className="swot-card threat">위협<textarea value={state.swot.threats} onChange={(event) => update({ swot: { ...state.swot, threats: event.target.value } })} placeholder="가격 인하, 원자재 변동, 대체재" /></label>
            </div>
            <div className="strategy-grid">{tows.map(([label, text]) => <article key={label}><strong>{label}</strong><p>{text}</p></article>)}</div>
          </Panel>
        )}

        {active === "scm" && (
          <Panel eyebrow="Step 4" title="SCM 네트워크와 리스크">
            <div className="scm-layout">
              <div className="network-map"><svg viewBox="0 0 720 360" role="img" aria-label="공급망 네트워크"><line x1="155" y1="85" x2="350" y2="180" /><line x1="155" y1="180" x2="350" y2="180" /><line x1="155" y1="275" x2="350" y2="180" /><line x1="455" y1="180" x2="610" y2="180" /><circle cx="118" cy="85" r="46" /><text x="118" y="91">원재료</text><circle cx="118" cy="180" r="46" /><text x="118" y="186">부품</text><circle cx="118" cy="275" r="46" /><text x="118" y="281">외주</text><rect x="330" y="132" width="145" height="96" rx="8" /><text x="402" y="186">우리 회사</text><circle cx="650" cy="180" r="52" /><text x="650" y="186">고객</text></svg></div>
              <EditableList title="공급처 리스크" addLabel="공급처" rows={state.suppliers} onAdd={() => update({ suppliers: [...state.suppliers, { name: "", dependence: 30, leadTime: 14, risk: "보통" }] })} onRemove={(index) => update({ suppliers: state.suppliers.filter((_, rowIndex) => rowIndex !== index) })}>
                {(supplier, index) => <>
                  <label>공급처<input value={supplier.name} onChange={(event) => replaceSupplier(index, { name: event.target.value })} placeholder="공급처명" /></label>
                  <label>의존도 %<input type="number" min="0" max="100" value={supplier.dependence} onChange={(event) => replaceSupplier(index, { dependence: Number(event.target.value) })} /></label>
                  <label>리드타임 일<input type="number" min="0" value={supplier.leadTime} onChange={(event) => replaceSupplier(index, { leadTime: Number(event.target.value) })} /></label>
                  <label>위험도<select value={supplier.risk} onChange={(event) => replaceSupplier(index, { risk: event.target.value as Risk })}>{["낮음", "보통", "높음"].map((risk) => <option key={risk}>{risk}</option>)}</select></label>
                </>}
              </EditableList>
            </div>
          </Panel>
        )}

        {active === "actions" && (
          <Panel eyebrow="Step 5" title="실행계획과 KPI">
            <EditableList title="90일 실행 과제" addLabel="과제" rows={state.actions} onAdd={() => update({ actions: [...state.actions, { task: "", owner: "", kpi: "", due: "" }] })} onRemove={(index) => update({ actions: state.actions.filter((_, rowIndex) => rowIndex !== index) })}>
              {(action, index) => <>
                <label>과제<input value={action.task} onChange={(event) => replaceAction(index, { task: event.target.value })} placeholder="실행 과제" /></label>
                <label>책임자<input value={action.owner} onChange={(event) => replaceAction(index, { owner: event.target.value })} placeholder="담당자" /></label>
                <label>KPI<input value={action.kpi} onChange={(event) => replaceAction(index, { kpi: event.target.value })} placeholder="측정 기준" /></label>
                <label>기한<input type="month" value={action.due} onChange={(event) => replaceAction(index, { due: event.target.value })} /></label>
              </>}
            </EditableList>
            <div className="memo"><article><strong>핵심 판단</strong><p>{state.companyName || "우리 회사"}의 우선 개선축은 {biggestGap.label}입니다. 경쟁사 대비 {biggestGap.gap}점 차이를 줄이는 실행 과제가 필요합니다.</p></article><article><strong>보고 메모</strong><p>{state.purpose} 목적의 {state.period} 분석입니다. 숫자 입력 후 인쇄 버튼으로 경영진 1페이지 초안을 출력할 수 있습니다.</p></article></div>
          </Panel>
        )}

        {active === "report" && (
          <Panel eyebrow="Executive Brief" title="경영진 1페이지 보고서" action={<button className="primary" type="button" onClick={exportMarkdown}><Download size={17} />Markdown</button>}>
            <section className="report-page">
              <div className="report-hero">
                <div>
                  <p className="eyebrow">Competitive Analysis Memo</p>
                  <h2>{state.companyName || "우리 회사"} 경쟁력 분석</h2>
                  <p>{state.industry || "산업 미입력"} · {state.purpose} · {state.period}</p>
                </div>
                <div className="report-score">
                  <strong>{scoreAverage}</strong>
                  <span>종합점수</span>
                </div>
              </div>

              <div className="report-grid">
                <article>
                  <strong>핵심 판단</strong>
                  <p>우선 개선축은 {biggestGap.label}입니다. 경쟁사 평균 대비 {biggestGap.gap}점 차이를 줄이는 실행 과제가 필요합니다.</p>
                </article>
                <article>
                  <strong>SCM 리스크</strong>
                  <p>{highRiskSuppliers.length ? `${highRiskSuppliers.map((supplier) => supplier.name || "미입력 공급처").join(", ")} 관리가 필요합니다.` : "현재 고위험 공급처는 없습니다."}</p>
                </article>
                <article>
                  <strong>실행 과제</strong>
                  <p>{validActions.length ? `${validActions.length}개 과제가 등록되어 있습니다.` : "아직 등록된 실행 과제가 없습니다."}</p>
                </article>
              </div>

              <div className="report-section">
                <h3>6축 점수 요약</h3>
                <div className="report-score-table">
                  {axes.map((axis) => (
                    <div key={axis.key}>
                      <span>{axis.label}</span>
                      <strong>{state.scores[axis.key].own}</strong>
                      <small>경쟁사 {state.scores[axis.key].peer}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-section">
                <h3>TOWS 전략 초안</h3>
                <div className="strategy-grid compact">
                  {tows.map(([label, text]) => <article key={label}><strong>{label}</strong><p>{text}</p></article>)}
                </div>
              </div>

              <div className="report-section">
                <h3>90일 실행 과제</h3>
                <div className="report-action-list">
                  {(validActions.length ? validActions : [{ task: "실행 과제를 입력하세요.", owner: "-", kpi: "-", due: "-" }]).map((action, index) => (
                    <div key={`${action.task}-${index}`}>
                      <strong>{action.task || "미입력 과제"}</strong>
                      <span>{action.owner || "책임자 미입력"} · {action.kpi || "KPI 미입력"} · {action.due || "기한 미입력"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </Panel>
        )}
      </main>
    </div>
  );
}

function Panel({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="panel active"><div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>{children}</section>;
}

function EditableList<T>({ title, addLabel, rows, onAdd, onRemove, children }: { title: string; addLabel: string; rows: T[]; onAdd: () => void; onRemove: (index: number) => void; children: (row: T, index: number) => ReactNode }) {
  return <div className="editable-list"><div className="list-heading"><h3>{title}</h3><button className="primary" type="button" onClick={onAdd}><Plus size={17} />{addLabel}</button></div>{rows.map((row, index) => <div className="row-card" key={index}>{children(row, index)}<button className="delete" type="button" onClick={() => onRemove(index)} aria-label={`${title} 삭제`}><Trash2 size={17} /></button></div>)}</div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
