import { toCurl } from './curl';
import type { ApiRequest } from './model';
import { prepareHttp } from './prepare';
import type { VariableScopes } from './variables';

export const CODEGEN_TARGETS = ['fetch', 'axios', 'node', 'python', 'go', 'curl', 'httpie'] as const;
export type CodegenTarget = (typeof CODEGEN_TARGETS)[number];

export function generateCode(request: ApiRequest, target: CodegenTarget, scopes: VariableScopes = {}): string {
  const prepared = prepareHttp(request, scopes);
  const method = prepared.method.toUpperCase();
  const url = prepared.url;
  const headers = prepared.headers;
  const body = prepared.body;

  switch (target) {
    case 'curl': {
      const curlReq: ApiRequest = {
        ...request,
        url,
        params: [],
        headers: Object.entries(headers).map(([k, v], i) => ({ id: `h${i}`, key: k, value: v, enabled: true })),
        body: body ? { mode: 'raw', text: body, language: 'text' as const } : { mode: 'none' },
      };
      return toCurl(curlReq);
    }
    case 'httpie':
      return httpie(method, url, headers, body);
    case 'fetch':
      return fetchSnippet(method, url, headers, body);
    case 'axios':
      return axiosSnippet(method, url, headers, body);
    case 'node':
      return nodeSnippet(method, url, headers, body);
    case 'python':
      return pythonSnippet(method, url, headers, body);
    case 'go':
      return goSnippet(method, url, headers, body);
    default:
      return '';
  }
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function fetchSnippet(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const opts: string[] = [`method: '${method}'`];
  if (Object.keys(headers).length) opts.push(`headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')}`);
  if (body != null && method !== 'GET' && method !== 'HEAD') opts.push(`body: ${JSON.stringify(body)}`);
  return `const res = await fetch('${esc(url)}', {\n  ${opts.join(',\n  ')}\n});\nconst data = await res.text();\nconsole.log(res.status, data);`;
}

function axiosSnippet(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const lower = method.toLowerCase();
  const hasBody = body != null && method !== 'GET' && method !== 'HEAD';
  if (hasBody) {
    return `import axios from 'axios';\n\nconst { data, status } = await axios.${lower}('${esc(url)}', ${JSON.stringify(tryParse(body!) ?? body)}, {\n  headers: ${JSON.stringify(headers, null, 2)}\n});\nconsole.log(status, data);`;
  }
  return `import axios from 'axios';\n\nconst { data, status } = await axios.${lower}('${esc(url)}', {\n  headers: ${JSON.stringify(headers, null, 2)}\n});\nconsole.log(status, data);`;
}

function nodeSnippet(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const hasBody = body != null && method !== 'GET' && method !== 'HEAD';
  return `import http from 'node:https'; // or 'node:http'\n\nconst url = new URL('${esc(url)}');\nconst req = http.request(\n  {\n    hostname: url.hostname,\n    port: url.port || undefined,\n    path: url.pathname + url.search,\n    method: '${method}',\n    headers: ${JSON.stringify(headers, null, 2)},\n  },\n  (res) => {\n    let data = '';\n    res.on('data', (c) => (data += c));\n    res.on('end', () => console.log(res.statusCode, data));\n  },\n);\n${hasBody ? `req.write(${JSON.stringify(body)});\n` : ''}req.end();`;
}

function pythonSnippet(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const hasBody = body != null && method !== 'GET' && method !== 'HEAD';
  return `import requests\n\nresp = requests.request(\n    "${method}",\n    "${esc(url)}",\n    headers=${JSON.stringify(headers)},\n${hasBody ? `    data=${JSON.stringify(body)},\n` : ''})\nprint(resp.status_code, resp.text)`;
}

function goSnippet(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const hasBody = body != null && method !== 'GET' && method !== 'HEAD';
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
    .join('\n');
  return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"\n\t"strings"\n)\n\nfunc main() {\n\tvar body io.Reader\n${hasBody ? `\tbody = strings.NewReader(${JSON.stringify(body)})\n` : ''}\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, body)\n\tif err != nil { panic(err) }\n${headerLines}\n\tres, err := http.DefaultClient.Do(req)\n\tif err != nil { panic(err) }\n\tdefer res.Body.Close()\n\tb, _ := io.ReadAll(res.Body)\n\tfmt.Println(res.StatusCode, string(b))\n}`;
}

function httpie(method: string, url: string, headers: Record<string, string>, body: string | null): string {
  const parts = ['http', method, url];
  for (const [k, v] of Object.entries(headers)) parts.push(`${k}:${v}`);
  if (body != null && method !== 'GET' && method !== 'HEAD') {
    parts.push(`<<< '${esc(body)}'`);
  }
  return parts.join(' ');
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
