# Lexi Selection Chrome extension

Select a word or phrase on any HTTP(S) page to save it as a marked item, add it to Vocabulary, translate it, or copy it. Actions and translations stay in the selection popup; only the optional sign-in button opens Lexi. The extension does not store your Lexi password or session token; API calls use the signed-in Lexi browser session.

Chrome's built-in PDF viewer does not allow extensions to inject the selection popup. In a PDF, select text, right-click, choose **Lexi Selection**, then choose an action. Open the extension icon to see the latest result or choose an ambiguous vocabulary form.

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select this `extension` folder.
3. Open the extension popup, set the Lexi site URL (for local development, `http://localhost:3000`), save it, then sign in using **Open Lexi and sign in**.
4. Reload the extension and pages where you want the selection menu. Accept the context menu permission if Chrome asks.

## Production setup

Set `CHROME_EXTENSION_ORIGIN` on the Lexi server to the published extension origin (`chrome-extension://<extension-id>`), then redeploy. `BETTER_AUTH_URL` must be set to the public Lexi URL. In `manifest.json`, add that URL to `host_permissions` (for example `https://lexi.example.com/*`).

For local development, Chrome extension origins are not included in the server allowlist unless explicitly set. Add `CHROME_EXTENSION_ORIGIN=chrome-extension://<your-unpacked-extension-id>` to the server environment and restart it.
