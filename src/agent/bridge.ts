import {
  isObject,
  mapJson,
  readKey,
  redactCredentials,
  withDeadline,
  type Json,
  type Redact,
} from "./runtime.ts";

type Scalar = string | number | boolean | null;
type StringSchema = {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: readonly string[];
};

/** Closed objects and the JSON Schema constraints supported by this registry. */
export type Schema =
  | ObjectSchema
  | StringSchema
  | {
      type: "integer" | "number";
      minimum?: number;
      maximum?: number;
      enum?: readonly number[];
    }
  | { type: "boolean" | "null" }
  | { type: "array"; items: Schema; minItems?: number; maxItems?: number }
  | { anyOf: readonly Schema[] };

export type ObjectSchema = {
  type: "object";
  properties: Readonly<Record<string, Schema>>;
  required: readonly string[];
  additionalProperties: false;
};

export function objectSchema(
  properties: ObjectSchema["properties"],
): ObjectSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function checkStrictSchema(schema: Schema): void {
  if ("anyOf" in schema) {
    schema.anyOf.forEach(checkStrictSchema);
  } else if (schema.type === "object") {
    const keys = Object.keys(schema.properties);
    if (
      schema.additionalProperties !== false ||
      schema.required.length !== keys.length ||
      keys.some((key) => !schema.required.includes(key))
    )
      throw new Error(
        "Strict tool schemas must require every property and reject additional properties.",
      );
    Object.values(schema.properties).forEach(checkStrictSchema);
  } else if (schema.type === "array") {
    checkStrictSchema(schema.items);
  } else if (schema.type === "string" && schema.pattern !== undefined) {
    new RegExp(schema.pattern, "u");
  }
}

function matches(schema: Schema, value: unknown): boolean {
  if ("anyOf" in schema)
    return schema.anyOf.some((item) => matches(item, value));
  switch (schema.type) {
    case "object":
      return (
        isObject(value) &&
        Object.keys(value).length === schema.required.length &&
        schema.required.every(
          (key) =>
            Object.hasOwn(value, key) &&
            matches(schema.properties[key], value[key]),
        )
      );
    case "array":
      return (
        Array.isArray(value) &&
        inRange(value.length, schema.minItems, schema.maxItems) &&
        [...value].every((item) => matches(schema.items, item))
      );
    case "string":
      return (
        typeof value === "string" &&
        inRange(Array.from(value).length, schema.minLength, schema.maxLength) &&
        (schema.pattern === undefined ||
          new RegExp(schema.pattern, "u").test(value)) &&
        inEnum(value, schema.enum)
      );
    case "integer":
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (schema.type === "number" || Number.isInteger(value)) &&
        inRange(value, schema.minimum, schema.maximum) &&
        inEnum(value, schema.enum)
      );
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
  }
}

function inRange(value: number, min = -Infinity, max = Infinity) {
  return value >= min && value <= max;
}

function inEnum(value: Scalar, values?: readonly Scalar[]) {
  return values === undefined || values.includes(value);
}

export type Estimate = {
  label: "estimate";
  description: string;
  model?: string;
  maxRequests?: number;
  maxOutputTokens?: number;
  maxWebSearchCalls?: number;
  narrationTurns?: number;
  narrationOutputTokensPerTurn?: number;
  transcriptionAudioSeconds?: number;
};

export type RequestConsent = (request: {
  tool: string;
  args: Readonly<Record<string, Json>>;
  estimate: Readonly<Estimate>;
}) => Promise<boolean>;

const messages = {
  unknown_tool: "没有找到此工具。",
  invalid_arguments: "工具参数无效。",
  consent_required: "请先确认费用预估并授权本次运行。",
  consent_denied: "本次运行未获费用授权。",
  aborted: "操作已取消。",
  timeout: "操作已超时。",
  unknown_may_have_been_billed:
    "请求结果未知，可能已计费。请核对用量和资料库进度。",
  no_key: "请先在此页面设置 OpenAI API 密钥。",
  key_in_content: "内容包含 API 密钥，请移除后再试。",
  not_found: "资料库中没有此节目。",
  prerequisite_required: "请先完成所需的节目阶段。",
  conflict: "节目已更新或正在制作，请重新读取资料库。",
  provider_rejected: "OpenAI 拒绝了请求，请检查模型权限和用量。",
  save_failed: "无法保存本次结果，请检查浏览器存储和用量。",
  error: "工具未能完成，请检查资料库进度。",
} as const;

type FailureStatus = keyof typeof messages;
export type ToolResult =
  { status: "ok"; data: Json } | { status: FailureStatus; message: string };

export type AuditEntry = Readonly<{
  tool: string;
  argsSummary: string;
  status: ToolResult["status"];
  startedAt: string;
  finishedAt: string;
}>;

export type AgentCallContext = {
  signal?: AbortSignal;
  requestConsent?: RequestConsent;
  appendAudit?: (entry: AuditEntry) => void;
  redact?: Redact;
};

type ToolContext<Deps> = AgentCallContext & {
  signal: AbortSignal;
  deps: Deps;
  appendAudit: (entry: AuditEntry) => void;
  redact: Redact;
};

