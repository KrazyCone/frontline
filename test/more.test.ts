import assert from 'node:assert/strict';
import test from 'node:test';
import { mixByCountry, parseCsv, readPlants } from '../scripts/csv';
import { POWER_RE, isEnglish, parseBsky, vesselKind } from '../scripts/util';
import { CONFLICTS, conflictFor, conflictStats, levelOf } from '../src/lib/conflicts';
import { normCountry } from '../src/lib/countries';
import { eventKind, planeKind, planeRank, vesselKindOf } from '../src/lib/kinds';
import { tensionIndex, tensionLevel, tensionSeries } from '../src/lib/tension';
import { activityZones, adminZones, clusters, hull, smooth } from '../src/lib/zones';
import type { Ev } from '../src/types';

const ev = (n: number, lat = 48.5, lon = 37.5, ts = Date.now(), o: Partial<Ev> = {}): Ev => ({
  id: `e${n}`, title: `t${n}`, lat, lon, country: 'Ukraine', conflict: 'Russia-Ukraine war', type: 'battle', severity: 2, source: 'x', ts, ...o,
});

test('bluesky feed becomes news items, skipping reposts, short posts and bad rows', () => {
  const post = (text: string, extra = {}) => ({
    post: { uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', author: { handle: 'apnews.com' }, record: { text, createdAt: '2026-11-05T12:00:00Z' } },
    ...extra,
  });
  const items = parseBsky({
    feed: [post('Missile strike hits   Kyiv\nresidential block'), post('Repost of something long enough', { reason: {} }), post('short'), {}],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Missile strike hits Kyiv residential block');
  assert.equal(items[0].url, 'https://bsky.app/profile/apnews.com/post/3kxyz');
  assert.equal(items[0].ts, Date.parse('2026-11-05T12:00:00Z'));
  assert.equal(items[0].source, '@apnews.com on Bluesky');
  assert.deepEqual(parseBsky(undefined), []);
});

test('hull keeps outer points only and smoothing rounds it', () => {
  const h = hull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 1]]);
  assert.equal(h.length, 4);
  assert.equal(smooth(h, 2).length, 16);
});

test('clusters link events through neighbours and keep distant ones apart', () => {
  // ~111 km between neighbours, so A-B and B-C link but C is ~222 km from A; D is on another continent.
  const g = clusters([ev(1, 48, 37), ev(2, 49, 37), ev(3, 50, 37), ev(4, 10, 100)], 150);
  assert.deepEqual(g.map((x) => x.length).sort(), [1, 3]);
});

