import { rowsToResult } from './sql-common.ts';
import type { DbAdapter, DescribeResult, ExecuteOptions, ObjectNode, ObjectPath } from './types.ts';

export function createDynamoAdapter(): DbAdapter {
  let client: {
    send(cmd: unknown): Promise<unknown>;
  };
  let doc: {
    send(cmd: unknown): Promise<unknown>;
  };
  let endpoint: string | undefined;
  let region = 'us-east-1';

  async function ensure(config: Record<string, unknown>): Promise<void> {
    const { DynamoDBClient, ListTablesCommand, DescribeTableCommand } = await import(
      '@aws-sdk/client-dynamodb'
    );
    const { DynamoDBDocumentClient, ScanCommand, QueryCommand, ExecuteStatementCommand } = await import(
      '@aws-sdk/lib-dynamodb'
    );
    endpoint = config.endpoint ? String(config.endpoint) : undefined;
    region = String(config.region ?? 'us-east-1');
    const base = new DynamoDBClient({
      region,
      endpoint,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: String(config.accessKeyId),
              secretAccessKey: String(config.secretAccessKey),
            }
          : config.password && config.username
            ? {
                accessKeyId: String(config.username),
                secretAccessKey: String(config.password),
              }
            : undefined,
    });
    client = base as never;
    doc = DynamoDBDocumentClient.from(base) as never;
    (ensure as unknown as { cmds: Record<string, unknown> }).cmds = {
      ListTablesCommand,
      DescribeTableCommand,
      ScanCommand,
      QueryCommand,
      ExecuteStatementCommand,
    };
  }

  type CmdCtor = new (input: Record<string, unknown>) => unknown;
  function cmds(): Record<string, CmdCtor> {
    return (ensure as unknown as { cmds: Record<string, CmdCtor> }).cmds;
  }

  return {
    async connect(config) {
      await ensure(config);
    },
    async testConnection(config) {
      const started = Date.now();
      try {
        await ensure(config);
        const ListTablesCommand = cmds().ListTablesCommand!;
        await client.send(new ListTablesCommand({ Limit: 1 }));
        return { ok: true as const, latencyMs: Date.now() - started };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async listObjects(path?: ObjectPath): Promise<ObjectNode[]> {
      if (!path || path.kind === 'root') {
        const ListTablesCommand = cmds().ListTablesCommand!;
        const rs = (await client.send(new ListTablesCommand({}))) as { TableNames?: string[] };
        return (rs.TableNames ?? []).map((name) => ({
          id: `table:${name}`,
          label: name,
          kind: 'table',
          meta: { name },
        }));
      }
      return [];
    },
    async describe(ref: ObjectPath): Promise<DescribeResult> {
      if (!ref.name) return { meta: { ref } };
      const DescribeTableCommand = cmds().DescribeTableCommand!;
      const rs = (await client.send(new DescribeTableCommand({ TableName: ref.name }))) as {
        Table?: Record<string, unknown>;
      };
      return { meta: { table: rs.Table }, ddl: JSON.stringify(rs.Table, null, 2) };
    },
    async execute(statement, _params, options: ExecuteOptions) {
      const started = Date.now();
      const trimmed = statement.trim();
      if (/^\s*SELECT\b/i.test(trimmed) || /^\s*INSERT\b/i.test(trimmed) || /^\s*UPDATE\b/i.test(trimmed) || /^\s*DELETE\b/i.test(trimmed)) {
        const ExecuteStatementCommand = cmds().ExecuteStatementCommand!;
        const rs = (await doc.send(
          new ExecuteStatementCommand({ Statement: trimmed, Limit: options.pageSize ?? 100 }),
        )) as { Items?: Record<string, unknown>[] };
        const items = rs.Items ?? [];
        return rowsToResult(['item'], items.map((i) => [i]), started);
      }
      const body = trimmed.startsWith('{') ? JSON.parse(trimmed) : { TableName: trimmed, Limit: options.pageSize ?? 100 };
      if (body.KeyConditionExpression) {
        const QueryCommand = cmds().QueryCommand!;
        const rs = (await doc.send(new QueryCommand(body))) as { Items?: Record<string, unknown>[] };
        return rowsToResult(['item'], (rs.Items ?? []).map((i) => [i]), started);
      }
      const ScanCommand = cmds().ScanCommand!;
      const rs = (await doc.send(new ScanCommand(body))) as { Items?: Record<string, unknown>[] };
      return rowsToResult(['item'], (rs.Items ?? []).map((i) => [i]), started);
    },
    async close() {
      /* SDK clients are lightweight */
    },
  };
}
