// Removed incorrect AssemblyAI imports
import { BraveSearchApi } from './credentials/BraveSearchApi.credentials';
// Import the correct class from the correct file
import { ToolBraveSearch } from './nodes/BraveSearch/ToolBraveSearch.node';

// Export the nodes and credentials
export {
	// Removed AssemblyAi exports
	BraveSearchApi,
	ToolBraveSearch, // Export the correct class name
};
