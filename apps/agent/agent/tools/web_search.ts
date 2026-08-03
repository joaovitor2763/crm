import { disableTool } from "eve/tools";

/**
 * OpenRouter backends do not share one native web-search tool shape. Advertising
 * Eve's provider-managed tool made DeepSeek reject the entire model request
 * before it could answer. Open-web work stays in the authored, budgeted tools
 * (`research_person`, `research_company`, and LinkedIn resolution), which also
 * keep third-party egress narrow instead of accepting arbitrary model text.
 */
export default disableTool();
