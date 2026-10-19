export interface FieldIssue {
  field: string;
  code: string;
  message: string;
  /** Free aliases to offer instead (only on alias problems). */
  suggestions?: string[];
}

/** Thrown from routes; the error middleware turns it into `{ error: { code, message, fields? } }`. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: FieldIssue[],
  ) {
    super(message);
  }
}

export const notFound = (what = 'That item') => new ApiError(404, 'NOT_FOUND', `${what} was not found.`);
export const forbidden = () => new ApiError(403, 'FORBIDDEN', 'You do not have access to this.');
