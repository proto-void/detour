import { describe, expect, it } from 'vitest';
import { encodeGraphQLBody, fieldCompletions, parseIntrospection } from './graphql';

describe('graphql', () => {
  it('encodes query and variables', () => {
    expect(JSON.parse(encodeGraphQLBody({ query: '{ a }', variables: '{"x":1}' }))).toEqual({
      query: '{ a }',
      variables: { x: 1 },
    });
  });

  it('parses introspection types', () => {
    const docs = parseIntrospection({
      data: {
        __schema: {
          types: [
            { kind: 'OBJECT', name: 'Query', fields: [{ name: 'hello', description: 'hi' }] },
            { kind: 'OBJECT', name: '__Schema', fields: [] },
          ],
        },
      },
    });
    expect(docs).toHaveLength(1);
    expect(fieldCompletions(docs, 'Query')).toEqual(['hello']);
  });
});
