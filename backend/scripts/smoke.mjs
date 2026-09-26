// Live smoke test: drives the actually-running HTTP server (node dist/server.js)
// end to end using in-memory multipart (Blob/FormData) — no local file involved,
// so nothing is read off disk and posted. Verifies the standalone server
// bootstrap + background worker + HTTP layer, which the in-process Jest suite
// does not cover.
const BASE = process.env.BASE || 'http://localhost:4999';

const pdf = () =>
  new Blob([Buffer.from('%PDF-1.4\nsmoke success\n%%EOF')], { type: 'application/pdf' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await (await fetch(`${BASE}/health`)).json();
  console.log('health:', JSON.stringify(health));

  const form = new FormData();
  form.append('documentType', 'FINANCIAL_STATEMENT');
  form.append('file', pdf(), 'smoke-success.pdf');
  const up = await (await fetch(`${BASE}/api/documents`, { method: 'POST', body: form })).json();
  console.log('upload:', JSON.stringify(up));
  const id = up.documentId;

  // Poll until terminal.
  let detail;
  for (let i = 0; i < 15; i++) {
    await sleep(400);
    detail = await (await fetch(`${BASE}/api/documents/${id}`)).json();
    if (detail.status === 'PROCESSED' || detail.status === 'FAILED') break;
  }
  console.log('detail:', JSON.stringify({ status: detail.status, result: detail.result }));

  const history = await (await fetch(`${BASE}/api/documents/${id}/history`)).json();
  const statuses = history.map((h) => h.status);
  console.log('history:', JSON.stringify(statuses));

  const stats = await (await fetch(`${BASE}/api/documents/stats`)).json();
  console.log('stats:', JSON.stringify(stats));

  // Duplicate upload (same bytes) should return 200 + duplicate=true.
  const form2 = new FormData();
  form2.append('documentType', 'FINANCIAL_STATEMENT');
  form2.append('file', pdf(), 'renamed.pdf');
  const dupRes = await fetch(`${BASE}/api/documents`, { method: 'POST', body: form2 });
  const dup = await dupRes.json();
  console.log('duplicate:', dupRes.status, JSON.stringify(dup));

  const ok =
    detail.status === 'PROCESSED' &&
    detail.result?.companyName === 'ABC Construction Pvt Ltd' &&
    statuses[0] === 'UPLOADED' &&
    statuses.includes('PROCESSED') &&
    dup.duplicate === true &&
    dup.documentId === id;
  console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
