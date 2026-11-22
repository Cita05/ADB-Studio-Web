export const errorText = (error) => (error instanceof Error ? error.message : String(error));
