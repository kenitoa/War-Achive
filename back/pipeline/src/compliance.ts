import type { SourceDefinition } from "./stages/types.js";

const crawlerName = "wararchivebot";

type RobotsRule = { directive: "allow" | "disallow"; pattern: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

function patternMatches(pattern: string, path: string): boolean {
  const endAnchored = pattern.endsWith("$");
  const raw = endAnchored ? pattern.slice(0, -1) : pattern;
  const expression = raw
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}${endAnchored ? "$" : ""}`).test(path);
}

export function robotsAllows(robotsText: string, targetUrl: string): boolean {
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let rules: RobotsRule[] = [];

  const flush = () => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      if (rules.length > 0) flush();
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (rules.length > 0) flush();
      agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && agents.length > 0) {
      if (key === "disallow" && value === "") continue;
      rules.push({ directive: key, pattern: value });
    }
  }
  flush();

  const specific = groups.filter((group) => group.agents.includes(crawlerName));
  const applicable = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));
  const path = `${new URL(targetUrl).pathname}${new URL(targetUrl).search}`;
  const matches = applicable
    .flatMap((group) => group.rules)
    .filter((rule) => patternMatches(rule.pattern, path))
    .sort((a, b) => b.pattern.length - a.pattern.length || (a.directive === "allow" ? -1 : 1));
  return matches[0]?.directive !== "disallow";
}

export function assertDeclaredCompliance(source: SourceDefinition): void {
  if ((source.kind ?? "url") !== "url") return;
  const declaration = source.compliance;
  if (!declaration) throw new Error(`정책 확인 정보가 없습니다: ${source.url ?? "URL 없음"}`);
  if (!declaration.crawlAllowed) throw new Error(`크롤링 허용 확인이 false입니다: ${source.url}`);
  if (!Number.isFinite(Date.parse(declaration.reviewedAt))) throw new Error(`reviewedAt 날짜가 올바르지 않습니다: ${source.url}`);
  for (const [name, value] of [["termsUrl", declaration.termsUrl], ["copyrightUrl", declaration.copyrightUrl]]) {
    if (!value.startsWith("https://")) throw new Error(`${name}은 확인한 HTTPS 근거 주소여야 합니다: ${source.url}`);
  }
  if (!Number.isInteger(declaration.minIntervalMs) || declaration.minIntervalMs < 1000) {
    throw new Error(`minIntervalMs는 1000 이상이어야 합니다: ${source.url}`);
  }
}

export async function assertRobotsAllowed(sourceUrl: string): Promise<void> {
  const target = new URL(sourceUrl);
  const robotsUrl = new URL("/robots.txt", target.origin);
  const response = await fetch(robotsUrl, {
    headers: { "user-agent": "WarArchiveBot/0.1 (+research archive)" },
    signal: AbortSignal.timeout(10_000)
  });
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) throw new Error(`robots.txt를 확인할 수 없습니다 (${response.status}): ${robotsUrl}`);
  const text = (await response.text()).slice(0, 512_000);
  if (!robotsAllows(text, sourceUrl)) throw new Error(`robots.txt가 크롤링을 허용하지 않습니다: ${sourceUrl}`);
}

const lastRequestByOrigin = new Map<string, number>();

export async function waitForSourceInterval(source: SourceDefinition): Promise<void> {
  if ((source.kind ?? "url") !== "url" || !source.url || !source.compliance) return;
  const origin = new URL(source.url).origin;
  const elapsed = Date.now() - (lastRequestByOrigin.get(origin) ?? 0);
  const remaining = source.compliance.minIntervalMs - elapsed;
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastRequestByOrigin.set(origin, Date.now());
}
