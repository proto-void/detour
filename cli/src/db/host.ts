import { createAdapter, ENGINE_IDS } from './adapters/registry.ts';
import type { DbAdapter, DescribeResult, PendingEdit } from './adapters/types.ts';
import { parseCsv, toCsv, toInsertSql } from './adapters/sql-common.ts';
import { bridgeStatus, startLocalBridge, stopLocalBridge } from './bridge-lifecycle.ts';
import { readCollections, saveCollection, type QueryCollectionFile } from './collections.ts';
import {
  buildErDiagram,
  dataCompare,
  schemaCompare,
  syncCollectionsToFolder,
  tableDesignerDdl,
} from './pro.ts';
import {
  chunkResult,
  HOST_VERSION,
  PROTOCOL_VERSION,
  type RpcRequest,
  type RpcResponse,
} from './protocol.ts';
import { inspectPemKey } from './inspect-pem.ts';
import { resolveTlsFiles } from './paths.ts';
import { pickFile, type PickFileFilter } from './pick-file.ts';
import { openProxyTunnel, type ProxyTunnel } from './proxy.ts';
import { deleteSecret, getSecret, setSecret } from './secrets.ts';
import { openSshTunnel, type SshTunnel } from './ssh.ts';

/** Parse pickFile RPC filters: [{ name, extensions: string[] }]. */
export function parsePickFilters(raw: unknown): PickFileFilter[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PickFileFilter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name : '';
    const extensions = Array.isArray(rec.extensions)
      ? rec.extensions.filter((e): e is string => typeof e === 'string' && e.length > 0)
      : [];
    out.push({ name, extensions });
  }
  return out.length ? out : undefined;
}

/** Extra keychain kinds appended to secretAccount (e.g. `db-x:sshKeyPass`). */
export const SECRET_KINDS = [
  'token',
  'sshKey',
  'sshPass',
  'sshKeyPass',
  'sslKeyPass',
  'trustStorePass',
  'keyStorePass',
  'proxyPass',
  'walletPass',
] as const;

type Session = {
  adapter: DbAdapter;
  engine: string;
  tunnel?: SshTunnel;
  proxyTunnel?: ProxyTunnel;
};

/**
 * Create the RPC method table. Pure enough to unit-test with a fake adapter factory.
 */
