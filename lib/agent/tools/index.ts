import { resolveEntityTool } from "./resolve-entity";
import { runSqlTool } from "./run-sql";

export { resolveEntityTool, runSqlTool };

export const agentTools = [resolveEntityTool, runSqlTool];
