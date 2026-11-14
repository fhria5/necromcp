/* NecroMCP Phase 1 — embedded engine (Mode B: fully static, zero fetch calls).
 * Works in the browser and in Node: all DOM access is guarded by
 * `typeof document !== 'undefined'`, and the engine is exposed as
 * globalThis.NecroEngine = { parseWSDL, buildSoapEnvelope, parseSoapResponse, simulate, CORPSE_01_WSDL }.
 */

const CORPSE_01_WSDL = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- 1998 FIRST NATIONAL MAINFRAME CORE BANKING WSDL/SOAP SPECIFICATION -->\n<definitions name=\"CoreBankingLegacyService\"\n  targetNamespace=\"urn:mainframe:banking:1998\"\n  xmlns:tns=\"urn:mainframe:banking:1998\"\n  xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\"\n  xmlns:soap=\"http://schemas.xmlsoap.org/wsdl/soap/\">\n\n  <message name=\"GetAccountBalanceRequest\">\n    <part name=\"ACCT_NUM_STR\" type=\"xsd:string\" doc=\"8-digit customer account number\"/>\n    <part name=\"ROUTING_ABA_CD\" type=\"xsd:string\" doc=\"9-digit ABA routing code\"/>\n  </message>\n  <message name=\"GetAccountBalanceResponse\">\n    <part name=\"LEDGER_BAL_CENTS\" type=\"xsd:long\" doc=\"Current balance in integer cents\"/>\n    <part name=\"AVAIL_BAL_CENTS\" type=\"xsd:long\" doc=\"Available balance in integer cents\"/>\n    <part name=\"CCY_ISO_CD\" type=\"xsd:string\" doc=\"3-letter ISO currency\"/>\n  </message>\n\n  <message name=\"ExecuteWireTransferRequest\">\n    <part name=\"SRC_ACCT_NUM\" type=\"xsd:string\" doc=\"Origin account number\"/>\n    <part name=\"DST_ACCT_NUM\" type=\"xsd:string\" doc=\"Beneficiary account number\"/>\n    <part name=\"XFER_AMT_USD\" type=\"xsd:decimal\" doc=\"Transfer amount in USD (HITL Gate > 10000)\"/>\n    <part name=\"WIRE_MEMO_TXT\" type=\"xsd:string\" doc=\"Payment remittance remarks\"/>\n  </message>\n  <message name=\"ExecuteWireTransferResponse\">\n    <part name=\"FEDWIRE_REF_ID\" type=\"xsd:string\" doc=\"Mainframe settlement reference\"/>\n    <part name=\"SETTLE_STATUS_CD\" type=\"xsd:string\" doc=\"00=SETTLED, 99=FAULT\"/>\n    <part name=\"POSTED_CENTS\" type=\"xsd:long\" doc=\"Exact integer cents posted to ledger\"/>\n  </message>\n</definitions>\n";

const TYPE_MAP = {
  'xsd:string': 'string',
  'xsd:long': 'number',
  'xsd:int': 'number',
  'xsd:decimal': 'number',
  'xsd:double': 'number',
  'xsd:boolean': 'boolean'
};

const SEMANTIC_NAMES = {
  ACCT_NUM_STR: 'accountNumber',
  ROUTING_ABA_CD: 'routingCode',
  LEDGER_BAL_CENTS: 'ledgerBalanceCents',
  AVAIL_BAL_CENTS: 'availableBalanceCents',
  CCY_ISO_CD: 'currencyCode',
  SRC_ACCT_NUM: 'sourceAccountNumber',
  DST_ACCT_NUM: 'destinationAccountNumber',
  XFER_AMT_USD: 'amountUsd',
  WIRE_MEMO_TXT: 'memo',
  FEDWIRE_REF_ID: 'fedwireReferenceId',
  SETTLE_STATUS_CD: 'settleStatusCode',
  POSTED_CENTS: 'postedCents'
};

const NUMBER_LEGACY = new Set(['LEDGER_BAL_CENTS', 'AVAIL_BAL_CENTS', 'POSTED_CENTS']);