export type ToolInfo = {
  name: string;
  description: string;
  parameters: ObjectSchema;
  paid: boolean;
};

type ToolHandler<Deps> = (
  args: Readonly<Record<string, Json>>,
  ctx: ToolContext<Deps>,
) => Json | Promise<Json>;

export type Tool<Deps> = Omit<ToolInfo, "paid"> & {
  run: ToolHandler<Deps>;
} & ({ paid: false } | { paid: true; estimate: Estimate });

export interface AgentBridge {
  listTools(): ToolInfo[];
  callTool(
    name: string,
    args: unknown,
    ctx?: AgentCallContext,
  ): Promise<ToolResult>;
}

export class ToolFailure extends Error {
  declare readonly status: FailureStatus;

  constructor(status: FailureStatus) {
    super(messages[status]);
    this.status = status;
  }
}

function failed(status: FailureStatus): ToolResult {
  return { status, message: messages[status] };
}

export function createAgentBridge<Deps = undefined>(
  tools: readonly Tool<Deps>[],
  {
    deps,
    getKey,
    timeoutMs = 1_200_000,
  }: {
    deps?: Deps;
    getKey?: () => string | undefined;
    timeoutMs?: number;
  } = {},
): AgentBridge & { listAudit(): AuditEntry[] } {
  if (!inRange(timeoutMs, 1, 2_147_483_647) || !Number.isInteger(timeoutMs))
    throw new RangeError("Invalid tool timeout.");
  const registry = new Map<string, Tool<Deps>>();
  const audit: AuditEntry[] = [];
  for (const tool of tools) {
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(tool.name) || registry.has(tool.name))
      throw new Error("Invalid or duplicate tool name.");
    const parameters = structuredClone(tool.parameters);
    checkStrictSchema(parameters);
    registry.set(tool.name, {
      ...tool,
      parameters,
      ...(tool.paid && { estimate: { ...tool.estimate } }),
    });
  }

  return {
    listTools: () =>
      [...registry.values()].map(({ name, description, parameters, paid }) => ({
        name,
        description,
        parameters: structuredClone(parameters),
        paid,
      })),
    listAudit: () => audit.slice(),
    async callTool(name, args, ctx = {}) {
      const startedAt = new Date().toISOString();
      const originalKey = readKey(getKey);
      const redact = (value: string) => {
        const masked = redactCredentials(value, originalKey);
        const latest = redactCredentials(masked, readKey(getKey));
        return ctx.redact?.(latest) ?? latest;
      };
      const signal = ctx.signal ?? new AbortController().signal;
      const tool = registry.get(name);
      const safeName = redact(typeof name === "string" ? name : "").slice(
        0,
        64,
      );
      let argsSummary = "";
      let started = false;
      const appendAudit = (entry: AuditEntry) => {
        const safeEntry = Object.freeze({
          tool: redact(entry.tool),
          argsSummary: redact(entry.argsSummary),
          status: entry.status,
          startedAt: redact(entry.startedAt),
          finishedAt: redact(entry.finishedAt),
        });
        audit.push(safeEntry);
        try {
          ctx.appendAudit?.(safeEntry);
        } catch {
          // Audit delivery is observational. The in-memory entry is already saved.
        }
      };
      let result: ToolResult;
      try {
        result = await withDeadline(signal, timeoutMs, async (active) => {
          if (!tool) return failed("unknown_tool");
          if (!matches(tool.parameters, args))
            return failed("invalid_arguments");
          let credential = false;
          const clean = mapJson(args, (value) => {
            const safe = redact(value);
            credential ||= safe !== value;
            return safe;
          }) as Record<string, Json>;
          argsSummary = JSON.stringify(clean).slice(0, 240);
          if (credential) return failed("key_in_content");
          if (tool.paid) {
            if (!ctx.requestConsent) return failed("consent_required");
            const estimate = mapJson(
              { ...tool.estimate, label: "estimate" },
              redact,
            ) as Estimate;
            let approved = false;
            try {
              approved = await ctx.requestConsent({
                tool: safeName,
                args: structuredClone(clean),
                estimate,
              });
            } catch {
              // A failed consent prompt grants no authority to spend.
            }
            active.throwIfAborted();
            if (approved !== true) return failed("consent_denied");
          }
          active.throwIfAborted();
          started = true;
          const data = await tool.run(clean, {
            ...ctx,
            signal: active,
            deps: deps as Deps,
            redact,
            appendAudit,
          });
          return { status: "ok", data: mapJson(data, redact) };
        });
      } catch (error) {
        result =
          error instanceof ToolFailure
            ? failed(error.status)
            : tool?.paid && started
              ? failed("unknown_may_have_been_billed")
              : failed(
                  signal.aborted
                    ? "aborted"
                    : error instanceof DOMException &&
                        error.name === "TimeoutError"
                      ? "timeout"
                      : "error",
                );
      }
      appendAudit({
        tool: safeName,
        argsSummary,
        status: result.status,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      return result;
    },
  };
}
