// ── Candidata a NOVA sanitização determinística ──────────────────────────────
// Percorre o texto rastreando string-state. Dentro de string:
//  - escapa control chars (< 0x20): \n \r \t \uXXXX
//  - decide se um `"` é ESTRUTURAL (fecha a string) ou CONTEÚDO (escapa p/ \").
//    Regra de lookahead: é fechamento sse, ignorando espaços, o próximo char for
//      ':'  (fim de chave)
//      ','  seguido (ignorando espaços) de '"'  (fim de valor, vem próxima chave/elem)
//      '}' ou ']'                               (fim de valor/container)
//      fim do texto
//    Caso contrário é aspa de conteúdo não escapada -> vira \".
function sanitizeJsonStrings(text) {
  const n = text.length;
  let out = '';
  let inString = false;
  let escaped = false;

  const nextNonWs = (from) => {
    let k = from;
    while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n' || text[k] === '\r')) k++;
    return k < n ? text[k] : undefined;
  };
  const nextNonWsIdx = (from) => {
    let k = from;
    while (k < n && (text[k] === ' ' || text[k] === '\t' || text[k] === '\n' || text[k] === '\r')) k++;
    return k;
  };

  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    // inString
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') { out += '\\r'; continue; }
    if (ch === '\t') { out += '\\t'; continue; }
    const code = ch.charCodeAt(0);
    if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }
    if (ch === '"') {
      const c1 = nextNonWs(i + 1);
      let closing = false;
      if (c1 === undefined || c1 === ':' || c1 === '}' || c1 === ']') {
        closing = true;
      } else if (c1 === ',') {
        const idxComma = nextNonWsIdx(i + 1);       // posição da vírgula
        const c2 = nextNonWs(idxComma + 1);         // char após a vírgula
        if (c2 === '"' || c2 === undefined) closing = true;
      }
      if (closing) { out += '"'; inString = false; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
}

// repairJson ATUAL (verbatim) para fechar truncados
function repairJson(raw) {
  let text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nenhum objeto JSON encontrado na resposta');
  text = text.slice(start);
  try { JSON.parse(text); return text; } catch {}
  let inString = false, escaped = false;
  const stack = [];
  for (const c of text) {
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { if (stack.length) stack.pop(); }
  }
  let repaired = text.trimEnd().replace(/,\s*$/, '');
  if (inString) repaired += '"';
  const closing = { '{': '}', '[': ']' };
  for (let i = stack.length - 1; i >= 0; i--) repaired += closing[stack[i]];
  return repaired;
}

function stripToObject(raw) {
  let text = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nenhum objeto JSON encontrado na resposta');
  return text.slice(start);
}

// NOVO parseJsonSafe
function parseJsonSafe(raw, label) {
  const cleaned = stripToObject(raw);
  try { return JSON.parse(cleaned); } catch {}
  const sanitized = sanitizeJsonStrings(cleaned);
  try { return JSON.parse(sanitized); } catch {}
  const repaired = repairJson(sanitized);
  try { return JSON.parse(repaired); } catch {}
  const repairedThenSanitized = sanitizeJsonStrings(repairJson(cleaned));
  try { return JSON.parse(repairedThenSanitized); }
  catch (e) { throw new Error(`JSON inválido mesmo após repair [${label}]: ${String(e).split('\n')[0]}`); }
}

const cases = {
  A_literal_newline:
    '{\n  "report_title": "Título do período",\n  "executive_summary": "Parágrafo um.\nParágrafo dois.\nParágrafo três."\n}',
  B_unescaped_quote:
    '{"report_title":"O ano da IA","executive_summary":"A narrativa dominante é o "meta-enredo" da autonomia agêntica."}',
  C_newline_and_quote:
    '{"report_title":"Título","executive_summary":"Primeiro parágrafo cita a "corrida armamentista".\nSegundo parágrafo segue aqui."}',
  D_literal_tab:
    '{"report_title":"T\tI","executive_summary":"ok"}',
  E_quote_before_comma_prose:
    '{"report_title":"t","executive_summary":"a chamada "corrida armamentista", que domina o período e muda tudo."}',
  F_already_valid_escaped:
    '{"report_title":"O \\"ano\\" da IA","executive_summary":"Par 1.\\nPar 2."}',
  G_valid_nested_arrays:
    '{"a":"x","b":["p","q"],"c":{"d":"e"},"n":3}',
  H_url_with_colon_comma:
    '{"u":"http://x.com/a,b?q=1","t":"end"}',
  I_truncated_plus_quote:
    '{"report_title":"t","executive_summary":"the "meta" story and more text that got cut',
};

const expect = {
  F_already_valid_escaped: 'O "ano" da IA',
  G_valid_nested_arrays: 'x',
  H_url_with_colon_comma: 'http://x.com/a,b?q=1',
};

let allOk = true;
for (const [name, input] of Object.entries(cases)) {
  try {
    const r = parseJsonSafe(input, name);
    const key = Object.keys(r)[0];
    let note = `OK -> ${key}="${String(r[key]).slice(0, 40)}"`;
    if (expect[name] !== undefined && r[key] !== expect[name]) { note = `VALOR ERRADO: "${r[key]}" != "${expect[name]}"`; allOk = false; }
    console.log(`✅ ${name}: ${note}`);
  } catch (e) {
    console.log(`❌ ${name}: ${String(e).split('\n')[0]}`);
    allOk = false;
  }
}
console.log(allOk ? '\nTODOS OS CASOS PASSARAM' : '\nHÁ FALHAS');
