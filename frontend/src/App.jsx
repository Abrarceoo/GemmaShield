import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

const C = {
  bg: "#040407", surface: "#08080f", border: "#12121e",
  red: "#ff3355", blue: "#3d8bff", green: "#00e676",
  yellow: "#ffd740", orange: "#ff9100", dim: "#3a3a55",
  muted: "#666680", text: "#c8c8e0", card: "#0c0c18",
};

const SEV = { CRITICAL: C.red, HIGH: C.orange, MEDIUM: C.yellow, LOW: C.green };
const OWASP_COLORS = {
  "LLM01": "#ff3355", "LLM02": "#ff6b35", "LLM06": "#ffd740",
  "LLM08": "#3d8bff", "LLM09": "#b44dff",
};

const Badge = ({ label, color }) => (
  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 10, letterSpacing: 1, fontWeight: 700 }}>{label}</span>
);
const Card = ({ children, accent, style = {} }) => (
  <div style={{ background: C.surface, border: `1px solid ${accent ? accent + "33" : C.border}`, borderRadius: 8, padding: 16, ...style }}>{children}</div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: 9, letterSpacing: 2, color: C.dim, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>
);
const Mono = ({ children, color = C.muted, size = 11 }) => (
  <span style={{ fontFamily: "monospace", fontSize: size, color }}>{children}</span>
);

