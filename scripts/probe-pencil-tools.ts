/**
 * Probes the current Pencil MCP binary:
 *   1. Dumps the full JSON schema of every tool (so we know exact params)
 *   2. Calls `get_guidelines` with no args — the tool description says it loads
 *      guides/styles for working with .pen files, which is the canonical
 *      how-to reference we need to port the moodboard workflow.
 *
 * Usage: npx -y tsx scripts/probe-pencil-tools.ts
 * Requires Pencil.app to be running.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const BINARY = '/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64'

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: BINARY,
    args: ['--app', 'desktop'],
    env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' }
  })
  const client = new Client({ name: 'stiilileidja-probe', version: '0.1.0' })
  await client.connect(transport)

  const tools = await client.listTools()
  console.log('=== Full tool schemas ===\n')
  for (const t of tools.tools) {
    console.log(`## ${t.name}`)
    if (t.description) console.log(t.description)
    console.log('```json')
    console.log(JSON.stringify(t.inputSchema, null, 2))
    console.log('```\n')
  }

  console.log('=== get_guidelines (no args) ===\n')
  try {
    const result = await client.callTool({ name: 'get_guidelines', arguments: {} })
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.log('get_guidelines failed:', (err as Error).message)
  }

  console.log('\n=== get_editor_state ===\n')
  try {
    const result = await client.callTool({ name: 'get_editor_state', arguments: { include_schema: true } })
    console.log(JSON.stringify(result, null, 2).slice(0, 8000))
  } catch (err) {
    console.log('get_editor_state failed:', (err as Error).message)
  }

  await (client as Client & { close?: () => Promise<void> }).close?.()
  process.exit(0)
}

main().catch(err => {
  console.error('[probe] failed:', err)
  process.exit(1)
})
