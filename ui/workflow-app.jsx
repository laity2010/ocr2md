/** OCR2MD · isolated React Flow demonstration.
 * Five initial nodes, four edges (including the translation output). No storage, fetch, API or Lab imports.
 * The nodes are only visual labels: no real file or module is opened.
 */
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Controls, MiniMap, Handle, Position, MarkerType,
  useNodesState, useEdgesState, useReactFlow, addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './workflow.css';

const NODES = [
  {id:'reviewed-md',type:'file',position:{x:45,y:135},data:{title:'审阅 MD',kind:'MD',description:'文件节点',sample:true}},
  {id:'sentence-module',type:'module',position:{x:385,y:135},data:{title:'分句',kind:'MODULE',description:'模块节点',sample:true}},
  {id:'sentence-table',type:'file',position:{x:725,y:135},data:{title:'句表',kind:'JSON',description:'文件节点',sample:true}},
  {id:'translation-module',type:'module',position:{x:1065,y:135},data:{title:'翻译',kind:'MODULE',description:'模块节点',sample:true}},
  {id:'translation-output',type:'file',position:{x:1405,y:135},data:{title:'译表 JSON',kind:'JSON',description:'文件节点',sample:true}},
];
const EDGES = [
  {id:'edge-reviewed-to-sentence',source:'reviewed-md',target:'sentence-module',type:'smoothstep'},
  {id:'edge-sentence-to-table',source:'sentence-module',target:'sentence-table',type:'smoothstep'},
  {id:'edge-table-to-translation',source:'sentence-table',target:'translation-module',type:'smoothstep'},
  {id:'edge-translation-to-output',source:'translation-module',target:'translation-output',type:'smoothstep'},
];
const edgeOptions={type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,color:'#a7c080',width:32,height:32},style:{stroke:'#a7c080',strokeWidth:2.1}};

function NodeCard({data,selected,type}) {
  const isModule=type==='module';
  return <div className={'workflow-node-card '+(isModule?'is-module':'is-file')+(selected?' is-selected':'')}>
    <Handle type="target" position={Position.Left} className="workflow-handle" />
    <div className="workflow-node-topline">
      <span className="workflow-node-symbol" aria-hidden="true">{isModule?'◇':data.kind==='JSON'?'{}':'▤'}</span>
      <span className="workflow-node-kind">{isModule?'MODULE':data.kind==='JSON'?'JSON FILE':'MD FILE'}</span>
    </div>
    {data.rename ? <input aria-label="节点名称" className="workflow-node-rename nodrag nopan nowheel"
      value={data.rename.value} maxLength={80} autoFocus
      onFocus={event=>event.target.select()}
      onChange={event=>data.rename.onChange(event.target.value)}
      onKeyDown={event=>{
        if(event.key==='Enter'){event.preventDefault();event.stopPropagation();data.rename.onCommit();}
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();data.rename.onCancel();}
      }}
      onBlur={data.rename.onCommit} />
      : <div className="workflow-node-title">{data.title}</div>}
    <div className="workflow-node-description">{data.description}</div>
    <Handle type="source" position={Position.Right} className="workflow-handle" />
  </div>;
}
const FileNode=props=><NodeCard {...props} type="file"/>;
const ModuleNode=props=><NodeCard {...props} type="module"/>;
const nodeTypes={file:FileNode,module:ModuleNode};

