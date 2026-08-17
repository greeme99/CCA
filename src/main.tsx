import { lazy, StrictMode, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Edge, MarkerType, Node } from "@xyflow/react";
import { BarChart3, ClipboardList, Download, ExternalLink, Factory, FileText, Network, PanelLeftClose, PanelLeftOpen, Plus, Printer, RefreshCw, Search, ShieldCheck, Target, Trash2, TrendingUp, Upload, Users, Wand2 } from "lucide-react";
import { normalizeCompanyName, shouldAutoRefreshCompetitors } from "./competitors";
import { hasUserInput, parseStateFile } from "./stateFile";
import "./styles.css";

type AxisKey = "strategy" | "profit" | "scm" | "market" | "operation" | "finance";
type Risk = "낮음" | "보통" | "높음";
type Score = { own: number; peer: number; note: string; source?: "자동 추정" | "DART/KOSIS" | "사용자 입력" | "검증 필요"; confidence?: number; reasons?: string[] };
type Competitor = { name: string; position: string; note: string; tags?: string[]; directness?: "direct" | "adjacent" | "benchmark" };
type ExecutiveRole = "CEO" | "CFO" | "COO" | "CMO" | "CSO" | "전략기획팀장" | "마케팅팀장" | "경영지원팀장";
type DepartmentName = "전략기획" | "마케팅" | "경영지원" | "운영/SCM" | "재무";
type DepartmentActionPlan = Action & { department: DepartmentName; rationale: string };
type DecisionAgenda = { title: string; owner: string; decision: string };
type SwotCategory = "strengths" | "weaknesses" | "opportunities" | "threats";
type SwotItem = {
  id: string;
  category: SwotCategory;
  content: string;
  evidence: string;
  impact: number;
  certainty: number;
  competitor: string;
  axis: AxisKey;
};
type TowsStrategy = {
  label: "SO" | "ST" | "WO" | "WT";
  name: string;
  logic: string;
  action90: string;
  kpi: string;
  risk: string;
  priority: "상" | "중" | "하";
  owner: DepartmentName;
};
type LearnedCompetitorSignal = { industryKey: string; companyName: string; terms: string[]; count: number; updatedAt: string };
type ScmNodeType = "원재료" | "부품" | "외주공정" | "물류" | "생산거점" | "주요 고객";
type Supplier = { name: string; type: ScmNodeType; dependence: number; leadTime: number; alternatives: number; qualityIssues: number; certificationRequired: boolean; regionRisk: Risk; risk: Risk };
type Action = { task: string; owner: string; kpi: string; due: string };
type LiveCompany = { corpCode: string; corpName: string; stockCode: string; modifyDate: string; ceo?: string; address?: string; industryCode?: string };
type CompetitorCandidate = { name: string; industryField: string; reason: string; source: "DART/KOSIS" | "업종 키워드"; industryMatch?: boolean; fitScore?: number };
type AxisSubMetric = { label: string; ownSignal: string; peerSignal: string };
type AxisDetail = { axis: AxisKey; subMetrics: Array<AxisSubMetric & { own: number; peer: number; reason: string }>; source: NonNullable<Score["source"]>; confidence: number; reasons: string[] };
type CompetitorAxisScore = { competitor: string; scores: Record<AxisKey, number>; reason: string; fitScore: number };
type ScmFlowData = { label: string; nodeType: ScmNodeType | "회사"; riskScore: number; badges: string[] };
type ResearchProfile = {
  label: string;
  keywords: string[];
  competitors: Competitor[];
  peerScores: Record<AxisKey, number>;
  requiredKeywordGroups?: string[][];
  negativeKeywords?: string[];
  tags?: string[];
};
type AppState = {
  companyName: string;
  industry: string;
  role: ExecutiveRole;
  purpose: string;
  period: string;
  competitors: Competitor[];
  scores: Record<AxisKey, Score>;
  swot: Record<SwotCategory, SwotItem[]>;
  suppliers: Supplier[];
  actions: Action[];
  liveCompetitors: LiveCompany[];
  competitorCandidates: CompetitorCandidate[];
  researchStatus: string;
  /** 경쟁사 목록이 앱 자동 생성물인지(true) 사용자가 편집했는지(false). 자동 갱신이 사용자 입력을 덮어쓰지 않도록 구분한다. */
  competitorsAuto: boolean;
};

const appName = "CCA(기업경쟁력분석)";
const envOpenDartKey = import.meta.env.VITE_OPENDART_API_KEY || "";
const envKosisKey = import.meta.env.VITE_KOSIS_API_KEY || "";
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const dartCacheUrl = `${import.meta.env.BASE_URL}data/opendart-companies.json`;

const executiveRoles: Array<{ role: ExecutiveRole; label: string; focus: string; decisionLens: string; primaryAxes: AxisKey[] }> = [
  { role: "CEO", label: "CEO/대표", focus: "성장 방향과 경쟁우위 유지", decisionLens: "어디에 자원을 집중하고 어떤 경쟁위협을 먼저 막을지 결정합니다.", primaryAxes: ["strategy", "market", "finance"] },
  { role: "CFO", label: "CFO/재무임원", focus: "수익성, 현금흐름, 투자여력", decisionLens: "마진 방어와 투자 회수 가능성을 기준으로 경쟁력을 판단합니다.", primaryAxes: ["profit", "finance", "strategy"] },
  { role: "COO", label: "COO/운영임원", focus: "운영 효율, 품질, 납기", decisionLens: "생산성, 품질, 납기 안정성의 실행 격차를 우선 점검합니다.", primaryAxes: ["operation", "scm", "profit"] },
  { role: "CMO", label: "CMO/마케팅임원", focus: "시장, 고객, 채널, 포지셔닝", decisionLens: "고객군과 채널에서 이길 수 있는 차별화 포인트를 찾습니다.", primaryAxes: ["market", "strategy", "profit"] },
  { role: "CSO", label: "CSO/전략임원", focus: "전략 옵션, 포트폴리오, 제휴", decisionLens: "신사업, 제휴, 포트폴리오 전환의 선택지를 비교합니다.", primaryAxes: ["strategy", "market", "finance"] },
  { role: "전략기획팀장", label: "전략기획팀장", focus: "경쟁사 벤치마크와 중장기 전략과제", decisionLens: "경쟁사 대비 우선순위와 실행 로드맵을 구조화합니다.", primaryAxes: ["strategy", "market", "operation"] },
  { role: "마케팅팀장", label: "마케팅팀장", focus: "타깃 고객, 가격, 채널, 메시지", decisionLens: "고객군별 포지셔닝과 채널 실행안을 구체화합니다.", primaryAxes: ["market", "profit", "strategy"] },
  { role: "경영지원팀장", label: "경영지원팀장", focus: "조직, 예산, KPI, 리스크 관리", decisionLens: "전략을 실행 가능한 과제, 예산, KPI 체계로 전환합니다.", primaryAxes: ["operation", "finance", "scm"] },
];

const scmNodeTypes: ScmNodeType[] = ["원재료", "부품", "외주공정", "물류", "생산거점", "주요 고객"];

function createScmNode(patch: Partial<Supplier> = {}): Supplier {
  return {
    name: "",
    type: "부품",
    dependence: 30,
    leadTime: 14,
    alternatives: 1,
    qualityIssues: 0,
    certificationRequired: false,
    regionRisk: "보통",
    risk: "보통",
    ...patch,
  };
}

function getScmRiskScore(node: Supplier) {
  const dependenceScore = Math.min(35, Math.max(0, node.dependence) * 0.35);
  const leadTimeScore = Math.min(25, Math.max(0, node.leadTime) / 60 * 25);
  const alternativeScore = node.alternatives <= 0 ? 18 : node.alternatives === 1 ? 12 : node.alternatives === 2 ? 6 : 0;
  const qualityScore = Math.min(12, Math.max(0, node.qualityIssues) * 4);
  const certificationScore = node.certificationRequired ? 6 : 0;
  const regionScore = node.regionRisk === "높음" ? 8 : node.regionRisk === "보통" ? 4 : 0;
  return Math.min(100, Math.round(dependenceScore + leadTimeScore + alternativeScore + qualityScore + certificationScore + regionScore));
}

function getScmRiskLevel(score: number): Risk {
  if (score >= 70) return "높음";
  if (score >= 40) return "보통";
  return "낮음";
}

function getScmRiskBadges(node: Supplier) {
  const badges: string[] = [];
  if (node.dependence >= 50) badges.push("핵심 병목");
  if (node.alternatives <= 1) badges.push("단일소스 위험");
  if (node.leadTime >= 30) badges.push("장기 리드타임");
  if (node.qualityIssues >= 2) badges.push("품질 이슈");
  if (node.certificationRequired) badges.push("인증 선행");
  if (node.regionRisk === "높음") badges.push("지역 리스크");
  return badges;
}

function hydrateSupplier(value: Partial<Supplier>): Supplier {
  const node = createScmNode(value);
  const score = getScmRiskScore(node);
  return { ...node, risk: getScmRiskLevel(score) };
}

type ScmRiskSummary = {
  averageRisk: number;
  maxRisk: number;
  bottlenecks: Supplier[];
  singleSources: Supplier[];
  longLeadTimes: Supplier[];
  highRiskNodes: Supplier[];
  recommendedScore: number;
  headline: string;
};

function buildScmRiskSummary(nodes: Supplier[]): ScmRiskSummary {
  const activeNodes = nodes.filter((node) => node.name.trim() || node.dependence || node.leadTime);
  const scores = activeNodes.map(getScmRiskScore);
  const averageRisk = scores.length ? Math.round(avg(scores)) : 0;
  const maxRisk = scores.length ? Math.max(...scores) : 0;
  const bottlenecks = activeNodes.filter((node) => node.dependence >= 50);
  const singleSources = activeNodes.filter((node) => node.alternatives <= 1);
  const longLeadTimes = activeNodes.filter((node) => node.leadTime >= 30);
  const highRiskNodes = activeNodes.filter((node) => getScmRiskScore(node) >= 70 || getScmRiskBadges(node).length >= 2);
  const penalty = Math.min(5, Math.round(maxRisk / 25) + Math.min(2, highRiskNodes.length));
  const recommendedScore = clampScore(8 - penalty);
  const headline = highRiskNodes.length
    ? `${highRiskNodes.length}개 고위험 SCM 노드가 6축 SCM 점수와 실행 과제에 반영되어야 합니다.`
    : "현재 SCM 노드는 관리 가능한 범위입니다. 대체 공급처와 납기 지표를 계속 추적하세요.";
  return { averageRisk, maxRisk, bottlenecks, singleSources, longLeadTimes, highRiskNodes, recommendedScore, headline };
}

function buildScmWeaknessItem(summary: ScmRiskSummary): SwotItem {
  const target = summary.highRiskNodes[0] || summary.bottlenecks[0] || summary.singleSources[0] || summary.longLeadTimes[0];
  const nodeName = target?.name || "핵심 SCM 노드";
  const badges = target ? getScmRiskBadges(target).join(" · ") : "공급망 리스크";
  return createSwotItem(
    "weaknesses",
    `${nodeName} 중심의 SCM 병목·단일소스 리스크`,
    `Step 4 자동 진단: 평균 위험도 ${summary.averageRisk}점, 최대 위험도 ${summary.maxRisk}점${badges ? ` · ${badges}` : ""}`,
    5,
    summary.maxRisk >= 70 ? 5 : 4,
    "",
    "scm",
  );
}

function buildScmActionPlan(summary: ScmRiskSummary): DepartmentActionPlan {
  const target = summary.highRiskNodes[0] || summary.bottlenecks[0] || summary.singleSources[0] || summary.longLeadTimes[0];
  const nodeName = target?.name || "핵심 SCM 노드";
  const badges = target ? getScmRiskBadges(target) : [];
  const mainTask = badges.includes("단일소스 위험")
    ? `${nodeName} 대체 공급처 2곳 발굴·인증`
    : badges.includes("장기 리드타임")
      ? `${nodeName} 안전재고 기준과 납기 SLA 재설계`
      : `${nodeName} SCM 리스크 저감 실행안 수립`;
  return {
    department: "운영/SCM",
    task: mainTask,
    owner: "운영/SCM",
    kpi: "위험도 20점 이상 감소, 대체 수 2개 이상, 리드타임 20% 단축",
    due: getPurposeDueMonth(3),
    rationale: summary.headline,
  };
}

function buildScmCompetitorRows(competitors: Competitor[], competitorScores: CompetitorAxisScore[], summary: ScmRiskSummary) {
  const rows = (competitors.length ? competitors : defaultResearchProfile.competitors).filter((competitor) => competitor.name.trim()).slice(0, 5);
  return rows.map((competitor) => {
    const score = competitorScores.find((item) => item.competitor === competitor.name)?.scores.scm || 7;
    const edge = score - summary.recommendedScore;
    return {
      name: competitor.name,
      scmScore: score,
      position: competitor.position || "SCM 비교 대상",
      comparison: edge > 1 ? "경쟁사 우위" : edge < -1 ? "당사 우위 가능" : "유사 수준",
      reason: competitor.note || "납기, 대체 공급처, 양산 안정성 관점에서 비교가 필요합니다.",
    };
  });
}

function getScmNodePoint(type: ScmNodeType, index: number) {
  const positions: Record<ScmNodeType, Array<{ x: number; y: number }>> = {
    원재료: [{ x: 110, y: 70 }, { x: 110, y: 125 }],
    부품: [{ x: 110, y: 190 }, { x: 110, y: 245 }],
    외주공정: [{ x: 300, y: 78 }, { x: 300, y: 130 }],
    물류: [{ x: 300, y: 260 }, { x: 300, y: 310 }],
    생산거점: [{ x: 500, y: 115 }, { x: 500, y: 245 }],
    "주요 고객": [{ x: 650, y: 160 }, { x: 650, y: 225 }],
  };
  const bucket = positions[type];
  return bucket[index % bucket.length];
}

function getScmLineColor(score: number) {
  if (score >= 70) return "#dc2626";
  if (score >= 40) return "#d97706";
  return "#2563eb";
}

function getScmNodeRiskClass(score: number) {
  if (score >= 70) return "risk-high";
  if (score >= 40) return "risk-mid";
  return "risk-low";
}

function buildScmFlow(nodes: Supplier[]) {
  const companyNode: Node<ScmFlowData> = {
    id: "company",
    type: "scmRisk",
    position: { x: 350, y: 170 },
    data: { label: "우리 회사", nodeType: "회사", riskScore: 0, badges: [] },
    className: "scm-flow-node company-flow-node",
    draggable: false,
  };
  const flowNodes: Node<ScmFlowData>[] = [companyNode];
  const flowEdges: Edge[] = [];

  nodes.forEach((node, index) => {
    const point = getScmNodePoint(node.type, index);
    const score = getScmRiskScore(node);
    const label = node.name.trim() || `${node.type} ${index + 1}`;
    const badges = getScmRiskBadges(node);
    const nodeId = `scm-${index}`;
    const isCustomer = node.type === "주요 고객";
    const isInternal = node.type === "생산거점";
    flowNodes.push({
      id: nodeId,
      type: "scmRisk",
      position: { x: point.x - 54, y: point.y - 34 },
      data: { label, nodeType: node.type, riskScore: score, badges },
      className: `scm-flow-node ${getScmNodeRiskClass(score)}`,
      draggable: false,
    });
    flowEdges.push({
      id: `edge-${index}`,
      source: isCustomer ? "company" : nodeId,
      target: isCustomer || isInternal ? nodeId : "company",
      type: "smoothstep",
      animated: score >= 70,
      // MarkerType.ArrowClosed 값. 열거형을 런타임 import하면 React Flow가 초기 번들에 들어온다.
      markerEnd: { type: "arrowclosed" as MarkerType, color: getScmLineColor(score) },
      style: { stroke: getScmLineColor(score), strokeWidth: Math.max(2, Math.min(9, Math.max(12, node.dependence) / 10)) },
    });
  });

  return { nodes: flowNodes, edges: flowEdges };
}