const OP_META = {
  GetAccountBalance: {
    mcpToolName: 'banking_get_balance',
    zodName: 'BankingGetBalanceInput',
    description: 'Get the ledger and available balance of an account',
    riskLevel: 'LOW',
    earsBody: 'return the ledger and available balance as integer cents'
  },
  ExecuteWireTransfer: {
    mcpToolName: 'banking_wire_transfer',
    zodName: 'BankingWireTransferInput',
    description: 'Execute a wire transfer between two accounts',
    riskLevel: 'CRITICAL',
    hitlThreshold: { field: 'amountUsd', maxAllowed: 10000 },
    earsBody: 'execute a wire transfer between two accounts and return the settlement reference and posted cents'
  }
};

function toCamel(legacyName) {
  const parts = legacyName.toLowerCase().split('_').filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

function toSnake(pascal) {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function semanticNameOf(legacyName) {
  return SEMANTIC_NAMES[legacyName] || toCamel(legacyName);
}

function parseWSDL(text) {
  const messageRe = /<message\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/message>/g;
  const messages = [];
  let m;
  while ((m = messageRe.exec(text)) !== null) {
    const parts = [];
    const partRe = /<part\b((?:"[^"]*"|[^>])*?)\/>/g;
    let p;
    while ((p = partRe.exec(m[2])) !== null) {
      const attrs = {};
      const attrRe = /(\w+)="([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(p[1])) !== null) attrs[a[1]] = a[2];
      parts.push({
        legacyName: attrs.name,
        semanticName: semanticNameOf(attrs.name),
        type: TYPE_MAP[attrs.type] || 'string',
        constraints: { required: true },
        description: attrs.doc || ''
      });
    }
    messages.push({ name: m[1], parts });
  }

  if (messages.length === 0) {
    const err = new Error('CorpseCorruptionError: no <message> blocks found in WSDL');
    err.name = 'CorpseCorruptionError';
    throw err;
  }

  const byName = {};
  messages.forEach((msg) => { byName[msg.name] = msg; });

  const operations = [];
  messages.forEach((msg) => {
    if (!msg.name.endsWith('Request')) return;
    const opId = msg.name.slice(0, -'Request'.length);
    const response = byName[opId + 'Response'];
    const meta = OP_META[opId] || {};
    const op = {
      opId,
      legacyAction: msg.name,
      mcpToolName: meta.mcpToolName || ('banking_' + toSnake(opId)),
      description: meta.description || ('Call legacy operation ' + opId),
      riskLevel: meta.riskLevel || 'LOW'
    };
    if (meta.hitlThreshold) op.hitlThreshold = { field: meta.hitlThreshold.field, maxAllowed: meta.hitlThreshold.maxAllowed };
    op.inputs = msg.parts;
    op.outputs = response ? response.parts : [];
    operations.push(op);
  });

  const generatedEarsSpec = operations.map((op) => {
    const meta = OP_META[op.opId] || {};
    const body = meta.earsBody || (op.description.charAt(0).toLowerCase() + op.description.slice(1));
    return 'WHEN an agent calls ' + op.mcpToolName + ', THE SYSTEM SHALL ' + body + '.';
  }).join('\n');

  const generatedZodCode = operations.map((op) => {
    const fields = op.inputs.map((f) => {
      return f.semanticName + ': ' + (f.type === 'number' ? 'z.number()' : 'z.string().min(1)');
    }).join(', ');
    return 'export const ' + (OP_META[op.opId] && OP_META[op.opId].zodName ? OP_META[op.opId].zodName : op.opId + 'Input') + ' = z.object({ ' + fields + ' });';
  }).join('\n');

  return {
    artifactId: 'corpse-01-banking-soap',
    title: '1998 SOAP Core Bank',
    era: '1998',
    format: 'SOAP_XML',
    rawSource: text,
    extractedAt: new Date().toISOString(),
    operations,
    generatedEarsSpec,
    generatedZodCode
  };
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

const SOAP_NS = 'xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:mainframe:banking:1998"';

function buildSoapEnvelope(op, args) {
  const parts = op.inputs.map((f) => {
    const v = args[f.semanticName] == null ? '' : args[f.semanticName];
    return '<' + f.legacyName + '>' + xmlEscape(v) + '</' + f.legacyName + '>';
  }).join('');
  return '<soapenv:Envelope ' + SOAP_NS + '><soapenv:Body><tns:' + op.legacyAction + '>' +
    parts + '</tns:' + op.legacyAction + '></soapenv:Body></soapenv:Envelope>';
}

function simulate(op, args) {
  let json;
  if (op.opId === 'GetAccountBalance') {
    const digits = String(args.accountNumber == null ? '' : args.accountNumber).replace(/\D/g, '');
    const n = parseInt(digits, 10) || 0;
    const ledgerBalanceCents = 100000 + ((n * 7919) % 900000);
    const availableBalanceCents = Math.max(0, ledgerBalanceCents - 2500);
    json = { ledgerBalanceCents, availableBalanceCents, currencyCode: 'USD' };
  } else if (op.opId === 'ExecuteWireTransfer') {
    const amountUsd = Number(args.amountUsd);
    const postedCents = Math.round((amountUsd + Number.EPSILON) * 100);
    const seedStr = String(args.sourceAccountNumber == null ? '' : args.sourceAccountNumber) +
      String(args.destinationAccountNumber == null ? '' : args.destinationAccountNumber) +
      String(args.memo == null ? '' : args.memo);
    let refSeed = postedCents;
    for (const ch of seedStr) refSeed += ch.charCodeAt(0);
    const fedwireReferenceId = 'FED' + String(refSeed % 100000000).padStart(8, '0');
    json = { fedwireReferenceId, settleStatusCode: '00', postedCents };
  } else {
    throw new Error('Unknown operation: ' + op.opId);
  }
  const body = op.outputs.map((f) => {
    return '<' + f.legacyName + '>' + xmlEscape(json[f.semanticName]) + '</' + f.legacyName + '>';
  }).join('');
  const responseXml = '<soapenv:Envelope ' + SOAP_NS + '><soapenv:Body><tns:' + op.opId + 'Response>' +
    body + '</tns:' + op.opId + 'Response></soapenv:Body></soapenv:Envelope>';
  return { responseXml, json };
}

function parseSoapResponse(xml) {
  const m = xml.match(/<tns:([A-Za-z0-9]+Response)>([\s\S]*?)<\/tns:\1>/);
  const inner = m ? m[2] : xml;
  const out = {};
  const re = /<([A-Z][A-Z0-9_]*)>([^<]*)<\/\1>/g;
  let part;
  while ((part = re.exec(inner)) !== null) {
    const legacy = part[1];
    const raw = xmlUnescape(part[2]);
    out[semanticNameOf(legacy)] = NUMBER_LEGACY.has(legacy) ? Number(raw) : raw;
  }
  return out;
}

globalThis.NecroEngine = { parseWSDL, buildSoapEnvelope, parseSoapResponse, simulate, CORPSE_01_WSDL };

/* ---- Browser UI (guarded: skipped entirely under Node) ---- */
if (typeof document !== 'undefined') {
  const DEFAULTS = {
    GetAccountBalance: { accountNumber: '88412007', routingCode: '021000021' },
    ExecuteWireTransfer: {
      sourceAccountNumber: '88412007',
      destinationAccountNumber: '11223344',
      amountUsd: '250',
      memo: 'NecroMCP test transfer'
    }
  };

  let ast = null;
  let callCount = 0;

  function el(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightXmlLine(escaped) {
    let out = escaped;
    out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c-comment">$1</span>');
    out = out.replace(/(&lt;\/?)([A-Za-z][\w:.-]*)/g, '$1<span class="c-tag">$2</span>');
    out = out.replace(/([\w:.-]+)=(&quot;.*?&quot;)/g, '<span class="c-attr">$1</span>=<span class="c-str">$2</span>');
    return out;
  }

  function renderRawCorpse() {
    const container = el('raw-corpse');
    const lines = CORPSE_01_WSDL.replace(/\n$/, '').split('\n');
    container.innerHTML = lines.map((line, i) => {
      return '<div class="code-line"><span class="line-no">' + (i + 1) + '</span><code class="line-code">' +
        highlightXmlLine(escapeHtml(line)) + '</code></div>';
    }).join('');
  }

  function setNodeState(num, state, label) {
    const node = el('node-' + num);
    if (!node) return;
    node.setAttribute('data-state', state);
    const stateEl = node.querySelector('.node-state');
    if (stateEl && label) stateEl.textContent = label;
  }

  function currentOp() {
    const select = el('op-select');
    return ast.operations.find((op) => op.opId === select.value) || ast.operations[0];
  }

  function renderForm(op) {
    const container = el('tool-inputs');
    const defaults = DEFAULTS[op.opId] || {};
    container.innerHTML = '';
    op.inputs.forEach((f) => {
      const group = document.createElement('div');
      group.className = 'field-group';
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = f.semanticName + '  (' + f.legacyName + ')';
      label.setAttribute('for', 'input-' + f.semanticName);
      const input = document.createElement('input');
      input.className = 'text-input';
      input.id = 'input-' + f.semanticName;
      input.name = f.semanticName;
      input.type = f.type === 'number' ? 'number' : 'text';
      if (f.type === 'number') input.step = 'any';
      input.value = defaults[f.semanticName] != null ? String(defaults[f.semanticName]) : '';
      input.required = true;
      const hint = document.createElement('span');
      hint.className = 'field-hint';
      hint.textContent = f.description;
      group.appendChild(label);
      group.appendChild(input);
      group.appendChild(hint);
      container.appendChild(group);
    });
  }

  function selectPreset() {
    const btn = el('preset-soap-bank');
    btn.classList.add('preset-active');
    btn.setAttribute('aria-pressed', 'true');
    ast = parseWSDL(CORPSE_01_WSDL);
    renderRawCorpse();
    el('ears-spec').textContent = ast.generatedEarsSpec;
    el('zod-code').textContent = ast.generatedZodCode;
    const select = el('op-select');
    select.innerHTML = '';
    ast.operations.forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op.opId;
      opt.textContent = op.opId + ' — ' + op.mcpToolName + (op.riskLevel === 'CRITICAL' ? '  [CRITICAL]' : '');
      select.appendChild(opt);
    });
    select.value = 'GetAccountBalance';
    renderForm(ast.operations[0]);
    setNodeState(1, 'done', 'Done');
    setNodeState(2, 'done', 'Done');
    setNodeState(3, 'active', 'Ready');
    setNodeState(4, 'locked', 'Phase 3');
  }

  function callTool() {
    const op = currentOp();
    const args = {};
    op.inputs.forEach((f) => {
      const input = el('input-' + f.semanticName);
      const raw = input ? input.value : '';
      args[f.semanticName] = f.type === 'number' ? Number(raw) : raw;
    });
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const envelope = buildSoapEnvelope(op, args);
    const result = simulate(op, args);
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const latencyMs = t1 - t0;
    callCount += 1;
    const mcpRequest = {
      jsonrpc: '2.0',
      id: callCount,
      method: 'tools/call',
      params: { name: op.mcpToolName, arguments: args }
    };
    el('wire-mcp').textContent = JSON.stringify(mcpRequest, null, 2);
    el('wire-soap').textContent = envelope;
    el('wire-json').textContent = JSON.stringify(result.json, null, 2);
    el('latency').textContent = latencyMs.toFixed(1) + ' ms';
    const parsed = parseSoapResponse(result.responseXml);
    const ok = JSON.stringify(parsed) === JSON.stringify(result.json);
    el('tool-result').innerHTML =
      '<span class="result-ok">' + escapeHtml(op.mcpToolName) + ' &mdash; settled ' + latencyMs.toFixed(1) + ' ms</span>\n' +
      escapeHtml(JSON.stringify(result.json, null, 2)) +
      '\n' + (ok ? 'Round-trip parse: match.' : 'Round-trip parse: mismatch.');
    setNodeState(3, 'done', 'Done');
    setNodeState(4, 'locked', 'Phase 3');
  }

  function switchTab(which) {
    const rawTab = el('tab-raw');
    const earsTab = el('tab-ears');
    const rawPanel = el('panel-raw');
    const earsPanel = el('panel-ears');
    if (which === 'raw') {
      rawTab.classList.add('tab-active');
      rawTab.setAttribute('aria-selected', 'true');
      earsTab.classList.remove('tab-active');
      earsTab.setAttribute('aria-selected', 'false');
      rawPanel.hidden = false;
      earsPanel.hidden = true;
    } else {
      earsTab.classList.add('tab-active');
      earsTab.setAttribute('aria-selected', 'true');
      rawTab.classList.remove('tab-active');
      rawTab.setAttribute('aria-selected', 'false');
      earsPanel.hidden = false;
      rawPanel.hidden = true;
    }
  }

  function init() {
    el('preset-soap-bank').addEventListener('click', selectPreset);
    el('tab-raw').addEventListener('click', () => switchTab('raw'));
    el('tab-ears').addEventListener('click', () => switchTab('ears'));
    el('op-select').addEventListener('change', () => renderForm(currentOp()));
    el('call-tool-btn').addEventListener('click', callTool);
    selectPreset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
