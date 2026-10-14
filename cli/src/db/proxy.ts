import { createConnection, createServer, type Server, type Socket } from 'node:net';

export type ProxyConfig = {
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** Destination the DB client should reach. */
  dstHost: string;
  dstPort: number;
};

export type ProxyTunnel = {
  localPort: number;
  close(): Promise<void>;
};

function connectTcp(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = createConnection({ host, port }, () => resolve(s));
    s.on('error', reject);
  });
}

async function httpConnect(cfg: ProxyConfig): Promise<Socket> {
  const sock = await connectTcp(cfg.host, cfg.port);
  const auth =
    cfg.username || cfg.password
      ? `Proxy-Authorization: Basic ${Buffer.from(`${cfg.username ?? ''}:${cfg.password ?? ''}`).toString('base64')}\r\n`
      : '';
  const req = `CONNECT ${cfg.dstHost}:${cfg.dstPort} HTTP/1.1\r\nHost: ${cfg.dstHost}:${cfg.dstPort}\r\n${auth}\r\n`;
  await new Promise<void>((resolve, reject) => {
    sock.write(req, (err) => (err ? reject(err) : resolve()));
  });
  const header = await readUntil(sock, '\r\n\r\n');
  const status = header.split('\r\n')[0] ?? '';
  if (!/HTTP\/\d\.\d 200/.test(status)) {
    sock.destroy();
    throw new Error(`HTTP CONNECT failed: ${status || 'no response'}`);
  }
  return sock;
}

async function socks5Connect(cfg: ProxyConfig): Promise<Socket> {
  const sock = await connectTcp(cfg.host, cfg.port);
  const wantAuth = Boolean(cfg.username || cfg.password);
  // greeting
  sock.write(Buffer.from(wantAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
  const greet = await readExact(sock, 2);
  if (greet[0] !== 0x05) {
    sock.destroy();
    throw new Error('Not a SOCKS5 proxy');
  }
  if (greet[1] === 0x02) {
    const user = Buffer.from(cfg.username ?? '', 'utf8');
    const pass = Buffer.from(cfg.password ?? '', 'utf8');
    const auth = Buffer.alloc(3 + user.length + pass.length);
    auth[0] = 0x01;
    auth[1] = user.length;
    user.copy(auth, 2);
    auth[2 + user.length] = pass.length;
    pass.copy(auth, 3 + user.length);
    sock.write(auth);
    const authRes = await readExact(sock, 2);
    if (authRes[1] !== 0x00) {
      sock.destroy();
      throw new Error('SOCKS5 authentication failed');
    }
  } else if (greet[1] !== 0x00) {
    sock.destroy();
    throw new Error(`SOCKS5 method rejected: ${greet[1]}`);
  }

  const hostBuf = Buffer.from(cfg.dstHost, 'utf8');
  const req = Buffer.alloc(7 + hostBuf.length);
  req[0] = 0x05;
  req[1] = 0x01; // CONNECT
  req[2] = 0x00;
  req[3] = 0x03; // domain
  req[4] = hostBuf.length;
  hostBuf.copy(req, 5);
  req.writeUInt16BE(cfg.dstPort, 5 + hostBuf.length);
  sock.write(req);
  const res = await readExact(sock, 4);
  if (res[1] !== 0x00) {
    sock.destroy();
    throw new Error(`SOCKS5 CONNECT failed (code ${res[1]})`);
  }
  const atyp = res[3]!;
  if (atyp === 0x01) await readExact(sock, 4 + 2);
  else if (atyp === 0x03) {
    const len = (await readExact(sock, 1))[0]!;
    await readExact(sock, len + 2);
  } else if (atyp === 0x04) await readExact(sock, 16 + 2);
  return sock;
}

function readExact(sock: Socket, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let got = 0;
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      got += chunk.length;
      if (got >= n) {
        cleanup();
        const buf = Buffer.concat(chunks);
        const extra = buf.subarray(n);
        if (extra.length) sock.unshift(extra);
        resolve(buf.subarray(0, n));
      }
    };
    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      sock.off('data', onData);
      sock.off('error', onErr);
      sock.off('close', onClose);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Socket closed while reading'));
    };
    sock.on('data', onData);
    sock.on('error', onErr);
    sock.on('close', onClose);
  });
}

function readUntil(sock: Socket, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf(marker);
      if (idx >= 0) {
        cleanup();
        const head = buf.slice(0, idx + marker.length);
        const rest = buf.slice(idx + marker.length);
        if (rest) sock.unshift(Buffer.from(rest, 'utf8'));
        resolve(head);
      }
    };
    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      sock.off('data', onData);
      sock.off('error', onErr);
    };
    sock.on('data', onData);
    sock.on('error', onErr);
  });
}

/**
 * Open a local TCP forward that dials dstHost:dstPort through an HTTP CONNECT or SOCKS5 proxy.
 */
export async function openProxyTunnel(config: ProxyConfig): Promise<ProxyTunnel> {
  const server: Server = createServer((client: Socket) => {
    void (async () => {
      try {
        const remote =
          config.type === 'http' ? await httpConnect(config) : await socks5Connect(config);
        client.pipe(remote);
        remote.pipe(client);
        client.on('error', () => remote.destroy());
        remote.on('error', () => client.destroy());
      } catch {
        client.destroy();
      }
    })();
  });

  const localPort = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('Failed to bind proxy local forward'));
    });
    server.on('error', reject);
  });

  return {
    localPort,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
