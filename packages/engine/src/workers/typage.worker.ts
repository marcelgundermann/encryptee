import { answerTool } from './answer-tool.ts';
import type { WorkerConnect } from './protocol.ts';
import { serveHeaders } from './serve-headers.ts';
import type { ToolRequest } from './tools-protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

/**
 * Everything that runs typage: a job's header workers, and the page's tools
 * worker. One script, since typage is nearly all of either and a worker's
 * script shares no code with another's. Each is a worker of its own.
 */
self.onmessage = async ({ data }: MessageEvent<WorkerConnect | ToolRequest>) => {
	if (data.type === 'tool') await answerTool(data);
	else serveHeaders(data.port);
};
