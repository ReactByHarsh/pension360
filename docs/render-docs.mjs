import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function inline(value) {
  const spans = [];
  let result = escape(value).replace(/`([^`]+)`/g, (_, code) => { spans.push(`<code>${code}</code>`); return `\u0000${spans.length - 1}\u0000`; });
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return result.replace(/\u0000(\d+)\u0000/g, (_, index) => spans[Number(index)]);
}
function markdown(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const output = [], contents = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (line.startsWith('```')) {
      const code = []; index++;
      while (index < lines.length && !lines[index].startsWith('```')) code.push(lines[index++]);
      index++;
      output.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const id = heading[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (level === 2) contents.push({ id, text: heading[2] });
      if (level > 1) output.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
      index++; continue;
    }
    if (line.startsWith('|') && /^\|\s*-/.test(lines[index + 1] || '')) {
      const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
      const header = cells(line); index += 2;
      const rows = [];
      while (index < lines.length && lines[index].startsWith('|')) rows.push(cells(lines[index++]));
      output.push(`<div class="table-wrap"><table><thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (/^(?:- |\d+\. )/.test(line)) {
      const ordered = /^\d+\./.test(line), items = [];
      const expression = ordered ? /^\d+\. / : /^- /;
      while (index < lines.length && expression.test(lines[index])) items.push(lines[index++].replace(expression, ''));
      const tag = ordered ? 'ol' : 'ul';
      output.push(`<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(?:#|\||```|- |\d+\. )/.test(lines[index])) paragraph.push(lines[index++]);
    output.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return { body: output.join('\n'), contents };
}

const styles = `
:root{--navy:#122e42;--ink:#213643;--muted:#536674;--teal:#087f80;--line:#d8e2e5;--soft:#f3f7f8;--paper:#fff;--gold:#e7b965}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:20px}body{margin:0;background:#eaf0f2;color:var(--ink);font:15px/1.7 'Segoe UI',Arial,sans-serif}a{color:#056f78;text-underline-offset:3px}a:hover{color:#0b414b}header{background:var(--navy);color:#fff;border-bottom:7px solid var(--teal);padding:54px max(5vw,28px) 46px;position:relative;overflow:hidden}header:after{content:'';position:absolute;width:380px;height:380px;border:1px solid #ffffff18;border-radius:50%;right:-90px;top:-170px;box-shadow:0 0 0 46px #ffffff06,0 0 0 92px #ffffff04}.brand{font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#c3e7e8}.eyebrow{margin:25px 0 9px;color:var(--gold);text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:2px}h1{font-size:clamp(32px,4vw,50px);font-weight:650;line-height:1.12;margin:0 0 16px;letter-spacing:-1.4px;max-width:950px}.deck{max-width:780px;color:#d1e0e6;font-size:17px;line-height:1.65}.meta{font-size:12px;margin-top:26px;color:#b7cbd5}.layout{max-width:1510px;margin:0 auto;display:grid;grid-template-columns:265px minmax(0,1fr);gap:34px;padding:35px 35px 60px}.contents{align-self:start;position:sticky;top:25px;max-height:calc(100vh - 60px);overflow:auto;padding:8px 12px 20px 2px}.contents strong{font-size:11px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase}.contents ol{list-style:none;padding:0;margin:15px 0}.contents li{margin:0 0 6px;font-size:12px;line-height:1.5}.contents a{display:block;text-decoration:none;padding:5px 8px;border-left:2px solid transparent;color:#49616e}.contents a:hover{border-left-color:var(--teal);background:#dce9ed;color:var(--navy)}main{background:var(--paper);padding:40px 48px 60px;border:1px solid #dce5e8;box-shadow:0 6px 22px #16334308;min-width:0}main>p:first-child{font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:18px;margin-top:0}h2{font-size:25px;line-height:1.27;color:var(--navy);margin:48px 0 17px;padding-top:14px;border-top:2px solid var(--line);letter-spacing:-.4px}h2:first-of-type{margin-top:30px}h3{font-size:18px;line-height:1.4;color:#066c73;margin:26px 0 12px}p{margin:0 0 17px}strong{font-weight:650}ul,ol{padding-left:24px;margin:12px 0 22px}li{margin:6px 0;padding-left:3px}.table-wrap{overflow-x:auto;margin:20px 0 27px}table{border-collapse:collapse;width:100%;font-size:12.5px;line-height:1.55}th{background:var(--navy);color:white;text-align:left;font-weight:600;padding:12px 13px;vertical-align:top}td{padding:12px 13px;vertical-align:top;border-bottom:1px solid var(--line)}tbody tr:nth-child(even){background:var(--soft)}td:first-child{font-weight:600;color:#173e4a}pre{background:#102b3d;border-radius:5px;color:#e3f3f6;padding:18px 22px;font:12.5px/1.8 Consolas,'Courier New',monospace;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}code{background:#edf3f5;color:#195368;padding:2px 5px;border-radius:3px;font:12px/1.5 Consolas,'Courier New',monospace}pre code{background:transparent;color:inherit;padding:0;font:inherit}footer{max-width:1180px;margin:0 auto 25px;padding:0 35px;color:#5e727d;font-size:11px;display:flex;justify-content:space-between;gap:15px}.print-button{border:1px solid #5c798b;background:transparent;color:white;font:12px 'Segoe UI',sans-serif;padding:9px 16px;border-radius:4px;position:absolute;right:36px;bottom:32px;cursor:pointer}.print-button:hover{background:#ffffff15}@media(max-width:1000px){.layout{grid-template-columns:1fr;padding:20px;gap:10px}.contents{position:static;max-height:none}.contents ol{columns:2}main{padding:28px}.print-button{position:static;margin-top:18px}}@media(max-width:600px){.contents ol{columns:1}.layout{padding:12px}main{padding:20px}header{padding:32px 25px}table{font-size:11.5px}th,td{padding:9px}.meta{max-width:260px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@page{size:A4;margin:17mm 15mm 18mm}@media print{body{background:#fff;font-size:9.2pt;line-height:1.5;color:#182d39}header{background:#fff!important;color:#122e42;padding:8mm 0 12mm;border-bottom:3px solid #087f80}header:after,.print-button,.contents{display:none}.brand{color:#087f80}.eyebrow{color:#596776;margin-top:10mm}h1{font-size:29pt;line-height:1.13;color:#122e42;max-width:170mm}.deck,.meta{color:#435c68;font-size:10pt}.layout{display:block;padding:0;max-width:none}main{border:0;box-shadow:none;padding:7mm 0 0}h2{font-size:16pt;margin:9mm 0 4mm;padding-top:4mm;break-after:avoid}h3{font-size:11.5pt;break-after:avoid;margin-top:6mm}p{orphans:3;widows:3;margin-bottom:3mm}li{orphans:3;widows:3}.table-wrap{overflow:visible;margin:4mm 0 6mm}table{font-size:8pt;line-height:1.4}th{background:#e7eff2!important;color:#122e42}th,td{padding:2.5mm 2mm}tr{break-inside:avoid}thead{display:table-header-group}pre{background:#f0f4f5!important;color:#122e42;border:1px solid #cedbdf;font-size:8pt;break-inside:avoid;padding:4mm}code{font-size:8pt}a{color:#125c68;text-decoration:none}footer{padding:5mm 0 0;margin:4mm 0 0;border-top:1px solid #d8e2e5;font-size:8pt}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

const documents = [
  { name:'DEVELOPER_GUIDE', title:'Developer & Operations Guide', label:'Engineering handbook', description:'Architecture, integration contracts, governed rules, deployment and recovery for the Node.js edition of Pension360.' },
  { name:'FSD', title:'Functional Specification', label:'Business review baseline', description:'Five connected modules, clear decision boundaries and a complete acceptance framework for business owners and delivery teams.' },
  { name:'REQUIREMENTS_TRACEABILITY', title:'Requirements & Release Traceability', label:'Delivery control register', description:'A transparent map from recovered requirements to implementation, evidence and the remaining production acceptance gates.' },
  { name:'DEMO_PLAYBOOK', title:'Copilot Demo Playbook', label:'Presenter and rehearsal guide', description:'Fictional data, practical questions, evidence checkpoints and an 18-minute business walkthrough across Pension360.' },
  { name:'FUNCTIONAL_CONSULTANT_DEMO', title:'Functional Consultant Demo Guide', label:'Client demonstration handbook', description:'Six roles, ten fictional PDFs, prepared rules and two live configuration exercises in a practical 25-minute client walkthrough.' },
  { name:'OPERATIONS', title:'Production Operations & Acceptance', label:'Deployment and recovery runbook', description:'Controlled access, source intake, evidence processing, acceptance checks and recovery procedures with explicit production boundaries.' },
];
for (const document of documents) {
  const rendered = markdown(await readFile(path.join(directory, document.name + '.md'), 'utf8'));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escape(document.description)}"><title>Pension360 — ${escape(document.title)}</title><style>${styles}</style></head><body><header><div class="brand">Pension360</div><div class="eyebrow">${document.label}</div><h1>${document.title}</h1><div class="deck">${document.description}</div><div class="meta">NODE EDITION &nbsp; / &nbsp; SEPTEMBER 2026 &nbsp; / &nbsp; BASELINE 1.0</div><button class="print-button" onclick="window.print()" aria-label="Print or save this document as PDF">Print / Save PDF</button></header><div class="layout"><nav class="contents" aria-label="Table of contents"><strong>In this document</strong><ol>${rendered.contents.map(item => `<li><a href="#${item.id}">${escape(item.text)}</a></li>`).join('')}</ol></nav><main>${rendered.body}</main></div><footer><span>Pension360 · Node edition · Delivery baseline 1.0</span><span>Reference the validation report for executed checks.</span></footer></body></html>`;
  await writeFile(path.join(directory, document.name + '.html'), html, 'utf8');
  console.log(`Rendered ${document.name}.html (${html.length.toLocaleString()} characters)`);
}
