/**
 * The one place tools are handed to `document.modelContext`. The React component and the
 * lifecycle test both go through here, so the test exercises the shipped registration path.
 *
 * Unregistration is exclusively `AbortSignal`: the spec has no `unregisterTool()`.
 */
import type { WebMcpToolDef } from "./contracts";
import { withToolLog } from "./log";

export type SpecTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
};

export type RegistrationTarget = {
  registerTool(tool: SpecTool, options?: { signal?: AbortSignal }): Promise<void>;
};

export type RegisteredInfo = { name: string; readOnlyHint: boolean; untrusted: boolean };

export async function registerTools(
  context: RegistrationTarget,
  defs: WebMcpToolDef[],
  signal: AbortSignal,
  onError: (name: string, error: unknown) => void = () => {}
): Promise<RegisteredInfo[]> {
  const done: RegisteredInfo[] = [];
  for (const def of defs) {
    // Declarative tools are registered by the browser from their <form toolname>. Registering
    // them here as well would collide on name and throw InvalidStateError.
    if (def.declarative) continue;
    if (signal.aborted) return done;
    try {
      await context.registerTool(
        {
          name: def.name,
          title: def.title,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: def.annotations,
          execute: withToolLog(def.name, def.execute),
        },
        { signal }
      );
      done.push({
        name: def.name,
        readOnlyHint: def.annotations.readOnlyHint,
        untrusted: def.annotations.untrustedContentHint,
      });
    } catch (error) {
      if (signal.aborted) return done;
      onError(def.name, error);
    }
  }
  return done;
}
