import type { PublicRecord } from '../generated-contract';

export type LocatedRecord = PublicRecord & { location: NonNullable<PublicRecord['location']> };
export interface LocationGroup { anchor: LocatedRecord['location']; records: LocatedRecord[] }

export function groupLocations(records: PublicRecord[], separation = 34): LocationGroup[] {
  const groups: LocationGroup[] = [];
  for (const record of records) {
    if (!record.location) continue;
    const located = record as LocatedRecord;
    const group = groups.find(item => Math.hypot((item.anchor.lon - located.location.lon) * 2.5, (item.anchor.lat - located.location.lat) * 2.5) < separation);
    if (group) group.records.push(located);
    else groups.push({ anchor: located.location, records: [located] });
  }
  return groups;
}
