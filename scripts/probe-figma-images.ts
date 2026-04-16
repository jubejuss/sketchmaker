/**
 * Minimal Figma image-fill probe.
 *
 * Runs `figma_execute` via figma-console-mcp with a tiny, focused test that
 * probes which image APIs are available in the Bridge plugin eval sandbox,
 * then tries each one with the same 1x1 JPEG and reports back.
 *
 * Usage:
 *   npm run probe:images
 *
 * Requires:
 *   - Figma Desktop open with the "Figma Desktop Bridge" plugin running
 *   - FIGMA_ACCESS_TOKEN env var OR a configured token in the Stiilileidja app
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FIGMA_MCP_PATH = '/Users/juhokalberg/.nvm/versions/node/v20.19.2/lib/node_modules/figma-console-mcp/dist/local.js'
const NODE_BIN = '/Users/juhokalberg/.nvm/versions/node/v20.19.2/bin/node'

// 1×1 red JPEG — smallest reasonable payload that's actually a valid image.
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AP/Z'

function getToken(): string {
  if (process.env.FIGMA_ACCESS_TOKEN) return process.env.FIGMA_ACCESS_TOKEN

  const configPath = path.join(os.homedir(), 'Library/Application Support/stiilileidja/config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const cfg = JSON.parse(raw) as { figmaAccessToken?: string }
    if (cfg.figmaAccessToken) return cfg.figmaAccessToken
  } catch {}

  console.error('No token. Set FIGMA_ACCESS_TOKEN or configure one in the app first.')
  process.exit(1)
}

async function main() {
  const token = getToken()

  const transport = new StdioClientTransport({
    command: NODE_BIN,
    args: [FIGMA_MCP_PATH],
    env: {
      FIGMA_ACCESS_TOKEN: token,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    }
  })

  const client = new Client({ name: 'figma-image-probe', version: '0.0.1' })

  console.log('→ connecting to figma-console-mcp...')
  await client.connect(transport)
  console.log('✓ connected')

  // Give the Bridge plugin a moment to register
  await new Promise(r => setTimeout(r, 1000))

  const probeCode = `
const report = {};
report.apis = {
  createImage: typeof figma.createImage,
  createImageAsync: typeof figma.createImageAsync,
  atob: typeof atob,
  fetch: typeof fetch,
  getBytesAsync: figma.createImage ? 'n/a (see Image.getBytesAsync)' : 'n/a'
};

const TINY = ${JSON.stringify(TINY_JPEG)};
const base64 = TINY.slice(TINY.indexOf(',') + 1);

// Attempt 1: sync createImage(bytes) with atob-decoded data URL
report.syncCreateImage = { attempted: false };
if (typeof figma.createImage === 'function' && typeof atob === 'function') {
  report.syncCreateImage.attempted = true;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const img = figma.createImage(bytes);
    report.syncCreateImage.ok = true;
    report.syncCreateImage.hash = img && img.hash;
    report.syncCreateImage.hashType = typeof (img && img.hash);
    report.syncCreateImage.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.syncCreateImage.ok = false;
    report.syncCreateImage.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 2: createImageAsync with data URL
report.asyncDataUrl = { attempted: false };
if (typeof figma.createImageAsync === 'function') {
  report.asyncDataUrl.attempted = true;
  try {
    const img = await figma.createImageAsync(TINY);
    report.asyncDataUrl.ok = true;
    report.asyncDataUrl.hash = img && img.hash;
    report.asyncDataUrl.hashType = typeof (img && img.hash);
    report.asyncDataUrl.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.asyncDataUrl.ok = false;
    report.asyncDataUrl.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 3: createImageAsync with https URL (Pexels CDN)
report.asyncHttps = { attempted: false };
if (typeof figma.createImageAsync === 'function') {
  report.asyncHttps.attempted = true;
  try {
    const img = await figma.createImageAsync('https://images.pexels.com/photos/33521778/pexels-photo-33521778.jpeg?auto=compress&cs=tinysrgb&h=650&w=940');
    report.asyncHttps.ok = true;
    report.asyncHttps.hash = img && img.hash;
    report.asyncHttps.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.asyncHttps.ok = false;
    report.asyncHttps.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 4: if a hash was produced, try applying it as a fill on a real rectangle
report.setFills = { attempted: false };
const producedHash = (report.syncCreateImage && report.syncCreateImage.hash) ||
                     (report.asyncDataUrl && report.asyncDataUrl.hash);
if (producedHash) {
  report.setFills.attempted = true;
  report.setFills.hashUsed = producedHash;
  try {
    await figma.loadAllPagesAsync();
    const page = figma.currentPage;
    const r = figma.createRectangle();
    r.resize(100, 100);
    r.x = 0; r.y = 0;
    page.appendChild(r);
    r.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: producedHash }];
    report.setFills.ok = true;
    report.setFills.nodeId = r.id;
    // Leave the node in place so the user can visually confirm
  } catch (e) {
    report.setFills.ok = false;
    report.setFills.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

return report;
`.trim()

  console.log('→ sending probe to Figma...')
  const result = await client.callTool({
    name: 'figma_execute',
    arguments: { code: probeCode, timeout: 20000 }
  })

  console.log('\n--- PROBE RESULT ---')
  console.log(JSON.stringify(result, null, 2))
  console.log('--------------------\n')

  await client.close()
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exit(1)
})
