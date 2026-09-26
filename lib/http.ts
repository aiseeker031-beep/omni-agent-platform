export async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${typeof data === "string" ? data.slice(0, 800) : JSON.stringify(data).slice(0, 800)}`);
  }
  return { data, headers: res.headers, status: res.status };
}
