import { DynamicStructuredTool } from '@langchain/core/tools';
import type {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import {
	NodeApiError,
	NodeConnectionType,
	NodeOperationError,
	jsonParse,
} from 'n8n-workflow';
import { z } from 'zod';

import { logWrapper } from '../../utils/logWrapper';

// Zod schema defining the input arguments for the Brave Search tool
const braveSearchSchema = z.object({
	q: z.string().describe('The search query string. Must not be empty. Example: "latest AI advancements"'),
	country: z
		.string()
		.optional()
		.describe(
			'Optional: The 2-character country code to tailor search results (e.g., "US", "DE", "FR"). If omitted, the search may use a default region.',
		),
	search_lang: z
		.string()
		.optional()
		.describe('Optional: The search language preference code (e.g., "en", "de", "fr"). Defaults to "en" if not specified.'),
	count: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe('Optional: Number of search results to return (integer between 1 and 20). Defaults to 10 if not specified.'),
	offset: z
		.number()
		.int()
		.min(0)
		.max(9)
		.optional()
		.describe('Optional: Zero-based offset for paginating results (integer between 0 and 9). Defaults to 0 if not specified.'),
	safesearch: z
		.enum(['off', 'moderate', 'strict'])
		.optional()
		.describe('Optional: Level of filtering for adult content ("off", "moderate", "strict"). Defaults to "moderate" if not specified.'),
	freshness: z
		.string()
		.optional()
		.describe(
			'Optional: Filter results by age. Use codes like "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year), or a date range format "YYYY-MM-DDtoYYYY-MM-DD". Example: "pw"',
		),
	result_filter: z
		.string()
		.optional()
		.describe(
			'Optional: Comma-separated list to filter result types (e.g., "web", "videos", "news", "images"). Example: "web,news"',
		),
	extra_snippets: z
		.boolean()
		.optional()
		.default(true)
		.describe('Optional: Set to true to request additional snippets per result (boolean). Defaults to true if not specified.'),
});

export class ToolBraveSearch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Web Search Tool (Brave)',
		name: 'toolBraveSearch',
		icon: 'file:braveSearch.svg',
		group: ['ai', 'tools'],
		version: 1,
		description: 'Provides a tool for AI Agents to search the web using the Brave Search API.',
		subtitle: '={{ $parameter.toolDescription }}',
		defaults: {
			name: 'Web Search (Brave)',
		},
		documentationUrl: 'https://api-dashboard.search.brave.com/app/documentation/web-search/get-started',
		inputs: [],
		outputs: [NodeConnectionType.AiTool],
		outputNames: ['Tool'],
		credentials: [
			{
				name: 'braveSearchApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Tool Settings', // Section Header
				name: 'toolSettingsNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {},
				},
			},
			{
				displayName: 'Tool Description',
				name: 'toolDescription',
				type: 'string',
				required: true,
				default: 'Performs a web search using the Brave Search API to find current information based on a user query. Input is a query string and optional parameters (country, language, count, etc.). Output is a formatted list of search results including title, URL, and a concise snippet.',
				placeholder: 'e.g., Use this tool to search the web for current information.',
				description: 'Detailed description of the tool\'s purpose, inputs, and outputs for the AI model. Essential for the AI to understand when and how to use this tool effectively.',
				typeOptions: {
					rows: 3,
				},
			},
			{
				displayName: 'API Options', // Section Header
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				description: 'Optional parameters to override or set defaults for the Brave Search API.',
				options: [
					{
						displayName: 'Result Count',
						name: 'count',
						type: 'number',
						typeOptions: {
							minValue: 1,
							maxValue: 20,
						},
						default: 5,
						description: 'Number of search results to return (1-20). Overrides AI input if set.',
					},
					{
						displayName: 'Result Offset',
						name: 'offset',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 9,
						},
						default: 0,
						description: 'Zero-based offset for pagination (0-9). Overrides AI input if set.',
					},
					{
						displayName: 'Safe Search',
						name: 'safesearch',
						type: 'options',
						options: [
							{ name: 'Off', value: 'off' },
							{ name: 'Moderate', value: 'moderate' },
							{ name: 'Strict', value: 'strict' },
						],
						default: 'moderate',
						description: 'Filter results for adult content. Overrides AI input if set.',
					},
					{
						displayName: 'Freshness',
						name: 'freshness',
						type: 'string',
						default: '',
						placeholder: 'e.g., pw, pm, YYYY-MM-DDtoYYYY-MM-DD',
						description: 'Filter results by discovery date (pd, pw, pm, py, or date range). Overrides AI input if set.',
					},
					{
						displayName: 'Result Filter',
						name: 'result_filter',
						type: 'string',
						default: '',
						placeholder: 'e.g., web,videos,news',
						description: 'Comma-separated list of result types to include. Overrides AI input if set.',
					},
					{
						displayName: 'Include Extra Snippets',
						name: 'extra_snippets',
						type: 'boolean',
						default: true,
						description: 'Whether to include up to 5 additional snippets per result. Overrides AI input if set.',
					},
					{
						displayName: 'Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'e.g., US, DE, FR',
						description: '2-character country code for search results origin. Overrides AI input if set.',
					},
					{
						displayName: 'Search Language',
						name: 'search_lang',
						type: 'string',
						default: '',
						placeholder: 'e.g., en, de, fr',
						description: 'Search language preference. Overrides AI input if set.',
					},
				],
			},
			{
				displayName: 'Output & Debugging', // Section Header
				name: 'outputDebuggingNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {},
				},
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{ name: 'Raw JSON String', value: 'rawJsonString' },
					{ name: 'Simplified List', value: 'simplifiedList' },
				],
				default: 'simplifiedList',
				description: 'Choose the format for the search results string returned by the tool. "Simplified List" is recommended for most AI agents.',
			},
			{
				displayName: 'Debug Mode',
				name: 'debugMode',
				type: 'boolean',
				default: false,
				description: 'Enable debug mode to log request details and raw API response.',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const toolDescription = this.getNodeParameter('toolDescription', itemIndex) as string;
		const nodeOptions = this.getNodeParameter('options', itemIndex, {}) as { [key: string]: any };
		const outputFormat = this.getNodeParameter('outputFormat', itemIndex, 'simplifiedList') as string; // Default to simplifiedList
		const debugMode = this.getNodeParameter('debugMode', itemIndex, false) as boolean;

		const credentials = await this.getCredentials('braveSearchApi', itemIndex);
		const baseURL = (credentials.baseURL as string) || 'https://api.search.brave.com';
		const apiKey = credentials.apiKey as string;

		const func = async (input: z.infer<typeof braveSearchSchema>): Promise<string> => {
			// Node options override AI input
			const finalParams: Record<string, any> = { ...input, ...nodeOptions };

			// Remove empty string options from UI that shouldn't be sent
			Object.keys(finalParams).forEach(key => {
				if (finalParams[key] === '') {
					delete finalParams[key];
				}
			});

			const { q, ...otherParams } = finalParams;

			const requestOptions: IHttpRequestOptions = {
				method: 'GET',
				baseURL: baseURL,
				url: '/res/v1/web/search',
				headers: {
					'Accept': 'application/json',
					'Accept-Encoding': 'gzip',
					'X-Subscription-Token': apiKey,
				},
				qs: {
					q: q,
					...otherParams,
				},
				// qsStringifyOptions removed as it's not part of IHttpRequestOptions
				json: true, // Expect a JSON response from Brave API
			};

			if (debugMode) {
				this.logger.debug(`Brave Search Request Options (Item ${itemIndex}): ${JSON.stringify(requestOptions, null, 2)}`);
			}

			let response: any;
			try {
				response = await this.helpers.httpRequest(requestOptions);

				if (debugMode) {
					this.logger.debug(`Brave Search Raw Response (Item ${itemIndex}):`, response);
				}

				if (outputFormat === 'simplifiedList') {
					try {
						const results = response?.web?.results || [];
						if (!Array.isArray(results)) {
							this.logger.warn(`Unexpected response structure for simplified list (Item ${itemIndex}). Returning raw JSON.`);
							return JSON.stringify(response, null, 2);
						}

						const maxSnippetLength = 1000;
						const simplified = results.map((res: any, idx: number) => {
							const snippet = (res.description || 'No Snippet').replace(/\n/g, ' ');
							const truncatedSnippet = snippet.length > maxSnippetLength
								? snippet.substring(0, maxSnippetLength) + '...'
								: snippet;
							return `${idx + 1}. ${res.title || 'No Title'}\n   URL: ${res.url || 'No URL'}\n   Snippet: ${truncatedSnippet}`;
						}).join('\n\n');

						if (debugMode) {
							this.logger.debug(`Brave Search Simplified Response (Truncated Snippet) (Item ${itemIndex}): ${simplified}`);
						}
						return simplified || 'No results found.';
					} catch (parseError) {
						this.logger.error(`Error simplifying Brave Search response (Item ${itemIndex}): ${parseError instanceof Error ? parseError.message : String(parseError)}. Returning raw JSON.`);
						return JSON.stringify(response, null, 2); // Fallback to raw JSON on simplification error
					}
				} else {
					// Raw JSON String output
					return JSON.stringify(response, null, 2);
				}

			} catch (error) {
				if (error instanceof NodeApiError) {
					this.logger.error(`Brave Search API Error (Item ${itemIndex}): Status ${error.httpCode} - ${error.message}`, { itemIndex, httpCode: error.httpCode, errorMessage: error.message, stack: error.stack });
					throw new NodeOperationError(
						this.getNode(),
						`Brave Search API request failed: ${error.message} (Status: ${error.httpCode})`,
						{ itemIndex, description: error.description ?? undefined }
					);
				}

				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logger.error(`Unexpected Error during Brave Search (Item ${itemIndex}): ${errorMessage}`, { itemIndex, errorMessage, stack: error instanceof Error ? error.stack : undefined });
				throw new NodeOperationError(
					this.getNode(),
					`An unexpected error occurred during Brave Search: ${errorMessage}`,
					{ itemIndex },
				);
			}
		};

		const tool = new DynamicStructuredTool({
			name: 'web_search', // Name used by the AI agent
			description: toolDescription,
			schema: braveSearchSchema,
			func: func,
		});

		return {
			response: logWrapper(tool, this), // Wrap tool for logging
		};
	}
}
