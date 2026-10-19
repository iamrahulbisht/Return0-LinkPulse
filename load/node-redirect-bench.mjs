// Quick redirect benchmark with plain Node (no install), for when k6 is not available.
//   node load/node-redirect-bench.mjs http://localhost:4000 club-join 50 3000
// args: base, code, concurrency, total requests. Prints p50/p95/p99 and status counts.
// This is a local measurement; the plan's number of record is the k6 run against the live URL.
const [base = 'http://localhost:4000', code = 'club-join', conc = '50', total = '3000'] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const N = Number(total);
const times = [];
const statuses = {};
let next = 0;

async function worker(id) {
  while (next < N) {
    const i = next++;
    const t0 = performance.now();
    const res = await fetch(`${base}/${code}`, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'X-Forwarded-For': `10.${id}.${(i >> 8) & 255}.${i & 255}` },
    });
    await res.arrayBuffer();
    times.push(performance.now() - t0);
    statuses[res.status] = (statuses[res.status] ?? 0) + 1;
  }
}

const start = performance.now();
await Promise.all(Array.from({ length: Number(conc) }, (_, i) => worker(i)));
const secs = (performance.now() - start) / 1000;
times.sort((a, b) => a - b);
const p = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(1);
console.log(JSON.stringify({ requests: N, concurrency: Number(conc), seconds: secs.toFixed(1), rps: (N / secs).toFixed(0), p50_ms: p(0.5), p95_ms: p(0.95), p99_ms: p(0.99), statuses }, null, 2));
