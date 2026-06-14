/**
 * Assembles the final prompt string from a template and variable values.
 * Supports {{variable}} substitution and {{#var}}block{{/var}} conditional blocks.
 */

export interface PromptVars {
  universe_title: string;
  universe_description: string;
  characters: string; // formatted character list
  theme_title: string;
  theme_description: string;
  narrative_type: string;
  weather_condition: string;
  weather_temperature: string;
  current_time: string;
  previous_summary?: string;
  user_guidance?: string;
  seed: string;
}

/**
 * Substitutes {{var}} placeholders and resolves {{#var}}...{{/var}} conditional blocks.
 */
export function assemblePrompt(template: string, vars: PromptVars): string {
  // Handle conditional blocks: {{#var}}content{{/var}}
  // If var is non-empty, keep content with var substituted; otherwise remove block
  let result = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, content: string) => {
      const value = vars[key as keyof PromptVars];
      if (value && String(value).trim()) {
        return content.replace(`{{${key}}}`, String(value));
      }
      return "";
    },
  );

  // Replace remaining {{var}} placeholders
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof PromptVars];
    return value !== undefined && value !== null ? String(value) : "";
  });

  return result.trim();
}
