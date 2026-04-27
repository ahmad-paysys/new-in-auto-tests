import fs from 'fs';
import path from 'path';

export interface EndpointParam {
  name: string;
  required: boolean;
  in: 'path' | 'query' | 'header';
  description?: string;
  schema: Record<string, unknown>;
}

export interface EndpointSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  enum?: string[];
  $ref?: string;
  [key: string]: unknown;
}

export interface EndpointInfo {
  method: string;
  path: string;
  operationId: string;
  summary?: string;
  description?: string;
  tags: string[];
  pathParams: EndpointParam[];
  queryParams: EndpointParam[];
  requestBodySchema: EndpointSchema | null;
  requestBodyRequired: boolean;
  responses: Record<string, { description: string; schema?: EndpointSchema }>;
  security: boolean;
}

export interface SwaggerSpec {
  version: '3.x' | '2.0';
  serverURL: string;
  frontendURL?: string;
  endpoints: EndpointInfo[];
  schemas: Record<string, EndpointSchema>;
}

function resolveRef(ref: string, doc: Record<string, unknown>): unknown {
  // "#/components/schemas/CreateMaskDto" → components.schemas.CreateMaskDto
  const parts = ref.replace(/^#\//, '').split('/');
  let current: unknown = doc;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return {};
    }
  }
  return current;
}

function resolveSchema(schema: EndpointSchema | undefined, doc: Record<string, unknown>): EndpointSchema | null {
  if (!schema) return null;
  if (schema.$ref) {
    return resolveRef(schema.$ref, doc) as EndpointSchema;
  }
  return schema;
}

export function parseSwagger(filePath?: string): SwaggerSpec {
  const docPath = filePath || path.resolve(process.cwd(), 'docs-json.json');
  const raw = fs.readFileSync(docPath, 'utf-8');
  const doc = JSON.parse(raw);

  // Auto-detect version
  const isOpenAPI3 = !!doc.openapi && doc.openapi.startsWith('3');
  const version: '3.x' | '2.0' = isOpenAPI3 ? '3.x' : '2.0';

  // Extract server URL
  let serverURL = '';
  let frontendURL: string | undefined;
  if (isOpenAPI3 && doc.servers && doc.servers.length > 0) {
    serverURL = doc.servers[0].url;
    // Check for frontend server
    for (const server of doc.servers) {
      if (server.description?.toLowerCase().includes('frontend')) {
        frontendURL = server.url;
      }
    }
  } else if (doc.host) {
    const scheme = doc.schemes?.[0] || 'http';
    const basePath = doc.basePath || '';
    serverURL = `${scheme}://${doc.host}${basePath}`;
  }

  // Extract schemas
  const schemas: Record<string, EndpointSchema> = {};
  const schemaSource = isOpenAPI3 ? doc.components?.schemas : doc.definitions;
  if (schemaSource) {
    for (const [name, schema] of Object.entries(schemaSource)) {
      schemas[name] = schema as EndpointSchema;
    }
  }

  // Extract /masking/* endpoints
  const endpoints: EndpointInfo[] = [];
  const paths = doc.paths || {};

  for (const [pathStr, methods] of Object.entries(paths)) {
    if (!pathStr.startsWith('/masking')) continue;

    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (['get', 'post', 'put', 'patch', 'delete'].indexOf(method) === -1) continue;

      const op = operation as Record<string, unknown>;
      const parameters = (op.parameters as EndpointParam[]) || [];

      const pathParams = parameters.filter((p) => p.in === 'path');
      const queryParams = parameters.filter((p) => p.in === 'query');

      // Request body
      let requestBodySchema: EndpointSchema | null = null;
      let requestBodyRequired = false;
      if (isOpenAPI3 && op.requestBody) {
        const rb = op.requestBody as Record<string, unknown>;
        requestBodyRequired = (rb.required as boolean) || false;
        const content = rb.content as Record<string, unknown>;
        if (content?.['application/json']) {
          const jsonContent = content['application/json'] as Record<string, unknown>;
          requestBodySchema = resolveSchema(jsonContent.schema as EndpointSchema, doc);
        }
      } else if (!isOpenAPI3) {
        const bodyParam = parameters.find((p) => p.in === ('body' as 'path'));
        if (bodyParam) {
          requestBodySchema = resolveSchema(bodyParam.schema as EndpointSchema, doc);
          requestBodyRequired = bodyParam.required;
        }
      }

      // Responses
      const responses: Record<string, { description: string; schema?: EndpointSchema }> = {};
      const rawResponses = (op.responses || {}) as Record<string, Record<string, unknown>>;
      for (const [code, resp] of Object.entries(rawResponses)) {
        const schema = isOpenAPI3
          ? resolveSchema(
              (resp.content as Record<string, Record<string, unknown>>)?.['application/json']?.schema as EndpointSchema,
              doc,
            )
          : resolveSchema(resp.schema as EndpointSchema, doc);
        responses[code] = {
          description: (resp.description as string) || '',
          schema: schema || undefined,
        };
      }

      // Security
      const security = Array.isArray(op.security) && op.security.length > 0;

      endpoints.push({
        method: method.toUpperCase(),
        path: pathStr,
        operationId: (op.operationId as string) || '',
        summary: (op.summary as string) || undefined,
        description: (op.description as string) || undefined,
        tags: (op.tags as string[]) || [],
        pathParams,
        queryParams,
        requestBodySchema,
        requestBodyRequired,
        responses,
        security,
      });
    }
  }

  return { version, serverURL, frontendURL, endpoints, schemas };
}

export function getMaskingEndpoints(filePath?: string): EndpointInfo[] {
  return parseSwagger(filePath).endpoints;
}

export function getBaseURL(filePath?: string): string {
  return parseSwagger(filePath).serverURL;
}

export function getLoginEndpoint(filePath?: string): { method: string; path: string; schema: EndpointSchema | null } {
  const docPath = filePath || path.resolve(process.cwd(), 'docs-json.json');
  const raw = fs.readFileSync(docPath, 'utf-8');
  const doc = JSON.parse(raw);
  const paths = doc.paths || {};

  for (const [pathStr, methods] of Object.entries(paths)) {
    if (!pathStr.includes('/auth/login')) continue;
    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (method === 'post') {
        const op = operation as Record<string, unknown>;
        let schema: EndpointSchema | null = null;
        if (op.requestBody) {
          const rb = op.requestBody as Record<string, unknown>;
          const content = rb.content as Record<string, unknown>;
          if (content?.['application/json']) {
            const jsonContent = content['application/json'] as Record<string, unknown>;
            schema = resolveSchema(jsonContent.schema as EndpointSchema, doc);
          }
        }
        return { method: 'POST', path: pathStr, schema };
      }
    }
  }

  return { method: 'POST', path: '/auth/login', schema: null };
}