const analysisPurposes = [
  "성장전략 수립",
  "시장점유 방어",
  "신사업 진입",
  "경쟁사 대응",
  "가격전략",
  "채널전략",
  "원가경쟁력 개선",
  "SCM 안정화",
  "조직역량 진단",
  "투자/M&A 검토",
  "수익성 개선",
  "위기대응 전략",
];

function getExecutiveRole(role: ExecutiveRole) {
  return executiveRoles.find((item) => item.role === role) || executiveRoles[0];
}

function getRoleLanguage(role: ExecutiveRole) {
  if (role === "CEO") return { question: "어디에 베팅할 것인가", verb: "자원 배분을 결정", reportTone: "투자와 철수의 선택지를 명확히 합니다." };
  if (role === "CSO" || role === "전략기획팀장") return { question: "어떤 전략 옵션이 타당한가", verb: "전략 옵션을 검증", reportTone: "시장 진입, 포트폴리오, 제휴 시나리오를 비교합니다." };
  if (role === "CMO" || role === "마케팅팀장") return { question: "어떤 고객·채널에서 이길 것인가", verb: "고객·채널 우선순위를 확정", reportTone: "타깃 고객, 포지셔닝, 가격, 채널 실행안을 구체화합니다." };
  if (role === "경영지원팀장") return { question: "무엇을 실행 가능하게 만들 것인가", verb: "조직·예산·KPI 체계를 설계", reportTone: "전략을 실행 가능한 책임, 예산, KPI로 전환합니다." };
  if (role === "CFO") return { question: "어떤 선택이 수익성과 현금흐름을 지키는가", verb: "재무 기준을 확정", reportTone: "수익성, 투자여력, 비용구조 기준으로 판단합니다." };
  return { question: "어떤 운영 격차를 먼저 줄일 것인가", verb: "운영 실행 우선순위를 확정", reportTone: "공급망, 생산성, 납기, 품질 격차를 실행 과제로 전환합니다." };
}

const axes = [
  { key: "strategy", label: "전략", hint: "성장 방향, 포지셔닝, 의사결정 속도", icon: Target },
  { key: "profit", label: "수익구조", hint: "마진, 반복매출, 가격 방어력", icon: TrendingUp },
  { key: "scm", label: "SCM", hint: "공급처 다변화, 리드타임, 재고회전", icon: Network },
  { key: "market", label: "시장·채널", hint: "고객 기반, 채널 접근성, 브랜드 신뢰", icon: Users },
  { key: "operation", label: "조직·운영", hint: "인재, 프로세스, 디지털 활용", icon: Factory },
  { key: "finance", label: "재무건전성", hint: "현금흐름, 부채, 투자 여력", icon: ShieldCheck },
] as const;


const swotCategories: Array<{ key: SwotCategory; label: string; tone: string; placeholder: string }> = [
  { key: "strengths", label: "강점", tone: "strength", placeholder: "당사가 이미 방어 가능한 역량" },
  { key: "weaknesses", label: "약점", tone: "weakness", placeholder: "경쟁사 대비 부족한 역량" },
  { key: "opportunities", label: "기회", tone: "opportunity", placeholder: "시장 성장, 정책, 프로젝트 수요" },
  { key: "threats", label: "위협", tone: "threat", placeholder: "가격 경쟁, 대형사 진입, 대체재" },
];

const axisOwnerMap: Record<AxisKey, DepartmentName> = {
  strategy: "전략기획",
  profit: "재무",
  scm: "운영/SCM",
  market: "마케팅",
  operation: "경영지원",
  finance: "재무",
};

const axisSwotTemplates: Record<AxisKey, { weakness: string; opportunity: string; question: string }> = {
  strategy: { weakness: "전략 포트폴리오와 제휴 옵션의 구체성이 경쟁사 대비 부족", opportunity: "시장 재편기에 포트폴리오·제휴 전략을 재정렬할 기회", question: "Top5 경쟁사 대비 어떤 전략 옵션이 가장 현실적인가요?" },
  profit: { weakness: "가격 경쟁 시 마진 방어 구조가 취약", opportunity: "고부가 제품·서비스 믹스로 수익성을 개선할 기회", question: "가격 경쟁이 발생하면 가장 먼저 훼손될 마진 구조는 무엇인가요?" },
  scm: { weakness: "공급처 의존·납기 리스크가 경쟁사 대비 큼", opportunity: "대체 공급처와 납기 안정성으로 프로젝트 수주 신뢰를 높일 기회", question: "대형 프로젝트 수주에서 부족한 인증·레퍼런스·납기 대응은 무엇인가요?" },
  market: { weakness: "타깃 고객·채널 커버리지가 경쟁사 대비 제한적", opportunity: "고객군·채널별 포지셔닝을 재정의해 침투율을 높일 기회", question: "Top5 경쟁사 대비 당사가 이길 수 있는 고객군과 채널은 어디인가요?" },
  operation: { weakness: "운영 프로세스와 디지털 활용 수준이 경쟁사 대비 낮음", opportunity: "자동화·표준화로 품질, 납기, 생산성을 동시에 개선할 기회", question: "반복 지연이나 품질 이슈를 만드는 운영 병목은 무엇인가요?" },
  finance: { weakness: "투자 우선순위와 회수 기준이 명확하지 않음", opportunity: "재무 안정성을 활용해 선택적 투자와 리스크 대응력을 높일 기회", question: "지금 투자해도 되는 영역과 중단해야 할 조건은 무엇인가요?" },
};

const axisEvaluationDefinitions: Record<AxisKey, AxisSubMetric[]> = {
  strategy: [
    { label: "전략 명확성", ownSignal: "포트폴리오·우선순위 문서화", peerSignal: "경쟁사 사업부문·투자 방향" },
    { label: "차별화 포지션", ownSignal: "고객이 선택하는 이유", peerSignal: "경쟁사 제품/채널 포지션" },
    { label: "의사결정 속도", ownSignal: "투자·수주 판단 리드타임", peerSignal: "경쟁사 확장·제휴 속도" },
  ],
  profit: [
    { label: "가격 방어력", ownSignal: "단가 인하 대응력", peerSignal: "경쟁사 가격·효율 압박" },
    { label: "마진 구조", ownSignal: "원가율·제품믹스", peerSignal: "동종업계 수익성" },
    { label: "반복 매출", ownSignal: "장기계약·A/S·소모품", peerSignal: "경쟁사 고객 유지 구조" },
  ],
  scm: [
    { label: "공급처 다변화", ownSignal: "핵심 공급처 의존도", peerSignal: "경쟁사 조달 안정성" },
    { label: "납기 안정성", ownSignal: "납기 준수율·리드타임", peerSignal: "경쟁사 프로젝트 대응력" },
    { label: "품질·수율", ownSignal: "불량률·수율·클레임", peerSignal: "양산 경험·인증" },
  ],
  market: [
    { label: "고객군 적합성", ownSignal: "타깃 고객·레퍼런스", peerSignal: "경쟁사 고객 포트폴리오" },
    { label: "채널 접근성", ownSignal: "직판·대리점·세트업체 접점", peerSignal: "경쟁사 납품 이력" },
    { label: "브랜드·신뢰", ownSignal: "인증·레퍼런스·평판", peerSignal: "시장 반복 언급도" },
  ],
  operation: [
    { label: "생산성", ownSignal: "자동화·표준시간", peerSignal: "경쟁사 양산 규모" },
    { label: "프로세스 성숙도", ownSignal: "계획·품질·원가 관리 체계", peerSignal: "경쟁사 운영 안정성" },
    { label: "인력·조직", ownSignal: "핵심인력·R&R", peerSignal: "경쟁사 조직 실행력" },
  ],
  finance: [
    { label: "재무 안정성", ownSignal: "부채·현금흐름", peerSignal: "경쟁사 투자 여력" },
    { label: "투자 여력", ownSignal: "CAPEX·R&D 가능성", peerSignal: "경쟁사 설비/기술 투자" },
    { label: "비용 구조", ownSignal: "고정비·변동비 민감도", peerSignal: "동종업계 비용 구조" },
  ],
};

const baseAxisWeights: Record<AxisKey, number> = { strategy: 1, profit: 1, scm: 1, market: 1, operation: 1, finance: 1 };

function clampScore(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function getPurposeAxisWeights(purpose: string, role: ExecutiveRole): Record<AxisKey, number> {
  const text = purpose.toLowerCase();
  const weights = { ...baseAxisWeights };
  for (const axis of getExecutiveRole(role).primaryAxes) weights[axis] += 0.35;
  if (text.includes("시장") || text.includes("채널") || text.includes("점유")) {
    weights.market += 0.9;
    weights.strategy += 0.45;
  }
  if (text.includes("가격") || text.includes("원가") || text.includes("수익")) {
    weights.profit += 0.9;
    weights.operation += 0.35;
    weights.finance += 0.25;
  }
  if (text.includes("scm") || text.includes("공급") || text.includes("납기")) {
    weights.scm += 1;
    weights.operation += 0.55;
  }
  if (text.includes("신사업") || text.includes("성장") || text.includes("m&a") || text.includes("투자")) {
    weights.strategy += 0.75;
    weights.finance += 0.45;
    weights.market += 0.35;
  }
  if (text.includes("조직") || text.includes("위기")) {
    weights.operation += 0.6;
    weights.finance += 0.3;
  }
  return weights;
}

function weightedScore(scores: Record<AxisKey, Score>, purpose: string, role: ExecutiveRole) {
  const weights = getPurposeAxisWeights(purpose, role);
  const totalWeight = axes.reduce((sum, axis) => sum + weights[axis.key], 0);
  const weighted = axes.reduce((sum, axis) => sum + scores[axis.key].own * weights[axis.key], 0) / totalWeight;
  return Math.round(weighted * 10);
}

function getScoreSource(score: Score): NonNullable<Score["source"]> {
  return score.source || (score.note ? "사용자 입력" : "자동 추정");
}

function getScoreConfidence(score: Score, hasLiveData: boolean) {
  if (score.confidence) return score.confidence;
  let confidence = 45;
  if (score.note.trim()) confidence += 15;
  if (hasLiveData) confidence += 20;
  if (score.reasons?.length) confidence += 10;
  return Math.min(95, confidence);
}

function buildCompetitorAxisScores(profile: ResearchProfile, competitors: Competitor[], companyName: string, industry: string): CompetitorAxisScore[] {
  return competitors.filter((competitor) => competitor.name.trim()).slice(0, 5).map((competitor) => {
    const fit = getBusinessFitDetails(competitor, companyName, industry, profile);
    const directBoost = competitor.directness === "direct" ? 1 : competitor.directness === "adjacent" ? 0 : -1;
    const signalBoost = Math.min(1, Math.floor(fit.score / 6));
    const scores = Object.fromEntries(axes.map((axis) => {
      const axisSignal = includesBusinessTerm(`${competitor.position} ${competitor.note} ${(competitor.tags || []).join(" ")}`, axis.label) ? 1 : 0;
      return [axis.key, clampScore(profile.peerScores[axis.key] + directBoost + signalBoost + axisSignal)];
    })) as Record<AxisKey, number>;
    return { competitor: competitor.name, scores, reason: fit.summary, fitScore: fit.score };
  });
}

function buildAxisDetails(state: AppState, profile: ResearchProfile, competitorAxisScores: CompetitorAxisScore[], liveCompanies: LiveCompany[]): AxisDetail[] {
  const averagePeer = (axis: AxisKey) => competitorAxisScores.length
    ? Math.round(avg(competitorAxisScores.map((competitor) => competitor.scores[axis])))
    : state.scores[axis].peer;

  return axes.map((axis) => {
    const score = state.scores[axis.key];
    const peerAverage = averagePeer(axis.key);
    const gap = peerAverage - score.own;
    const source = getScoreSource(score);
    const confidence = getScoreConfidence(score, Boolean(liveCompanies.length));
    const reasons = score.reasons?.length ? score.reasons : [
      `${profile.label} 업종 프로파일 기준 경쟁사 평균 ${peerAverage}점`,
      gap > 0 ? `경쟁사 대비 ${gap}점 열위` : gap < 0 ? `경쟁사 대비 ${Math.abs(gap)}점 우위` : "경쟁사 평균과 유사",
      score.note || "내부 정량지표 입력 시 보정 필요",
    ];
    const subMetrics = axisEvaluationDefinitions[axis.key].map((metric, index) => {
      const adjustment = index === 0 ? 0 : index === 1 ? Math.sign(score.own - peerAverage) : -Math.sign(gap);
      return {
        ...metric,
        own: clampScore(score.own + adjustment),
        peer: clampScore(peerAverage + (index === 2 && competitorAxisScores.length >= 4 ? 1 : 0)),
        reason: `${metric.ownSignal} / ${metric.peerSignal}`,
      };
    });
    return { axis: axis.key, subMetrics, source, confidence, reasons };
  });
}

function createSwotItem(category: SwotCategory, content = "", evidence = "", impact = 3, certainty = 3, competitor = "", axis: AxisKey = "strategy"): SwotItem {
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    content,
    evidence,
    impact,
    certainty,
    competitor,
    axis,
  };
}

function createEmptySwot(): Record<SwotCategory, SwotItem[]> {
  return { strengths: [createSwotItem("strengths")], weaknesses: [createSwotItem("weaknesses")], opportunities: [createSwotItem("opportunities")], threats: [createSwotItem("threats")] };
}

function migrateSwotValue(value: unknown): Record<SwotCategory, SwotItem[]> {
  const empty = createEmptySwot();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Partial<Record<SwotCategory, unknown>>;
  return Object.fromEntries(swotCategories.map(({ key }) => {
    const bucket = raw[key];
    if (Array.isArray(bucket)) {
      const items = bucket.map((item) => ({ ...createSwotItem(key), ...(item as Partial<SwotItem>), category: key })).filter((item) => item.content || item.evidence || item.competitor);
      return [key, items.length ? items : [createSwotItem(key)]];
    }
    if (typeof bucket === "string") {
      const items = splitLines(bucket).map((line) => createSwotItem(key, line));
      return [key, items.length ? items : [createSwotItem(key)]];
    }
    return [key, empty[key]];
  })) as Record<SwotCategory, SwotItem[]>;
}

function getSwotItemText(items: SwotItem[]) {
  return items.map((item) => item.content.trim()).filter(Boolean);
}

function firstSwotItem(items: SwotItem[], fallbackLabel: string) {
  return getSwotItemText(items)[0] || fallbackLabel;
}

