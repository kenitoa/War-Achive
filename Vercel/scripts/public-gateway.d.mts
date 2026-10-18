export const PUBLIC_API_PATHS: readonly string[];
export function gatewayBaseUrl(value: unknown): string;
export function gatewayRewrites(value: unknown): { source: string; destination: string }[];
export function verifyGatewayRewrites(rewrites: unknown): string | undefined;
