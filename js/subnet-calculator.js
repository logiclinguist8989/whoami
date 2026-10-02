/* IPv4 subnet calculator — runs entirely in the browser. */
(function () {
  'use strict';

  const MAX_SPLIT_ROWS = 256;

  // ----- Pure helpers -----

  function parseIp(text) {
    const parts = text.trim().split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const octet = Number(part);
      if (octet > 255) return null;
      value = value * 256 + octet;
    }
    return value;
  }

  function toIp(value) {
    return [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join('.');
  }

  function prefixToMask(prefix) {
    return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  }

  function maskToPrefix(mask) {
    // Valid masks are a run of 1s followed by 0s
    const inverted = (~mask) >>> 0;
    if (((inverted + 1) & inverted) !== 0) return null;
    let prefix = 0;
    for (let bit = 31; bit >= 0; bit--) {
      if ((mask >>> bit) & 1) prefix++;
    }
    return prefix;
  }

  function toBinary(value, prefix) {
    const bits = value.toString(2).padStart(32, '0');
    return { network: bits.slice(0, prefix), host: bits.slice(prefix) };
  }

  function ipClass(ip) {
    const first = Math.floor(ip / 2 ** 24);
    if (first < 128) return 'A';
    if (first < 192) return 'B';
    if (first < 224) return 'C';
    if (first < 240) return 'D (multicast)';
    return 'E (reserved)';
  }

  const RANGES = [
    ['0.0.0.0', 8, 'This network'],
    ['10.0.0.0', 8, 'Private'],
    ['100.64.0.0', 10, 'Carrier-grade NAT'],
    ['127.0.0.0', 8, 'Loopback'],
    ['169.254.0.0', 16, 'Link-local'],
    ['172.16.0.0', 12, 'Private'],
    ['192.0.2.0', 24, 'Documentation'],
    ['192.168.0.0', 16, 'Private'],
    ['198.18.0.0', 15, 'Benchmarking'],
    ['198.51.100.0', 24, 'Documentation'],
    ['203.0.113.0', 24, 'Documentation'],
    ['224.0.0.0', 4, 'Multicast'],
    ['255.255.255.255', 32, 'Limited broadcast'],
    ['240.0.0.0', 4, 'Reserved']
  ].map(([base, prefix, label]) => ({ base: parseIp(base), mask: prefixToMask(prefix), label }));

  function ipType(ip) {
    const match = RANGES.find(range => ((ip & range.mask) >>> 0) === range.base);
    return match ? match.label : 'Public';
  }

  function calculate(ip, prefix) {
    const mask = prefixToMask(prefix);
    const network = (ip & mask) >>> 0;
    const broadcast = (network | ~mask) >>> 0;
    const total = 2 ** (32 - prefix);

    let firstHost, lastHost, usable;
    if (prefix === 32) {
      firstHost = lastHost = network;
      usable = 1;
    } else if (prefix === 31) {
      // Point-to-point link: both addresses are usable (RFC 3021)
      firstHost = network;
      lastHost = broadcast;
      usable = 2;
    } else {
      firstHost = network + 1;
      lastHost = broadcast - 1;
      usable = total - 2;
    }

    return {
      ip, prefix, mask, network, broadcast, total, usable, firstHost, lastHost,
      wildcard: (~mask) >>> 0,
      ipClass: ipClass(ip),
      type: ipType(ip)
    };
  }

  function split(network, prefix, newPrefix) {
    const count = 2 ** (newPrefix - prefix);
    const size = 2 ** (32 - newPrefix);
    const rows = [];
    for (let i = 0; i < Math.min(count, MAX_SPLIT_ROWS); i++) {
      rows.push(calculate(network + i * size, newPrefix));
    }
    return { count, rows };
  }

  // Accepts "a.b.c.d/nn", "a.b.c.d nn.nn.nn.nn" or a bare "a.b.c.d" (uses fallbackPrefix)
  function parseInput(text, fallbackPrefix) {
    const trimmed = text.trim();
    if (!trimmed) return { error: 'Enter an IPv4 address, for example 192.168.1.10/24.' };

    let ipText = trimmed;
    let prefix = fallbackPrefix;

    if (trimmed.includes('/')) {
      const [left, right] = trimmed.split('/');
      ipText = left;
      if (!/^\d{1,2}$/.test(right.trim()) || Number(right) > 32) {
        return { error: 'The prefix after "/" must be a number from 0 to 32.' };
      }
      prefix = Number(right);
    } else if (/\s/.test(trimmed)) {
      const [left, right] = trimmed.split(/\s+/);
      ipText = left;
      const mask = parseIp(right);
      const maskPrefix = mask === null ? null : maskToPrefix(mask);
      if (maskPrefix === null) {
        return { error: `"${right}" is not a valid subnet mask.` };
      }
      prefix = maskPrefix;
    }

    const ip = parseIp(ipText);
    if (ip === null) {
      return { error: `"${ipText.trim()}" is not a valid IPv4 address. Use four numbers from 0 to 255, like 10.0.0.1.` };
    }
    return { ip, prefix };
  }

  const api = { parseIp, toIp, prefixToMask, maskToPrefix, calculate, split, parseInput, ipType };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ----- UI -----

  const form = document.getElementById('calc-form');
  const input = document.getElementById('ip-input');
  const maskSelect = document.getElementById('mask-select');
  const errorEl = document.getElementById('calc-error');
  const output = document.getElementById('output');
  const resultsEl = document.getElementById('results');
  const badgesEl = document.getElementById('badges');
  const binaryBody = document.getElementById('binary-body');
  const splitSelect = document.getElementById('split-select');
  const splitNote = document.getElementById('split-note');
  const splitBody = document.getElementById('split-body');
  const splitTableWrap = document.getElementById('split-table-wrap');

  let current = null;

  for (let p = 32; p >= 0; p--) {
    const option = document.createElement('option');
    option.value = String(p);
    option.textContent = `/${p} — ${toIp(prefixToMask(p))}`;
    maskSelect.appendChild(option);
  }
  maskSelect.value = '24';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    });
    (children || []).forEach(child => {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function stat(label, value, highlight) {
    return el('div', { className: highlight ? 'stat highlight' : 'stat' }, [
      el('dt', {}, [label]),
      el('dd', {}, [value])
    ]);
  }

  function binaryRow(label, value, prefix) {
    const { network, host } = toBinary(value, prefix);
    const cell = el('td');
    const group = (bits, offset, className) => {
      const span = el('span', { className });
      // Dot between octets
      span.textContent = bits.replace(/./g, (bit, i) => ((offset + i) % 8 === 0 && offset + i > 0 ? '.' : '') + bit);
      return span;
    };
    cell.appendChild(group(network, 0, 'bit-net'));
    cell.appendChild(group(host, network.length, 'bit-host'));
    return el('tr', {}, [el('th', { scope: 'row' }, [label]), cell]);
  }

  function renderSplit() {
    if (!current) return;
    splitBody.textContent = '';
    if (!splitSelect.value) {
      splitNote.textContent = 'A /32 is a single address and cannot be split further.';
      splitTableWrap.hidden = true;
      return;
    }
    splitTableWrap.hidden = false;
    const newPrefix = Number(splitSelect.value);
    const { count, rows } = split(current.network, current.prefix, newPrefix);
    const each = calculate(current.network, newPrefix).usable.toLocaleString();
    splitNote.textContent = count > MAX_SPLIT_ROWS
      ? `${count.toLocaleString()} subnets with ${each} usable hosts each — showing the first ${MAX_SPLIT_ROWS}.`
      : `${count.toLocaleString()} subnets with ${each} usable hosts each.`;
    rows.forEach((row, i) => {
      splitBody.appendChild(el('tr', {}, [
        el('td', {}, [String(i + 1)]),
        el('td', {}, [`${toIp(row.network)}/${row.prefix}`]),
        el('td', {}, [`${toIp(row.firstHost)} – ${toIp(row.lastHost)}`]),
        el('td', {}, [toIp(row.broadcast)])
      ]));
    });
  }

  function render(r) {
    current = r;
    resultsEl.textContent = '';
    badgesEl.textContent = '';
    binaryBody.textContent = '';

    const badge = (label, value) => el('span', { className: 'badge' }, [`${label}: `, el('strong', {}, [value])]);
    badgesEl.append(badge('Class', r.ipClass), badge('Type', r.type), badge('CIDR', `/${r.prefix}`));

    resultsEl.append(
      stat('Network address', `${toIp(r.network)}/${r.prefix}`, true),
      stat('Broadcast address', r.prefix >= 31 ? 'None' : toIp(r.broadcast)),
      stat('First usable host', toIp(r.firstHost)),
      stat('Last usable host', toIp(r.lastHost)),
      stat('Usable hosts', r.usable.toLocaleString(), true),
      stat('Total addresses', r.total.toLocaleString()),
      stat('Subnet mask', toIp(r.mask)),
      stat('Wildcard mask', toIp(r.wildcard)),
      stat('Hex address', '0x' + r.ip.toString(16).toUpperCase().padStart(8, '0'))
    );

    binaryBody.append(
      binaryRow('IP address', r.ip, r.prefix),
      binaryRow('Subnet mask', r.mask, r.prefix),
      binaryRow('Network', r.network, r.prefix),
      binaryRow('Broadcast', r.broadcast, r.prefix)
    );

    const previous = Number(splitSelect.value);
    splitSelect.textContent = '';
    for (let p = r.prefix + 1; p <= 32; p++) {
      const option = document.createElement('option');
      option.value = String(p);
      option.textContent = `/${p} — ${(2 ** (p - r.prefix)).toLocaleString()} subnets`;
      splitSelect.appendChild(option);
    }
    splitSelect.disabled = r.prefix === 32;
    if (previous > r.prefix && previous <= 32) splitSelect.value = String(previous);
    else if (r.prefix < 32) splitSelect.value = String(Math.min(r.prefix + 2, 32));
    renderSplit();

    output.hidden = false;
  }

  function run() {
    const parsed = parseInput(input.value, Number(maskSelect.value));
    if (parsed.error) {
      errorEl.textContent = parsed.error;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    errorEl.textContent = '';
    input.removeAttribute('aria-invalid');
    maskSelect.value = String(parsed.prefix);
    render(calculate(parsed.ip, parsed.prefix));
    const shareable = `${toIp(parsed.ip)}/${parsed.prefix}`;
    if (location.hash.slice(1) !== shareable) history.replaceState(null, '', `#${shareable}`);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    run();
  });

  // Picking a mask replaces any typed /prefix
  maskSelect.addEventListener('change', () => {
    const ipOnly = input.value.trim().split(/[\/\s]/)[0];
    input.value = `${ipOnly}/${maskSelect.value}`;
    run();
  });

  splitSelect.addEventListener('change', renderSplit);

  document.querySelectorAll('[data-example]').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.example;
      run();
    });
  });

  document.getElementById('year').textContent = new Date().getFullYear();

  // Allow sharing a calculation via the URL, e.g. #10.0.0.0/8
  function loadFromHash() {
    if (location.hash.length > 1) input.value = decodeURIComponent(location.hash.slice(1));
    run();
  }

  window.addEventListener('hashchange', loadFromHash);
  loadFromHash();
})();
