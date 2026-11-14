// NecroMCP Phase 1 server: Express + static UI (Mode B files) + REST + MCP call.
// The "mainframe" behind POST /mcp/call is a LOCAL SIMULATOR, not a real mainframe.
import express, { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { parseWSDL } from './engine/parser';
import { simulate } from './engine/simulator';
import { buildSoapEnvelope } from './engine/translator';
import { zodSchemasForSchema } from './engine/synthesizer';
import type { MCPToolCallOutcome, NecroIntermediateSchema } from './types/necro';

const SIMULATOR_NOTE =
  'Mainframe adalah simulator lokal, bukan mainframe sungguhan.';

interface CorpseMeta {
  artifactId: string;
  title: string;
  era: string;
  format: 'SOAP_XML' | 'SQL_DDL' | 'FIXED_WIDTH';
  file: string;
  status: 'available' | 'phase-2';
}

const CORPSES: CorpseMeta[] = [
  {
    artifactId: 'corpse-01-banking-soap',
    title: '1998 SOAP Core Bank',
    era: '1998',
    format: 'SOAP_XML',
    file: 'corpse-01-banking-soap.xml',
    status: 'available',
  },
  {
    artifactId: 'corpse-02-inventory-sql',
    title: '2004 SQL Warehouse',
    era: '2004',
    format: 'SQL_DDL',
    file: 'corpse-02-inventory-dump.sql',
    status: 'phase-2',
  },
  {
    artifactId: 'corpse-03-cobol-claims',
    title: '1989 COBOL Claims Ledger',
    era: '1989',
    format: 'FIXED_WIDTH',
    file: 'corpse-03-cobol-flatfile.dat',
    status: 'phase-2',
  },
];

export function createApp(
  graveyardDir?: string,
  publicDir?: string,
): Express {
  const root =
    typeof __dirname !== 'undefined'
      ? path.resolve(__dirname, '..')
      : process.cwd();
  const gyDir = graveyardDir ?? path.join(root, 'graveyard');
  const pubDir = publicDir ?? path.join(root, 'public');

  // Phase 1: only corpse-01 is parsed. The other two corpses exist as files
  // but their parsers land in Phase 2.
  const corpse01 = CORPSES[0];
  const raw01 = fs.readFileSync(path.join(gyDir, corpse01.file), 'utf-8');
  const schema01: NecroIntermediateSchema = parseWSDL(raw01, {
    artifactId: corpse01.artifactId,
    title: corpse01.title,
    era: corpse01.era,
  });
  const schemasByTool = zodSchemasForSchema(schema01);
  const opsByTool = new Map(schema01.operations.map((op) => [op.mcpToolName, op]));

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, mode: 'phase-1', simulator: 'local', note: SIMULATOR_NOTE });
  });

  app.get('/api/graveyard', (_req: Request, res: Response) => {
    res.json({
      corpses: CORPSES.map((c) => ({
        artifactId: c.artifactId,
        title: c.title,
        era: c.era,
        format: c.format,
        status: c.status,
        fileExists: fs.existsSync(path.join(gyDir, c.file)),
        operations:
          c.status === 'available'
            ? schema01.operations.map((op) => op.mcpToolName)
            : [],
      })),
      note: SIMULATOR_NOTE,
    });
  });

  app.post('/api/resurrect', (req: Request, res: Response) => {
    const artifactId = req.body?.artifactId;
    if (typeof artifactId !== 'string') {
      res.status(400).json({ error: 'artifactId (string) is required.' });
      return;
    }
    const meta = CORPSES.find((c) => c.artifactId === artifactId);
    if (!meta) {
      res.status(404).json({ error: `Unknown artifactId "${artifactId}".` });
      return;
    }
    if (meta.status !== 'available') {
      res.status(501).json({
        error: `"${meta.title}" resurrects in Phase 2 (only corpse-01 is available in Phase 1).`,
      });
      return;
    }
    res.json(schema01);
  });

  app.get('/mcp/tools', (_req: Request, res: Response) => {
    res.json({
      jsonrpc: '2.0',
      result: {
        tools: schema01.operations.map((op) => ({
          name: op.mcpToolName,
          description: op.description,
          inputSchema: z.toJSONSchema(schemasByTool[op.mcpToolName]),
        })),
      },
    });
  });

  app.post('/mcp/call', (req: Request, res: Response) => {
    const { artifactId, toolName, arguments: args } = req.body ?? {};
    if (artifactId !== corpse01.artifactId) {
      res.status(404).json({ error: `Unknown artifactId "${artifactId}".` });
      return;
    }
    const op = opsByTool.get(toolName);
    if (!op) {
      res.status(404).json({ error: `Unknown tool "${toolName}".` });
      return;
    }
    const parsed = schemasByTool[toolName].safeParse(args ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid arguments for tool.',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    const started = Date.now();
    const envelope = buildSoapEnvelope(op, parsed.data);
    const { responseXml, json } = simulate(op, parsed.data);
    const outcome: MCPToolCallOutcome = {
      status: 'SUCCESS',
      toolName,
      mcpRequestJson: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: parsed.data },
      },
      legacyWirePayload: envelope,
      legacyRawResponse: responseXml,
      normalizedJsonResponse: json,
      latencyMs: Date.now() - started,
    };
    res.json(outcome);
  });

  // Static UI (Mode B files). If public/ does not exist yet, API still works.
  if (fs.existsSync(pubDir)) {
    app.use(express.static(pubDir));
  }

  return app;
}

if (typeof require !== 'undefined' && require.main === module) {
  const port = Number(process.env.PORT ?? 8932);
  const app = createApp();
  app.listen(port, () => {
    console.log(`NecroMCP Phase 1 listening on http://localhost:${port}`);
    console.log(`NOTE: ${SIMULATOR_NOTE}`);
  });
}
