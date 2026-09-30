import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  let status =
    err instanceof ApiError ? err.status : err instanceof ZodError ? 400 : 500;
  let code =
    err instanceof ApiError
      ? err.code
      : err instanceof ZodError
        ? "VALIDATION_ERROR"
        : "INTERNAL_ERROR";
  let message =
    err instanceof ApiError
      ? err.message
      : err instanceof ZodError
        ? err.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")
        : "The request could not be completed";
  if (err?.code === "23505") {
    status = 409;
    code = "CONFLICT";
    message = "A matching record already exists";
  }
  if (err?.code === "23503") {
    status = 400;
    code = "INVALID_REFERENCE";
    message = "A referenced record does not exist";
  }
  if (err?.type === "entity.too.large") {
    status = 413;
    code = "TOO_LARGE";
    message = "Request exceeds the configured size limit";
  }
  if (err?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Invalid request body";
  }
  if (status >= 500)
    console.error(
      JSON.stringify({
        level: "error",
        requestId: req.requestId,
        code: err?.code ?? "INTERNAL_ERROR",
        message: err?.message,
      }),
    );
  res
    .status(status)
    .json({ error: { code, message, requestId: req.requestId } });
};
