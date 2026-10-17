import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/session";

type Ctx<P> = { params: Promise<P> };

/**
 * Wraps a route handler: consistent JSON errors for validation, permission and DB errors.
 */
export function withApi<P = Record<string, string>>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return NextResponse.json({ error: "Duplicate record", details: err.meta }, { status: 409 });
    if (err.code === "P2025") return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}
