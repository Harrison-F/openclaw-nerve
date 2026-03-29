export interface ToolDefinition {
  id: string;
  label: string;
  description: string;
  url: string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: 'apartment-dashboard',
    label: 'Apartment Dashboard',
    description: 'Apartment search tracker and shortlist dashboard.',
    url: 'http://127.0.0.1:3333?tab=apartments',
  },
  {
    id: 'lightning-dashboard',
    label: 'Lightning Dashboard',
    description: 'Phoenixd wallet and Lightning payment dashboard.',
    url: 'http://127.0.0.1:8091',
  },
];

export function getToolDefinition(toolId: string | null | undefined): ToolDefinition | null {
  if (!toolId) return null;
  return TOOL_DEFINITIONS.find((tool) => tool.id === toolId) ?? null;
}