async function downloadPDF(report) {
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, margin = 18, maxW = W - margin * 2;
  let y = 0;
  const sev = report.verdict?.severity || "UNKNOWN";
  const blocked = report.defense?.blocked;
  const sevRGB = { CRITICAL:[220,38,38], HIGH:[234,88,12], MEDIUM:[161,98,7], LOW:[21,128,61] }[sev] || [100,100,100];

  // ── Header ────────────────────────────────────────────────────────────────────
  doc.setFillColor(...sevRGB); doc.rect(0,0,W,42,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(24); doc.setTextColor(255,255,255);
  doc.text("GEMMA", margin, 18);
  doc.setFontSize(24); doc.setTextColor(255,255,255,0.7);
  doc.text("SHIELD", margin+38, 18);
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(255,255,255);
  doc.text("AI Security Assessment Report", margin, 26);
  doc.setFontSize(8);
  doc.text(`ID: ${report.report_id}`, W-margin, 14, {align:"right"});
  doc.text(new Date(report.generated_at).toLocaleString(), W-margin, 20, {align:"right"});
  doc.text(`Target: ${report.target_system}`, W-margin, 26, {align:"right"});
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text(sev, margin, 37);
  doc.text(blocked ? "BLOCKED" : "BREACHED", W-margin, 37, {align:"right"});
  y = 52;

  // ── Score cards ───────────────────────────────────────────────────────────────
  const cards = [
    {label:"CVSS-LIKE SCORE", value:`${report.verdict?.cvss_like_score}/10`, color:sevRGB},
    {label:"SEVERITY", value:sev, color:sevRGB},
    {label:"PATCH PRIORITY", value:report.verdict?.patch_priority||"N/A", color:[234,88,12]},
    {label:"DEFENSE STATUS", value:blocked?"BLOCKED":"BREACHED", color:blocked?[21,128,61]:[220,38,38]},
  ];
  const cW = (maxW-6)/4;
  cards.forEach((c,i) => {
    const x = margin + i*(cW+2);
    doc.setFillColor(248,250,252); doc.setDrawColor(...c.color); doc.setLineWidth(0.3);
    doc.roundedRect(x,y,cW,18,2,2,"FD");
    doc.setFillColor(...c.color); doc.rect(x,y,cW,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...c.color);
    doc.text(c.value, x+cW/2, y+11, {align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(100,116,139);
    doc.text(c.label, x+cW/2, y+16, {align:"center"});
  });
  y += 26;

  const section = (title) => {
    doc.setFillColor(...sevRGB); doc.rect(margin,y,3,6,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(15,23,42);
    doc.text(title, margin+6, y+4.5);
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
    doc.line(margin+6+doc.getTextWidth(title)+3, y+2.5, W-margin, y+2.5);
    y += 11;
  };
  const body = (text, color=[30,41,59], size=9.5) => {
    if (!text) return;
    doc.setFont("helvetica","normal"); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text), maxW);
    doc.text(lines, margin, y);
    y += lines.length*(size*0.42)+3;
  };
  const kv = (key, value, vc=[30,41,59]) => {
    if (!value) return;
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(100,116,139);
    doc.text(`${key}`, margin, y);
    doc.setFont("helvetica","normal"); doc.setTextColor(...vc);
    const lines = doc.splitTextToSize(String(value), maxW-36);
    doc.text(lines, margin+36, y);
    y += Math.max(lines.length*4,5)+1;
  };
  const chk = (n=20) => { if(y+n>270){doc.addPage();y=20;} };

  // ── Executive Summary ─────────────────────────────────────────────────────────
  section("EXECUTIVE SUMMARY");
  doc.setFillColor(248,250,252);
  const sl = doc.splitTextToSize(report.executive_summary||"", maxW-8);
  const sh = sl.length*4.5+8;
  doc.roundedRect(margin,y,maxW,sh,2,2,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(30,41,59);
  doc.text(sl, margin+4, y+5.5);
  y += sh+6;

  // ── OWASP ─────────────────────────────────────────────────────────────────────
  chk(30); section("OWASP LLM CLASSIFICATION");
  if (report.owasp_category?.id) {
    const oc = {LLM01:[220,38,38],LLM02:[234,88,12],LLM06:[161,98,7],LLM08:[29,78,216],LLM09:[109,40,217]}[report.owasp_category.id]||[100,100,128];
    doc.setFillColor(...oc,15); doc.setDrawColor(...oc); doc.setLineWidth(0.3);
    doc.roundedRect(margin,y,maxW,12,2,2,"FD");
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...oc);
    doc.text(`${report.owasp_category.id}`, margin+4, y+8);
    doc.setFont("helvetica","normal"); doc.setTextColor(30,41,59);
    doc.text(report.owasp_category.name, margin+18, y+8);
    y += 18;
  }

  // ── Attack Details ────────────────────────────────────────────────────────────
  chk(50); section("ATTACK DETAILS");
  const atk = report.attack||{};
  kv("Type:", atk.type?.replace(/_/g," ").toUpperCase(), sevRGB);
  kv("Technique:", atk.technique);
  kv("Weakness:", atk.target_weakness);
  kv("Severity:", atk.severity, sevRGB);
  kv("Stealth:", `${atk.stealth_score}/10`);
  y += 3;

  // ── Attack Prompt ─────────────────────────────────────────────────────────────
  chk(40); section("ATTACK PROMPT");
  const pl = doc.splitTextToSize(atk.prompt||"N/A", maxW-8);
  const ph = pl.length*4.2+8;
  doc.setFillColor(15,23,42); doc.roundedRect(margin,y,maxW,ph,2,2,"F");
  doc.setFont("courier","normal"); doc.setFontSize(8); doc.setTextColor(148,163,184);
  doc.text(pl, margin+4, y+5.5);
  y += ph+6;

  // ── Vulnerability ─────────────────────────────────────────────────────────────
  chk(25); section("VULNERABILITY");
  const vl = doc.splitTextToSize(report.verdict?.vulnerability_label||"", maxW-8);
  doc.setFillColor(254,242,242); doc.setDrawColor(220,38,38); doc.setLineWidth(0.3);
  doc.roundedRect(margin,y,maxW,vl.length*4.5+8,2,2,"FD");
  doc.setFont("courier","bold"); doc.setFontSize(9); doc.setTextColor(153,27,27);
  doc.text(vl, margin+4, y+5.5);
  y += vl.length*4.5+14;

  // ── Defense Analysis ──────────────────────────────────────────────────────────
  chk(30); section("DEFENSE ANALYSIS");
  kv("Risk Score:", `${report.defense?.risk_score}/10`);
  kv("Confidence:", `${report.defense?.confidence}`);
  kv("Threat Category:", report.defense?.threat_category);
  y += 3;
  (report.defense?.reasoning||[]).forEach((step,i) => {
    chk(15);
    doc.setFillColor(i%2===0?248:241, i%2===0?250:245, i%2===0?252:249);
    const sl2 = doc.splitTextToSize(step, maxW-14);
    const h2 = sl2.length*4+5;
    doc.rect(margin,y,maxW,h2,"F");
    doc.setFillColor(...sevRGB); doc.circle(margin+4.5,y+h2/2,2.5,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(255,255,255);
    doc.text(`${i+1}`, margin+4.5, y+h2/2+0.8, {align:"center"});
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(30,41,59);
    doc.text(sl2, margin+10, y+4);
    y += h2+2;
  });
  y += 4;

  // ── Recommendation ────────────────────────────────────────────────────────────
  chk(35); section("RECOMMENDATION");
  const rl = doc.splitTextToSize(report.verdict?.recommendation||"", maxW-10);
  const rh = rl.length*4.5+10;
  doc.setFillColor(240,253,244); doc.setDrawColor(21,128,61); doc.setLineWidth(0.3);
  doc.roundedRect(margin,y,maxW,rh,2,2,"FD");
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(20,83,45);
  doc.text(rl, margin+5, y+6);
  y += rh+6;

  // ── Judge Reasoning ───────────────────────────────────────────────────────────
  chk(20); section("JUDGE REASONING");
  body(report.verdict?.judge_reasoning, [71,85,105]);
  y += 4;

  // ── Traceability ──────────────────────────────────────────────────────────────
  chk(40); section("TRACEABILITY");
  const tr = report.traceability||{};
  doc.setFillColor(15,23,42); doc.rect(margin,y,maxW,7,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(148,163,184);
  doc.text("AGENT",margin+3,y+4.5); doc.text("LATENCY",margin+80,y+4.5);
  doc.text("MODEL",margin+110,y+4.5); doc.text("SOURCE",margin+148,y+4.5);
  y += 7;
  [["Attacker Agent",tr.attacker_latency_ms],["Target Agent",tr.target_latency_ms],["Defender Agent",tr.defender_latency_ms],["Judge Agent",tr.judge_latency_ms]].forEach(([name,ms],i) => {
    doc.setFillColor(i%2===0?248:241,i%2===0?250:245,i%2===0?252:249); doc.rect(margin,y,maxW,6,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(30,41,59);
    doc.text(name,margin+3,y+4); doc.setTextColor(...sevRGB);
    doc.text(ms?`${ms}ms`:"—",margin+80,y+4); doc.setTextColor(30,41,59);
    doc.text(tr.model||"gemma4:latest",margin+110,y+4);
    doc.text(tr.source||"ollama",margin+148,y+4);
    y += 6;
  });
  doc.setFillColor(15,23,42); doc.rect(margin,y,maxW,7,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(255,255,255);
  doc.text("TOTAL PIPELINE",margin+3,y+4.5);
  doc.setTextColor(...sevRGB.map(c=>Math.min(255,c+80)));
  doc.text(tr.total_latency_ms?`${(tr.total_latency_ms/1000).toFixed(1)}s`:"—",margin+80,y+4.5);
  y += 12;
  kv("Note:", "All inference run 100% locally via Ollama — zero cloud, zero data leakage", [21,128,61]);

  // ── Footer ────────────────────────────────────────────────────────────────────
  const pc = doc.internal.getNumberOfPages();
  for (let i=1;i<=pc;i++) {
    doc.setPage(i);
    doc.setFillColor(15,23,42); doc.rect(0,285,W,12,"F");
    doc.setFillColor(...sevRGB); doc.rect(0,285,3,12,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(148,163,184);
    doc.text("GemmaShield v2.1  ·  Gemma 4 via Ollama  ·  Local inference  ·  OWASP LLM Top 10", margin, 292);
    doc.text(`Page ${i} of ${pc}`, W-margin, 292, {align:"right"});
  }

  doc.save(`gemmashield-report-${report.report_id}.pdf`);
}

function ModelUnavailable({ error }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16, padding:32 }}>
      <div style={{ fontSize:48 }}>⚠</div>
      <div style={{ fontSize:22, fontWeight:800, color:C.red, fontFamily:"monospace", letterSpacing:2 }}>MODEL UNAVAILABLE</div>
      <div style={{ color:C.muted, fontSize:13, maxWidth:480, textAlign:"center", lineHeight:1.8 }}>Gemma 4 via Ollama is not reachable. GemmaShield does not simulate or mock AI responses.</div>
      <Card accent={C.red} style={{ maxWidth:520, width:"100%" }}>
        <Label>Error Details</Label>
        <Mono color={C.red} size={12}>{error?.detail || JSON.stringify(error)}</Mono>
      </Card>
    </div>
  );
}

function DebugPanel({ data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const agents = ["attack","target","defense","verdict"].map(k => ({ key:k, d:data[k] })).filter(a => a.d);
  return (
    <div style={{ marginTop:16 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background:"none", border:`1px solid ${C.border}`, color:C.muted, padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:11, letterSpacing:1 }}>
        {open ? "▼" : "▶"} DEBUG PANEL — Model Trace
      </button>
      {open && (
        <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:10 }}>
          {agents.map(({ key, d }) => (
            <Card key={key} style={{ borderLeft:`3px solid ${C.blue}` }}>
              <div style={{ display:"flex", gap:16, marginBottom:10, flexWrap:"wrap" }}>
                <Badge label={d.agent?.toUpperCase() || key.toUpperCase()} color={C.blue} />
                <Mono>model: <span style={{ color:C.green }}>{d.model}</span></Mono>
                <Mono>source: <span style={{ color:C.yellow }}>{d.source}</span></Mono>
                <Mono>latency: <span style={{ color:C.orange }}>{d.latency_ms}ms</span></Mono>
              </div>
              <Label>Raw LLM Output</Label>
              <pre style={{ margin:0, fontSize:10, color:C.muted, background:C.bg, padding:12, borderRadius:4, overflow:"auto", maxHeight:160, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{d.raw_output}</pre>
            </Card>
          ))}
          <Card>
            <Label>Total Pipeline Latency</Label>
            <Mono color={C.orange} size={20}>{data.total_latency_ms?.toLocaleString()}ms</Mono>
            <Mono color={C.muted}> ({(data.total_latency_ms/1000).toFixed(1)}s)</Mono>
          </Card>
        </div>
      )}
    </div>
  );
}

function PhaseEntry({ event }) {
  const phaseColors = { init:C.muted, attacker_start:C.red, attacker_done:C.red, target_start:C.muted, target_done:C.muted, defender_start:C.blue, defender_done:C.blue, judge_start:C.yellow, judge_done:C.yellow, complete:C.green, error:C.red };
  const color = phaseColors[event.phase] || C.muted;
  const isDone = event.phase.endsWith("_done");
  const isError = event.phase === "error";
  return (
    <div style={{ display:"flex", gap:10, padding:"7px 0", borderBottom:`1px solid ${C.bg}` }}>
      <Mono color={color} size={13}>{isError ? "✗" : isDone ? "✓" : "◌"}</Mono>
      <div style={{ flex:1 }}>
        <span style={{ color, fontFamily:"monospace", fontSize:11, letterSpacing:1 }}>[{event.phase.toUpperCase()}]</span>
        {event.message && <span style={{ color:C.muted, fontFamily:"monospace", fontSize:11, marginLeft:8 }}>{event.message}</span>}
        {isDone && event.agent && <span style={{ marginLeft:8 }}><Badge label={`${event.model} · ${event.source} · ${event.latency_ms}ms`} color={color} /></span>}
        {isDone && event.output?.owasp && <span style={{ marginLeft:8 }}><Badge label={`${event.output.owasp.id}: ${event.output.owasp.name}`} color={OWASP_COLORS[event.output.owasp.id] || C.muted} /></span>}
        {isError && <div style={{ marginTop:6, color:C.red, fontFamily:"monospace", fontSize:11 }}>{event.detail}</div>}
      </div>
    </div>
  );
}

function VerdictCard({ battle }) {
  if (!battle?.verdict?.output) return null;
  const v = battle.verdict.output;
  const a = battle.attack?.output || {};
  const d = battle.defense?.output || {};
  const sev = v.severity || a.severity;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <Card accent={SEV[sev]}>
        <Label>Final CVSS-like Score</Label>
        <div style={{ fontSize:52, fontWeight:900, fontFamily:"monospace", color:SEV[sev], lineHeight:1 }}>
          {v.cvss_like_score}<span style={{ fontSize:18, color:C.muted }}>/10</span>
        </div>
        <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
          <Badge label={sev} color={SEV[sev]} />
          {a.owasp && <Badge label={`${a.owasp.id}: ${a.owasp.name}`} color={OWASP_COLORS[a.owasp.id] || C.muted} />}
        </div>
      </Card>
      <Card>
        <Label>Attack</Label>
        <Mono color={C.text} size={12}>{a.attack_type?.replace(/_/g," ").toUpperCase()}</Mono>
        <div style={{ marginTop:4 }}><Mono>Stealth: {a.stealth_score}/10</Mono></div>
        <div style={{ marginTop:2 }}><Mono>{a.technique}</Mono></div>
      </Card>
      <Card accent={d.blocked ? C.green : C.red}>
        <Label>Defense Status</Label>
        <div style={{ fontSize:18, fontWeight:800, color:d.blocked ? C.green : C.red, fontFamily:"monospace" }}>{d.blocked ? "✓ BLOCKED" : "✗ BREACHED"}</div>
        <div style={{ marginTop:4 }}><Mono>confidence: {d.confidence}</Mono></div>
        <div style={{ marginTop:2 }}><Mono>{d.threat_category}</Mono></div>
      </Card>
      <Card><Label>Patch Priority</Label><Mono color={C.orange} size={13}>{v.patch_priority}</Mono></Card>
      <Card><Label>Judge Reasoning</Label><Mono color={C.muted} size={11}>{v.judge_reasoning}</Mono></Card>
      <Card><Label>Recommendation</Label><div style={{ color:C.text, fontSize:11, lineHeight:1.7 }}>{v.recommendation}</div></Card>
    </div>
  );
}

function BattleConsole({ onComplete }) {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [battle, setBattle] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [target, setTarget] = useState("Healthcare AI Assistant");
  const [attackType, setAttackType] = useState("any");
  const logsRef = useRef(null);
  useEffect(() => { logsRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  const runBattle = async () => {
    setLogs([]); setBattle(null); setModelError(null); setRunning(true);
    const params = new URLSearchParams({ target_system:target, attack_type:attackType });
    try {
      const res = await fetch(`${API}/battle/stream?${params}`, { method:"POST" });
      if (!res.ok) { const err = await res.json(); setModelError(err.detail); setRunning(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assembled = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(6));
            setLogs(prev => [...prev, event]);
            if (event.phase === "error") { setModelError(event); setRunning(false); return; }
            if (event.phase === "attacker_done") assembled.attack = event;
            if (event.phase === "target_done")   assembled.target = event;
            if (event.phase === "defender_done") assembled.defense = event;
            if (event.phase === "judge_done")    assembled.verdict = event;
            if (event.phase === "complete") { assembled.battle_id = event.battle_id; assembled.total_latency_ms = event.total_latency_ms; setBattle(assembled); onComplete?.(); }
          } catch {}
        }
      }
    } catch { setModelError({ error:"MODEL_UNAVAILABLE", detail:"Cannot reach backend. Start: uvicorn main:app --reload" }); }
    setRunning(false);
  };

  const PRESETS = [
    { label:"Healthcare AI", target:"Healthcare AI Assistant", icon:"🏥", attack:"any", desc:"Medical advice & patient data" },
    { label:"Banking Chatbot", target:"Banking AI Chatbot", icon:"🏦", attack:"data_extraction", desc:"Financial data & transactions" },
    { label:"Legal AI", target:"Legal AI Assistant", icon:"⚖️", attack:"role_override", desc:"Confidential legal counsel" },
    { label:"Government AI", target:"Government Services AI", icon:"🏛️", attack:"prompt_injection", desc:"Citizen data & services" },
    { label:"Education AI", target:"Educational Platform AI", icon:"🎓", attack:"jailbreak", desc:"Student data & content" },
    { label:"HR AI", target:"HR AI Assistant", icon:"👤", attack:"data_extraction", desc:"Employee PII & records" },
  ];
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    fetch(`${API}/scenarios`).then(r => r.json()).then(d => {
      const found = d.scenarios?.find(s => s.name === target);
      if (found) setSystemPrompt(found.system_prompt);
    }).catch(() => {});
  }, [target]);

  return (
    <div style={{ display:"flex", gap:12, height:"calc(100vh - 180px)", minHeight:560 }}>

      {/* ── Scenarios Sidebar ───────────────────────────────────────── */}
      <div style={{ width:180, display:"flex", flexDirection:"column", gap:6, overflow:"auto" }}>
        <div style={{ fontSize:9, color:C.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:4, fontFamily:"monospace" }}>Preset Scenarios</div>
        {PRESETS.map(p => (
          <div key={p.label}
            onClick={() => { setTarget(p.target); setAttackType(p.attack); }}
            style={{
              background: target === p.target ? C.surface : C.bg,
              border: `1px solid ${target === p.target ? C.red + "66" : C.border}`,
              borderLeft: target === p.target ? `3px solid ${C.red}` : `3px solid transparent`,
              borderRadius:6, padding:"10px 10px", cursor:"pointer",
            }}>
            <div style={{ fontSize:16, marginBottom:4 }}>{p.icon}</div>
            <div style={{ fontSize:11, fontWeight:700, color:target===p.target?C.text:C.muted, fontFamily:"monospace" }}>{p.label}</div>
            <div style={{ fontSize:9, color:C.dim, marginTop:2, lineHeight:1.4 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      {/* ── Console ─────────────────────────────────────────────────── */}
      <div style={{ flex:1.2, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
          <input value={target} onChange={e => setTarget(e.target.value)}
            style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, color:C.text, padding:"8px 12px", borderRadius:6, fontFamily:"monospace", fontSize:12, minWidth:140 }} />
          <select value={attackType} onChange={e => setAttackType(e.target.value)}
            style={{ background:C.surface, border:`1px solid ${C.border}`, color:C.muted, padding:"8px 10px", borderRadius:6, fontSize:12 }}>
            <option value="any">Auto Select</option>
            <option value="prompt_injection">Prompt Injection (LLM01)</option>
            <option value="jailbreak">Jailbreak (LLM02)</option>
            <option value="role_override">Role Override (LLM08)</option>
            <option value="data_extraction">Data Extraction (LLM06)</option>
            <option value="deception">Deception (LLM09)</option>
          </select>
          <button onClick={runBattle} disabled={running}
            style={{ background:running?C.surface:C.red, color:running?C.dim:"#fff", border:"none", padding:"8px 20px", borderRadius:6, cursor:running?"not-allowed":"pointer", fontWeight:800, fontSize:12, letterSpacing:1, fontFamily:"monospace" }}>
            {running ? "RUNNING..." : "▶ BATTLE"}
          </button>
        </div>

        <div style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:16, overflow:"auto" }}>
          <div style={{ color:C.dim, fontSize:10, letterSpacing:2, marginBottom:12, fontFamily:"monospace" }}>
            GEMMASHIELD v2.1 ── GEMMA 4 via OLLAMA ── LLM-ONLY ── OWASP LLM TOP 10
          </div>
          {systemPrompt && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <div style={{ fontSize:9, color:C.dim, letterSpacing:2, textTransform:"uppercase", fontFamily:"monospace" }}>System Prompt (Target Configuration)</div>
                <button onClick={() => setShowPrompt(p => !p)} style={{ background:"none", border:`1px solid ${C.border}`, color:C.muted, padding:"2px 8px", borderRadius:4, cursor:"pointer", fontSize:9, fontFamily:"monospace" }}>
                  {showPrompt ? "HIDE" : "SHOW"}
                </button>
              </div>
              {showPrompt && (
                <pre style={{ margin:0, fontSize:9, color:"#64748b", background:"#0f172a", padding:10, borderRadius:6, border:`1px solid ${C.border}`, whiteSpace:"pre-wrap", wordBreak:"break-word", lineHeight:1.6, maxHeight:120, overflow:"auto" }}>
                  {systemPrompt}
                </pre>
              )}
              {!showPrompt && (
                <div style={{ fontSize:9, color:"#334155", fontFamily:"monospace", background:"#0f172a", padding:"6px 10px", borderRadius:4, border:`1px solid ${C.border}` }}>
                  {systemPrompt.split("\n")[0]}...
                </div>
              )}
            </div>
          )}
          {modelError && <ModelUnavailable error={modelError} />}
          {logs.length === 0 && !modelError && (
            <div style={{ color:C.dim, fontSize:12, textAlign:"center", marginTop:60, fontFamily:"monospace" }}>
              Select a scenario and press BATTLE.<br />
              <span style={{ fontSize:10, color:C.dim }}>All agents use Gemma 4 exclusively.</span>
            </div>
          )}
          {logs.map((e,i) => <PhaseEntry key={i} event={e} />)}

          {/* Combat Activity Log */}
          {battle && (
            <div style={{ marginTop:16, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
              <div style={{ fontSize:9, color:C.dim, letterSpacing:2, textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>Combat Activity Log</div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {battle.attack?.output && (
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:11, fontFamily:"monospace" }}>
                      <span style={{ color:C.red }}>RED</span>
                      <span style={{ color:C.muted }}> deployed </span>
                      <span style={{ color:C.text }}>{battle.attack.output.technique}</span>
                    </div>
                    <Badge label={battle.defense?.output?.blocked ? "BLUE_TEAM_WIN" : "RED_TEAM_WIN"} color={battle.defense?.output?.blocked ? C.blue : C.red} />
                  </div>
                )}
                {battle.defense?.output?.reasoning_steps?.map((step, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontSize:10, fontFamily:"monospace", color:C.muted }}>
                      <span style={{ color:C.blue }}>BLUE</span> {step.slice(0, 60)}{step.length > 60 ? "..." : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={logsRef} />
        </div>
        {battle && <DebugPanel data={battle} />}
      </div>

      {/* ── Verdict ─────────────────────────────────────────────────── */}
      <div style={{ width:260, overflow:"auto" }}>
        {battle ? <VerdictCard battle={battle} /> : (
          <Card style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ color:C.dim, fontSize:11, textAlign:"center", fontFamily:"monospace" }}>Verdict panel<br />awaiting<br />battle results</div>
          </Card>
        )}
      </div>
    </div>
  );
}

function OWASPHeatmap({ data }) {
  const OWASP_ALL = [
    { id:"LLM01", name:"Prompt Injection" },
    { id:"LLM02", name:"Insecure Output Handling" },
    { id:"LLM06", name:"Sensitive Info Disclosure" },
    { id:"LLM08", name:"Excessive Agency" },
    { id:"LLM09", name:"Overreliance / Trust Bias" },
  ];
  const maxCount = Math.max(...(data?.map(d => d.count) || [1]), 1);
  return (
    <Card style={{ marginBottom:20 }}>
      <Label>OWASP LLM Top 10 — Attack Distribution</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {OWASP_ALL.map(o => {
          const found = data?.find(d => d.id === o.id);
          const count = found?.count || 0;
          const width = count > 0 ? Math.max(4, (count/maxCount)*100) : 0;
          const color = OWASP_COLORS[o.id] || C.muted;
          return (
            <div key={o.id} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:50, fontSize:10, color, fontFamily:"monospace", fontWeight:700 }}>{o.id}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{o.name}</div>
                <div style={{ background:"#111", borderRadius:2, height:8, overflow:"hidden" }}>
                  <div style={{ width:`${width}%`, height:"100%", background:color, borderRadius:2, transition:"width 0.8s ease" }} />
                </div>
              </div>
              <div style={{ width:24, fontSize:11, color:count>0?color:C.dim, fontFamily:"monospace", textAlign:"right" }}>{count}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SuccessRates({ data }) {
  if (!data?.length) return null;
  return (
    <Card style={{ marginBottom:20 }}>
      <Label>Attack Success Rate (Breach %)</Label>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {data.map(a => (
          <div key={a.type} style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:110, fontSize:10, color:C.muted, fontFamily:"monospace" }}>{a.type?.replace(/_/g," ")}</div>
            <div style={{ flex:1 }}>
              <div style={{ background:"#111", borderRadius:2, height:8, overflow:"hidden" }}>
                <div style={{ width:`${a.success_rate}%`, height:"100%", background:a.success_rate>50?C.red:C.green, borderRadius:2, transition:"width 0.8s ease" }} />
              </div>
            </div>
            <div style={{ width:40, fontSize:11, color:a.success_rate>50?C.red:C.green, fontFamily:"monospace", textAlign:"right" }}>{a.success_rate}%</div>
            <div style={{ width:30, fontSize:10, color:C.dim, fontFamily:"monospace" }}>{a.total}x</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReportsPanel() {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`${API}/reports?limit=20`).then(r => r.json()).then(d => { setReports(d.reports || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleDownload = async (report) => {
    setDownloading(true);
    try { await downloadPDF(report); } catch(e) { console.error(e); }
    setDownloading(false);
  };

  if (loading) return <div style={{ color:C.muted, fontFamily:"monospace", fontSize:12, padding:32 }}>Loading reports...</div>;
  if (!reports.length) return <div style={{ color:C.dim, fontFamily:"monospace", fontSize:12, padding:32, textAlign:"center" }}>No reports yet. Run a battle first.</div>;

  return (
    <div style={{ display:"flex", gap:16, height:"calc(100vh - 180px)" }}>
      <div style={{ width:300, overflow:"auto", display:"flex", flexDirection:"column", gap:8 }}>
        {reports.map(r => (
          <div key={r.report_id} onClick={() => setSelected(r)} style={{ background:selected?.report_id===r.report_id?C.surface:C.bg, border:`1px solid ${selected?.report_id===r.report_id?C.blue+"44":C.border}`, borderRadius:8, padding:12, cursor:"pointer" }}>
            <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
              <Badge label={r.verdict?.severity || "?"} color={SEV[r.verdict?.severity] || C.muted} />
              <Badge label={r.defense?.blocked ? "BLOCKED" : "BREACHED"} color={r.defense?.blocked ? C.green : C.red} />
            </div>
            <Mono color={C.text} size={12}>{r.attack?.type?.replace(/_/g," ")}</Mono>
            <div style={{ marginTop:4 }}><Mono>{r.target_system?.slice(0,24)}</Mono></div>
            {r.owasp_category?.id && <div style={{ marginTop:4 }}><Badge label={`${r.owasp_category.id}: ${r.owasp_category.name}`} color={OWASP_COLORS[r.owasp_category.id] || C.muted} /></div>}
            <div style={{ marginTop:6, fontSize:10, color:C.dim, fontFamily:"monospace" }}>CVSS: {r.verdict?.cvss_like_score}/10 · {r.traceability?.total_latency_ms ? `${(r.traceability.total_latency_ms/1000).toFixed(1)}s` : "—"}</div>
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflow:"auto" }}>
        {selected ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => handleDownload(selected)} disabled={downloading} style={{ background:downloading?C.surface:C.blue, color:downloading?C.dim:"#fff", border:"none", padding:"10px 24px", borderRadius:6, cursor:downloading?"not-allowed":"pointer", fontWeight:800, fontSize:12, fontFamily:"monospace", letterSpacing:1 }}>
                {downloading ? "GENERATING PDF..." : "↓ DOWNLOAD PDF"}
              </button>
            </div>
            <Card accent={SEV[selected.verdict?.severity]}>
              <Label>Executive Summary</Label>
              <div style={{ color:C.text, fontSize:13, lineHeight:1.7 }}>{selected.executive_summary}</div>
            </Card>
            <div style={{ display:"flex", gap:12 }}>
              <Card style={{ flex:1 }}><Label>CVSS-like Score</Label><div style={{ fontSize:40, fontWeight:900, color:SEV[selected.verdict?.severity], fontFamily:"monospace" }}>{selected.verdict?.cvss_like_score}/10</div></Card>
              <Card style={{ flex:1 }}><Label>Patch Priority</Label><Mono color={C.orange} size={16}>{selected.verdict?.patch_priority}</Mono></Card>
              <Card style={{ flex:1 }}><Label>Defense</Label><div style={{ fontSize:16, fontWeight:800, color:selected.defense?.blocked?C.green:C.red, fontFamily:"monospace" }}>{selected.defense?.blocked ? "✓ BLOCKED" : "✗ BREACHED"}</div></Card>
            </div>
            <Card>
              <Label>Attack Prompt</Label>
              <pre style={{ margin:0, fontSize:11, color:C.text, whiteSpace:"pre-wrap", wordBreak:"break-word", lineHeight:1.6 }}>{selected.attack?.prompt}</pre>
            </Card>
            <Card>
              <Label>Vulnerability</Label>
              <Mono color={C.text} size={12}>{selected.verdict?.vulnerability_label}</Mono>
              {selected.owasp_category?.id && <div style={{ marginTop:8 }}><Badge label={`${selected.owasp_category.id}: ${selected.owasp_category.name}`} color={OWASP_COLORS[selected.owasp_category.id] || C.muted} /></div>}
            </Card>
            <Card>
              <Label>Defense Reasoning</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {selected.defense?.reasoning?.map((step,i) => (
                  <div key={i} style={{ display:"flex", gap:8 }}><Mono color={C.blue}>{i+1}.</Mono><Mono color={C.muted} size={11}>{step}</Mono></div>
                ))}
              </div>
            </Card>
            <Card><Label>Recommendation</Label><div style={{ color:C.text, fontSize:12, lineHeight:1.7 }}>{selected.verdict?.recommendation}</div></Card>
            <Card>
              <Label>Traceability</Label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[["Attacker",selected.traceability?.attacker_latency_ms],["Target",selected.traceability?.target_latency_ms],["Defender",selected.traceability?.defender_latency_ms],["Judge",selected.traceability?.judge_latency_ms]].map(([name,ms]) => (
                  <div key={name} style={{ background:C.bg, borderRadius:6, padding:"8px 12px" }}>
                    <Mono color={C.dim}>{name}</Mono>
                    <div><Mono color={C.orange} size={13}>{ms ? `${(ms/1000).toFixed(1)}s` : "—"}</Mono></div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8 }}>
                <Mono>Model: <span style={{ color:C.green }}>{selected.traceability?.model}</span></Mono>
                <span style={{ marginLeft:16 }}><Mono>Source: <span style={{ color:C.yellow }}>{selected.traceability?.source}</span></Mono></span>
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.dim, fontFamily:"monospace", fontSize:12 }}>Select a report to view details</div>
        )}
      </div>
    </div>
  );
}

function Dashboard({ refresh }) {
  const [stats, setStats] = useState(null);
  const [battles, setBattles] = useState([]);
  useEffect(() => {
    Promise.all([fetch(`${API}/analytics`).then(r => r.json()), fetch(`${API}/logs?limit=25`).then(r => r.json())]).then(([s,b]) => { setStats(s); setBattles(b.battles || []); }).catch(() => {});
  }, [refresh]);
  return (
    <div>
      {stats && (
        <>
          <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
            {[{label:"Total Battles",value:stats.total_battles,color:C.blue},{label:"Blocked",value:stats.blocked_attacks,color:C.green},{label:"Breached",value:stats.breached_attacks,color:C.red},{label:"Block Rate",value:`${stats.block_rate}%`,color:C.green},{label:"Avg CVSS",value:stats.avg_cvss_score,color:C.orange},{label:"Avg Latency",value:stats.avg_latency_ms?`${(stats.avg_latency_ms/1000).toFixed(1)}s`:"—",color:C.yellow}].map(s => (
              <Card key={s.label} accent={s.color} style={{ flex:1, minWidth:100 }}>
                <div style={{ fontSize:26, fontWeight:900, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:4, letterSpacing:1, textTransform:"uppercase" }}>{s.label}</div>
              </Card>
            ))}
          </div>
          <OWASPHeatmap data={stats.owasp_distribution} />
          <SuccessRates data={stats.attack_success_rates} />
        </>
      )}
      <Label>Battle History</Label>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, overflow:"auto" }}>
        {battles.length === 0 ? <div style={{ padding:32, color:C.dim, textAlign:"center", fontFamily:"monospace", fontSize:12 }}>No battles yet.</div> : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"monospace" }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                {["ID","TARGET","ATTACK","OWASP","SEV","CVSS","STATUS","TIME"].map(h => <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:C.dim, letterSpacing:1, fontWeight:400 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {battles.map((b,i) => {
                const atk = b.attack?.output || {};
                const def = b.defense?.output || {};
                const jdg = b.verdict?.output || {};
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.bg}` }}>
                    <td style={{ padding:"9px 14px", color:C.dim }}>{b.battle_id}</td>
                    <td style={{ padding:"9px 14px", color:C.muted }}>{b.target_system?.slice(0,16)}</td>
                    <td style={{ padding:"9px 14px", color:C.text }}>{atk.attack_type?.replace(/_/g," ")}</td>
                    <td style={{ padding:"9px 14px" }}>{atk.owasp?.id && <Badge label={atk.owasp.id} color={OWASP_COLORS[atk.owasp.id] || C.muted} />}</td>
                    <td style={{ padding:"9px 14px" }}><Badge label={atk.severity || "?"} color={SEV[atk.severity] || C.muted} /></td>
                    <td style={{ padding:"9px 14px", color:C.orange }}>{jdg.cvss_like_score ?? "—"}</td>
                    <td style={{ padding:"9px 14px", color:def.blocked?C.green:C.red }}>{def.blocked ? "BLOCKED" : "BREACHED"}</td>
                    <td style={{ padding:"9px 14px", color:C.muted }}>{b.total_latency_ms ? `${(b.total_latency_ms/1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div style={{ padding:"56px 0", maxWidth:700 }}>
      <div style={{ fontSize:10, letterSpacing:4, color:C.red, marginBottom:16, textTransform:"uppercase" }}>Safety & Trust Track · Ollama Special Track · Gemma 4 Good Hackathon</div>
      <div style={{ fontSize:58, fontWeight:900, letterSpacing:-2, marginBottom:12, fontFamily:"monospace", lineHeight:1 }}>Gemma<span style={{ color:C.red }}>Shield</span></div>
      <div style={{ fontSize:16, color:C.muted, marginBottom:40, lineHeight:1.8 }}>
        Pre-deployment AI Security Testing Platform.<br />
        <span style={{ color:C.dim }}>Every output generated by Gemma 4 locally via Ollama. No simulations. No mocks. OWASP LLM Top 10 aligned.</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:32 }}>
        {[{title:"LLM-Only Execution",body:"All 4 agents call Gemma 4. Hard failure if unavailable — no silent mocking.",color:C.red},{title:"OWASP LLM Top 10",body:"Every attack maps to LLM01–LLM09. Industry-standard classification.",color:C.orange},{title:"Full Traceability",body:"Model, source, latency, raw output per agent. Debug panel for verification.",color:C.blue},{title:"PDF Security Reports",body:"Download full CVSS-like reports with reasoning, recommendations, and audit trail.",color:C.green}].map(f => (
          <Card key={f.title} accent={f.color}>
            <div style={{ fontSize:13, fontWeight:700, color:f.color, marginBottom:6 }}>{f.title}</div>
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.6 }}>{f.body}</div>
          </Card>
        ))}
      </div>
      <Card accent={C.dim}>
        <Label>Pipeline</Label>
        <pre style={{ margin:0, fontSize:11, color:C.muted, lineHeight:1.8 }}>{`Attacker Agent  →  Gemma 4 (Ollama)  →  adversarial_prompt + OWASP tag\nTarget Agent    →  Gemma 4 (Ollama)  →  target_response\nDefender Agent  →  Gemma 4 (Ollama)  →  threat_analysis JSON\nJudge Agent     →  Gemma 4 (Ollama)  →  CVSS verdict JSON\n                                     ↓\n                    SQLite + JSONL + PDF Security Reports`}</pre>
      </Card>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("home");
  const [refresh, setRefresh] = useState(0);
  const tabs = [{id:"home",label:"◈ HOME"},{id:"console",label:"▶ BATTLE CONSOLE"},{id:"dashboard",label:"◉ DASHBOARD"},{id:"reports",label:"📋 REPORTS"}];
  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text }}>
      <style>{`* { box-sizing:border-box; margin:0; padding:0; } body { background:${C.bg}; } ::-webkit-scrollbar { width:4px; height:4px; } ::-webkit-scrollbar-track { background:${C.bg}; } ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; } select option { background:${C.surface}; }`}</style>
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:"0 32px", display:"flex", alignItems:"center", gap:0 }}>
        <div style={{ padding:"14px 0", fontSize:15, fontWeight:900, fontFamily:"monospace", marginRight:24, letterSpacing:-0.5 }}>GEMMA<span style={{ color:C.red }}>SHIELD</span><span style={{ fontSize:9, color:C.dim, letterSpacing:2, marginLeft:10 }}>v2.1</span></div>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setPage(t.id)} style={{ background:"none", border:"none", borderBottom:page===t.id?`2px solid ${C.red}`:"2px solid transparent", color:page===t.id?C.text:C.muted, padding:"14px 16px", cursor:"pointer", fontSize:10, letterSpacing:1.5, fontFamily:"monospace", transition:"color 0.15s" }}>{t.label}</button>
        ))}
        <div style={{ marginLeft:"auto", fontSize:9, color:C.dim, letterSpacing:1, fontFamily:"monospace" }}>GEMMA 4 · OLLAMA · OWASP LLM TOP 10 · NO FALLBACKS</div>
      </div>
      <div style={{ padding:"28px 32px" }}>
        {page === "home"      && <Landing />}
        {page === "console"   && <BattleConsole onComplete={() => setRefresh(r => r+1)} />}
        {page === "dashboard" && <Dashboard refresh={refresh} />}
        {page === "reports"   && <ReportsPanel />}
      </div>
    </div>
  );
}