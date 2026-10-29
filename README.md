# Engbek

Engbek is an English vocabulary app with a contextual Watch mode. Watch uses the selected AI connection to explain expressions, translations, usage, and grammar.

## AI connection

Configure the AI provider used by Watch at `/settings/ai`. You can use the server's `OPENAI_API_KEY` or connect ChatGPT locally. Stored ChatGPT credentials are encrypted with `AI_CREDENTIAL_ENCRYPTION_KEY` (64 hexadecimal characters), or a key derived from `BETTER_AUTH_SECRET` when the dedicated key is unset. Keep the encryption secret stable between restarts.

The local ChatGPT sign-in flow is available at `http://localhost:3000` and uses a loopback callback at `http://127.0.0.1:3000/auth/callback`. Keep the same database across restarts to preserve the connection.

## Development

```bash
npm run dev
```

Open `http://localhost:3000`.
