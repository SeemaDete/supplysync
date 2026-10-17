import type { Prisma } from "@prisma/client";
import type { getPoDetail } from "@/services/po-service";

/** Shape of a value after JSON serialisation (server → client component boundary) */
export type Jsonify<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? string
    : T extends Uint8Array
      ? never
      : T extends (infer U)[]
        ? Jsonify<U>[]
        : T extends object
          ? { [K in keyof T]: Jsonify<T[K]> }
          : T;

/** Decimals → strings, Dates → ISO strings: safe to pass to client components */
export function toPlain<T>(v: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(v)) as Jsonify<T>;
}

export type PoDetailDTO = Jsonify<Awaited<ReturnType<typeof getPoDetail>>>;
export type PoLineDTO = PoDetailDTO["lines"][number];

export type Perms = {
  edit: boolean;
  archive: boolean;
  close: boolean;
  email: boolean;
  response: boolean;
  delivery: boolean;
  gr: boolean;
  override: boolean;
  comment: boolean;
  upload: boolean;
  supplier: boolean;
};
