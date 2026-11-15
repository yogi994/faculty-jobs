import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

// Many Indian university sites serve incomplete certificate chains, which
// Node's fetch rejects but curl (with the system store) accepts.
async function viaCurl(url, timeoutMs) {
  const { stdout } = await run(
    'curl',
    ['-sSL', '--fail', '--compressed', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-A', UA, url],
    { maxBuffer: 30 * 1024 * 1024 },
  );
  return stdout;
}

export async function fetchText(url, { timeoutMs = 25000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    try {
      return await viaCurl(url, timeoutMs);
    } catch (curlErr) {
      throw new Error(`${url}: ${err.message}; curl: ${curlErr.stderr?.trim() || curlErr.message}`);
    }
  }
}

export const clean = (s = '') => s.replace(/\s+/g, ' ').replace(/&#8211;|&ndash;/g, '-').trim();
