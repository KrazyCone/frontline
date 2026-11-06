import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFLICT_RE, gdeltTs, keywords, parseRss } from '../scripts/util';
import { hourId, recent5pms } from '../src/lib/time';
import { activityZones, adminZones } from '../src/lib/zones';
import type { Ev } from '../src/types';

const ev = (n: number, ts = Date.now(), lat = 48.5, lon = 37.5): Ev => ({
  id: `e${n}`, title: `t${n}`, lat, lon, country: 'Ukraine', conflict: 'Russia-Ukraine war', type: 'battle', severity: 2, source: 'x', ts,
});

test('parseRss handles CDATA, escaped html and skips items without a link', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Strikes hit city & port]]></title><link>https://x.test/a</link>
      <description>&lt;p&gt;Hello&lt;/p&gt;</description><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>No link</title></item></channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Strikes hit city & port');
  assert.equal(items[0].summary, 'Hello');
  assert.equal(items[0].ts, Date.parse('2026-11-03T10:00:00Z'));
});

test('conflict filter and keyword counting', () => {
  assert.ok(CONFLICT_RE.test('Missile strike hits Kyiv'));
  assert.ok(!CONFLICT_RE.test('Local bakery wins award'));
  const k = keywords(['Airstrike hits Kyiv', 'Missile strike near Kyiv', 'Kyiv power cut']);
  assert.deepEqual(k[0], { word: 'kyiv', count: 3 });
});

test('gdelt timestamps parse', () => {
  assert.equal(gdeltTs('20261103T120000Z'), Date.parse('2026-11-03T12:00:00Z'));
});

test('activity zones need 3 recent events in one cell', () => {
  assert.equal(activityZones([ev(1), ev(2), ev(3)]).features.length, 1);
  assert.equal(activityZones([ev(1), ev(2)]).features.length, 0);
  const old = Date.now() - 73 * 36e5;
  assert.equal(activityZones([ev(1, old), ev(2, old), ev(3, old)]).features.length, 0);
});

test('admin zones accept Polygon, Feature and bad JSON', () => {
  const poly = '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}';
  const z = (geojson: string) => ({ id: 'z', name: 'Z', color: '#f00', geojson });
  assert.equal(adminZones([z(poly), z(`{"type":"Feature","geometry":${poly}}`), z('not json')]).length, 2);
});

test('recent5pms returns 5 PM local slots, newest already passed', () => {
  const before = recent5pms(3, new Date(2026, 10, 3, 16, 0));
  assert.equal(before[0].getDate(), 2);
  const after = recent5pms(3, new Date(2026, 10, 3, 18, 0));
  assert.equal(after[0].getDate(), 3);
  assert.ok(after.every((d) => d.getHours() === 17));
  assert.equal(hourId(new Date('2026-11-03T22:30:00Z')), '2026-11-03T22');
});