export function createRpcHandlers(options?: {
  createAdapter?: (engine: string) => DbAdapter;
}): {
  handle(req: RpcRequest): Promise<unknown>;
  shutdown(): Promise<void>;
  stats(): { openConnections: number; version: string };
} {
  const sessions = new Map<string, Session>();
  const factory = options?.createAdapter ?? createAdapter;
  let openConnections = 0;

  async function getSession(connectionId: string): Promise<Session> {
    const s = sessions.get(connectionId);
    if (!s) throw new Error(`Unknown connection "${connectionId}". Call connect first.`);
    return s;
  }

  async function applySecrets(config: Record<string, unknown>, secretAccount?: string): Promise<void> {
    if (!secretAccount) return;
    const password = await getSecret(secretAccount);
    if (password !== null) {
      config.password = password;
      if (String(config.target ?? '') === 'astra' && !config.astraToken) config.astraToken = password;
    }
    const token = await getSecret(`${secretAccount}:token`);
    if (token !== null) config.astraToken = token;

    if (config.ssh && typeof config.ssh === 'object') {
      const ssh = config.ssh as Record<string, unknown>;
      const privateKey = await getSecret(`${secretAccount}:sshKey`);
      if (privateKey !== null) ssh.privateKey = privateKey;
      const sshPass = await getSecret(`${secretAccount}:sshPass`);
      if (sshPass !== null) ssh.password = sshPass;
      const sshKeyPass = await getSecret(`${secretAccount}:sshKeyPass`);
      if (sshKeyPass !== null) ssh.passphrase = sshKeyPass;
    }

    if (config.tls && typeof config.tls === 'object') {
      const tls = config.tls as Record<string, unknown>;
      const sslKeyPass = await getSecret(`${secretAccount}:sslKeyPass`);
      if (sslKeyPass !== null) tls.keyPassphrase = sslKeyPass;
      const trustStorePass = await getSecret(`${secretAccount}:trustStorePass`);
      if (trustStorePass !== null) tls.trustStorePassword = trustStorePass;
      const keyStorePass = await getSecret(`${secretAccount}:keyStorePass`);
      if (keyStorePass !== null) tls.keyStorePassword = keyStorePass;
    }

    if (config.proxy && typeof config.proxy === 'object') {
      const proxy = config.proxy as Record<string, unknown>;
      const proxyPass = await getSecret(`${secretAccount}:proxyPass`);
      if (proxyPass !== null) proxy.password = proxyPass;
    }

    const walletPass = await getSecret(`${secretAccount}:walletPass`);
    if (walletPass !== null) config.walletPassword = walletPass;
  }

  async function hydrateTls(config: Record<string, unknown>): Promise<void> {
    const tlsIn =
      config.tls && typeof config.tls === 'object'
        ? (config.tls as Record<string, unknown>)
        : config.tlsEnabled
          ? {
              enabled: true,
              mode: config.tlsRejectUnauthorized === false ? 'required' : 'verify-full',
              rejectUnauthorized: config.tlsRejectUnauthorized !== false,
            }
          : undefined;
    if (!tlsIn) return;
    const resolved = await resolveTlsFiles(tlsIn);
    config.tlsEnabled = resolved.enabled;
    config.tlsRejectUnauthorized = resolved.rejectUnauthorized;
    config.tls = {
      ...tlsIn,
      enabled: resolved.enabled,
      ca: resolved.ca,
      cert: resolved.cert,
      key: resolved.key,
      rejectUnauthorized: resolved.rejectUnauthorized,
      servername: resolved.servername,
      minVersion: resolved.minVersion,
      // Preserve keychain-hydrated passphrase for encrypted client keys (Node TLS `passphrase`).
      ...(tlsIn.keyPassphrase ? { keyPassphrase: tlsIn.keyPassphrase } : {}),
    };
  }

  return {
    stats: () => ({ openConnections, version: HOST_VERSION }),
    async shutdown() {
      for (const [id, s] of sessions) {
        try {
          await s.adapter.close();
        } catch {
          /* ignore */
        }
        try {
          await s.tunnel?.close();
        } catch {
          /* ignore */
        }
        try {
          await s.proxyTunnel?.close();
        } catch {
          /* ignore */
        }
        sessions.delete(id);
      }
      openConnections = 0;
      await stopLocalBridge();
    },
    async handle(req: RpcRequest): Promise<unknown> {
      const method = req.method;
      const params = (req.params ?? {}) as Record<string, unknown>;

      switch (method) {
        case 'hello': {
          const capabilities = [
            ...ENGINE_IDS.map((id) => `engine:${id}`),
            'ssh',
            'proxy',
            'tls',
            'pickFile',
            'inspectPemKey',
            'secrets',
            'bridge',
            'erDiagram',
            'schemaCompare',
            'dataCompare',
            'tableDesigner',
            'transactions',
            'explain',
          ];
          return {
            protocolVersion: PROTOCOL_VERSION,
            hostVersion: HOST_VERSION,
            capabilities,
          };
        }

        case 'version':
          return { version: HOST_VERSION, openConnections, bridge: bridgeStatus() };

        case 'setSecret': {
          const account = String(params.account ?? '');
          const value = String(params.value ?? '');
          if (!account) throw new Error('account required');
          await setSecret(account, value);
          return { ok: true };
        }

        case 'deleteSecret': {
          const account = String(params.account ?? '');
          if (!account) throw new Error('account required');
          await deleteSecret(account);
          return { ok: true };
        }

        case 'pickFile': {
          const filters = parsePickFilters(params.filters);
          const path = await pickFile({
            title: params.title ? String(params.title) : undefined,
            filters,
          });
          return { path };
        }

        case 'inspectPemKey': {
          const path = String(params.path ?? '').trim();
          if (!path) throw new Error('path required');
          return inspectPemKey(path);
        }

        case 'connect':
        case 'testConnection': {
          const connectionId = String(params.connectionId ?? 'default');
          const engine = String(params.engine ?? 'cassandra');
          const config = { ...(params.config as Record<string, unknown>) };
          await applySecrets(config, params.secretAccount ? String(params.secretAccount) : undefined);
          await hydrateTls(config);

          const dstHost = String(
            config.host ?? (config.contactPoints as string[] | undefined)?.[0] ?? '127.0.0.1',
          );
          const dstPort = Number(config.port ?? 5432);

          let tunnel: SshTunnel | undefined;
          let proxyTunnel: ProxyTunnel | undefined;

          if (config.ssh && typeof config.ssh === 'object') {
            const ssh = config.ssh as Record<string, unknown>;
            if (ssh.enabled !== false && ssh.host) {
              tunnel = await openSshTunnel({
                host: String(ssh.host),
                port: ssh.port ? Number(ssh.port) : 22,
                username: String(ssh.username ?? ''),
                password: ssh.password ? String(ssh.password) : undefined,
                privateKey: ssh.privateKey ? String(ssh.privateKey) : undefined,
                keyPath: ssh.keyPath ? String(ssh.keyPath) : undefined,
                passphrase: ssh.passphrase ? String(ssh.passphrase) : undefined,
                agent: ssh.auth === 'agent' || ssh.agent === true,
                keepaliveInterval: ssh.keepaliveInterval ? Number(ssh.keepaliveInterval) : undefined,
                strictHostKey: ssh.strictHostKey !== false,
                jumpHosts: ssh.jumpHosts ? String(ssh.jumpHosts) : undefined,
                dstHost,
                dstPort,
              });
              config.host = '127.0.0.1';
              config.port = tunnel.localPort;
              if (Array.isArray(config.contactPoints)) config.contactPoints = ['127.0.0.1'];
            }
          } else if (config.proxy && typeof config.proxy === 'object') {
            const proxy = config.proxy as Record<string, unknown>;
            const ptype = String(proxy.type ?? 'none');
            if ((ptype === 'socks5' || ptype === 'http') && proxy.host) {
              proxyTunnel = await openProxyTunnel({
                type: ptype,
                host: String(proxy.host),
                port: Number(proxy.port ?? (ptype === 'socks5' ? 1080 : 8080)),
                username: proxy.username ? String(proxy.username) : undefined,
                password: proxy.password ? String(proxy.password) : undefined,
                dstHost,
                dstPort,
              });
              config.host = '127.0.0.1';
              config.port = proxyTunnel.localPort;
              if (Array.isArray(config.contactPoints)) config.contactPoints = ['127.0.0.1'];
            }
          }

          const adapter = factory(engine);
          try {
            if (method === 'testConnection') {
              const result = await adapter.testConnection?.(config);
              await adapter.close();
              await tunnel?.close();
              await proxyTunnel?.close();
              return result ?? { ok: false, error: 'testConnection not supported' };
            }
            await adapter.connect(config);
          } catch (e) {
            await tunnel?.close();
            await proxyTunnel?.close();
            throw e;
          }
          const existing = sessions.get(connectionId);
          if (existing) {
            await existing.adapter.close();
            await existing.tunnel?.close();
            await existing.proxyTunnel?.close();
            openConnections = Math.max(0, openConnections - 1);
          }
          sessions.set(connectionId, { adapter, engine, tunnel, proxyTunnel });
          openConnections += 1;
          return { ok: true, connectionId, engine };
        }

        case 'listObjects': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          return session.adapter.listObjects(params.path as never);
        }

        case 'describe': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          return session.adapter.describe(params.ref as never);
        }

        case 'execute': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          return session.adapter.execute(
            String(params.statement ?? ''),
            (params.params as unknown[]) ?? [],
            (params.options as never) ?? {},
          );
        }

        case 'fetchPage': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          return session.adapter.execute(String(params.statement ?? ''), (params.params as unknown[]) ?? [], {
            ...((params.options as object) ?? {}),
            pageToken: params.pageToken as string | null | undefined,
          });
        }

        case 'explain': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          if (!session.adapter.explain) throw new Error('Explain not supported for this engine.');
          return session.adapter.explain(String(params.statement ?? ''));
        }

        case 'beginTransaction': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          await session.adapter.beginTransaction?.();
          return { ok: true };
        }
        case 'commit': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          await session.adapter.commit?.();
          return { ok: true };
        }
        case 'rollback': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          await session.adapter.rollback?.();
          return { ok: true };
        }

        case 'applyEdits': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          if (!session.adapter.applyEdits) throw new Error('Inline edit not supported for this engine.');
          return session.adapter.applyEdits(params.edits as PendingEdit[]);
        }

        case 'exportData': {
          const format = String(params.format ?? 'json');
          const columns = params.columns as string[];
          const rows = params.rows as unknown[][];
          if (format === 'csv') return { text: toCsv(columns, rows) };
          if (format === 'sql') return { text: toInsertSql(String(params.table ?? 't'), columns, rows) };
          return { text: `${JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))), null, 2)}\n` };
        }

        case 'importCsv': {
          const parsed = parseCsv(String(params.text ?? ''));
          return parsed;
        }

        case 'cancel': {
          const session = sessions.get(String(params.connectionId ?? 'default'));
          await session?.adapter.cancel?.(String(params.requestId ?? ''));
          return { ok: true };
        }

        case 'close': {
          const connectionId = String(params.connectionId ?? 'default');
          const session = sessions.get(connectionId);
          if (session) {
            await session.adapter.close();
            await session.tunnel?.close();
            await session.proxyTunnel?.close();
            sessions.delete(connectionId);
            openConnections = Math.max(0, openConnections - 1);
          }
          return { ok: true };
        }

        case 'saveCollection': {
          saveCollection(params.collection as QueryCollectionFile, params.dir as string | undefined);
          return { ok: true };
        }

        case 'readCollections': {
          return readCollections(params.dir as string | undefined);
        }

        case 'syncCollections': {
          return syncCollectionsToFolder(
            String(params.folder ?? ''),
            (params.direction as 'push' | 'pull') ?? 'pull',
            params.collections as QueryCollectionFile[] | undefined,
          );
        }

        case 'erDiagram': {
          const session = await getSession(String(params.connectionId ?? 'default'));
          const tables = params.tables as Array<{ id: string; label: string; schema?: string; name: string }>;
          const described: Array<{ id: string; label: string; describe: DescribeResult }> = [];
          for (const t of tables) {
            const describe = await session.adapter.describe({
              kind: 'table',
              schema: t.schema,
              name: t.name,
              database: t.schema,
            });
            described.push({ id: t.id, label: t.label, describe });
          }
          return buildErDiagram(described);
        }

        case 'tableDesigner': {
          return { ddl: tableDesignerDdl(params as never) };
        }

        case 'schemaCompare': {
          return schemaCompare(params.left as never, params.right as never);
        }

        case 'dataCompare': {
          return dataCompare(params.leftRows as unknown[][], params.rightRows as unknown[][], Number(params.keyIndex ?? 0));
        }

        case 'bridgeStart': {
          return startLocalBridge(String(params.folder ?? '.'), Number(params.port ?? 47321));
        }
        case 'bridgeStop': {
          return stopLocalBridge();
        }
        case 'bridgeStatus': {
          return bridgeStatus();
        }

        default:
          throw new Error(`Unknown method "${method}"`);
      }
    },
  };
}