function Workspace() {
  const [nodes,setNodes,onNodesChange]=useNodesState(NODES);
  const [edges,setEdges,onEdgesChange]=useEdgesState(EDGES);
  const [selected,setSelected]=useState({nodes:[],edges:[]});
  const [rename,setRename]=useState(null);
  const serial=useRef(0);
  const startRename=useCallback(id=>{
    const node=nodes.find(item=>item.id===id);
    if(node)setRename({id,value:node.data.title});
  },[nodes]);
  const commitRename=useCallback(()=>{
    if(!rename)return;
    const title=rename.value.trim();
    if(title)setNodes(previous=>previous.map(node=>node.id===rename.id
      ? {...node,data:{...node.data,title}} : node));
    setRename(null);
  },[rename,setNodes]);
  const cancelRename=useCallback(()=>setRename(null),[]);
  const renderedNodes=useMemo(()=>nodes.map(node=>node.id===rename?.id
    ? {...node,data:{...node.data,rename:{value:rename.value,
       onChange:value=>setRename(previous=>previous?.id===node.id?{...previous,value}:previous),
       onCommit:commitRename,onCancel:cancelRename}}}
    : node),[nodes,rename,commitRename,cancelRename]);
  const {screenToFlowPosition,fitView}=useReactFlow();
  const onConnect=useCallback(connection=>setEdges(existing=>addEdge({...connection,
    type:'smoothstep',markerEnd:edgeOptions.markerEnd,style:edgeOptions.style},existing)),[setEdges]);

  const addNode=useCallback(kind=>{
    setRename(null);
    const count=++serial.current;
    const point=screenToFlowPosition({x:window.innerWidth*0.52,y:window.innerHeight*0.49});
    const id=`demo-${count}`;
    setNodes(previous=>[...previous.map(node=>({...node,selected:false})),{
      id,type:kind==='module'?'module':'file',
      position:{x:point.x-115+(count%4)*26,y:point.y-52+(count%4)*22},
      data:{title:kind==='module'?`新模块 ${count}`:`新文件 ${count}`,
        kind:kind==='module'?'MODULE':'MD',description:kind==='module'?'模块节点':'文件节点',sample:false},
      selected:true,
    }]);
    setEdges(previous=>previous.map(edge=>({...edge,selected:false})));
    setSelected({nodes:[id],edges:[]});
  },[screenToFlowPosition,setEdges,setNodes]);

  const deleteSelected=useCallback(()=>{
    setRename(null);
    const nodesToDelete=new Set(selected.nodes);
    const edgesToDelete=new Set(selected.edges);
    if(nodesToDelete.size===0&&edgesToDelete.size===0)return;
    setNodes(previous=>previous.filter(node=>!nodesToDelete.has(node.id)));
    setEdges(previous=>previous.filter(edge=>!edgesToDelete.has(edge.id)
      &&!nodesToDelete.has(edge.source)&&!nodesToDelete.has(edge.target)));
    setSelected({nodes:[],edges:[]});
  },[selected,setNodes,setEdges]);

  const reset=useCallback(()=>{
    setRename(null);
    setNodes(NODES.map(n=>({...n,position:{...n.position},data:{...n.data}})));
    setEdges(EDGES.map(e=>({...e})));
    setSelected({nodes:[],edges:[]});
    serial.current=0;
    requestAnimationFrame(()=>fitView({padding:0.25,duration:380}));
  },[setNodes,setEdges,fitView]);

  const onSelectionChange=useCallback(({nodes:newNodes,edges:newEdges})=>{
    setSelected({nodes:newNodes.map(n=>n.id),edges:newEdges.map(e=>e.id)});
  },[]);
  const selectedCount=selected.nodes.length+selected.edges.length;
  const canRename=selected.nodes.length===1 && !rename;
  return <div className="workflow-page">
    <header className="workflow-header">
      <div className="workflow-identity">
        <a href="/labs/" className="workflow-back" aria-label="返回 Lab 首页">‹ <span>Lab 首页</span></a>
        <span className="workflow-header-divider" />
        <div><strong>工作流节点图</strong><small>React Flow · 交互演示</small></div>
      </div>
      <span className="workflow-demo-label">仅节点演示 · 不连接文件或模块</span>
    </header>
    <section className="workflow-stage" aria-label="可交互的工作流节点图">
      <ReactFlow nodes={renderedNodes} edges={edges} nodeTypes={nodeTypes}
        defaultEdgeOptions={edgeOptions} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onSelectionChange={onSelectionChange}
        onNodeDoubleClick={(_event,node)=>startRename(node.id)}
        fitView fitViewOptions={{padding:0.2}}
        nodesDraggable nodesConnectable elementsSelectable zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace','Delete']}
        minZoom={0.25} maxZoom={2.5}
        attributionPosition="bottom-left" proOptions={{hideAttribution:false}}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="#41515a" />
        <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={2}
          nodeColor={n=>n.type==='module'?'#a7c080':'#7faeb3'}
          maskColor="rgba(30,40,44,0.70)" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <div className="workflow-toolbar" role="toolbar" aria-label="节点操作">
        <button type="button" id="add-file-node" onClick={()=>addNode('file')}><span>＋</span> 文件节点</button>
        <button type="button" id="add-module-node" onClick={()=>addNode('module')}><span>＋</span> 模块节点</button>
        <span className="workflow-toolbar-divider" />
        <button type="button" id="rename-selected" disabled={!canRename}
          onClick={()=>startRename(selected.nodes[0])}><span>✎</span> 重命名</button>
        <button type="button" id="delete-selected" disabled={!selectedCount} onClick={deleteSelected}>
          <span>⌫</span> 删除选中{selectedCount?` (${selectedCount})`:''}
        </button>
        <button type="button" id="reset-workflow" onClick={reset} title="恢复初始五个节点">恢复初始</button>
      </div>
      <div className="workflow-info" aria-live="polite">
        <strong data-testid="node-count">{nodes.length}</strong> 个节点
        <span className="workflow-info-separator">·</span>
        <strong data-testid="edge-count">{edges.length}</strong> 条连线
        <span className="workflow-info-separator">·</span>
        <span>双击节点改名，或选中后点「重命名」</span>
      </div>
    </section>
  </div>;
}

function App(){return <ReactFlowProvider><Workspace/></ReactFlowProvider>;}
createRoot(document.getElementById('workflow-root')).render(<App/>);
