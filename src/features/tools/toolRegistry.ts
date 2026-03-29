export interface ToolDefinition {
  id: string;
  label: string;
  description: string;
  getUrl: () => string;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: 'apartment-dashboard',
    label: 'Apartment Dashboard',
    description: 'Apartment search tracker and shortlist dashboard.',
    getUrl: () => '/tools/apartment/?tab=apartments',
  },
  {
    id: 'lightning-dashboard',
    label: 'Lightning Dashboard',
    description: 'Phoenixd wallet and Lightning payment dashboard.',
    getUrl: () => '/tools/lightning/',
  },
];

export function getToolDefinition(toolId: string | null | undefined): (ToolDefinition & { url: string }) | null {
  if (!toolId) return null;
  const tool = TOOL_DEFINITIONS.find((entry) => entry.id === toolId);
  return tool ? { ...tool, url: tool.getUrl() } : null;
}
