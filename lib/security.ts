import dns from "node:dns/promises";
import net from "node:net";

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

export async function assertPublicHttpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Remote connector URLs must use HTTPS");
  if (url.username || url.password) throw new Error("Credentials must not be embedded in connector URLs");
  if (["localhost","localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Local/private connector URLs are not allowed");
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((r) => privateIp(r.address))) throw new Error("Local/private connector addresses are not allowed");
  return url;
}
