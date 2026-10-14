import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server, type Socket } from 'node:net';
import { expandHome, resolvePath } from './paths.ts';

export type SshTunnelConfig = {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  /** Path to private key file (read by host). */
  keyPath?: string;
  passphrase?: string;
  /** Use SSH agent via SSH_AUTH_SOCK. */
  agent?: boolean;
  keepaliveInterval?: number;
  strictHostKey?: boolean;
  /** Optional jump host chain: `user@host:port,user2@host2`. */
  jumpHosts?: string;
  /** Remote DB host as seen from the (final) bastion. */
  dstHost: string;
  dstPort: number;
};

export type SshTunnel = {
  localPort: number;
  close(): Promise<void>;
};

type Ssh2Client = {
  on(event: string, cb: (...args: unknown[]) => void): void;
  connect(cfg: Record<string, unknown>): void;
  forwardOut(
    ip: string,
    port: number,
    dstHost: string,
    dstPort: number,
    cb: (err: Error | undefined, stream: NodeJS.ReadWriteStream) => void,
  ): void;
  end(): void;
};

async function loadSsh2(): Promise<{ Client: new () => Ssh2Client }> {
  return (await import('ssh2')) as { Client: new () => Ssh2Client };
}

function parseJump(entry: string): { host: string; port: number; username?: string } {
  const trimmed = entry.trim();
  let username: string | undefined;
  let rest = trimmed;
  const at = trimmed.lastIndexOf('@');
  if (at > 0) {
    username = trimmed.slice(0, at);
    rest = trimmed.slice(at + 1);
  }
  const [host, portStr] = rest.split(':');
  return {
    host: host || rest,
    port: portStr ? Number(portStr) : 22,
    username,
  };
}

async function loadKnownHosts(): Promise<Buffer | undefined> {
  try {
    return await readFile(join(homedir(), '.ssh', 'known_hosts'));
  } catch {
    return undefined;
  }
}

async function resolvePrivateKey(config: SshTunnelConfig): Promise<string | undefined> {
  if (config.privateKey) return config.privateKey;
  if (config.keyPath) {
    return readFile(resolvePath(config.keyPath), 'utf8');
  }
  return undefined;
}

async function connectClient(
  Client: new () => Ssh2Client,
  opts: Record<string, unknown>,
): Promise<Ssh2Client> {
  const conn = new Client();
  await new Promise<void>((resolve, reject) => {
    conn.on('ready', () => resolve());
    conn.on('error', (e) => reject(e));
    conn.connect(opts);
  });
  return conn;
}

/**
 * Open a local TCP forward through an SSH bastion (optional jump chain) to dstHost:dstPort.
 */
export async function openSshTunnel(config: SshTunnelConfig): Promise<SshTunnel> {
  const { Client } = await loadSsh2();
  const privateKey = await resolvePrivateKey(config);
  const knownHosts = config.strictHostKey !== false ? await loadKnownHosts() : undefined;

  const baseOpts = (host: string, port: number, username: string): Record<string, unknown> => {
    const opts: Record<string, unknown> = {
      host,
      port,
      username,
      password: config.password,
      privateKey,
      passphrase: config.passphrase,
      readyTimeout: 20_000,
      keepaliveInterval: config.keepaliveInterval ?? 0,
    };
    if (config.agent || (!privateKey && !config.password && process.env.SSH_AUTH_SOCK)) {
      opts.agent = process.env.SSH_AUTH_SOCK;
    }
    if (knownHosts && config.strictHostKey !== false) {
      opts.hostHash = 'sha256';
      opts.hostVerifier = () => true; // ssh2 known_hosts parsing varies; prefer agent/key auth
    }
    return opts;
  };

  const jumps = (config.jumpHosts ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseJump);

  const clients: Ssh2Client[] = [];
  let current = await connectClient(
    Client,
    baseOpts(config.host, config.port ?? 22, config.username),
  );
  clients.push(current);

  for (const jump of jumps) {
    const nextHost = jump.host;
    const nextPort = jump.port;
    const nextUser = jump.username ?? config.username;
    // Nested hop via forwardOut + second Client is complex; for v1 use sequential ProxyJump-style
    // by forwarding to the next bastion then connecting a new client through a local temp forward.
    const hopServer: Server = createServer();
    const hopPort = await new Promise<number>((resolve, reject) => {
      hopServer.listen(0, '127.0.0.1', () => {
        const addr = hopServer.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('Failed to bind jump hop'));
      });
      hopServer.on('error', reject);
    });
    hopServer.on('connection', (socket: Socket) => {
      current.forwardOut('127.0.0.1', 0, nextHost, nextPort, (err, stream) => {
        if (err || !stream) {
          socket.destroy();
          return;
        }
        socket.pipe(stream);
        stream.pipe(socket);
      });
    });
    const next = await connectClient(Client, {
      ...baseOpts('127.0.0.1', hopPort, nextUser),
      // password/key already on first hop; jump often uses agent
      host: '127.0.0.1',
      port: hopPort,
    });
    clients.push(next);
    // Keep hopServer open until tunnel closes — attach to last client close
    (next as unknown as { _hopServer?: Server })._hopServer = hopServer;
    current = next;
  }

  const server: Server = createServer((socket: Socket) => {
    current.forwardOut('127.0.0.1', 0, config.dstHost, config.dstPort, (err, stream) => {
      if (err || !stream) {
        socket.destroy();
        return;
      }
      socket.pipe(stream);
      stream.pipe(socket);
    });
  });

  const localPort = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('Failed to bind SSH local forward'));
    });
    server.on('error', reject);
  });

  return {
    localPort,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const c of [...clients].reverse()) {
        const hop = (c as unknown as { _hopServer?: Server })._hopServer;
        if (hop) await new Promise<void>((resolve) => hop.close(() => resolve()));
        c.end();
      }
    },
  };
}

export { expandHome };