test('a zone is one closed ring per cluster of 3+', () => {
  const now = Date.now();
  const z = activityZones([ev(1), ev(2, 48.7, 37.6), ev(3, 48.6, 37.9), ev(4, 55, 60), ev(5, 55.1, 60.1)], now);
  assert.equal(z.features.length, 1);
  const ring = (z.features[0].geometry as any).coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test('country names normalise across spellings', () => {
  assert.equal(normCountry('Dem. Rep. Congo'), normCountry('Democratic Republic of the Congo'));
  assert.equal(normCountry('S. Sudan'), normCountry('South Sudan'));
  assert.equal(normCountry('Russian Federation'), 'russia');
  assert.notEqual(normCountry('Sudan'), normCountry('South Sudan'));
});

test('events map to the right listed conflict', () => {
  const f = (country: string, title = 'x', conflict = '') => conflictFor({ country, title, conflict })?.id;
  assert.equal(f('Ukraine', 'x', 'Russia-Ukraine war'), 'ukraine');
  assert.equal(f('Gaza Strip', 'Strike on Gaza City', 'Gaza war'), 'israel-palestine');
  assert.equal(f('South Sudan'), 'south-sudan');
  assert.equal(f('Sudan', 'x', 'Sudan civil war'), 'sudan');
  assert.equal(f('Democratic Republic of Congo', 'x', 'M23 offensive'), 'drc');
  assert.equal(f('Atlantis'), undefined);
  assert.equal(new Set(CONFLICTS.map((c) => c.id)).size, CONFLICTS.length);
});

test('conflict stats count 24h activity, ignore power-only reports, keep unlisted conflicts', () => {
  const now = Date.now();
  const { byId, other } = conflictStats(
    [ev(1, 48.5, 37.5, now), ev(2, 48.5, 37.5, now - 2 * 864e5, { severity: 3 }), ev(3, 48.5, 37.5, now, { conflict: '', power: true }), ev(4, 1, 1, now, { country: 'Atlantis', conflict: 'Atlantis war' })],
    now,
  );
  const u = byId.get('ukraine')!;
  assert.deepEqual([u.day, u.total, u.major], [1, 2, 1]);
  assert.equal(other.get('Atlantis war')!.total, 1);
  assert.deepEqual([levelOf(10), levelOf(3), levelOf(2)], ['high', 'active', 'low']);
});

test('power headlines are recognised', () => {
  assert.ok(POWER_RE.test('Millions without power after grid failure'));
  assert.ok(POWER_RE.test('Russian strike hits power plant near Kyiv'));
  assert.ok(POWER_RE.test('Nationwide blackout hits Cuba'));
  assert.ok(!POWER_RE.test('Prime minister wins power struggle'));
});

test('csv parser handles quotes, commas, escaped quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('plant csv is read by column name and grouped by country and fuel', () => {
  const csv = '﻿country,name,capacity_mw,latitude,longitude,primary_fuel\nUKR,Zaporizhia,5700,47.51,34.58,Nuclear\nUKR,Kyiv CHP,500,50.4,30.6,Gas\nUKR,Bad,x,1,2,Coal\nUSA,Solar farm,150,35,-117,Solar\n';
  const p = readPlants(csv);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], { n: 'Zaporizhia', x: 34.58, y: 47.51, m: 5700, f: 'nuclear', c: 'UKR' });
  assert.deepEqual(mixByCountry(p).UKR, { mw: 6200, mix: { nuclear: 5700, gas: 500 } });
  assert.throws(() => readPlants('country,name\nUKR,x'), /capacity_mw/);
});

test('admin zones keep each feature\'s own name, description, colour and extra fields', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'Donbas', description: 'Contested front', fill: '#00ff00', controlled_by: 'Russia', nested: { a: 1 } }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      { type: 'Feature', properties: { stroke: 'not a colour!' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
    ],
  };
  const [a, b] = adminZones([{ id: 'z', name: 'Fallback', color: '#ff0000', description: 'Doc text', geojson: JSON.stringify(fc) }]);
  const pa = a.properties as Record<string, unknown>, pb = b.properties as Record<string, unknown>;
  assert.deepEqual([pa.name, pa.description, pa.color, pa.controlled_by, pa.admin], ['Donbas', 'Contested front', '#00ff00', 'Russia', true]);
  assert.equal('nested' in pa, false);
  assert.deepEqual([pb.name, pb.description, pb.color], ['Fallback', 'Doc text', '#ff0000']);
});

test('icons: event, aircraft and vessel kinds', () => {
  assert.equal(eventKind('airstrike'), 'airstrike');
  assert.equal(eventKind('explosions/remote violence'), 'explosion');
  assert.equal(eventKind('battles'), 'battle');
  assert.equal(eventKind('violence against civilians'), 'civilians');
  assert.equal(eventKind('battle', true), 'power');
  assert.equal(eventKind(undefined), 'other');
  assert.equal(planeKind({ t: 'H60', desc: 'Sikorsky UH-60 Black Hawk' }), 'helo');
  assert.equal(planeKind({ t: 'C17', desc: 'Boeing C-17 Globemaster III' }), 'plane');
  assert.equal(vesselKindOf({ kind: 'tanker' }), 'tanker');
  assert.equal(vesselKindOf({ navy: true }), 'navy');
  assert.equal(vesselKindOf({ kind: 'bogus' }), 'other');
});

