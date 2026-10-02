// Run with: node tests/subnet-calculator.test.js
const assert = require('assert');
const c = require('../js/subnet-calculator.js');

const ip = c.toIp;
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
}

function calc(text) {
  const parsed = c.parseInput(text, 24);
  assert.ok(!parsed.error, `${text}: ${parsed.error}`);
  const r = c.calculate(parsed.ip, parsed.prefix);
  return {
    network: ip(r.network), broadcast: ip(r.broadcast), first: ip(r.firstHost), last: ip(r.lastHost),
    usable: r.usable, total: r.total, mask: ip(r.mask), wildcard: ip(r.wildcard), type: r.type
  };
}

test('/24', () => assert.deepStrictEqual(calc('192.168.1.10/24'), {
  network: '192.168.1.0', broadcast: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254',
  usable: 254, total: 256, mask: '255.255.255.0', wildcard: '0.0.0.255', type: 'Private'
}));

test('/26', () => {
  const r = calc('172.16.5.130/26');
  assert.deepStrictEqual([r.network, r.broadcast, r.usable], ['172.16.5.128', '172.16.5.191', 62]);
});

test('/0', () => {
  const r = calc('10.1.2.3/0');
  assert.deepStrictEqual([r.network, r.broadcast, r.total, r.usable, r.mask], ['0.0.0.0', '255.255.255.255', 2 ** 32, 2 ** 32 - 2, '0.0.0.0']);
});

test('/31 point-to-point (RFC 3021)', () => {
  const r = calc('10.0.0.5/31');
  assert.deepStrictEqual([r.first, r.last, r.usable], ['10.0.0.4', '10.0.0.5', 2]);
});

test('/32 single host', () => {
  const r = calc('8.8.8.8/32');
  assert.deepStrictEqual([r.network, r.first, r.last, r.usable, r.type], ['8.8.8.8', '8.8.8.8', '8.8.8.8', 1, 'Public']);
});

test('address types', () => {
  const types = {
    '10.0.0.1': 'Private', '172.16.0.1': 'Private', '172.31.255.255': 'Private', '172.32.0.0': 'Public',
    '192.168.0.1': 'Private', '127.0.0.1': 'Loopback', '169.254.1.1': 'Link-local', '100.64.0.1': 'Carrier-grade NAT',
    '100.128.0.0': 'Public', '192.0.0.8': 'IETF protocol assignments', '192.0.2.1': 'Documentation',
    '198.18.0.1': 'Benchmarking', '224.0.0.1': 'Multicast', '240.0.0.1': 'Reserved',
    '255.255.255.255': 'Limited broadcast', '0.1.2.3': 'This network', '1.1.1.1': 'Public'
  };
  for (const [addr, type] of Object.entries(types)) assert.strictEqual(c.ipType(c.parseIp(addr)), type, addr);
});

test('subnet masks', () => {
  assert.strictEqual(c.maskToPrefix(c.parseIp('255.255.255.192')), 26);
  assert.strictEqual(c.maskToPrefix(0), 0);
  assert.strictEqual(c.maskToPrefix(0xFFFFFFFF), 32);
  assert.strictEqual(c.maskToPrefix(c.parseIp('255.0.255.0')), null);
});

test('accepted input formats', () => {
  const ok = {
    '192.168.1.1/24': '192.168.1.1/24', '192.168.1.1 /24': '192.168.1.1/24', '192.168.1.1/ 26': '192.168.1.1/26',
    ' 10.0.0.1/8 ': '10.0.0.1/8', '192.168.1.1 24': '192.168.1.1/24', '192.168.1.1 255.255.255.0': '192.168.1.1/24',
    '1.2.3.4\t255.255.0.0': '1.2.3.4/16', '10.0.0.1': '10.0.0.1/24', '0.0.0.0/0': '0.0.0.0/0'
  };
  for (const [text, expected] of Object.entries(ok)) {
    const r = c.parseInput(text, 24);
    assert.ok(!r.error, `${text}: ${r.error}`);
    assert.strictEqual(`${ip(r.ip)}/${r.prefix}`, expected, text);
  }
});

test('rejected input', () => {
  const bad = ['', '/24', '192.168.1.1/', '192.168.1.1/33', '192.168.1.1/24/5', '1.2.3.4/-1', '1.2.3.4/3.5',
    '192.168.1.1 255.255.255.0 junk', '192.168.1.1 255.0.255.0', '192.168.1.1 33', '1.2.3', '1.2.3.4.5',
    'a.b.c.d/24', '1..2.3/24', '256.0.0.0/8', '010.0.0.1/8', '10.0.00.1/8'];
  for (const text of bad) assert.ok(c.parseInput(text, 24).error, `should reject ${JSON.stringify(text)}`);
});

test('splitting', () => {
  const s = c.split(c.parseIp('192.168.1.0'), 24, 26);
  assert.strictEqual(s.count, 4);
  assert.deepStrictEqual(s.rows.map(r => `${ip(r.network)}-${ip(r.broadcast)}`), [
    '192.168.1.0-192.168.1.63', '192.168.1.64-192.168.1.127',
    '192.168.1.128-192.168.1.191', '192.168.1.192-192.168.1.255'
  ]);
  const huge = c.split(0, 0, 32);
  assert.deepStrictEqual([huge.count, huge.rows.length], [2 ** 32, 256]);
});

console.log(`All ${passed} subnet calculator tests passed.`);
