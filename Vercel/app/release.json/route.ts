import { archive } from '@/lib/archive';
import { createHash } from 'node:crypto';
export const dynamic = 'force-static';
export function GET() {
  const data = archive();
  return Response.json({ schemaVersion: data.schemaVersion, releaseId: data.releaseId, generatedAt: data.generatedAt, records: data.records.length, wars: data.wars.length, sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex') });
}