test('AIS ship types group into vessel kinds', () => {
  assert.deepEqual([70, 75, 80, 84, 60, 30, 31, 36, 35, 99].map((t) => vesselKind(t)), ['cargo', 'cargo', 'tanker', 'tanker', 'passenger', 'fishing', 'tug', 'sail', 'navy', 'other']);
  assert.equal(vesselKind(undefined, 'USS Gerald R. Ford'), 'navy');
  assert.equal(vesselKind(undefined, 'MSC ANNA'), 'other');
});

test('only English headlines pass', () => {
  assert.ok(isEnglish('Missile strike hits residential block in Kyiv'));
  assert.ok(isEnglish('Gaza ceasefire'));
  assert.ok(!isEnglish('Ataque con misiles deja diez muertos en Kiev'));
  assert.ok(!isEnglish('Frappes russes sur Kharkiv, plusieurs blessés'));
  assert.ok(!isEnglish('Russland greift Kiew mit Raketen an'));
  assert.ok(!isEnglish('Удар по Харькову: есть погибшие'));
  assert.ok(!isEnglish('غارة جوية على غزة'));
  assert.ok(!isEnglish('12345 !!!'));
});

test('bluesky posts tagged with another language are skipped', () => {
  const post = (langs?: string[]) => ({ post: { uri: 'at://d/app.bsky.feed.post/k1', author: { handle: 'x.com' }, record: { text: 'A long enough post about something', createdAt: '2026-11-05T12:00:00Z', langs } } });
  assert.equal(parseBsky({ feed: [post(['en']), post(['es']), post(undefined), post(['en', 'es'])] }).length, 3);
});

test('tension index rises with volume and severity, ignores old and power-only reports', () => {
  const now = Date.now();
  const mk = (n: number, sev: 1 | 2 | 3, ageH: number, o: Partial<Ev> = {}) => Array.from({ length: n }, (_, i) => ev(i, 48.5, 37.5, now - ageH * 36e5, { severity: sev, ...o }));
  assert.equal(tensionIndex([], now), 0);
  const quiet = tensionIndex(mk(10, 1, 1), now), busy = tensionIndex(mk(10, 3, 1), now);
  assert.ok(busy > quiet && busy < 100);
  assert.equal(tensionIndex(mk(10, 3, 30), now), 0); // older than 24h
  assert.equal(tensionIndex(mk(10, 3, 1, { conflict: '', power: true }), now), 0);
  assert.equal(tensionIndex(mk(30, 2, 1), now), tensionIndex(mk(30, 2, 1), now)); // 30*3 = 90 -> 38
  assert.equal(tensionIndex(mk(30, 2, 1), now), 38);
});

test('tension series is oldest-first with 17 points and sees an earlier spike', () => {
  const now = Date.now();
  const spike = Array.from({ length: 40 }, (_, i) => ev(i, 48.5, 37.5, now - 40 * 36e5, { severity: 3 }));
  const s = tensionSeries(spike, now);
  assert.equal(s.length, 17);
  assert.ok(s[3] > 0 && s[0] === 0 && s[16] === 0); // the spike enters the 24h window at -40h and ages out by now
  assert.deepEqual([tensionLevel(10), tensionLevel(40), tensionLevel(60), tensionLevel(90)], ['Calm', 'Elevated', 'High', 'Severe']);
});

test('the most notable aircraft is ranked first', () => {
  assert.ok(planeRank({ desc: 'Boeing E-3 Sentry', flight: 'SENTRY1' }) > planeRank({ desc: 'Boeing C-17 Globemaster III', flight: 'RCH123' }));
  assert.ok(planeRank({ desc: 'Boeing C-17 Globemaster III' }) > planeRank({ desc: 'Cessna 172' }));
  assert.ok(planeRank({ flight: 'ABC1' }) > planeRank({}));
});
