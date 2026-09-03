import { getEquipment } from "../index";
import type { RouteIndex } from "./score";

/**
 * Routes are scored against the reliability index in `src/lib/index/` (data agent).
 * A lookup that throws (missing or half-built `data/index.json`) degrades one
 * elevator to tier "unknown" rather than failing the whole search.
 */
export function defaultIndex(): RouteIndex {
  return {
    getEquipment(code: string) {
      try {
        return getEquipment(code);
      } catch {
        return undefined;
      }
    },
  };
}
