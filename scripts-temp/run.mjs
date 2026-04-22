// Simulate the server-fn pipeline locally against real Supabase + OpenAI.
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI = process.env.OPENAI_API_KEY;

const supa = createClient(SUPABASE_URL, SR, { auth: { persistSession: false } });

const EISENPAKKET_ID = '66428a0b-ac4e-4b14-b1cf-389854f45000';
const VERSION_LABEL = 'autorun-test-' + Date.now();
const STORAGE_PATH = '66428a0b-ac4e-4b14-b1cf-389854f45000/test-autorun.xlsx';
const FILE_HASH = 'autorun-' + Date.now();
const EMBEDDING_DIM = 1536;
const EMBEDDING_BATCH = 200;
const INSERT_BATCH = 500;

const t0 = Date.now();
const log = (p, x) => console.log(`+${Date.now()-t0}ms ${p}`, x?JSON.stringify(x):'');

// Cleanup any drafts from previous tries
const { data: drafts } = await supa.from('eisenpakket_versions')
  .select('id').eq('eisenpakket_id', EISENPAKKET_ID).eq('status','draft');
if (drafts?.length) {
  await supa.from('eisen').delete().in('eisenpakket_version_id', drafts.map(d=>d.id));
  await supa.from('eisenpakket_versions').delete().in('id', drafts.map(d=>d.id));
  log('cleaned drafts', { n: drafts.length });
}

// Download
const { data: blob, error: dlErr } = await supa.storage.from('requirements').download(STORAGE_PATH);
if (dlErr) throw dlErr;
log('downloaded', { size: blob.size });

const ab = await blob.arrayBuffer();
const wb = XLSX.read(ab, { type: 'array' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, blankrows: false });
log('parsed', { rows: raw.length });

const strOrNull = v => { if (v==null) return null; const s=String(v).trim(); return s||null; };

const eisen = [];
for (let i=0;i<raw.length;i++) {
  const r = raw[i];
  const objecttype = strOrNull(r['Objecttype']);
  const eis_code   = strOrNull(r['Klantnummer']);
  const eistitel   = strOrNull(r['Eistitel']);
  const eistekst   = strOrNull(r['Eistekst']);
  if (!objecttype||!eis_code||!eistitel||!eistekst) continue;
  const brondocument = strOrNull(r['Brondocument']);
  eisen.push({
    objecttype, eis_code, eistitel, eistekst, brondocument,
    bron_prefix: brondocument ? brondocument.trim().split(/\s+/)[0] : null,
    fase: strOrNull(r['Fase']),
    verantwoordelijke_rol: strOrNull(r['Verantwoordelijke rol']),
    verificatiemethode: strOrNull(r['Verificatiemethode']),
    type_bewijsdocument: strOrNull(r['Type bewijsdocument']),
    raw: { Bijlage: r['Bijlage'], Type: r['Type'], Scope: r['Scope'], 'Titel verificatieplan': r['Titel verificatieplan'] },
  });
}

// dedup
const seen = new Set();
const finalEisen = [];
let dupes = 0;
for (const e of eisen) {
  const k = `${e.objecttype}||${e.eis_code}`;
  if (seen.has(k)) { dupes++; continue; }
  seen.add(k); finalEisen.push(e);
}
log('dedup', { input: eisen.length, after: finalEisen.length, skipped: dupes });

// Create draft version
const { data: ver, error: verErr } = await supa.from('eisenpakket_versions').insert({
  eisenpakket_id: EISENPAKKET_ID, version_label: VERSION_LABEL,
  status: 'draft', source_file: 'test-autorun.xlsx',
  source_file_hash: FILE_HASH, row_count: finalEisen.length,
}).select('id').single();
if (verErr) throw verErr;
const version_id = ver.id;
log('draft', { version_id });

try {
  // Embeddings
  const embeds = new Array(finalEisen.length);
  const total = Math.ceil(finalEisen.length/EMBEDDING_BATCH);
  for (let s=0;s<finalEisen.length;s+=EMBEDDING_BATCH) {
    const batch = finalEisen.slice(s, s+EMBEDDING_BATCH);
    const inputs = batch.map(e => `${e.eistitel}\n\n${e.eistekst}`.substring(0,8000));
    const tB = Date.now();
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${OPENAI}` },
      body: JSON.stringify({ model:'text-embedding-3-small', input: inputs, dimensions: EMBEDDING_DIM }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (let k=0;k<batch.length;k++) embeds[s+k] = j.data[k].embedding;
    log(`embed ${Math.floor(s/EMBEDDING_BATCH)+1}/${total}`, { ms: Date.now()-tB });
  }

  // Insert
  let inserted = 0;
  for (let s=0;s<finalEisen.length;s+=INSERT_BATCH) {
    const batch = finalEisen.slice(s, s+INSERT_BATCH).map((e, i) => ({
      eisenpakket_version_id: version_id,
      objecttype: e.objecttype, eis_code: e.eis_code,
      eistitel: e.eistitel, eistekst: e.eistekst,
      brondocument: e.brondocument, bron_prefix: e.bron_prefix,
      fase: e.fase, verantwoordelijke_rol: e.verantwoordelijke_rol,
      verificatiemethode: e.verificatiemethode,
      type_bewijsdocument: e.type_bewijsdocument,
      embedding: `[${embeds[s+i].join(',')}]`,
      raw: e.raw,
    }));
    const tB = Date.now();
    const { error } = await supa.from('eisen').insert(batch);
    if (error) throw new Error(`insert: ${error.message}`);
    inserted += batch.length;
    log(`insert ${Math.floor(s/INSERT_BATCH)+1}`, { rows: batch.length, ms: Date.now()-tB });
  }

  await supa.from('eisenpakket_versions').update({ status:'active' }).eq('id', version_id);
  log('DONE', { inserted, total_ms: Date.now()-t0, version_id });
} catch (e) {
  log('FAIL — rollback', { error: e.message });
  await supa.from('eisen').delete().eq('eisenpakket_version_id', version_id);
  await supa.from('eisenpakket_versions').delete().eq('id', version_id);
  throw e;
}
