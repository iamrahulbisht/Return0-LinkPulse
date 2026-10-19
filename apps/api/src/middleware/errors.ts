import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from '../lib/errors';

/** Wraps an async route so thrown errors reach the error middleware. */
export function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToApi(r.error);
  return r.data;
}

function zodToApi(err: ZodError): ApiError {
  const fields = err.issues.map((i) => ({
    field: i.path.join('.') || 'body',
    code: 'INVALID',
    message: i.message,
  }));
  return new ApiError(400, 'VALIDATION_FAILED', fields[0]?.message ?? 'Some fields are not valid.', fields);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  if (err instanceof ZodError) {
    const e = zodToApi(err);
    res.status(400).json({ error: { code: e.code, message: e.message, fields: e.fields } });
    return;
  }
  const status = (err as { status?: number }).status;
  const multerCode = (err as { name?: string; code?: string }).name === 'MulterError' ? (err as { code?: string }).code : undefined;
  if (multerCode === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That file is too large. The limit is 1 MB.' } });
    return;
  }
  if (multerCode) {
    res.status(400).json({ error: { code: 'BAD_UPLOAD', message: 'Upload one file in the "file" field.' } });
    return;
  }
  if (status === 413) {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That file or request is too large.' } });
    return;
  }
  console.error('[error]', err instanceof Error ? err.stack : err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' } });
}