function getCoreSwotItems(swot: Record<SwotCategory, SwotItem[]>) {
  const rank = (items: SwotItem[]) => [...items]
    .filter((item) => item.content.trim())
    .sort((a, b) => (b.impact * b.certainty) - (a.impact * a.certainty));
  return {
    strengths: rank(swot.strengths),
    weaknesses: rank(swot.weaknesses),
    opportunities: rank(swot.opportunities),
    threats: rank(swot.threats),
  };
}

function buildSwotDrafts(state: AppState, profile: ResearchProfile) {
  const gapAxes = axes
    .map((axis) => ({ axis, gap: state.scores[axis.key].peer - state.scores[axis.key].own }))
    .sort((a, b) => b.gap - a.gap);
  const strongestAxis = axes
    .map((axis) => ({ axis, edge: state.scores[axis.key].own - state.scores[axis.key].peer }))
    .sort((a, b) => b.edge - a.edge)[0]?.axis || axes[0];
  const biggestGapAxis = gapAxes[0]?.axis || axes[2];
  const competitor = state.competitors.find((item) => item.name.trim()) || profile.competitors[0];
  const signals = extractBusinessSignals(`${state.companyName} ${state.industry} ${profile.label} ${profile.tags?.join(" ") || ""} ${competitor?.note || ""}`, profile).slice(0, 6).join(" · ");
  const matchedCompetitor = competitor?.name || "Top5 경쟁사";

  return {
    strengths: [createSwotItem("strengths", `${strongestAxis.label} 축에서 당사가 방어 가능한 기존 역량 보유`, `${matchedCompetitor} 대비 6축 점수와 내부 근거 확인 필요${signals ? ` · 신호: ${signals}` : ""}`, 4, 3, matchedCompetitor, strongestAxis.key)],
    weaknesses: [createSwotItem("weaknesses", axisSwotTemplates[biggestGapAxis.key].weakness, `${biggestGapAxis.label} 격차 ${Math.max(0, state.scores[biggestGapAxis.key].peer - state.scores[biggestGapAxis.key].own)}점 · 경쟁사 비교표 근거`, 5, 4, matchedCompetitor, biggestGapAxis.key)],
    opportunities: [createSwotItem("opportunities", axisSwotTemplates[biggestGapAxis.key].opportunity, `KOSIS ${state.industry || profile.label} 업종 추세와 프로젝트 수요 확인 필요`, 4, 3, matchedCompetitor, biggestGapAxis.key)],
    threats: [createSwotItem("threats", `${matchedCompetitor} 등 직접 경쟁사의 가격·효율·레퍼런스 압박`, `경쟁사 선정사유와 사업부문 적합도 신호 기반`, 5, 3, matchedCompetitor, biggestGapAxis.key)],
  } satisfies Record<SwotCategory, SwotItem[]>;
}

function buildSwotCoachQuestions(state: AppState, profile: ResearchProfile, biggestGap: { label: string; gap: number }) {
  const topGapAxis = axes.map((axis) => ({ axis, gap: state.scores[axis.key].peer - state.scores[axis.key].own })).sort((a, b) => b.gap - a.gap)[0]?.axis || axes[0];
  const directCompetitors = state.competitors.filter((item) => item.directness === "direct" || item.name).slice(0, 3).map((item) => item.name).filter(Boolean).join("·") || "Top5 경쟁사";
  const signals = extractBusinessSignals(`${state.industry} ${profile.label} ${profile.tags?.join(" ") || ""}`, profile).slice(0, 4).join("·");
  return [
    `Top5 경쟁사(${directCompetitors}) 대비 당사가 이미 가진 고객·납기·기술 우위는 무엇인가요?`,
    axisSwotTemplates[topGapAxis.key].question,
    `${state.industry || profile.label}에서 ${signals || "핵심 사업 신호"} 기준으로 대체재나 해외계 업체가 위협이 되는 지점은 어디인가요?`,
    `${biggestGap.label} 격차를 90일 안에 줄이려면 어떤 근거 데이터가 먼저 필요할까요?`,
  ];
}

function buildTowsStrategies(state: AppState): TowsStrategy[] {
  const core = getCoreSwotItems(state.swot);
  const strength = core.strengths[0] || createSwotItem("strengths", "핵심 강점", "", 3, 3, "", "strategy");
  const weakness = core.weaknesses[0] || createSwotItem("weaknesses", "핵심 약점", "", 3, 3, "", "operation");
  const opportunity = core.opportunities[0] || createSwotItem("opportunities", "핵심 기회", "", 3, 3, "", "market");
  const threat = core.threats[0] || createSwotItem("threats", "핵심 위협", "", 3, 3, "", "profit");
  const priority = (impact: number, certainty: number): "상" | "중" | "하" => impact >= 4 && certainty >= 4 ? "상" : impact >= 3 && certainty >= 3 ? "중" : "하";
  return [
    { label: "SO", name: "강점 기반 성장 옵션", logic: `${strength.content}을 활용해 ${opportunity.content}를 선점합니다.`, action90: `${axisOwnerMap[opportunity.axis]} 주도로 고객·채널·제품 적용 시나리오 3개를 검증`, kpi: "검증 시나리오 3개, 파일럿 고객 1곳", risk: "기회 규모가 과대 추정될 수 있음", priority: priority(strength.impact, opportunity.certainty), owner: axisOwnerMap[opportunity.axis] },
    { label: "ST", name: "방어 가능한 경쟁우위 강화", logic: `${strength.content}으로 ${threat.content}의 영향을 낮춥니다.`, action90: `${axisOwnerMap[threat.axis]} 주도로 가격·효율·레퍼런스 방어 기준 확정`, kpi: "방어 기준 5개, 리스크 대응안 1건", risk: "경쟁사의 가격 인하 속도가 빠를 수 있음", priority: priority(threat.impact, strength.certainty), owner: axisOwnerMap[threat.axis] },
    { label: "WO", name: "약점 보완형 기회 포착", logic: `${opportunity.content}를 활용해 ${weakness.content}를 개선합니다.`, action90: `${axisOwnerMap[weakness.axis]} 주도로 약점 개선 파일럿과 외부 파트너 후보를 검토`, kpi: "개선 파일럿 1건, 파트너 후보 3곳", risk: "내부 실행 리소스가 부족할 수 있음", priority: priority(weakness.impact, opportunity.certainty), owner: axisOwnerMap[weakness.axis] },
    { label: "WT", name: "리스크 차단 과제", logic: `${weakness.content}과 ${threat.content}이 만나는 영역을 선제 차단합니다.`, action90: `${axisOwnerMap[weakness.axis]} 주도로 중단 조건, 모니터링 지표, 책임자를 지정`, kpi: "리스크 지표 3개, 대응 책임자 지정", risk: "위험이 현실화되면 비용이 먼저 증가할 수 있음", priority: priority(Math.max(weakness.impact, threat.impact), Math.max(weakness.certainty, threat.certainty)), owner: axisOwnerMap[weakness.axis] },
  ];
}

const defaultState: AppState = {
  companyName: "",
  industry: "",
  role: "CEO",
  purpose: "성장전략 수립",
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
  swot: createEmptySwot(),
  suppliers: [createScmNode()],
  actions: [{ task: "", owner: "", kpi: "", due: "" }],
  liveCompetitors: [],
  competitorCandidates: [],
  researchStatus: "",
  competitorsAuto: false,
};

const sampleState: AppState = {
  companyName: "한빛정밀",
  industry: "자동차 부품 제조",
  role: "COO",
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
    strengths: [
      createSwotItem("strengths", "장기 고객사와 품질 신뢰", "반복 거래와 품질 클레임 이력", 5, 4, "세진테크", "market"),
      createSwotItem("strengths", "낮은 부채비율", "최근 3년 재무 안정성", 4, 4, "", "finance"),
      createSwotItem("strengths", "핵심 가공 기술 내재화", "주요 공정 사내 보유", 4, 3, "대성모빌리티", "operation"),
    ],
    weaknesses: [
      createSwotItem("weaknesses", "핵심 소재 공급처 의존도 높음", "1개사 의존도 68%", 5, 5, "대성모빌리티", "scm"),
      createSwotItem("weaknesses", "생산계획 수작업 비중 높음", "주간 계획 조정 시간이 길어짐", 4, 4, "우진파트너스", "operation"),
      createSwotItem("weaknesses", "의사결정 체계 미완성", "투자·수주 판단 기준 문서화 부족", 3, 3, "", "strategy"),
    ],
    opportunities: [
      createSwotItem("opportunities", "전장 부품 수요 확대", "완성차 전동화 전환", 5, 4, "세진테크", "market"),
      createSwotItem("opportunities", "정부 스마트공장 지원", "자동화 투자 보조 가능성", 4, 3, "", "operation"),
      createSwotItem("opportunities", "경쟁사 납기 지연 이슈", "고객 전환 가능성", 4, 3, "우진파트너스", "scm"),
    ],
    threats: [
      createSwotItem("threats", "완성차 단가 인하 압박", "고객사 원가 절감 요구", 5, 4, "대성모빌리티", "profit"),
      createSwotItem("threats", "원자재 가격 변동", "핵심 소재 가격 민감도", 4, 4, "", "scm"),
      createSwotItem("threats", "해외 저가 업체 진입", "저가 대량 생산 경쟁", 4, 3, "대성모빌리티", "market"),
    ],
  },
  suppliers: [
    createScmNode({ name: "동원소재", type: "원재료", dependence: 68, leadTime: 21, alternatives: 0, qualityIssues: 1, certificationRequired: true, regionRisk: "보통" }),
    createScmNode({ name: "한서정공", type: "부품", dependence: 22, leadTime: 12, alternatives: 2, qualityIssues: 0, certificationRequired: false, regionRisk: "낮음" }),
  ],
  actions: [
    { task: "핵심 소재 대체 공급처 2곳 인증", owner: "구매팀장", kpi: "의존도 45% 이하", due: "2026-09" },
    { task: "주간 생산계획 자동화 대시보드 구축", owner: "후계자", kpi: "계획 소요시간 50% 절감", due: "2026-08" },
  ],
  liveCompetitors: [],
  competitorCandidates: [],
  researchStatus: "",
  competitorsAuto: false,
};

