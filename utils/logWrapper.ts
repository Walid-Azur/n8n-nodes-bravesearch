import type { Tool, StructuredTool } from '@langchain/core/tools'; // Import StructuredTool
import type {
	IExecuteFunctions,
	ISupplyDataFunctions,
	NodeConnectionType, // Keep as type import if needed elsewhere
} from 'n8n-workflow';
// Import NodeConnectionType as a value/enum
import { NodeOperationError, NodeConnectionType as NodeConnectionTypeEnum, parseErrorMetadata } from 'n8n-workflow';

import { logAiEvent, isToolsInstance } from './helpers'; // Import from local helpers

// Helper function copied from the original logWrapper.ts
export async function callMethodAsync<T>(
	this: T,
	parameters: {
		executeFunctions: IExecuteFunctions | ISupplyDataFunctions;
		connectionType: NodeConnectionType;
		currentNodeRunIndex: number;
		method: (...args: any[]) => Promise<unknown>;
		arguments: unknown[];
	},
): Promise<unknown> {
	try {
		return await parameters.method.call(this, ...parameters.arguments);
	} catch (e) {
		const connectedNode = parameters.executeFunctions.getNode();
		// Ensure 'e' is an Error before passing to NodeOperationError and parseErrorMetadata
		const errorToParse = e instanceof Error ? e : new Error(String(e));

		const error = new NodeOperationError(connectedNode, errorToParse, { // Use errorToParse here
			functionality: 'configuration-node',
		});

		const metadata = parseErrorMetadata(errorToParse); // Keep using errorToParse here

		parameters.executeFunctions.addOutputData(
			parameters.connectionType,
			parameters.currentNodeRunIndex,
			error,
			metadata,
		);

		if (error.message) {
			if (!error.description) {
				error.description = error.message;
			}
			throw error;
		}

		throw new NodeOperationError(
			connectedNode,
			`Error on node "${connectedNode.name}" which is connected via input "${parameters.connectionType}"`,
			{ functionality: 'configuration-node' },
		);
	}
}


// Simplified logWrapper focusing only on Tool instances (accepting StructuredTool)
export function logWrapper(
	originalInstance: StructuredTool, // Accept StructuredTool or DynamicStructuredTool
	executeFunctions: IExecuteFunctions | ISupplyDataFunctions,
) {
	return new Proxy(originalInstance, {
		get: (target, prop) => {
			// ========== Tool ==========
			if (isToolsInstance(originalInstance)) {
				if (prop === '_call' && '_call' in target) {
					return async (query: string): Promise<string> => {
						// Assign connectionType directly here using the imported enum
						const connectionType = NodeConnectionTypeEnum.AiTool;
						const { index } = executeFunctions.addInputData(connectionType, [
							[{ json: { query } }],
						]);

						const response = (await callMethodAsync.call(target, {
							executeFunctions,
							connectionType,
							currentNodeRunIndex: index,
							method: target[prop],
							arguments: [query],
						})) as string;

						logAiEvent(executeFunctions, 'ai-tool-called', { query, response });
						executeFunctions.addOutputData(connectionType, index, [[{ json: { response } }]]);
						return response;
					};
				}
			}

			// Fallback for other properties
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return (target as any)[prop];
		},
	});
}
