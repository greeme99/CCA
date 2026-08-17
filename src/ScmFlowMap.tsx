// SCM 탭에서만 쓰는 React Flow 네트워크 지도. 초기 번들에서 분리하기 위해 별도 모듈로 둔다.
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export type ScmFlowData = { label: string; nodeType: string; riskScore: number; badges: string[] };

function ScmRiskNode({ data }: { data: ScmFlowData }) {
  return (
    <div className="scm-risk-flow-card">
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <div><small>{data.nodeType}</small><strong>{data.label}</strong></div>
      <span>{data.nodeType === "회사" ? "기준점" : `${data.riskScore}점`}</span>
      {data.badges.length > 0 && <div className="flow-badge-list">{data.badges.slice(0, 2).map((badge) => <em key={badge}>{badge}</em>)}</div>}
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const scmFlowNodeTypes: NodeTypes = { scmRisk: ScmRiskNode as never };

export default function ScmFlowMap({ nodes, edges, onNodeClick }: { nodes: Node<ScmFlowData>[]; edges: Edge[]; onNodeClick: (nodeId: string) => void }) {
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={scmFlowNodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_, node) => onNodeClick(node.id)}>
      <Background gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
