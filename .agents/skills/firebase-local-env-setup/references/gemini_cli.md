# Gemini CLI Setup

To get the most out of Firebase in the Gemini CLI, follow these steps to install the agent extension and the MCP server.

## Recommended: Installing Extensions

The best way to get both the agent skills and the MCP server is via the Gemini extension.

### 1. Install Firebase Extension
This provides both the agent skills and the MCP server for working with Firebase.
```bash
gemini extensions install https://github.com/firebase/agent-skills
```

### 2. Verify and Restart
Run the following checks to confirm installation:
1. `gemini extensions list` -> Output should include `firebase`.
2. `gemini mcp list` -> Output should include `firebase-tools`.
3. `gemini skills list` -> Output should include `firebase-basic`.
4. Instruct the user to restart the Gemini CLI if any new installation occurred.

---

## Alternative: Manual MCP Configuration (Project Scope)

If the user only wants to use the MCP server for the current project:
```bash
gemini mcp add firebase "npx -y firebase-tools@latest mcp" -e IS_GEMINI_CLI_EXTENSION=true
```
