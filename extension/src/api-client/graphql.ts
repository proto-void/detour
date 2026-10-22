/** GraphQL body helpers + introspection for docs/autocomplete lists. */

export interface GraphQLBody {
  query: string;
  variables?: string;
  operationName?: string;
}

export function encodeGraphQLBody(gql: GraphQLBody): string {
  let variables: unknown = undefined;
  if (gql.variables?.trim()) {
    try {
      variables = JSON.parse(gql.variables);
    } catch {
      throw new Error('GraphQL variables must be valid JSON');
    }
  }
  const payload: Record<string, unknown> = { query: gql.query };
  if (variables !== undefined) payload.variables = variables;
  if (gql.operationName?.trim()) payload.operationName = gql.operationName.trim();
  return JSON.stringify(payload);
}

export const INTROSPECTION_QUERY = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args { name description type { ...TypeRef } }
        type { ...TypeRef }
      }
    }
  }
}
fragment TypeRef on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name } } }
}
`;

export interface GqlTypeDoc {
  name: string;
  kind: string;
  description?: string;
  fields: { name: string; description?: string }[];
}

export function parseIntrospection(data: unknown): GqlTypeDoc[] {
  const root = data as { data?: { __schema?: { types?: unknown[] } } };
  const types = root?.data?.__schema?.types ?? (data as { __schema?: { types?: unknown[] } })?.__schema?.types;
  if (!Array.isArray(types)) return [];
  return types
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string')
    .filter((t) => !String(t.name).startsWith('__'))
    .map((t) => ({
      name: String(t.name),
      kind: String(t.kind ?? ''),
      description: t.description ? String(t.description) : undefined,
      fields: Array.isArray(t.fields)
        ? (t.fields as { name?: string; description?: string }[]).map((f) => ({
            name: String(f.name ?? ''),
            description: f.description ? String(f.description) : undefined,
          }))
        : [],
    }));
}

export function fieldCompletions(docs: GqlTypeDoc[], typeName?: string): string[] {
  if (typeName) {
    const t = docs.find((d) => d.name === typeName);
    return (t?.fields ?? []).map((f) => f.name).filter(Boolean);
  }
  return docs.flatMap((d) => d.fields.map((f) => `${d.name}.${f.name}`));
}
