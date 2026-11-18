import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { svg, NAMES } = createRequire(import.meta.url)('../icons.js');

const REQUIRED = ['coffee', 'utensils', 'martini', 'beer', 'landmark', 'drama', 'car', 'shirt', 'disc', 'star', 'star-fill', 'check', 'map-pin', 'walk', 'clock', 'umbrella', 'search', 'sliders', 'x', 'chevron-left', 'chevron-down', 'arrow-up', 'arrow-down', 'plus', 'share', 'calendar', 'tram', 'bus', 'taxi', 'alert', 'wifi-off', 'locate', 'external', 'map', 'list', 'ticket', 'home', 'moon', 'info'];

describe('icons', () => {
  test('every name renders a decorative outline svg', () => {
    // Arrange / Act / Assert
    for (const name of NAMES) {
      const out = svg(name);
      assert.ok(out.startsWith('<svg'), name);
      assert.ok(out.includes('viewBox="0 0 24 24"'), name);
      assert.ok(out.includes('aria-hidden="true"'), name);
    }
  });

  test('NAMES is frozen and contains every required name', () => {
    assert.ok(Object.isFrozen(NAMES));
    assert.deepEqual([...NAMES].sort(), [...REQUIRED].sort());
  });

  test('label gives role img and an escaped aria-label', () => {
    const out = svg('map-pin', { label: '"<x>&"' });
    assert.ok(out.includes('role="img"'));
    assert.ok(out.includes('aria-label="&quot;&lt;x&gt;&amp;&quot;"'));
    assert.ok(!out.includes('<x>'));
    assert.ok(!out.includes('aria-hidden'));
  });

  test('unknown name returns empty string and warns once', () => {
    const warn = mock.method(console, 'warn', () => {});
    try {
      assert.equal(svg('no-such-icon'), '');
      assert.equal(svg('no-such-icon'), '');
      assert.equal(warn.mock.callCount(), 1);
    } finally {
      warn.mock.restore();
    }
  });

  test('size option sets width and height', () => {
    const out = svg('clock', { size: 16 });
    assert.ok(out.includes('width="16"'));
    assert.ok(out.includes('height="16"'));
  });

  test('star-fill uses currentColor fill', () => {
    assert.ok(svg('star-fill').includes('fill="currentColor"'));
    assert.ok(svg('star').includes('fill="none"'));
  });
});
