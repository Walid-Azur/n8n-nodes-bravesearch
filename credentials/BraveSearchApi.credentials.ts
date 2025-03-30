import {
	NodeApiError,
	type ICredentialTestRequest, // Keep this type
	type ICredentialType,
	type IHttpRequestOptions,
	// Add INodeProperties for properties array type
	type INodeProperties,
} from 'n8n-workflow';

export class BraveSearchApi implements ICredentialType {
	name = 'braveSearchApi';
	displayName = 'Brave Search API';
	documentationUrl = 'https://api.search.brave.com/'; // Using the base API URL as documentation
	properties: INodeProperties[] = [ // Explicitly type the array
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string' as const,
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Brave Search API Key (X-Subscription-Token)',
		},
		// Add Base URL property
		{
			displayName: 'Base URL',
			name: 'baseURL',
			type: 'string',
			default: 'https://api.search.brave.com',
			description: 'The base URL for the Brave Search API',
		},
	];

	// Implement test method
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseURL}}', // Use the baseURL from credentials
			url: '/res/v1/web/search', // Simple search endpoint
			headers: {
				'Accept': 'application/json',
				'X-Subscription-Token': '={{$credentials.apiKey}}',
			},
			qs: {
				q: 'test', // Simple query for validation
				count: 1, // Request minimal results
			},
			// Skip SSL verification if needed for local testing, but generally not recommended
			// skipSslCertificateValidation: true,
		},
	};
}
