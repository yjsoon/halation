export type ToolCredentials = { provider: string; model: string; apiKey: string };
export function ToolProvider({ value, onChange, statement = false }: { value: ToolCredentials; onChange: (value: ToolCredentials) => void; statement?: boolean }) {
  return <div className="tool-provider">
    <label>Provider<select value={value.provider} onChange={(event) => onChange({ provider: event.target.value, model: "", apiKey: "" })}>
      <option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option>
      {statement ? <option value="gemini">Google Gemini</option> : <option value="opencode">OpenCode</option>}
    </select></label>
    <label>Exact model ID<input required value={value.model} maxLength={160} placeholder={value.provider === "gemini" ? "gemini-3-flash-preview" : value.provider === "openrouter" ? "openai/gpt-4o-mini" : value.provider === "opencode" ? "deepseek-v4-flash" : "gpt-4o-mini"} onChange={(event) => onChange({ ...value, model: event.target.value })} /></label>
    {value.provider === "openrouter" && <p className="diagnostic-note">Any compatible OpenRouter model ID is accepted, including Claude. Include the vendor prefix, for example <code>anthropic/claude-sonnet-4.5</code>. Check the <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer">current model list</a>{statement ? " and choose a model that accepts images" : ""}.</p>}
    <label>Your provider API key<input required type="password" autoComplete="off" value={value.apiKey} maxLength={512} onChange={(event) => onChange({ ...value, apiKey: event.target.value })} /></label>
    <p className="diagnostic-note">Keys stay in page memory and are sent only through Halation to the chosen provider. No model or provider fallback. Leaving this page clears the key. Provider charges and retention policies apply.</p>
  </div>;
}