const researchProfiles: ResearchProfile[] = [
  {
    label: "배터리팩·BMS",
    keywords: ["배터리팩", "배터리 팩", "bms", "ess", "전동공구", "로봇배터리", "모빌리티 배터리", "배터리 모듈", "2차전지 팩"],
    competitors: [
      { name: "아이티엠반도체", position: "소형 IT·전자담배 배터리팩/보호회로(PMP)", note: "배터리 보호회로 핵심 부품인 PMP 기술력을 바탕으로 스마트폰 및 KT&G·필립모리스 등 글로벌 전자담배 기기 배터리팩·ODM 시장에서 당사와 직접 수주 경쟁 관계이며, 최근 전장·로봇용 배터리팩으로도 영역을 확장 중입니다" },
      { name: "상신이디피", position: "배터리 캔·케이스 등 팩 구조물", note: "삼성SDI 핵심 벤더로 스마트폰용 소형 배터리 용기 및 EV/ESS용 중대형 캔을 공급하며, 당사의 배터리팩·모듈 조립 영역과 셀 보호용 케이스·정밀 부품 가공 영역에서 강한 경쟁 관계를 형성합니다" },
      { name: "신흥에스이씨", position: "배터리 팩·모듈·캡 어셈블리(Cap Ass'y)", note: "배터리 셀 안전을 담당하는 캡 어셈블리·스트립 제조가 주력이지만 ESS·전동공구·소형 모빌리티용 배터리 모듈/팩 사업도 영위해 당사의 ESS·e-Mobility 중대형 배터리팩/모듈 시장과 밸류체인상 직접 비교가 가능합니다" },
      { name: "알루코", position: "중대형 배터리 모듈 케이스·ESS 팩 하우징", note: "알루미늄 압출 기술로 전기차·대형 ESS용 배터리 팩 하우징과 모듈 케이스를 공급하며, 중대형 배터리 기구물·하우징 시장에서 경쟁 구도를 형성합니다" },
      { name: "넥스콘테크놀러지", position: "소형 IT·e-Mobility 배터리 보호회로(BMS)·팩", note: "노트북·스마트폰용 배터리 보호회로와 팩 조립이 주력이며, 최근 전기자전거·전동킥보드 등 e-Mobility 및 소형 ESS용 배터리팩/BMS 개발에 집중해 당사의 신성장 동력 부문과 타깃 시장이 상당 부분 겹치는 동종 업계 경쟁사입니다" },
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
    keywords: ["태양광", "태양광 인버터", "pv inverter", "solar inverter", "인버터", "pcs", "ess용 pcs", "전력변환", "신재생", "스마트그리드"],
    requiredKeywordGroups: [["태양광", "pv", "solar", "신재생"], ["인버터", "pcs", "전력변환"]],
    negativeKeywords: ["스마트폰", "반도체", "디스플레이", "생활가전", "자동차부품"],
    tags: ["태양광", "인버터", "PV", "PCS", "전력변환", "ESS"],
    competitors: [
      { name: "효성중공업", position: "대용량 태양광 인버터·전력기기", tags: ["태양광", "인버터", "대용량", "전력기기", "공공프로젝트", "A/S", "직접경쟁"], directness: "direct", note: "국내 태양광 인버터 기업군에서 대용량 시장에 참여하는 핵심 플레이어로, 공공·대규모 프로젝트의 인증·납기·A/S·레퍼런스 기준에서 당사와 직접 비교 가능" },
      { name: "OCI파워", position: "대용량 태양광 인버터·발전 프로젝트", tags: ["태양광", "인버터", "대용량", "발전사업", "프로젝트", "공공조달", "직접경쟁"], directness: "direct", note: "국내 대용량 태양광 인버터 보급에 나서는 주요 업체로, 발전사업 고객과 프로젝트형 수요 대응력 측면에서 직접 경쟁 가능" },
      { name: "다쓰테크", position: "태양광 인버터 전문", tags: ["태양광", "인버터", "대용량", "PV", "전력변환", "국내전문기업", "직접경쟁"], directness: "direct", note: "국내 태양광 인버터 대표 전문기업 중 하나로 스트링·센트럴 인버터와 대용량 발전소 시장 대응 역량을 보유해 당사의 태양광 인버터 사업과 직접 비교 가능" },
      { name: "윌링스", position: "태양광 인버터·ESS PCS", tags: ["태양광", "인버터", "ESS", "PCS", "새만금", "프로젝트", "전력변환", "직접경쟁"], directness: "direct", note: "태양광 발전용 인버터와 ESS용 PCS 공급 실적 및 대형 프로젝트 수주 사례가 있어 프로젝트 레퍼런스, 효율, 납기 대응력 비교 가능" },
      { name: "신성이엔지", position: "태양광 인버터·설치형 신재생 솔루션", tags: ["태양광", "인버터", "설치형", "사업용", "신재생", "프로젝트", "직접경쟁"], directness: "direct", note: "국내 태양광 인버터 시장 참여 기업으로 설치형·사업용 수요에서 겹치며 가격, 효율, 레퍼런스, 공공조달 대응력 비교가 필요" },
    ],
    peerScores: { strategy: 8, profit: 7, scm: 7, market: 8, operation: 8, finance: 7 },
  },
  {
    label: "스마트폰 쉴드캔·메탈케이스·광학부품",
    keywords: ["스마트폰 렌즈 쉴드", "렌즈 쉴드", "렌즈쉴드", "쉴드캔", "shield can", "metal case", "메탈 케이스", "메탈케이스", "deco", "금속 외장", "스마트폰 금속부품", "휴대폰 금속부품", "vcm", "셔터", "광학기기 부품", "카메라 렌즈 부품", "스마트폰 내장 부품"],
    requiredKeywordGroups: [["쉴드캔", "shield can", "렌즈쉴드", "렌즈 쉴드", "metal case", "메탈케이스", "메탈 케이스", "deco"], ["스마트폰", "휴대폰", "삼성전자", "세트업체", "카메라", "광학", "vcm", "셔터"]],
    negativeKeywords: ["터치스크린", "touch screen", "pba", "pcb", "태양광", "전자담배", "배터리팩", "자동차부품"],
    tags: ["스마트폰", "쉴드캔", "Shield Can", "메탈케이스", "렌즈쉴드", "VCM", "셔터", "광학부품", "카메라모듈", "프레스", "정밀가공", "금속부품", "삼성전자", "세트업체"],
    competitors: [
      { name: "에스코넥", position: "스마트폰 쉴드캔·금속부품", tags: ["쉴드캔", "스마트폰", "삼성전자", "금속부품", "프레스", "직접경쟁"], directness: "direct", note: "쉴드캔의 삼성전자 물량을 공급하는 경쟁사로 언급되며, 전자파 차폐용 쉴드캔과 금속 정밀부품에서 제품·고객 중복성이 가장 높습니다" },
      { name: "원진", position: "쉴드캔 대체 공급처·금속 정밀부품", tags: ["쉴드캔", "대체공급", "스마트폰", "금속부품", "직접경쟁"], directness: "direct", note: "에스코넥과 함께 쉴드캔 대체 공급처로 언급되어 삼성전자 1차 협력망 내 직접 경쟁 가능성이 큽니다" },
      { name: "파트론", position: "스마트폰 부품·메탈/광학 모듈", tags: ["스마트폰", "카메라모듈", "광학부품", "메탈", "삼성전자", "확장경쟁"], directness: "adjacent", note: "스마트폰 부품 대형 공급사로 메탈 케이스, 광학부품, 모듈 영역에서 당사와 고객군이 겹쳐 확장 경쟁사로 비교할 수 있습니다" },
      { name: "해성옵틱스", position: "카메라 모듈·광학 부품", tags: ["카메라모듈", "광학부품", "렌즈", "VCM", "스마트폰", "확장경쟁"], directness: "adjacent", note: "카메라 모듈과 광학 부품 기반 기업으로 당사의 VCM, 셔터 등 영상·광학기기 부문과 연결됩니다" },
      { name: "엠씨넥스", position: "스마트폰 카메라 모듈·광학부품", tags: ["카메라모듈", "광학부품", "렌즈", "스마트폰", "삼성전자", "확장경쟁"], directness: "adjacent", note: "스마트폰 카메라 모듈과 광학 부품 역량이 강해 렌즈·카메라 주변 부품군에서 경쟁 가능성이 높습니다" },
    ],
    peerScores: { strategy: 7, profit: 7, scm: 8, market: 8, operation: 8, finance: 7 },
  },
  {
    label: "터치스크린·터치모듈",
    keywords: ["터치스크린", "touch screen", "touch screen panel", "tsp", "터치패널", "터치 패널", "터치모듈", "터치 모듈", "정전용량", "저항막", "gff", "ito", "oca", "강화유리", "산업용 hmi", "hmi", "특수용 터치"],
    requiredKeywordGroups: [["터치스크린", "touch screen", "touch screen panel", "tsp", "터치패널", "터치모듈"], ["gff", "ito", "oca", "강화유리", "정전용량", "저항막", "hmi", "산업용", "특수용", "양산"]],
    negativeKeywords: ["pba", "pcb assembly", "인쇄회로기판", "배터리팩", "태양광", "전자담배", "반도체 장비"],
    tags: ["터치스크린", "터치패널", "터치모듈", "TSP", "GFF", "ITO", "OCA", "강화유리", "산업용", "HMI", "세트업체", "양산"],
    competitors: [
      { name: "에스맥", position: "터치스크린 패널·모듈", tags: ["터치스크린", "터치패널", "TSP", "삼성전자", "양산", "직접경쟁"], directness: "direct", note: "국내 터치스크린 관련 대표 업체로 반복 언급되며 삼성전자 납품 계열 경쟁군에 속해, 당사의 터치스크린 패널·모듈 사업과 제품 중복성이 높습니다" },
      { name: "시노펙스", position: "ITO 필름·터치스크린", tags: ["터치스크린", "ITO", "필름", "터치패널", "직접경쟁"], directness: "direct", note: "ITO 필름과 터치스크린 사업으로 알려진 국내 터치패널 경쟁군의 핵심 플레이어로, 소재·패널 공정과 고객 대응력 비교가 가능합니다" },
      { name: "미성포리테크", position: "터치스크린 양산·납품", tags: ["터치스크린", "터치패널", "양산", "납품", "직접경쟁"], directness: "direct", note: "터치스크린 양산 및 납품 사례가 언급되어 당사와 같은 제조형 경쟁을 하며 단가, 수율, 납기 안정성 비교에 적합합니다" },
      { name: "디지텍시스템즈", position: "강화유리·OCA·터치패널", tags: ["터치패널", "강화유리", "OCA", "핵심공정", "직접경쟁"], directness: "direct", note: "강화유리·OCA·터치패널 축으로 경쟁하며 터치스크린 핵심 공정 측면에서 당사의 제품 포트폴리오와 겹칩니다" },
      { name: "이엘케이", position: "세트업체 대응형 터치패널", tags: ["터치패널", "LG전자", "세트업체", "양산", "직접경쟁"], directness: "direct", note: "LG전자 납품 업체로 언급되며 세트업체 대응형 터치패널 경쟁사로 볼 수 있어 고객 인증, 납기, 양산 안정성 비교에 적합합니다" },
    ],
    peerScores: { strategy: 7, profit: 6, scm: 8, market: 7, operation: 8, finance: 6 },
  },
  {
    label: "PBA·PCB 어셈블리",
    keywords: ["pba", "pcb", "pcb assembly", "인쇄회로기판", "어셈블리", "전자부품 조립", "ems"],
    requiredKeywordGroups: [["pba", "pcb", "인쇄회로기판", "assembly", "어셈블리", "ems"], ["전자부품", "모듈", "조립", "실장"]],
    negativeKeywords: ["완성차", "식품", "화장품", "제약", "전자담배"],
    tags: ["PBA", "PCB", "EMS", "전자부품", "어셈블리", "모듈"],
    competitors: [
      { name: "드림텍", position: "전자부품·PBA 모듈", tags: ["PBA", "전자부품", "모듈", "EMS", "직접경쟁"], directness: "direct", note: "스마트폰·의료기기·자동차 전장용 모듈 제조 역량을 보유해 PBA/EMS 제조 경쟁력 비교 가능" },
      { name: "파트론", position: "카메라모듈·전자부품", tags: ["전자부품", "모듈", "EMS", "인접경쟁"], directness: "adjacent", note: "전자부품 모듈 양산, 고객사 대응, 생산 효율 관점에서 벤치마크 가능" },
      { name: "비에이치", position: "FPCB·전자부품", tags: ["FPCB", "PCB", "전자부품", "직접경쟁"], directness: "direct", note: "모바일·전장용 인쇄회로기판 제품군과 글로벌 고객 기반을 보유해 PCB 가치사슬 비교 가능" },
      { name: "인터플렉스", position: "연성인쇄회로기판", tags: ["FPCB", "PCB", "인쇄회로기판", "직접경쟁"], directness: "direct", note: "FPCB 제조와 고객사 납품 경험이 있어 품질·납기·수율 관리 비교 대상" },
      { name: "대덕전자", position: "PCB·반도체 패키지기판", tags: ["PCB", "패키지기판", "전자부품", "인접경쟁"], directness: "adjacent", note: "PCB와 패키지기판 양산 역량, 설비투자, 고객 포트폴리오 측면에서 비교 가능" },
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
    keywords: ["스피커", "마이크로스피커", "음향부품", "음향", "이어폰", "헤드폰", "리시버", "마이크로폰", "mems마이크", "사운드 솔루션"],
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
    keywords: ["전자담배", "베이프", "베이핑", "vape", "vaping", "무화기", "카트리지", "액상형", "히팅", "궐련형", "atomizer", "e-cigarette"],
    requiredKeywordGroups: [["전자담배", "베이프", "vape", "e-cigarette", "무화기"], ["기기", "카트리지", "히팅", "atomizer", "odm", "부품"]],
    negativeKeywords: ["마이크로스피커", "음향", "스피커", "배터리팩", "태양광"],
    tags: ["전자담배", "베이퍼라이저", "무화", "카트리지", "히팅", "ODM"],
    competitors: [
      { name: "이엠텍", position: "전자담배 ODM·기기 개발", tags: ["전자담배", "ODM", "기기", "히팅", "직접경쟁"], directness: "direct", note: "KT&G 릴 기기 개발·생산 경험과 전자담배 ODM 기술/IP 이력을 보유한 가장 강한 직접 비교 대상입니다" },
      { name: "아이티엠반도체", position: "전자담배 기기·카트리지 부품", tags: ["전자담배", "카트리지", "부품", "직접경쟁"], directness: "direct", note: "KT&G向 전자담배 기기·카트리지 생산 비중이 커지고 있는 핵심 직접 경쟁사입니다" },
      { name: "파트론", position: "전자담배 OEM·전자부품", tags: ["전자담배", "OEM", "전자부품", "직접경쟁"], directness: "direct", note: "전자담배 OEM 매출 확대가 확인되는 코스닥 전자부품사로 생산 효율·고객 다변화 비교에 적합합니다" },
      { name: "KH바텍", position: "메탈·기구부품(전자담배 인접)", tags: ["전자담배", "기구부품", "메탈", "인접경쟁"], directness: "adjacent", note: "전자담배 관련 특허·신제품 개발 이력과 금속/기구물 제조역량을 보유한 인접 경쟁사입니다" },
      { name: "SMOORE International", position: "글로벌 전자담배·무화 기술", tags: ["전자담배", "무화", "atomizer", "글로벌", "직접경쟁"], directness: "direct", note: "세계적인 전자담배·무화 기술 제조사로 글로벌 제조역량과 기술 격차를 점검하는 벤치마크 대상입니다" },
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
const defaultGenericCompetitorNames = new Set(defaultResearchProfile.competitors.map((competitor) => competitor.name));

const researchSites = [
  { name: "DART", description: "공시·사업보고서", url: "https://dart.fss.or.kr/" },
  { name: "KIND", description: "상장사 공시·시장정보", url: "https://kind.krx.co.kr/" },
  { name: "SMINFO", description: "중소기업 현황", url: "https://sminfo.mss.go.kr/cm/sv/CSV001R0.do" },
  { name: "KOSIS", description: "산업 통계", url: "https://kosis.kr/" },
  { name: "NICE BizLINE", description: "기업 신용·거래 정보", url: "https://www.nicebizline.com/" },
];

const storageKey = "succession-competitiveness-workbench";
const learningStorageKey = "succession-competitiveness-learning";
const clone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const firstLine = (value: string, fallback: string) => value.split("\n").map((line) => line.trim()).filter(Boolean)[0] || fallback;
const splitLines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const fallback = (value: string, label: string) => value.trim() || label;
const normalizeBusinessText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[()\[\]{}.,/\-·_\s㈜]/g, "");

const includesBusinessTerm = (text: string, term: string) => Boolean(term.trim()) && text.includes(normalizeBusinessText(term));

function getCompetitorBusinessText(competitor: Competitor) {
  return normalizeBusinessText([competitor.name, competitor.position, competitor.note, ...(competitor.tags || [])].join(" "));
}

const businessSignalLexicon = [
  { group: "capacity", terms: ["대용량", "소용량", "중대형", "설치형", "사업용", "공공", "프로젝트", "양산", "대량", "프리미엄", "저가", "고효율", "맞춤형", "특수용", "산업용", "1차협력", "대체공급", "세트업체"] },
  { group: "customer", terms: ["공공", "발전사업", "완성차", "스마트폰", "의료기기", "가전", "B2B", "B2C", "ODM", "OEM", "조달", "상업용", "산업용", "삼성전자", "LG전자", "세트업체", "HMI"] },
  { group: "value", terms: ["가격", "효율", "품질", "납기", "A/S", "인증", "레퍼런스", "수율", "원가", "보증", "채널", "브랜드", "단가", "품질신뢰", "고객대응", "대응속도"] },
  { group: "technology", terms: ["인버터", "PCS", "BMS", "PCB", "PBA", "FPCB", "모듈", "배터리팩", "반도체", "전력변환", "ESS", "히팅", "카트리지", "무화", "터치스크린", "터치패널", "터치모듈", "Touch Screen Panel", "TSP", "GFF", "ITO", "OCA", "강화유리", "정전용량", "저항막", "쉴드캔", "Shield Can", "렌즈쉴드", "렌즈 쉴드", "메탈케이스", "Metal Case", "Deco", "VCM", "셔터", "광학부품", "카메라모듈", "렌즈", "프레스", "정밀가공", "금속부품"] },
  { group: "market", terms: ["국내", "해외", "글로벌", "신재생", "전장", "모빌리티", "에너지", "전자부품", "프로젝트형", "설치", "대체재", "스마트폰부품", "휴대폰부품", "삼성전자", "카메라", "광학"] },
];

function uniqueTerms(terms: string[]) {
  const seen = new Set<string>();
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => {
      const normalized = normalizeBusinessText(term);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function getIndustryKey(companyName: string, industry: string, profile: ResearchProfile) {
  const keySource = industry.trim() || profile.label || companyName.trim() || "general";
  return normalizeBusinessText(keySource).slice(0, 80) || "general";
}

function extractBusinessSignals(text: string, profile?: ResearchProfile) {
  const normalized = normalizeBusinessText(text);
  const profileTerms = [
    ...(profile?.keywords || []),
    ...(profile?.tags || []),
    ...((profile?.requiredKeywordGroups || []).flat()),
  ];
  const lexiconTerms = businessSignalLexicon.flatMap((item) => item.terms);
  return uniqueTerms([...profileTerms, ...lexiconTerms].filter((term) => includesBusinessTerm(normalized, term)));
}

function getSignalGroups(terms: string[]) {
  const normalizedTerms = terms.map(normalizeBusinessText);
  return businessSignalLexicon
    .filter((group) => group.terms.some((term) => normalizedTerms.includes(normalizeBusinessText(term))))
    .map((group) => group.group);
}

// 적합도 계산은 경쟁사·축마다 이 함수를 호출하므로 같은 저장값을 반복 파싱하지 않도록 캐시한다.
let learnedSignalCache: { raw: string | null; signals: LearnedCompetitorSignal[] } | null = null;

function readLearnedCompetitorSignals(): LearnedCompetitorSignal[] {
  try {
    const raw = localStorage.getItem(learningStorageKey);
    if (learnedSignalCache && learnedSignalCache.raw === raw) return learnedSignalCache.signals;
    const signals = raw ? JSON.parse(raw) as LearnedCompetitorSignal[] : [];
    learnedSignalCache = { raw, signals };
    return signals;
  } catch {
    return [];
  }
}

function writeLearnedCompetitorSignals(signals: LearnedCompetitorSignal[]) {
  learnedSignalCache = null;
  try {
    localStorage.setItem(learningStorageKey, JSON.stringify(signals.slice(-120)));
  } catch {
    // 학습 메모리 저장 실패는 추천 기능을 막지 않습니다.
  }
}

function rememberCompetitorSignals(companyName: string, industry: string, profile: ResearchProfile, competitors: Competitor[]) {
  if (!industry.trim() && !profile.label) return;
  const industryKey = getIndustryKey(companyName, industry, profile);
  const now = new Date().toISOString();
  const learned = readLearnedCompetitorSignals();
  const next = [...learned];

  for (const competitor of competitors.filter((item) => item.name.trim())) {
    const terms = extractBusinessSignals([competitor.name, competitor.position, competitor.note, ...(competitor.tags || [])].join(" "), profile);
    if (!terms.length) continue;
    const normalizedName = normalizeCompanyName(competitor.name);
    const existing = next.find((item) => item.industryKey === industryKey && normalizeCompanyName(item.companyName) === normalizedName);
    if (existing) {
      existing.terms = uniqueTerms([...existing.terms, ...terms]).slice(0, 24);
      existing.count = Math.min(20, existing.count + 1);
      existing.updatedAt = now;
    } else {
      next.push({ industryKey, companyName: competitor.name, terms: terms.slice(0, 24), count: 1, updatedAt: now });
    }
  }

  writeLearnedCompetitorSignals(next);
}

function getLearnedSignalBoost(companyName: string, industry: string, profile: ResearchProfile, competitor: Competitor) {
  const industryKey = getIndustryKey(companyName, industry, profile);
  const normalizedName = normalizeCompanyName(competitor.name);
  const learned = readLearnedCompetitorSignals().find((item) => item.industryKey === industryKey && normalizeCompanyName(item.companyName) === normalizedName);
  if (!learned) return { score: 0, reason: "" };
  return {
    score: Math.min(3, learned.count),
    reason: `사용자 검증 신호 ${learned.terms.slice(0, 2).join("/")} 누적`,
  };
}

function getBusinessFitDetails(
  competitor: Competitor,
  companyName: string,
  industry: string,
  profile: ResearchProfile,
  liveCompany?: LiveCompany,
  ownCompany?: LiveCompany,
) {
  const competitorText = getCompetitorBusinessText(competitor);
  const businessText = normalizeBusinessText(`${companyName} ${industry} ${profile.label}`);
  const businessSignals = extractBusinessSignals(`${companyName} ${industry} ${profile.label}`, profile);
  const competitorSignals = extractBusinessSignals([competitor.name, competitor.position, competitor.note, ...(competitor.tags || [])].join(" "), profile);
  const sharedSignals = businessSignals.filter((term) => competitorSignals.some((candidate) => normalizeBusinessText(candidate) === normalizeBusinessText(term)));
  const sharedGroups = getSignalGroups(sharedSignals);
  const learnedBoost = getLearnedSignalBoost(companyName, industry, profile, competitor);
  const reasons: string[] = [];
  let score = 0;

  if (sharedSignals.length) {
    score += Math.min(5, sharedSignals.length);
    reasons.push(`사업특성 ${sharedSignals.slice(0, 2).join("/")} 일치`);
  }

  if (sharedGroups.length >= 2) {
    score += 2;
    reasons.push(`고객·기술·시장 신호 ${sharedGroups.slice(0, 2).join("/")} 교차`);
  }

  if (learnedBoost.score) {
    score += learnedBoost.score;
    reasons.push(learnedBoost.reason);
  }

  if (competitor.directness === "direct") {
    score += 4;
    reasons.push("직접 경쟁 태그");
  } else if (competitor.directness === "adjacent") {
    score += 2;
    reasons.push("인접 경쟁 태그");
  } else if (competitor.directness === "benchmark") {
    score += 1;
    reasons.push("벤치마크 태그");
  }

  for (const group of profile.requiredKeywordGroups || []) {
    const matched = group.filter((term) => includesBusinessTerm(businessText, term) || includesBusinessTerm(competitorText, term));
    if (matched.length) {
      score += 3;
      reasons.push(`핵심어 ${matched.slice(0, 2).join("/")} 일치`);
    } else {
      score -= 2;
    }
  }

  const tagMatches = (profile.tags || []).filter((tag) => includesBusinessTerm(competitorText, tag) || includesBusinessTerm(businessText, tag));
  if (tagMatches.length) {
    score += Math.min(4, tagMatches.length);
    reasons.push(`태그 ${tagMatches.slice(0, 2).join("/")} 일치`);
  }

  const keywordMatches = profile.keywords.filter((keyword) => includesBusinessTerm(competitorText, keyword) || includesBusinessTerm(businessText, keyword));
  if (keywordMatches.length) score += Math.min(3, keywordMatches.length);

  const negativeMatches = (profile.negativeKeywords || []).filter((keyword) => includesBusinessTerm(competitorText, keyword));
  if (negativeMatches.length) {
    score -= negativeMatches.length * 4;
    reasons.push(`제외어 ${negativeMatches.slice(0, 2).join("/")} 감점`);
  }

  if (liveCompany?.industryCode && ownCompany?.industryCode && liveCompany.industryCode === ownCompany.industryCode) {
    score += 4;
    reasons.push("DART 업종코드 일치");
  }

  const label = score >= 10 ? "매우 높음" : score >= 7 ? "높음" : score >= 4 ? "보통" : "낮음";
  return { score, label, summary: reasons.slice(0, 4).join(" · ") || `${profile.label} 기준 기본 후보` };
}

function rankCompetitorsByBusinessFit(
  competitors: Competitor[],
  companyName: string,
  industry: string,
  profile: ResearchProfile,
  liveCompanies: LiveCompany[] = [],
  ownCompany?: LiveCompany,
) {
  const normalizedCompanyName = normalizeCompanyName(companyName);
  const scored = competitors
    .filter((competitor) => {
      const normalizedCompetitorName = normalizeCompanyName(competitor.name);
      return competitor.name.trim() && normalizedCompetitorName !== normalizedCompanyName;
    })
    .map((competitor, index) => {
      const liveCompany = liveCompanies.find((company) => isCompanyNameMatch(competitor.name, company.corpName));
      const fit = getBusinessFitDetails(competitor, companyName, industry, profile, liveCompany, ownCompany);
      return { competitor, index, liveCompany, fit };
    })
    .sort((a, b) => {
      const industryMatchGap = Number(Boolean(b.liveCompany?.industryCode && ownCompany?.industryCode && b.liveCompany.industryCode === ownCompany.industryCode))
        - Number(Boolean(a.liveCompany?.industryCode && ownCompany?.industryCode && a.liveCompany.industryCode === ownCompany.industryCode));
      if (industryMatchGap) return industryMatchGap;
      if (b.fit.score !== a.fit.score) return b.fit.score - a.fit.score;
      return a.index - b.index;
    });

  if (!profile.requiredKeywordGroups?.length) return scored;

  const strongMatches = scored.filter((item) => item.fit.score >= 4);
  return strongMatches.length >= Math.min(3, scored.length) ? strongMatches : scored;
}

function scoreProfileMatch(profile: ResearchProfile, rawText: string) {
  const text = normalizeBusinessText(rawText);
  if (!text) return { profile, score: 0, longest: 0, requiredMatches: 0 };
  const keywordMatches = profile.keywords.filter((keyword) => includesBusinessTerm(text, keyword));
  const tagMatches = (profile.tags || []).filter((tag) => includesBusinessTerm(text, tag));
  const competitorMatches = profile.competitors.map((competitor) => competitor.name).filter((name) => includesBusinessTerm(text, name));
  const negativeMatches = (profile.negativeKeywords || []).filter((keyword) => includesBusinessTerm(text, keyword));
  const requiredMatches = (profile.requiredKeywordGroups || []).reduce((count, group) => count + (group.some((term) => includesBusinessTerm(text, term)) ? 1 : 0), 0);
  const longest = [...keywordMatches, ...tagMatches, ...competitorMatches].reduce((max, term) => Math.max(max, normalizeBusinessText(term).length), 0);
  let score = 0;
  score += keywordMatches.length * 4;
  score += tagMatches.length * 3;
  score += competitorMatches.length * 2;
  score += requiredMatches * 8;
  score += Math.min(12, longest);
  score -= negativeMatches.length * 10;
  if (profile.requiredKeywordGroups?.length && requiredMatches === profile.requiredKeywordGroups.length) score += 10;
  return { profile, score, longest, requiredMatches };
}

function matchProfileByText(text: string) {
  if (!text) return undefined;
  const scored = researchProfiles
    .map((profile) => scoreProfileMatch(profile, text))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.requiredMatches !== a.requiredMatches) return b.requiredMatches - a.requiredMatches;
      return b.longest - a.longest;
    });
  return scored[0]?.profile;
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
  fit?: { score: number; label: string; summary: string },
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
    reason: `${baseCompany}의 경쟁력 기준점으로 선정했습니다. ${fit ? `사업부문 적합도 ${fit.label}(${fit.summary}). ` : ""}${evidence}${liveTag ? ` (DART 확인: ${liveTag})` : ""} ${competitor.note ? `추가 근거: ${competitor.note}` : ""}`.trim(),
    source,
    industryMatch,
    fitScore: fit?.score,
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
  const profile = getResearchProfile(companyName, industry);
  return rankCompetitorsByBusinessFit(competitors, companyName, industry, profile, liveCompanies, ownCompany)
    .slice(0, 5)
    .map((item, index) => buildCandidate(item.competitor, index, companyName, industry, source, item.liveCompany, ownCompany, item.fit));
}

function needsCompetitorRefresh(competitors: Array<{ name: string }>, candidates: Array<{ name: string }>, profile: ResearchProfile, competitorsAuto: boolean) {
  return shouldAutoRefreshCompetitors({
    competitors,
    candidates,
    profile,
    isDefaultProfile: profile === defaultResearchProfile,
    competitorsAuto,
    placeholderNames: defaultGenericCompetitorNames,
  });
}

function isCompanyNameMatch(targetName: string, corpName: string) {
  const target = normalizeCompanyName(targetName);
  const corp = normalizeCompanyName(corpName);
  if (!target || !corp) return false;
  if (target === corp) return true;
  return target.length >= 4 && (corp.startsWith(target) || target.startsWith(corp));
}

async function resolveLiveCompetitors(competitors: Competitor[], apiKey: string) {
  const corpCodes = await fetchOpenDartCompanies();
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
  const corpCodes = await fetchOpenDartCompanies();
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
  const sourceLabel = liveCompanies.length ? `DART 기업목록에서 경쟁사 ${liveCompanies.length}개 매칭` : "DART 직접 매칭 없음";
  const ownSourceLabel = ownCompany ? "DART 기업목록에서 회사명 확인" : "회사명 직접 매칭 없음";

  return Object.fromEntries(
    axes.map((axis) => {
      const kosisBoost = kosisWeights[axis.key];
      const profileScore = profile.peerScores[axis.key];
      const nextPeer = Math.min(10, Math.max(1, profileScore + coverageBoost + liveBoost + kosisBoost));
      const ownAdjustment = getOwnCompanyAxisAdjustment(axis.key, industry, purpose);
      const nextOwn = Math.min(10, Math.max(1, profileScore + ownAdjustment + ownLiveBoost + Math.min(1, kosisBoost)));
      const source: NonNullable<Score["source"]> = liveCompanies.length || ownCompany ? "DART/KOSIS" : "자동 추정";
      const reasons = [
        `${ownSourceLabel} 기반 우리회사 ${axis.label} ${nextOwn}점`,
        `${sourceLabel} 기반 경쟁사 평균 ${nextPeer}점`,
        `KOSIS ${industry || profile.label} 업종·${purpose} 목적 가중치 ${kosisBoost}`,
      ];
      const confidence = Math.min(95, 45 + (ownCompany ? 15 : 0) + (liveCompanies.length ? 20 : 0) + (currentScores[axis.key].note ? 10 : 0));
      const note = `${companyName || "우리회사"} ${axis.label} 점수는 ${nextOwn}점으로 산정했습니다. 근거: ${ownSourceLabel}, KOSIS ${industry || profile.label} 업종 관점, 분석 목적 ${purpose}. ${competitorNames} 기준 경쟁사 평균은 ${nextPeer}점입니다. 근거: ${sourceLabel}. 내부 실적 지표 입력 후 보정하세요.`;

      return [axis.key, { ...currentScores[axis.key], own: nextOwn, peer: nextPeer, note, source, confidence, reasons }];
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
  const savedCandidates = saved.competitorCandidates || [];
  // 저장 데이터에 출처 표시가 없으면 사용자 입력으로 간주해 덮어쓰지 않는다.
  const savedCompetitorsAuto = saved.competitorsAuto ?? false;
  const needsRefresh = needsCompetitorRefresh(savedCompetitors, savedCandidates, profile, savedCompetitorsAuto);
  const competitors = needsRefresh ? clone(profile.competitors) : savedCompetitors;
  const competitorCandidates = needsRefresh
    ? buildCandidates(profile.competitors, saved.companyName || "", saved.industry || "", "업종 키워드")
    : savedCandidates;

  return {
    ...clone(defaultState),
    ...saved,
    role: executiveRoles.some((item) => item.role === saved.role) ? saved.role as ExecutiveRole : defaultState.role,
    competitors,
    scores: { ...clone(defaultState.scores), ...saved.scores },
    swot: migrateSwotValue(saved.swot),
    suppliers: saved.suppliers?.length ? saved.suppliers.map((supplier) => hydrateSupplier(supplier)) : clone(defaultState.suppliers),
    actions: saved.actions?.length ? saved.actions : clone(defaultState.actions),
    liveCompetitors: saved.liveCompetitors || [],
    competitorCandidates,
    researchStatus: sanitizeResearchStatus(saved.researchStatus),
    competitorsAuto: needsRefresh ? true : savedCompetitorsAuto,
  };
}

async function loadDartCompanies() {
  const response = await fetch(dartCacheUrl);
  if (!response.ok) {
    throw new Error(`DART 기업목록 조회 실패 (${response.status})`);
  }
  const data = await response.json();
  const companies = ((data.companies || []) as LiveCompany[])
    .filter((company) => company.corpCode && company.corpName)
    // 구버전 캐시는 industryCode에 업종 설명문을 담았다. "업종코드 일치" 판정이 잘못되지 않도록 숫자 코드만 인정한다.
    .map((company) => (company.industryCode && !/^\d+$/.test(company.industryCode) ? { ...company, industryCode: "" } : company));
  if (!companies.length) {
    throw new Error("DART 기업목록이 비어 있습니다. OpenDART 키를 설정하고 node scripts/prefetch-opendart.mjs를 실행하세요.");
  }
  return companies;
}

// 전체 기업목록은 세션 중 바뀌지 않으므로 한 번만 받아 재사용한다.
let dartCompaniesRequest: Promise<LiveCompany[]> | undefined;

function fetchOpenDartCompanies() {
  if (!dartCompaniesRequest) {
    dartCompaniesRequest = loadDartCompanies().catch((error) => {
      dartCompaniesRequest = undefined;
      throw error;
    });
  }
  return dartCompaniesRequest;
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

const ScmFlowMap = lazy(() => import("./ScmFlowMap"));

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

function getPurposeDueMonth(offsetMonths = 3) {
  const due = new Date();
  due.setMonth(due.getMonth() + offsetMonths);
  return due.toISOString().slice(0, 7);
}

function buildDepartmentActionPlans(state: AppState, biggestGap: { label: string; gap: number }, tows: TowsStrategy[]): DepartmentActionPlan[] {
  const due = getPurposeDueMonth(3);
  const firstTows = tows[0]?.logic || `${state.purpose} 목적의 경쟁력 개선 전략을 구체화`;
  return [
    {
      department: "전략기획",
      task: `${state.industry || "핵심 사업"} 시장 진입·포트폴리오·제휴 옵션 비교`,
      owner: "전략기획",
      kpi: "전략 옵션 3개, 의사결정 기준 5개",
      due,
      rationale: firstTows,
    },
    {
      department: "마케팅",
      task: "타깃 고객·포지셔닝·채널·가격 대응안 수립",
      owner: "마케팅",
      kpi: "고객군 3개, 채널별 가격/메시지 초안",
      due,
      rationale: `${state.purpose} 관점에서 시장·채널 경쟁력을 강화합니다.`,
    },
    {
      department: "경영지원",
      task: "실행 조직·인력·예산·KPI 운영안 확정",
      owner: "경영지원",
      kpi: "부서별 R&R, 예산안, KPI 대시보드 초안",
      due,
      rationale: "전략 과제를 실행 가능한 관리 체계로 전환합니다.",
    },
    {
      department: "운영/SCM",
      task: `${biggestGap.label} 격차 축소를 위한 공급망·생산성·납기·품질 개선`,
      owner: "운영/SCM",
      kpi: "납기 준수율, 품질 이슈, 대체 공급처 지표",
      due,
      rationale: `${biggestGap.label} 개선축을 운영 실행 과제로 연결합니다.`,
    },
    {
      department: "재무",
      task: "수익성·투자여력·비용구조 기준의 실행안 검증",
      owner: "재무",
      kpi: "ROI, 원가 개선액, 투자 한도, 현금흐름 영향",
      due,
      rationale: "전략 실행의 재무 타당성과 리스크 허용 범위를 점검합니다.",
    },
  ];
}

function buildDecisionAgendas(state: AppState, executiveSummary: ReturnType<typeof getExecutiveSummary>, departmentPlans: DepartmentActionPlan[]): DecisionAgenda[] {
  const roleLanguage = getRoleLanguage(state.role);
  return [
    { title: roleLanguage.question, owner: executiveSummary.role.label, decision: executiveSummary.decisionRequest },
    { title: "Top5 경쟁사 대응 우선순위", owner: "전략기획", decision: "직접 경쟁사, 인접 경쟁사, 벤치마크 회사를 구분해 대응 순서를 확정" },
    { title: "부서별 실행 KPI 승인", owner: "경영지원", decision: `${departmentPlans.length}개 부서 과제의 책임자, KPI, 기한 승인` },
    { title: "90일 내 확인할 핵심 리스크", owner: "C레벨", decision: `${state.purpose} 추진 중 중단 조건과 리스크 모니터링 기준 확정` },
  ];
}

function getExecutiveSummary(state: AppState, biggestGap: { label: string; gap: number }, validCompetitors: Competitor[]) {
  const role = getExecutiveRole(state.role);
  const competitorCount = validCompetitors.length || state.competitorCandidates.length || state.competitors.filter((competitor) => competitor.name.trim()).length;
  const priorityAxisLabels = role.primaryAxes.map((key) => axes.find((axis) => axis.key === key)?.label).filter(Boolean).join(" · ");
  const decisionRequest = state.purpose.includes("가격")
    ? "가격 방어선과 할인 허용 범위를 확정하세요."
    : state.purpose.includes("채널")
      ? "우선 공략 채널과 고객군별 메시지를 확정하세요."
      : state.purpose.includes("M&A") || state.purpose.includes("투자")
        ? "투자 기준, 실사 항목, 중단 조건을 확정하세요."
        : state.purpose.includes("SCM")
          ? "핵심 공급망 리스크와 대체 조달 기준을 확정하세요."
          : "자원 배분 우선순위와 90일 실행 책임을 확정하세요.";
  const riskSignal = biggestGap.gap >= 3 ? `${biggestGap.label} 격차가 커 즉시 보완이 필요합니다.` : `${biggestGap.label} 격차를 관리하면서 강점 확대가 가능합니다.`;

  const roleLanguage = getRoleLanguage(state.role);
  return {
    role,
    roleLanguage,
    competitorCount,
    priorityAxisLabels,
    riskSignal,
    decisionRequest,
    headline: `${role.label} 관점에서 ${state.purpose} 목적의 경쟁력 판단을 정리합니다.`,
  };
}

function buildMarkdownReport(state: AppState, scoreAverage: number, biggestGap: { label: string; gap: number }, tows: TowsStrategy[], departmentPlans: DepartmentActionPlan[], decisionAgendas: DecisionAgenda[]) {
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
  const departmentRows = departmentPlans
    .map((plan) => `| ${plan.department} | ${fallback(plan.task, "-")} | ${fallback(plan.kpi, "-")} | ${fallback(plan.due, "-")} |`)
    .join("\n");
  const agendaRows = decisionAgendas
    .map((agenda) => `| ${agenda.title} | ${agenda.owner} | ${agenda.decision} |`)
    .join("\n");

  return `# ${fallback(state.companyName, "우리 회사")} 경쟁력 분석 보고서

## 경영진 요약
- 산업: ${fallback(state.industry, "미입력")}
- 분석 관점: ${getExecutiveRole(state.role).label}
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
- 강점: ${getSwotItemText(state.swot.strengths).join(", ") || "-"}
- 약점: ${getSwotItemText(state.swot.weaknesses).join(", ") || "-"}
- 기회: ${getSwotItemText(state.swot.opportunities).join(", ") || "-"}
- 위협: ${getSwotItemText(state.swot.threats).join(", ") || "-"}

${tows.map((item) => `- ${item.label} ${item.name}: ${item.logic} / 90일 액션: ${item.action90} / KPI: ${item.kpi} / 우선순위: ${item.priority}`).join("\n")}

## SCM 리스크
| 공급처 | 의존도 | 리드타임 | 위험도 |
| --- | ---: | ---: | --- |
${supplierRows || "| - | - | - | - |"}

## 부서별 실행 KPI
| 부서 | 실행 과제 | KPI | 기한 |
| --- | --- | --- | --- |
${departmentRows || "| - | - | - | - |"}

## 의사결정 안건
| 안건 | 오너 | 결정할 내용 |
| --- | --- | --- |
${agendaRows || "| - | - | - |"}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedScmIndex, setSelectedScmIndex] = useState<number | null>(null);

  useEffect(() => {
    document.title = appName;
  }, []);

  // 키 입력마다 동기 저장하면 입력이 밀리므로 마지막 변경 후 300ms에 한 번만 저장한다.
  const latestState = useRef(state);
  latestState.current = state;

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(state));
      setSaved(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [state]);

  // 디바운스 대기 중에 탭을 닫아도 입력이 사라지지 않도록 이탈 시점에 즉시 저장한다.
  useEffect(() => {
    const flush = () => localStorage.setItem(storageKey, JSON.stringify(latestState.current));
    const flushOnHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushOnHide);
    };
  }, []);

  const scoreAverage = useMemo(() => weightedScore(state.scores, state.purpose, state.role), [state.purpose, state.role, state.scores]);
  const biggestGap = useMemo(
    () => axes.map((axis) => ({ label: axis.label, gap: Math.max(0, state.scores[axis.key].peer - state.scores[axis.key].own) })).sort((a, b) => b.gap - a.gap)[0],
    [state.scores],
  );
  const researchProfile = useMemo(() => getResearchProfile(state.companyName, state.industry), [state.companyName, state.industry]);
  const tows = useMemo(() => buildTowsStrategies(state), [state.swot]);
  const swotDrafts = useMemo(() => buildSwotDrafts(state, researchProfile), [researchProfile, state.companyName, state.competitors, state.industry, state.scores]);
  const swotCoachQuestions = useMemo(() => buildSwotCoachQuestions(state, researchProfile, biggestGap), [biggestGap, researchProfile, state.competitors, state.industry, state.scores]);
  const coreSwotItems = useMemo(() => getCoreSwotItems(state.swot), [state.swot]);
  const scmRiskSummary = useMemo(() => buildScmRiskSummary(state.suppliers), [state.suppliers]);
  const highRiskSuppliers = scmRiskSummary.highRiskNodes;
  const validActions = state.actions.filter((action) => action.task || action.owner || action.kpi || action.due);
  const validCompetitors = useMemo(() => state.competitors.filter((competitor) => competitor.name.trim()), [state.competitors]);
  const competitorAxisScores = useMemo(() => buildCompetitorAxisScores(researchProfile, validCompetitors, state.companyName, state.industry), [researchProfile, state.companyName, state.industry, validCompetitors]);
  const axisDetails = useMemo(() => buildAxisDetails(state, researchProfile, competitorAxisScores, state.liveCompetitors), [competitorAxisScores, researchProfile, state.liveCompetitors, state.scores]);
  const axisWeights = useMemo(() => getPurposeAxisWeights(state.purpose, state.role), [state.purpose, state.role]);
  const scmCompetitorRows = useMemo(() => buildScmCompetitorRows(validCompetitors, competitorAxisScores, scmRiskSummary), [competitorAxisScores, scmRiskSummary, validCompetitors]);
  const scmFlow = useMemo(() => buildScmFlow(state.suppliers), [state.suppliers]);
  const displayCandidates = useMemo(
    () => (state.competitorCandidates.length ? state.competitorCandidates : buildCandidates(validCompetitors, state.companyName, state.industry)),
    [state.companyName, state.competitorCandidates, state.industry, validCompetitors],
  );
  const executiveSummary = useMemo(() => getExecutiveSummary(state, biggestGap, validCompetitors), [biggestGap, state.competitorCandidates, state.competitors, state.purpose, state.role, validCompetitors]);
  const departmentPlans = useMemo(() => buildDepartmentActionPlans(state, biggestGap, tows), [biggestGap, state.industry, state.purpose, tows]);
  const decisionAgendas = useMemo(() => buildDecisionAgendas(state, executiveSummary, departmentPlans), [departmentPlans, executiveSummary, state.purpose]);
  const tabs = [
    ["overview", ClipboardList, "개요"],
    ["scorecard", BarChart3, "6축 진단"],
    ["swot", FileText, "SWOT/TOWS"],
    ["scm", Network, "SCM"],
    ["actions", Target, "실행 KPI"],
    ["report", FileText, "보고서"],
  ] as const;

  useEffect(() => {
    if (!validCompetitors.length || (!state.industry.trim() && researchProfile === defaultResearchProfile)) return;
    // 학습 메모리도 localStorage 동기 쓰기이므로 입력이 멈춘 뒤 한 번만 기록한다.
    const timer = window.setTimeout(() => rememberCompetitorSignals(state.companyName, state.industry, researchProfile, validCompetitors), 400);
    return () => window.clearTimeout(timer);
  }, [researchProfile, state.companyName, state.industry, validCompetitors]);

  useEffect(() => {
    if (!needsCompetitorRefresh(state.competitors, state.competitorCandidates, researchProfile, state.competitorsAuto)) return;

    setState((current) => {
      const profile = getResearchProfile(current.companyName, current.industry);
      return {
        ...current,
        competitors: profile.competitors,
        competitorsAuto: true,
        liveCompetitors: [],
        competitorCandidates: buildCandidates(profile.competitors, current.companyName, current.industry, "업종 키워드"),
        researchStatus: `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 실제 회사명으로 다시 제안했습니다. DART 공시와 KOSIS 산업통계 관점의 비교 가능성을 기준으로 선정했습니다.`,
      };
    });
  }, [researchProfile, state.companyName, state.competitors, state.competitorCandidates, state.competitorsAuto, state.industry]);

  const update = (patch: Partial<AppState>) => setState((current) => ({ ...current, ...patch }));
  const updateScore = (key: AxisKey, patch: Partial<Score>) => setState((current) => ({ ...current, scores: { ...current.scores, [key]: { ...current.scores[key], ...patch } } }));
  const replaceCompetitor = (index: number, patch: Partial<Competitor>) => update({ competitors: state.competitors.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)), competitorsAuto: false });
  const replaceSupplier = (index: number, patch: Partial<Supplier>) => update({ suppliers: state.suppliers.map((row, rowIndex) => (rowIndex === index ? hydrateSupplier({ ...row, ...patch }) : row)) });
  const replaceAction = (index: number, patch: Partial<Action>) => update({ actions: state.actions.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
  const updateSwotItem = (category: SwotCategory, id: string, patch: Partial<SwotItem>) => setState((current) => ({
    ...current,
    swot: { ...current.swot, [category]: current.swot[category].map((item) => item.id === id ? { ...item, ...patch } : item) },
  }));
  const addSwotItem = (category: SwotCategory) => setState((current) => ({
    ...current,
    swot: { ...current.swot, [category]: [...current.swot[category], createSwotItem(category)] },
  }));
  const removeSwotItem = (category: SwotCategory, id: string) => setState((current) => {
    const nextItems = current.swot[category].filter((item) => item.id !== id);
    return { ...current, swot: { ...current.swot, [category]: nextItems.length ? nextItems : [createSwotItem(category)] } };
  });
  const applySwotDrafts = () => setState((current) => ({
    ...current,
    swot: Object.fromEntries(swotCategories.map(({ key }) => {
      const existing = current.swot[key].filter((item) => item.content.trim());
      return [key, existing.length ? [...existing, ...swotDrafts[key]] : swotDrafts[key]];
    })) as Record<SwotCategory, SwotItem[]>,
  }));
  const addTowsAction = (strategy: TowsStrategy) => addDepartmentPlan({
    department: strategy.owner,
    task: `[${strategy.label}] ${strategy.action90}`,
    owner: strategy.owner,
    kpi: strategy.kpi,
    due: getPurposeDueMonth(3),
    rationale: strategy.logic,
  });
  const syncScmScore = () => setState((current) => {
    const summary = buildScmRiskSummary(current.suppliers);
    const currentScm = current.scores.scm;
    const peerScore = Math.max(currentScm.peer, 7);
    return {
      ...current,
      scores: {
        ...current.scores,
        scm: {
          ...currentScm,
          own: summary.recommendedScore,
          peer: peerScore,
          source: "사용자 입력",
          confidence: Math.min(95, 55 + summary.highRiskNodes.length * 8),
          reasons: [
            `Step 4 SCM 평균 위험도 ${summary.averageRisk}점, 최대 ${summary.maxRisk}점`,
            summary.highRiskNodes.length ? `고위험 노드 ${summary.highRiskNodes.map((node) => node.name || node.type).join(" · ")}` : "고위험 노드 없음",
            `자동 권고 SCM 점수 ${summary.recommendedScore}점`,
          ],
          note: `${summary.headline} Step 4 SCM 리스크 기반으로 우리회사 SCM 점수를 ${summary.recommendedScore}점으로 보정했습니다.`,
        },
      },
    };
  });
  const addScmWeakness = () => setState((current) => {
    const summary = buildScmRiskSummary(current.suppliers);
    const item = buildScmWeaknessItem(summary);
    const exists = current.swot.weaknesses.some((weakness) => weakness.content === item.content);
    return exists ? current : { ...current, swot: { ...current.swot, weaknesses: [...current.swot.weaknesses.filter((weakness) => weakness.content.trim()), item] } };
  });
  const addScmAction = () => addDepartmentPlan(buildScmActionPlan(scmRiskSummary));
  const focusScmNode = (nodeId: string) => {
    if (!nodeId.startsWith("scm-")) return;
    const index = Number(nodeId.replace("scm-", ""));
    if (!Number.isFinite(index)) return;
    setSelectedScmIndex(index);
    window.setTimeout(() => document.getElementById(`scm-node-row-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const addDepartmentPlan = (plan: DepartmentActionPlan) => setState((current) => {
    const nextAction: Action = { task: plan.task, owner: plan.owner, kpi: plan.kpi, due: plan.due };
    const hasSameTask = current.actions.some((action) => action.task.trim() === nextAction.task.trim());
    if (hasSameTask) return current;
    const emptyIndex = current.actions.findIndex((action) => !action.task && !action.owner && !action.kpi && !action.due);
    if (emptyIndex >= 0) {
      return { ...current, actions: current.actions.map((action, index) => index === emptyIndex ? nextAction : action) };
    }
    return { ...current, actions: [...current.actions, nextAction] };
  });
  const researchCompetitors = async () => {
    const suggestedCompetitors = researchProfile.competitors;
    const openDartKey = envOpenDartKey;

    setState((current) => ({
      ...current,
      competitors: suggestedCompetitors,
      competitorsAuto: true,
      competitorCandidates: buildCandidates(suggestedCompetitors, current.companyName, current.industry, "업종 키워드"),
      liveCompetitors: [],
      researchStatus: `${current.companyName || "우리회사"} 기준 Top5 경쟁사를 조사 중입니다. DART 전체 기업목록과 업종 관점을 함께 사용합니다.`,
    }));

    try {
      const corpCodes = await fetchOpenDartCompanies();
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
        competitorsAuto: true,
        liveCompetitors: liveCompanies,
        competitorCandidates: candidates,
        researchStatus: liveCompanies.length
          ? `${state.companyName || "우리회사"} 기준 Top5 경쟁사 중 DART 기업목록에서 ${liveCompanies.length}개 회사를 확인했습니다.${industryMatchCount ? ` 이 중 ${industryMatchCount}개사는 ${ownCompany?.industryCode ? `업종코드 ${ownCompany.industryCode}` : "동일 업종코드"}가 일치해 등록 데이터 기준으로 직접 비교가 가능합니다.` : " KOSIS 산업통계는 시장규모·업종 추세를 보정하는 근거로 함께 사용합니다."}`
          : `${state.companyName || "우리회사"} 기준으로 DART 기업목록 직접 매칭이 어려워 업종 키워드 관점으로 Top5 경쟁사를 제안했습니다.`,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        competitors: suggestedCompetitors,
        competitorsAuto: true,
        liveCompetitors: [],
        competitorCandidates: buildCandidates(suggestedCompetitors, current.companyName, current.industry, "업종 키워드"),
        researchStatus: `${error instanceof Error ? error.message : "실시간 조회 실패"} 현재는 ${current.companyName || "우리회사"} 기준 Top5 경쟁사를 업종 키워드와 DART/KOSIS 선정 기준에 맞춰 표시합니다.`,
      }));
    }
  };
  const compareCompetitiveness = async () => {
    if (isComparing) return;

    // 사용자가 입력·편집한 목록이 있으면 그대로 비교하고, 없을 때만 프로파일 목록으로 채운다.
    const baseCompetitors = validCompetitors.length ? validCompetitors : researchProfile.competitors;
    const baseCompetitorsAuto = validCompetitors.length ? state.competitorsAuto : true;
    const openDartKey = envOpenDartKey;

    setIsComparing(true);
    setState((current) => ({
      ...current,
      competitors: baseCompetitors,
      competitorsAuto: baseCompetitorsAuto,
      liveCompetitors: [],
      competitorCandidates: current.competitorCandidates.length
        ? current.competitorCandidates
        : buildCandidates(baseCompetitors, current.companyName, current.industry, "DART/KOSIS"),
      researchStatus: `${current.companyName || "우리회사"} 기준 경쟁력 비교를 진행 중입니다. DART 전체 기업목록과 업종 관점으로 6축 경쟁사 평균을 산정합니다.`,
    }));

    try {
      const liveResults = await resolveLiveCompetitors(baseCompetitors, openDartKey);
      const nextCompetitors = liveResults.length ? liveResults.map((result) => result.competitor) : baseCompetitors;
      const liveCompanies = liveResults.map((result) => result.liveCompany).filter(Boolean) as LiveCompany[];
      const ownCompany = await resolveLiveCompany(state.companyName, openDartKey);
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
        competitorsAuto: baseCompetitorsAuto,
        liveCompetitors: liveCompanies,
        competitorCandidates: buildCandidates(nextCompetitors, current.companyName, current.industry, "DART/KOSIS", liveCompanies, ownCompany),
        scores: nextScores,
        researchStatus: liveCompanies.length
          ? `${current.companyName || "우리회사"} 기준 경쟁력 비교를 완료했습니다. DART 기업목록에서 경쟁사 ${liveCompanies.length}개${ownCompany ? "와 우리회사" : ""}를 확인했고, KOSIS ${current.industry || researchProfile.label} 업종 관점으로 우리회사와 경쟁사 평균을 함께 보정했습니다.${ownCompany?.industryCode ? ` 업종코드 ${ownCompany.industryCode} 일치 후보는 추천 목록 상단에 우선 배치했습니다.` : ""}`
          : `${current.companyName || "우리회사"} 기준 경쟁력 비교를 완료했습니다. DART 기업목록 직접 매칭이 부족해 회사명·산업·분석목적과 ${current.industry || researchProfile.label} 업종 관점으로 우리회사와 경쟁사 평균을 산정했습니다.`,
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
        competitorsAuto: baseCompetitorsAuto,
        competitorCandidates: buildCandidates(baseCompetitors, current.companyName, current.industry, "업종 키워드"),
        scores: nextScores,
        researchStatus: `${error instanceof Error ? error.message : "DART/KOSIS 비교 조회 실패"} KOSIS 업종 관점과 입력된 회사/경쟁사 정보로 6축 점수를 산정했습니다.`,
      }));
    } finally {
      setIsComparing(false);
      setActive("scorecard");
    }
  };

  // 현재 작업 내용이 있을 때만 확인을 받는다. 빈 화면에서는 불필요한 확인창을 띄우지 않는다.
  const confirmDiscard = (message: string) => !hasUserInput({
    companyName: state.companyName,
    industry: state.industry,
    competitors: state.competitors,
    swotItems: swotCategories.flatMap(({ key }) => state.swot[key]),
    suppliers: state.suppliers,
    actions: state.actions,
  }) || window.confirm(message);

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const result = parseStateFile(await file.text());
    if (!result.ok) {
      window.alert(`가져오기를 취소했습니다.\n\n${result.message}`);
      return;
    }
    if (!confirmDiscard(`${file.name} 파일로 현재 입력한 내용을 덮어씁니다. 계속하시겠습니까?`)) return;
    setState(hydrateState(result.value as Partial<AppState>));
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
    // 보고서 본문은 화면에 쓰이지 않으므로 내보낼 때만 생성한다.
    const markdownReport = buildMarkdownReport(state, scoreAverage, biggestGap, tows, departmentPlans, decisionAgendas);
    const blob = new Blob([markdownReport], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${state.companyName || "competitive-analysis"}-report.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="sidebar">
        <div className="sidebar-topline">
          <div className="brand"><div className="brand-mark"><img src={`${import.meta.env.BASE_URL}cca-app-icon.png`} alt="CCA" /></div><div className="brand-text"><strong>{appName}</strong></div></div>
          <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"} title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}>{sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button>
        </div>
        <nav aria-label="분석 단계">
          {tabs.map(([id, Icon, label]) => <button className={active === id ? "active" : ""} key={id} onClick={() => setActive(id)} type="button" title={sidebarCollapsed ? label : undefined}><Icon size={18} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-actions">
          <button type="button" onClick={() => { if (confirmDiscard("현재 입력한 내용을 샘플 데이터로 덮어씁니다. 계속하시겠습니까?")) setState(clone(sampleState)); }} title={sidebarCollapsed ? "샘플" : undefined}><RefreshCw size={17} /><span>샘플</span></button>
          <button type="button" onClick={() => { if (confirmDiscard("현재 입력한 내용을 모두 지우고 초기 상태로 되돌립니다. 되돌릴 수 없으니 필요하면 먼저 JSON으로 내보내세요. 계속하시겠습니까?")) setState(clone(defaultState)); }} title={sidebarCollapsed ? "초기화" : undefined}><Trash2 size={17} /><span>초기화</span></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Executive Strategy Cockpit</p><h1>우리 회사의 경쟁력을 비교하고, 경영 실행 과제로 연결하세요</h1></div>
          <div className="topbar-actions"><span className="save-pill">{saved ? "저장됨" : "저장 중"}</span><label title="JSON 가져오기"><Upload size={19} /><span className="visually-hidden">JSON 가져오기</span><input type="file" accept="application/json,.json" hidden onChange={(event) => { const input = event.target; const file = input.files?.[0]; input.value = ""; void importJson(file); }} /></label><button type="button" onClick={exportJson} aria-label="JSON 내보내기"><Download size={19} /></button><button type="button" onClick={exportMarkdown} aria-label="Markdown 보고서 내보내기"><FileText size={19} /></button><button type="button" onClick={() => window.print()} aria-label="보고서 인쇄"><Printer size={19} /></button></div>
        </header>

        {active === "overview" && (
          <Panel eyebrow="Step 1" title="분석 범위 설정">
            <div className="form-grid executive-scope-grid">
              <label>회사명<input value={state.companyName} onChange={(event) => update({ companyName: event.target.value, competitorCandidates: [], researchStatus: "" })} placeholder="예: 한빛정밀" /></label>
              <label>산업<input value={state.industry} onChange={(event) => update({ industry: event.target.value, competitorCandidates: [], researchStatus: "" })} placeholder="예: 자동차 부품 제조" /></label>
              <label>분석 관점<select value={state.role} onChange={(event) => update({ role: event.target.value as ExecutiveRole })}>{executiveRoles.map((item) => <option key={item.role} value={item.role}>{item.label}</option>)}</select></label>
              <label>분석 목적<select value={state.purpose} onChange={(event) => update({ purpose: event.target.value })}>{analysisPurposes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>분석 기간<select value={state.period} onChange={(event) => update({ period: event.target.value })}>{["최근 3년", "최근 1년", "향후 6개월", "향후 12개월"].map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <section className="executive-summary-grid" aria-label="임원용 요약 대시보드">
              <article>
                <span>분석 관점</span>
                <strong>{executiveSummary.role.label}</strong>
                <p>{executiveSummary.role.focus}</p>
              </article>
              <article>
                <span>핵심 판단</span>
                <strong>{scoreAverage}점 · {biggestGap.label}</strong>
                <p>{executiveSummary.riskSignal}</p>
              </article>
              <article>
                <span>비교 범위</span>
                <strong>{executiveSummary.competitorCount || 0}개 경쟁사</strong>
                <p>{executiveSummary.priorityAxisLabels} 축을 우선 확인합니다.</p>
              </article>
              <article>
                <span>의사결정 요청</span>
                <strong>{state.purpose}</strong>
                <p>{executiveSummary.decisionRequest}</p>
              </article>
            </section>
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
                <p>{state.researchStatus || `경쟁사 조사를 누르면 입력한 회사명을 기준으로 DART 전체 기업목록과 업종 관점의 Top5 경쟁사를 제안합니다.${isLocalHost ? ` 로컬 DART 키${envOpenDartKey ? "가 연결되어" : "를 넣으면"} 대표자·업종코드까지 보강합니다.` : ""}`}</p>
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
            <EditableList title="벤치마크 경쟁사" addLabel="경쟁사" rows={state.competitors} onAdd={() => update({ competitors: [...state.competitors, { name: "", position: "", note: "" }], competitorsAuto: false })} onRemove={(index) => update({ competitors: state.competitors.filter((_, rowIndex) => rowIndex !== index), competitorsAuto: false })}>
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
                  const detail = axisDetails.find((item) => item.axis === axis.key);
                  return <article className="axis-card" key={axis.key}>
                    <div className="axis-title"><Icon size={20} /><div><strong>{axis.label}</strong><span>{axis.hint}</span></div><em>가중치 {axisWeights[axis.key].toFixed(1)}x</em></div>
                    <div className="range-grid"><label>우리 회사 <b>{score.own}</b><input type="range" min="1" max="10" value={score.own} onChange={(event) => updateScore(axis.key, { own: Number(event.target.value), source: "사용자 입력" })} /></label><label>경쟁사 평균 <b>{score.peer}</b><input type="range" min="1" max="10" value={score.peer} onChange={(event) => updateScore(axis.key, { peer: Number(event.target.value), source: "사용자 입력" })} /></label></div>
                    <div className="axis-evidence-strip"><span>{detail?.source || "자동 추정"}</span><span>근거 신뢰도 {detail?.confidence || 45}%</span><span>{score.own >= score.peer ? "우위/동률" : `격차 ${score.peer - score.own}점`}</span></div>
                    <div className="submetric-grid">
                      {(detail?.subMetrics || []).map((metric) => <div key={metric.label}><strong>{metric.label}</strong><span>우리 {metric.own} · 경쟁 {metric.peer}</span><small>{metric.reason}</small></div>)}
                    </div>
                    <div className="score-reason-list">{(detail?.reasons || []).slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}</div>
                    <input value={score.note} onChange={(event) => updateScore(axis.key, { note: event.target.value, source: "사용자 입력" })} placeholder="판단 근거와 출처" />
                  </article>;
                })}
              </div>
              <div className="chart-panel"><ScoreRing value={scoreAverage} /><Radar scores={state.scores} /><div className="legend"><span className="own-dot">우리 회사</span><span className="peer-dot">경쟁사 평균</span></div><div className="weight-panel"><strong>목적별 가중치</strong>{axes.map((axis) => <span key={axis.key}>{axis.label} {axisWeights[axis.key].toFixed(1)}x</span>)}</div></div>
            </div>
            <section className="competitor-score-panel">
              <div className="candidate-heading"><strong>Top5 경쟁사별 6축 추정 점수</strong><span>경쟁사 평균은 개별 후보의 사업부문 적합도와 프로파일 점수를 함께 반영합니다.</span></div>
              <div className="competitor-score-table">
                <div><strong>경쟁사</strong>{axes.map((axis) => <strong key={axis.key}>{axis.label}</strong>)}<strong>근거</strong></div>
                {(competitorAxisScores.length ? competitorAxisScores : buildCompetitorAxisScores(researchProfile, researchProfile.competitors, state.companyName, state.industry)).map((row) => (
                  <div key={row.competitor}><span>{row.competitor}</span>{axes.map((axis) => <span key={axis.key}>{row.scores[axis.key]}</span>)}<span>{row.reason}</span></div>
                ))}
              </div>
            </section>
          </Panel>
        )}

        {active === "swot" && (
          <Panel eyebrow="Step 3" title="구조화 SWOT에서 TOWS 실행전략으로" action={<button className="secondary" type="button" onClick={applySwotDrafts}><Wand2 size={17} />SWOT 초안 생성</button>}>
            <section className="swot-coach-panel">
              <div>
                <strong>질문 기반 SWOT 코치</strong>
                <p>6축 진단, Top5 경쟁사, 사업특성 신호를 바탕으로 핵심 질문을 제안합니다.</p>
              </div>
              <div className="coach-question-list">
                {swotCoachQuestions.map((question) => <span key={question}>{question}</span>)}
              </div>
            </section>

            <div className="swot-grid structured">
              {swotCategories.map((category) => (
                <section className={`swot-card ${category.tone}`} key={category.key}>
                  <div className="swot-card-head">
                    <div><strong>{category.label}</strong><span>{category.placeholder}</span></div>
                    <button type="button" onClick={() => addSwotItem(category.key)} aria-label={`${category.label} 항목 추가`}><Plus size={16} /></button>
                  </div>
                  <div className="swot-item-list">
                    {state.swot[category.key].map((item) => (
                      <article className="swot-item-card" key={item.id}>
                        <label>내용<input value={item.content} onChange={(event) => updateSwotItem(category.key, item.id, { content: event.target.value })} placeholder={category.placeholder} /></label>
                        <label>근거<input value={item.evidence} onChange={(event) => updateSwotItem(category.key, item.id, { evidence: event.target.value })} placeholder="DART/KOSIS, 경쟁사 비교표, 내부 지표 등" /></label>
                        <div className="swot-mini-grid">
                          <label>영향도 <b>{item.impact}</b><input type="range" min="1" max="5" value={item.impact} onChange={(event) => updateSwotItem(category.key, item.id, { impact: Number(event.target.value) })} /></label>
                          <label>확실성 <b>{item.certainty}</b><input type="range" min="1" max="5" value={item.certainty} onChange={(event) => updateSwotItem(category.key, item.id, { certainty: Number(event.target.value) })} /></label>
                        </div>
                        <div className="swot-mini-grid">
                          <label>관련 경쟁사<select value={item.competitor} onChange={(event) => updateSwotItem(category.key, item.id, { competitor: event.target.value })}><option value="">선택 없음</option>{validCompetitors.map((competitor) => <option key={competitor.name} value={competitor.name}>{competitor.name}</option>)}</select></label>
                          <label>관련 6축<select value={item.axis} onChange={(event) => updateSwotItem(category.key, item.id, { axis: event.target.value as AxisKey })}>{axes.map((axis) => <option key={axis.key} value={axis.key}>{axis.label}</option>)}</select></label>
                        </div>
                        <button className="text-danger" type="button" onClick={() => removeSwotItem(category.key, item.id)}><Trash2 size={15} />항목 삭제</button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="swot-matrix-panel">
              <div><strong>중요도-확실성 매트릭스</strong><p>영향도와 확실성이 높은 항목을 TOWS 핵심 재료로 우선 사용합니다.</p></div>
              <div className="matrix-grid">
                <article><span>핵심 재료</span>{swotCategories.flatMap(({ key }) => coreSwotItems[key].filter((item) => item.impact >= 4 && item.certainty >= 4).map((item) => <strong key={item.id}>{item.content}</strong>))}</article>
                <article><span>검증 필요</span>{swotCategories.flatMap(({ key }) => coreSwotItems[key].filter((item) => item.impact >= 4 && item.certainty < 4).map((item) => <strong key={item.id}>{item.content}</strong>))}</article>
                <article><span>보조 메모</span>{swotCategories.flatMap(({ key }) => coreSwotItems[key].filter((item) => item.impact < 4).slice(0, 3).map((item) => <strong key={item.id}>{item.content}</strong>))}</article>
              </div>
            </section>

            <div className="strategy-grid expanded">{tows.map((strategy) => <article key={strategy.label}><div className="strategy-head"><strong>{strategy.label} · {strategy.name}</strong><span>{strategy.priority}</span></div><p>{strategy.logic}</p><dl><dt>90일 액션</dt><dd>{strategy.action90}</dd><dt>KPI</dt><dd>{strategy.kpi}</dd><dt>리스크</dt><dd>{strategy.risk}</dd></dl><button type="button" onClick={() => addTowsAction(strategy)}><Plus size={15} />실행 과제로 전환</button></article>)}</div>
          </Panel>
        )}

        {active === "scm" && (
          <Panel eyebrow="Step 4" title="SCM 네트워크와 리스크">
            <section className="scm-bridge-panel">
              <article><span>평균 위험도</span><strong>{scmRiskSummary.averageRisk}점</strong><p>{scmRiskSummary.headline}</p></article>
              <article><span>6축 권고</span><strong>SCM {scmRiskSummary.recommendedScore}점</strong><p>위험도가 높을수록 Step 2 SCM 점수를 낮춰 보수적으로 반영합니다.</p></article>
              <article><span>자동 탐지</span><strong>{scmRiskSummary.highRiskNodes.length}개</strong><p>핵심 병목 {scmRiskSummary.bottlenecks.length} · 단일소스 {scmRiskSummary.singleSources.length} · 장기 리드타임 {scmRiskSummary.longLeadTimes.length}</p></article>
              <div className="scm-bridge-actions"><button className="secondary" type="button" onClick={syncScmScore}>6축 SCM 반영</button><button className="secondary" type="button" onClick={addScmWeakness}>SWOT 약점 추가</button><button className="primary" type="button" onClick={addScmAction}><Plus size={15} />실행 과제 전환</button></div>
            </section>
            <div className="scm-layout">
              <div className="network-map reactflow-network"><Suspense fallback={<div className="flow-loading">SCM 네트워크 지도를 불러오는 중…</div>}><ScmFlowMap nodes={scmFlow.nodes} edges={scmFlow.edges} onNodeClick={focusScmNode} /></Suspense><div className="network-legend"><span><i className="low" />낮음</span><span><i className="mid" />보통</span><span><i className="high" />높음</span></div></div>
              <EditableList className="scm-node-list" title="SCM 노드 리스크" addLabel="노드" rows={state.suppliers} rowId={(_, index) => `scm-node-row-${index}`} rowClassName={(_, index) => selectedScmIndex === index ? "selected-row" : ""} onAdd={() => update({ suppliers: [...state.suppliers, createScmNode()] })} onRemove={(index) => update({ suppliers: state.suppliers.filter((_, rowIndex) => rowIndex !== index) })}>
                {(supplier, index) => {
                  const riskScore = getScmRiskScore(supplier);
                  const riskLevel = getScmRiskLevel(riskScore);
                  const badges = getScmRiskBadges(supplier);
                  return <>
                    <label>유형<select value={supplier.type} onChange={(event) => replaceSupplier(index, { type: event.target.value as ScmNodeType })}>{scmNodeTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                    <label>노드명<input value={supplier.name} onChange={(event) => replaceSupplier(index, { name: event.target.value })} placeholder="공급처/공정/거점/고객명" /></label>
                    <label>의존도 %<input type="number" min="0" max="100" value={supplier.dependence} onChange={(event) => replaceSupplier(index, { dependence: Number(event.target.value) })} /></label>
                    <label>리드타임 일<input type="number" min="0" value={supplier.leadTime} onChange={(event) => replaceSupplier(index, { leadTime: Number(event.target.value) })} /></label>
                    <label>대체 수<input type="number" min="0" value={supplier.alternatives} onChange={(event) => replaceSupplier(index, { alternatives: Number(event.target.value) })} /></label>
                    <label>품질 이슈<input type="number" min="0" value={supplier.qualityIssues} onChange={(event) => replaceSupplier(index, { qualityIssues: Number(event.target.value) })} /></label>
                    <label>인증 필요<select value={supplier.certificationRequired ? "예" : "아니오"} onChange={(event) => replaceSupplier(index, { certificationRequired: event.target.value === "예" })}>{["아니오", "예"].map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label>지역 리스크<select value={supplier.regionRisk} onChange={(event) => replaceSupplier(index, { regionRisk: event.target.value as Risk })}>{["낮음", "보통", "높음"].map((risk) => <option key={risk}>{risk}</option>)}</select></label>
                    <div className={`scm-risk-result risk-${riskLevel}`}>
                      <strong>{riskScore}점</strong>
                      <span>{riskLevel}</span>
                      <div>{badges.length ? badges.map((badge) => <em key={badge}>{badge}</em>) : <em>정상 범위</em>}</div>
                    </div>
                  </>;
                }}
              </EditableList>
            </div>
            <section className="scm-competitor-panel">
              <div className="candidate-heading"><strong>경쟁사 SCM 비교 관점</strong><span>납기, 공급처 다변화, 양산 안정성, 대형 프로젝트 대응력 기준으로 확인합니다.</span></div>
              <div className="scm-competitor-table">
                <div><strong>경쟁사</strong><strong>SCM 점수</strong><strong>판정</strong><strong>비교 근거</strong></div>
                {scmCompetitorRows.map((row) => <div key={row.name}><span>{row.name}</span><span>{row.scmScore}</span><span>{row.comparison}</span><span>{row.reason}</span></div>)}
              </div>
            </section>
          </Panel>
        )}

        {active === "actions" && (
          <Panel eyebrow="Step 5" title="실행계획과 KPI">
            <section className="department-plan-panel" aria-label="부서별 추천 실행 과제">
              <div className="candidate-heading">
                <strong>부서별 액션 플랜</strong>
                <span>{executiveSummary.roleLanguage.reportTone}</span>
              </div>
              <div className="department-plan-grid">
                {departmentPlans.map((plan) => (
                  <article key={plan.department}>
                    <div><small>{plan.department}</small><strong>{plan.task}</strong></div>
                    <p>{plan.rationale}</p>
                    <span>{plan.kpi} · {plan.due}</span>
                    <button className="secondary" type="button" onClick={() => addDepartmentPlan(plan)}><Plus size={15} />과제 추가</button>
                  </article>
                ))}
              </div>
            </section>
            <EditableList className="action-list" title="90일 실행 과제" addLabel="과제" rows={state.actions} onAdd={() => update({ actions: [...state.actions, { task: "", owner: "", kpi: "", due: "" }] })} onRemove={(index) => update({ actions: state.actions.filter((_, rowIndex) => rowIndex !== index) })}>
              {(action, index) => <>
                <label>과제<input value={action.task} onChange={(event) => replaceAction(index, { task: event.target.value })} placeholder="실행 과제" /></label>
                <label>책임자<input value={action.owner} onChange={(event) => replaceAction(index, { owner: event.target.value })} placeholder="담당자" /></label>
                <label>KPI<input value={action.kpi} onChange={(event) => replaceAction(index, { kpi: event.target.value })} placeholder="측정 기준" /></label>
                <label>기한<input type="month" value={action.due} onChange={(event) => replaceAction(index, { due: event.target.value })} /></label>
              </>}
            </EditableList>
            <div className="memo"><article><strong>{executiveSummary.roleLanguage.question}</strong><p>{state.companyName || "우리 회사"}의 우선 개선축은 {biggestGap.label}입니다. {executiveSummary.roleLanguage.verb}하기 위한 실행 과제를 확정하세요.</p></article><article><strong>보고 메모</strong><p>{state.purpose} 목적의 {state.period} 분석입니다. 부서별 KPI와 의사결정 안건을 경영회의 자료로 활용하세요.</p></article></div>
          </Panel>
        )}

        {active === "report" && (
          <Panel eyebrow="Executive Brief" title="경영진 1페이지 보고서" action={<button className="primary" type="button" onClick={exportMarkdown}><Download size={17} />Markdown</button>}>
            <section className="report-page">
              <div className="report-hero">
                <div>
                  <p className="eyebrow">Competitive Analysis Memo</p>
                  <h2>{state.companyName || "우리 회사"} 경쟁력 분석</h2>
                  <p>{getExecutiveRole(state.role).label} · {state.industry || "산업 미입력"} · {state.purpose} · {state.period}</p>
                </div>
                <div className="report-score">
                  <strong>{scoreAverage}</strong>
                  <span>종합점수</span>
                </div>
              </div>

              <div className="report-grid">
                <article>
                  <strong>{executiveSummary.roleLanguage.question}</strong>
                  <p>{executiveSummary.roleLanguage.reportTone} 우선 개선축은 {biggestGap.label}입니다.</p>
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
                <h3>경쟁사 비교표</h3>
                <div className="meeting-table competitor-meeting-table">
                  <div><strong>회사</strong><strong>포지션</strong><strong>관찰 메모</strong></div>
                  {(validCompetitors.length ? validCompetitors : [{ name: "경쟁사 미입력", position: "-", note: "-" }]).map((competitor, index) => (
                    <div key={`${competitor.name}-${index}`}><span>{competitor.name || "-"}</span><span>{competitor.position || "-"}</span><span>{competitor.note || "-"}</span></div>
                  ))}
                </div>
              </div>

              <div className="report-section">
                <h3>TOWS 전략 초안</h3>
                <div className="strategy-grid compact">
                  {tows.map((strategy) => <article key={strategy.label}><strong>{strategy.label} · {strategy.name}</strong><p>{strategy.logic}</p></article>)}
                </div>
              </div>

              <div className="report-section">
                <h3>부서별 실행 KPI</h3>
                <div className="meeting-table department-kpi-table">
                  <div><strong>부서</strong><strong>실행 과제</strong><strong>KPI</strong><strong>기한</strong></div>
                  {departmentPlans.map((plan) => (
                    <div key={plan.department}><span>{plan.department}</span><span>{plan.task}</span><span>{plan.kpi}</span><span>{plan.due}</span></div>
                  ))}
                </div>
              </div>

              <div className="report-section">
                <h3>의사결정 안건</h3>
                <div className="meeting-table agenda-table">
                  <div><strong>안건</strong><strong>오너</strong><strong>결정할 내용</strong></div>
                  {decisionAgendas.map((agenda) => (
                    <div key={agenda.title}><span>{agenda.title}</span><span>{agenda.owner}</span><span>{agenda.decision}</span></div>
                  ))}
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

function EditableList<T>({ title, addLabel, rows, onAdd, onRemove, children, className = "", rowId, rowClassName }: { title: string; addLabel: string; rows: T[]; onAdd: () => void; onRemove: (index: number) => void; children: (row: T, index: number) => ReactNode; className?: string; rowId?: (row: T, index: number) => string; rowClassName?: (row: T, index: number) => string }) {
  return <div className={`editable-list ${className}`}><div className="list-heading"><h3>{title}</h3><button className="primary" type="button" onClick={onAdd}><Plus size={17} />{addLabel}</button></div>{rows.map((row, index) => <div className={`row-card ${rowClassName?.(row, index) || ""}`} id={rowId?.(row, index)} key={index}>{children(row, index)}<button className="delete" type="button" onClick={() => onRemove(index)} aria-label={`${title} 삭제`}><Trash2 size={17} /></button></div>)}</div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
