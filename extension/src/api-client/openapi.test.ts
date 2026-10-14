import { describe, expect, it } from 'vitest';
import { importOpenApi } from './openapi';

const oas3 = {
  openapi: '3.0.0',
  info: { title: 'Pets', description: 'Pet store' },
  servers: [{ url: 'https://petstore.example' }],
  paths: {
    '/pets': {
      get: { operationId: 'listPets', summary: 'List pets' },
      post: {
        operationId: 'createPet',
        requestBody: {
          content: { 'application/json': { example: { name: 'fido' } } },
        },
      },
    },
  },
};

describe('importOpenApi', () => {
  it('imports OAS3 JSON', () => {
    const result = importOpenApi(JSON.stringify(oas3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.collection.name).toBe('Pets');
    const reqs = result.collection.children?.flatMap((n) => (n.kind === 'folder' ? n.children : [n])) ?? [];
    expect(reqs.filter((n) => n.kind === 'request')).toHaveLength(2);
  });

  it('imports Swagger 2', () => {
    const sw = {
      swagger: '2.0',
      info: { title: 'Legacy' },
      host: 'api.legacy.test',
      basePath: '/v1',
      schemes: ['https'],
      paths: { '/ping': { get: { operationId: 'ping' } } },
    };
    const result = importOpenApi(JSON.stringify(sw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const folder = result.collection.children?.[0];
    expect(folder?.kind).toBe('folder');
    if (folder?.kind !== 'folder') return;
    const req = folder.children[0];
    expect(req?.kind === 'request' && req.request.url).toBe('https://api.legacy.test/v1/ping');
  });
});
