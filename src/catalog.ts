import { z } from 'zod';
import { commandSchemas, type Command } from './commands.js';

export function designCatalog(command?: Command) {
  return command
    ? {
        command,
        inputSchema: z.toJSONSchema(commandSchemas[command], { io: 'input' }),
      }
    : {
        commands: Object.keys(commandSchemas),
        workflow:
          'Fetch one schema, then execute. Conditional factors are not an overall beauty score. Keep full results in receipts or session references.',
      };
}
