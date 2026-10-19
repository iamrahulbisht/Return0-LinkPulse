// IP → country and city, offline (geoip-lite ships its own database). Loaded on first use.
// Set GEOIP_ENABLED=false on very small hosts to save memory; cities then show as "—".
type GeoLookup = (ip: string) => { country?: string; city?: string } | null;
let lookup: GeoLookup | null | undefined;

function load(): GeoLookup | null {
  if (lookup !== undefined) return lookup;
  if (process.env.GEOIP_ENABLED === 'false' || process.env.NODE_ENV === 'test') {
    lookup = null;
    return lookup;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const geoip = require('geoip-lite') as { lookup: GeoLookup };
    lookup = geoip.lookup;
  } catch {
    lookup = null;
  }
  return lookup;
}

export function geoFromIp(ip: string): { country: string | null; city: string | null } {
  const fn = load();
  if (!fn) return { country: null, city: null };
  const clean = ip.replace(/^::ffff:/, '');
  const r = fn(clean);
  return { country: r?.country || null, city: r?.city || null };
}
