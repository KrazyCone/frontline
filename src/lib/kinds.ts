/** Which icon an event, aircraft or vessel gets. Pure, so it can be tested without a browser. */

export type EventKind = 'airstrike' | 'battle' | 'explosion' | 'naval' | 'ceasefire' | 'civilians' | 'protest' | 'power' | 'other';

export function eventKind(type: string | undefined, power?: boolean): EventKind {
  if (power) return 'power';
  const t = (type ?? '').toLowerCase();
  if (/air|drone/.test(t)) return 'airstrike';
  if (/explosion|shell|artillery|missile|remote/.test(t)) return 'explosion';
  if (/battle|clash|armed/.test(t)) return 'battle';
  if (/naval|ship|sea/.test(t)) return 'naval';
  if (/ceasefire|truce|peace|strategic/.test(t)) return 'ceasefire';
  if (/civilian|violence/.test(t)) return 'civilians';
  if (/protest|riot/.test(t)) return 'protest';
  return 'other';
}

export const EVENT_LABEL: Record<EventKind, string> = {
  airstrike: 'Air / drone strike', battle: 'Battle', explosion: 'Explosion / shelling', naval: 'Naval',
  ceasefire: 'Ceasefire / diplomacy', civilians: 'Violence against civilians', protest: 'Protest / unrest', power: 'Power outage / grid', other: 'Other',
};

const HELO_DESC = /helicopter|black ?hawk|chinook|apache|sea ?hawk|lakota|huey|cobra|osprey/i;
const HELO_CODE = /^(H\d{2}|UH|CH|AH|MH|HH|SH|S70|S92|EC\d|AS\d|B06|B407|NH90|A139|AW\d)/i;
export const planeKind = (p: { t?: string; desc?: string }): 'plane' | 'helo' => (HELO_DESC.test(p.desc ?? '') || HELO_CODE.test(p.t ?? '') ? 'helo' : 'plane');

export const VESSEL_KINDS = ['navy', 'cargo', 'tanker', 'passenger', 'fishing', 'tug', 'sail', 'other'] as const;
export type VesselKind = (typeof VESSEL_KINDS)[number];
export const VESSEL_LABEL: Record<VesselKind, string> = {
  navy: 'Naval vessel', cargo: 'Cargo ship', tanker: 'Tanker', passenger: 'Passenger ship', fishing: 'Fishing vessel', tug: 'Tug / service vessel', sail: 'Sailing / pleasure craft', other: 'Vessel',
};
/** Older data only has the `navy` flag. */
export const vesselKindOf = (v: { kind?: string; navy?: boolean }): VesselKind =>
  (VESSEL_KINDS as readonly string[]).includes(v.kind ?? '') ? (v.kind as VesselKind) : v.navy ? 'navy' : 'other';
