const DEFAULT_URL = "http://localhost:3000"

chrome.runtime.onInstalled.addListener(async () => {
  const { appUrl } = await chrome.storage.sync.get("appUrl")
  if (!appUrl) await chrome.storage.sync.set({ appUrl: DEFAULT_URL })
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({ id: "lexi-selection", title: "Lexi Selection", contexts: ["selection"] })
  chrome.contextMenus.create({ id: "lexi-translate", parentId: "lexi-selection", title: "Translate and explain", contexts: ["selection"] })
  chrome.contextMenus.create({ id: "lexi-vocab", parentId: "lexi-selection", title: "Add to Vocabulary", contexts: ["selection"] })
  chrome.contextMenus.create({ id: "lexi-mark", parentId: "lexi-selection", title: "Save to Marked", contexts: ["selection"] })
})

async function lexiApi(path, body) {
  const { appUrl = DEFAULT_URL } = await chrome.storage.sync.get("appUrl")
  const response = await fetch(new URL(path, appUrl), {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || (response.status === 401 ? "Sign in to Lexi, then try again." : `Lexi returned ${response.status}.`))
  return data
}

async function reportContextAction(title, detail, extra = {}) {
  await chrome.storage.local.set({ lexiLastAction: { title, detail, updatedAt: Date.now(), ...extra } })
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" })
  await chrome.action.setBadgeText({ text: "✓" })
  await chrome.action.setTitle({ title: `Lexi: ${title}` })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!["lexi-translate", "lexi-vocab", "lexi-mark"].includes(info.menuItemId) || !info.selectionText) return
  const text = info.selectionText.trim().slice(0, 500)
  const url = tab?.url || "https://unknown.invalid/"
  const title = (tab?.title || "PDF document").slice(0, 300)
  const payload = { text, context: text, url, title }
  await reportContextAction("Working…", "Processing the selected PDF text.")
  try {
    if (info.menuItemId === "lexi-mark") {
      await lexiApi("/api/extension/marked", payload)
      return await reportContextAction("Saved to Marked", text)
    }
    if (info.menuItemId === "lexi-translate") {
      const { item } = await lexiApi("/api/extension/marked", payload)
      const { entry } = await lexiApi("/api/learning-history/translations/explain", { markedItemId: item.id })
      const explanation = entry.explanation || {}
      return await reportContextAction("Translation", `${text}: ${explanation.wordTranslation || explanation.contextMeaning || "Done"}`, { explanation })
    }
    const result = await lexiApi("/api/vocabulary/add", { term: text, context: text, source: { title, url } })
    if (result.status === "ambiguous") return await reportContextAction("Choose a word form", "Open the extension popup to choose an entry.", { candidates: result.candidates, addPayload: { term: text, context: text, source: { title, url } } })
    if (result.status === "similar") return await reportContextAction("Similar word found", "Open the extension popup to review the result.", { similarItems: result.similarItems, addPayload: { term: text, context: text, source: { title, url } } })
    return await reportContextAction("Added to Vocabulary", result.term || text)
  } catch (error) {
    await reportContextAction("Action failed", error instanceof Error ? error.message : "Could not complete the action.")
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "LEXI_API") return
  ;(async () => {
    const { appUrl = DEFAULT_URL } = await chrome.storage.sync.get("appUrl")
    const response = await fetch(new URL(message.path, appUrl), {
      method: message.method || "GET",
      credentials: "include",
      headers: message.body ? { "content-type": "application/json" } : {},
      body: message.body ? JSON.stringify(message.body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    sendResponse({ ok: response.ok, status: response.status, data })
  })().catch(error => sendResponse({ ok: false, status: 0, data: { error: error.message } }))
  return true
})
