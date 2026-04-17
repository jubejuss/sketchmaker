/**
 * Probes the exact response format of batch_design so we can parse
 * binding → nodeId mappings correctly.
 *
 * Usage: npx -y tsx scripts/probe-pencil-batch.ts
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
  const client = new Client({ name: 'stiilileidja-batch-probe', version: '0.1.0' })
  await client.connect(transport)

  console.log('=== open_document("new") ===\n')
  const open = await client.callTool({ name: 'open_document', arguments: { filePathOrTemplate: 'new' } })
  console.log(JSON.stringify(open, null, 2))

  console.log('\n=== get_editor_state ===\n')
  const state = await client.callTool({ name: 'get_editor_state', arguments: { include_schema: false } })
  console.log(JSON.stringify(state, null, 2))

  // Try batch_design with empty filePath first
  console.log('\n=== batch_design (filePath="") ===\n')
  const ops = [
    'a=I("document",{"type":"frame","name":"probe-A","layout":"none","x":0,"y":0,"width":200,"height":200,"fill":"#FF0000"})',
    'b=I("document",{"type":"frame","name":"probe-B","layout":"none","x":240,"y":0,"width":200,"height":200,"fill":"#00FF00"})',
    'c=I(a,{"type":"text","content":"hello","x":20,"y":20,"width":160,"fontSize":24,"fontFamily":"Inter","fontWeight":"700","fill":"#FFFFFF"})'
  ].join('\n')
  try {
    const result = await client.callTool({ name: 'batch_design', arguments: { filePath: '', operations: ops } })
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.log('batch_design with empty filePath failed:', (err as Error).message)

    console.log('\n=== batch_design (filePath=/tmp/stiilileidja-probe.pen) ===\n')
    try {
      const result2 = await client.callTool({ name: 'batch_design', arguments: { filePath: '/tmp/stiilileidja-probe.pen', operations: ops } })
      console.log(JSON.stringify(result2, null, 2))
    } catch (err2) {
      console.log('also failed:', (err2 as Error).message)
    }
  }

  await (client as Client & { close?: () => Promise<void> }).close?.()
  process.exit(0)
}

main().catch(err => {
  console.error('[probe] failed:', err)
  process.exit(1)
})
