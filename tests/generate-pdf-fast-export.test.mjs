import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchPdfBrowser, pdfCacheKey, pdfCacheMatches } from '../generate-pdf.mjs';
import { createHash } from 'node:crypto';

test('uses bundled Chromium when it launches', async () => {
  const calls = [];
  const browser = {};
  assert.equal(await launchPdfBrowser({ headless: true }, async opts => { calls.push(opts); return browser; }), browser);
  assert.deepEqual(calls, [{ headless: true }]);
});

test('falls back to installed Chrome only for missing executable', async () => {
  const calls = [];
  const browser = {};
  const result = await launchPdfBrowser({ headless: true }, async opts => {
    calls.push(opts);
    if (calls.length === 1) throw new Error("Executable doesn't exist at test path");
    return browser;
  });
  assert.equal(result, browser);
  assert.equal(calls[1].channel, 'chrome');
  assert.equal(calls[1].headless, true);
});

test('does not mask unrelated browser errors or endlessly retry', async () => {
  let calls = 0;
  await assert.rejects(launchPdfBrowser({}, async () => { calls++; throw new Error('permission denied'); }), /permission denied/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(launchPdfBrowser({}, async () => { calls++; throw new Error("Executable doesn't exist"); }), /install Chrome/i);
  assert.equal(calls, 2);
});

test('external assets disable caching, including quoted CSS URLs', () => {
  for (const html of ['<img src="file:///secret.png">', '<img src=file:///secret.png>', '<style>p { background: url("https://example.com/a.png") }</style>', '<style>@import "x.css";</style>', '<style>p { background: u\\72l(file:///x) }</style>']) {
    assert.equal(pdfCacheKey(html, { format: 'a4' }), null);
  }
});

test('cache rejects stale keys and modified PDFs', () => {
  const pdf = Buffer.from('example PDF');
  const metadata = { key: 'expected', pdfHash: createHash('sha256').update(pdf).digest('hex') };
  assert.equal(pdfCacheMatches(metadata, 'expected', pdf), true);
  assert.equal(pdfCacheMatches(metadata, 'changed', pdf), false);
  assert.equal(pdfCacheMatches(metadata, 'expected', Buffer.from('modified')), false);
  assert.equal(pdfCacheMatches(metadata, null, pdf), false);
});

test('cache key changes with HTML and render options when browser is available', t => {
  const key = pdfCacheKey('<p>one</p>', { format: 'a4' });
  if (!key) return t.skip('No supported browser installed');
  assert.notEqual(key, pdfCacheKey('<p>two</p>', { format: 'a4' }));
  assert.notEqual(key, pdfCacheKey('<p>one</p>', { format: 'letter' }));
  assert.equal(key, pdfCacheKey('<p>one</p>', { format: 'a4' }));
  assert.ok(pdfCacheKey('<style>/* no <img> emitted */ p{color:red}</style>', { format: 'a4' }));
});