/** Read a length-prefixed native messaging message from a buffer stream. */
export function tryReadNativeMessage(buffer: Buffer): { message: unknown; rest: Buffer } | null {
  if (buffer.length < 4) return null;
  const len = buffer.readUInt32LE(0);
  if (buffer.length < 4 + len) return null;
  const json = buffer.subarray(4, 4 + len).toString('utf8');
  return { message: JSON.parse(json), rest: buffer.subarray(4 + len) };
}

export function encodeNativeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export async function runNativeHostStdio(
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const rpc = createRpcHandlers();
  let buf = Buffer.alloc(0);

  const writeResponse = async (req: RpcRequest, result: unknown) => {
    const chunks = chunkResult(req.id, result);
    for (const part of chunks) {
      const response: RpcResponse =
        typeof part === 'object' && part !== null && (part as { chunked?: boolean }).chunked
          ? { jsonrpc: '2.0', id: req.id, result: part }
          : { jsonrpc: '2.0', id: req.id, result: part };
      stdout.write(encodeNativeMessage(response));
    }
  };

  const onMessage = async (raw: unknown) => {
    const req = raw as RpcRequest;
    if (!req || typeof req.method !== 'string' || req.id === undefined) {
      stdout.write(
        encodeNativeMessage({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid Request' },
        } satisfies RpcResponse),
      );
      return;
    }
    try {
      const result = await rpc.handle(req);
      await writeResponse(req, result);
    } catch (e) {
      const response: RpcResponse = {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32000, message: e instanceof Error ? e.message : String(e) },
      };
      stdout.write(encodeNativeMessage(response));
    }
  };

  stdin.on('data', (chunk: Buffer | string) => {
    const next = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk);
    buf = Buffer.concat([buf, next]);
    for (;;) {
      const parsed = tryReadNativeMessage(buf);
      if (!parsed) break;
      buf = Buffer.from(parsed.rest);
      void onMessage(parsed.message);
    }
  });

  await new Promise<void>((resolve) => {
    stdin.on('end', () => resolve());
    stdin.on('close', () => resolve());
  });
  await rpc.shutdown();
}
