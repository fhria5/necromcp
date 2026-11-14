// NecroMCP Phase 4 server: Express + static UI (Mode B files) + REST + MCP call.
// All three corpses resurrect. Sentinel runs BEFORE wire marshaling; the HITL
// gate pauses mutations above $10,000 until the caller presents the approval
// token for that exact call. The "mainframe" behind POST /mcp/call is a LOCAL
// SIMULATOR, not a real mainframe.
import express, { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { cobolDataRows, parseCOBOL, parseSQL, parseWSDL } from './engine/parser';
import { computeHitlToken, verifyHitlToken } from './engine/hitl';
import { inspect } from './engine/sentinel';
import { simulate, simulateCobol, simulateSql } from './engine/simulator';
import { runExorcism, type ExorcismDeps } from './engine/exorcist-pbt';
import {
  buildSoapEnvelope,
  buildSqlCall,
  type CobolLayoutField,
} from './engine/translator';
import { zodSchemasForSchema } from './engine/synthesizer';
import type {
  MCPToolCallOutcome,
  NecroIntermediateSchema,
  NormalizedOperation,
} from './types/necro';

const SIMULATOR_NOTE =
  'Mainframe adalah simulator lokal, bukan mainframe sungguhan.';

interface CorpseMeta {
  artifactId: string;
  title: string;
  era: string;
  format: 'SOAP_XML' | 'SQL_DDL' | 'FIXED_WIDTH';
  file: string;
}

const CORPSES: CorpseMeta[] = [
  {
    artifactId: 'corpse-01-banking-soap',
    title: '1998 SOAP Core Bank',
    era: '1998',
    format: 'SOAP_XML',
    file: 'corpse-01-banking-soap.xml',
  },
  {
    artifactId: 'corpse-02-inventory-sql',
    title: '2004 SQL Warehouse',
    era: '2004',
    format: 'SQL_DDL',
    file: 'corpse-02-inventory-dump.sql',
  },
  {
    artifactId: 'corpse-03-cobol-claims',
    title: '1989 COBOL Claims Ledger',
    era: '1989',
    format: 'FIXED_WIDTH',
    file: 'corpse-03-cobol-flatfile.dat',
  },
];

interface ResolvedTool {
  op: NormalizedOperation;
  schema: NecroIntermediateSchema;
}

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

  // Parse all three corpses at startup.
  const schemas = new Map<string, NecroIntermediateSchema>();
  const tools = new Map<string, ResolvedTool>();
  const zodByTool = new Map<string, z.ZodObject<any>>();
  let cobolRows: string[] = [];
  let cobolFields: CobolLayoutField[] = [];

  for (const meta of CORPSES) {
    const raw = fs.readFileSync(path.join(gyDir, meta.file), 'utf-8');
    let schema: NecroIntermediateSchema;
    if (meta.format === 'SOAP_XML') {
      schema = parseWSDL(raw, {
        artifactId: meta.artifactId,
        title: meta.title,
        era: meta.era,
      });
    } else if (meta.format === 'SQL_DDL') {
      schema = parseSQL(raw, {
        artifactId: meta.artifactId,
        title: meta.title,
        era: meta.era,
      });
    } else {
      const cobol = parseCOBOL(raw, {
        artifactId: meta.artifactId,
        title: meta.title,
        era: meta.era,
      });
      schema = cobol;
      cobolRows = cobolDataRows(raw);
      cobolFields = cobol.cobolFields.map((f) => ({
        legacyName: f.legacyName,
        semanticName: f.semanticName,
        // COBOL copybook fields are only string/number/iso_date (never boolean).
        type: f.type as 'string' | 'number' | 'iso_date',
        byteOffset: f.constraints.byteOffset!,
        decimals: f.decimals,
      }));
    }
    schemas.set(meta.artifactId, schema);
    for (const op of schema.operations) {
      tools.set(op.mcpToolName, { op, schema });
      zodByTool.set(op.mcpToolName, zodSchemasForSchema(schema)[op.mcpToolName]);
    }
  }

  // Phase 3: Exorcist quarantine state. When PBT detects the Demon Bug in an
  // adapter, its MCP tool is quarantined: /mcp/tools stops listing it and
  // /mcp/call rejects it with BLOCKED_SECURITY until Auto-Patch restores it.
  const blockedTools = new Set<string>();

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, mode: 'phase-4', simulator: 'local', note: SIMULATOR_NOTE });
  });

  app.get('/api/graveyard', (_req: Request, res: Response) => {
    res.json({
      corpses: CORPSES.map((c) => ({
        artifactId: c.artifactId,
        title: c.title,
        era: c.era,
        format: c.format,
        status: 'available',
        fileExists: fs.existsSync(path.join(gyDir, c.file)),
        operations: (schemas.get(c.artifactId)?.operations ?? []).map(
          (op) => op.mcpToolName,
        ),
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
    const schema = schemas.get(artifactId);
    if (!schema) {
      res.status(404).json({ error: `Unknown artifactId "${artifactId}".` });
      return;
    }
    res.json(schema);
  });

  // Phase 3: PBT Exorcism. Runs 100 fast-check runs comparing the legacy
  // simulator with the resurrected adapter for one artifact. With
  // injectDemonBug the buggy adapter is exercised; with applyPatch the
  // fixed adapter is re-verified 100/100 and the quarantine is lifted.
  app.post('/api/exorcise', (req: Request, res: Response) => {
    const body = z
      .object({
        artifactId: z.string(),
        injectDemonBug: z.boolean().optional(),
        applyPatch: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({
        error: 'Invalid body: expected { artifactId, injectDemonBug?, applyPatch? }.',
        issues: body.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    const { artifactId, injectDemonBug, applyPatch } = body.data;
    if (!schemas.has(artifactId)) {
      res.status(404).json({ error: `Unknown artifactId "${artifactId}".` });
      return;
    }
    const deps: ExorcismDeps = { schemas, cobolFields, simulate, simulateSql };
    const report = runExorcism(artifactId, { injectDemonBug, applyPatch }, deps);
    if (report.status === 'DEMON_DETECTED') {
      for (const tool of report.blockedTools) blockedTools.add(tool);
    } else if (report.status === 'PATCHED') {
      // The patch restores this artifact's tools; other quarantines stay.
      for (const op of schemas.get(artifactId)!.operations) {
        blockedTools.delete(op.mcpToolName);
      }
    }
    res.json(report);
  });

  app.get('/mcp/tools', (_req: Request, res: Response) => {
    const allTools: unknown[] = [];
    for (const meta of CORPSES) {
      const schema = schemas.get(meta.artifactId)!;
      for (const op of schema.operations) {
        if (blockedTools.has(op.mcpToolName)) continue;
        allTools.push({
          name: op.mcpToolName,
          description: op.description,
          inputSchema: z.toJSONSchema(zodByTool.get(op.mcpToolName)!),
        });
      }
    }
    res.json({ jsonrpc: '2.0', result: { tools: allTools } });
  });

  app.post('/mcp/call', (req: Request, res: Response) => {
    const { artifactId, toolName, arguments: args, bypassHitlToken } = req.body ?? {};
    const schema = typeof artifactId === 'string' ? schemas.get(artifactId) : undefined;
    if (!schema) {
      res.status(404).json({ error: `Unknown artifactId "${artifactId}".` });
      return;
    }
    const resolved = tools.get(toolName);
    if (!resolved || resolved.schema.artifactId !== artifactId) {
      res.status(404).json({ error: `Unknown tool "${toolName}".` });
      return;
    }
    const { op } = resolved;

    // 0. Phase 3 quarantine: a tool the Exorcist caught with the Demon Bug
    // stays dark until Auto-Patch restores it.
    if (blockedTools.has(toolName)) {
      const outcome: MCPToolCallOutcome = {
        toolName,
        mcpRequestJson: {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: toolName, arguments: args ?? {} },
        },
        legacyWirePayload: '',
        legacyRawResponse: '',
        normalizedJsonResponse: {},
        latencyMs: 0,
        status: 'BLOCKED_SECURITY',
        securityAlert: {
          ruleId: 'DEMON_DETECTED',
          severity: 'CRITICAL',
          reason:
            'Tool quarantined by the Exorcist: property-based testing detected the Demon Bug in this adapter. Run Auto-Patch (POST /api/exorcise with applyPatch) to restore it.',
        },
      };
      res.json(outcome);
      return;
    }

    const parsed = zodByTool.get(toolName)!.safeParse(args ?? {});
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
    const mcpRequestJson = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: parsed.data },
    };
    const baseOutcome = {
      toolName,
      mcpRequestJson,
      legacyWirePayload: '',
      legacyRawResponse: '',
      normalizedJsonResponse: {},
      latencyMs: 0,
    };

    // 1. Sentinel FIRST: blocked calls never reach the wire marshaler.
    const verdict = inspect(parsed.data);
    if (verdict.blocked) {
      const outcome: MCPToolCallOutcome = {
        ...baseOutcome,
        status: 'BLOCKED_SECURITY',
        latencyMs: Date.now() - started,
        securityAlert: {
          ruleId: verdict.ruleId!,
          severity: verdict.severity!,
          reason: `${verdict.reason} Field "${verdict.field}": ${verdict.matched}`,
        },
      };
      res.json(outcome);
      return;
    }

    // 2. HITL gate: mutations above the threshold pause until approved.
    if (op.hitlThreshold) {
      const value = Number(parsed.data[op.hitlThreshold.field]);
      if (value > op.hitlThreshold.maxAllowed) {
        const token = computeHitlToken(artifactId, toolName, parsed.data);
        if (
          typeof bypassHitlToken !== 'string' ||
          !verifyHitlToken(bypassHitlToken, artifactId, toolName, parsed.data)
        ) {
          const outcome: MCPToolCallOutcome = {
            ...baseOutcome,
            status: 'PENDING_HITL',
            latencyMs: Date.now() - started,
            hitl: {
              field: op.hitlThreshold.field,
              value,
              maxAllowed: op.hitlThreshold.maxAllowed,
              approvalToken: token,
            },
          };
          res.json(outcome);
          return;
        }
      }
    }

    // 3. Marshal to the legacy wire format, run the local simulator, unmarshal.
    try {
      let wirePayload: string;
      let wireResponse: string;
      let json: Record<string, unknown>;
      if (schema.format === 'SOAP_XML') {
        wirePayload = buildSoapEnvelope(op, parsed.data);
        const result = simulate(op, parsed.data);
        wireResponse = result.responseXml;
        json = result.json;
      } else if (schema.format === 'SQL_DDL') {
        wirePayload = buildSqlCall(op, parsed.data).wireText;
        const result = simulateSql(op, parsed.data);
        wireResponse = result.wireResponse;
        json = result.json;
      } else {
        // COBOL lookup: the request wire is a keyed 80-byte query record
        // (patient id in bytes 1-10, rest spaces); the response is the
        // matching ledger row.
        wirePayload = String(parsed.data.patientId).padEnd(10, ' ').padEnd(80, ' ');
        const result = simulateCobol(op, parsed.data, cobolRows, cobolFields);
        wireResponse = result.wireResponse;
        json = result.json;
      }
      const outcome: MCPToolCallOutcome = {
        ...baseOutcome,
        status: 'SUCCESS',
        legacyWirePayload: wirePayload,
        legacyRawResponse: wireResponse,
        normalizedJsonResponse: json,
        latencyMs: Date.now() - started,
      };
      res.json(outcome);
    } catch (err) {
      // Simulator miss (e.g. unknown patient): honest 404, no invented data.
      res.status(404).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
    console.log(`NecroMCP Phase 4 listening on http://localhost:${port}`);
    console.log(`NOTE: ${SIMULATOR_NOTE}`);
  });
}
