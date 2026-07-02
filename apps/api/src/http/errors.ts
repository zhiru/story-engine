/**
 * Envelope padrão de erro (SDD §7):
 * { "error": { "code": string, "message": string, "request_id": string } }
 *
 * Todos os erros da API devem passar por sendError() (ou pelo error handler
 * global em observability.ts) para garantir o envelope com request_id.
 */
import type { FastifyReply } from "fastify";

/**
 * Códigos estáveis (UPPER_SNAKE). Códigos de domínio da geração
 * (NO_ACTIVE_SUBSCRIPTION, UNIVERSE_ACCESS_DENIED, …) também são aceitos —
 * o tipo permite string para não engessar códigos específicos de serviço.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SUSPENDED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "CONTENT_REJECTED"
  | "GENERATION_FAILED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL"
  | (string & {});

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

/** Monta o corpo do envelope padrão (útil fora de um FastifyReply, ex.: rate limit). */
export function errorEnvelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

/**
 * Responde com o envelope padrão. O request_id vem de reply.request.id
 * (gerado via genReqId/x-request-id no app.ts).
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): FastifyReply {
  return reply
    .code(statusCode)
    .send(errorEnvelope(code, message, reply.request.id, details));
}

/**
 * Erro de aplicação tipado — pode ser lançado em serviços/handlers e é
 * convertido para o envelope padrão pelo error handler global.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Fallback: mapeia status HTTP → código estável quando não há código explícito. */
export function codeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return statusCode >= 500 ? "INTERNAL" : "VALIDATION_ERROR";
  }
}
