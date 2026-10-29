const input = document.querySelector("#app-url")
const status = document.querySelector("#status")
chrome.storage.sync.get("appUrl", ({ appUrl }) => input.value = appUrl || "http://localhost:3000")

function renderLastAction(value) {
  const box = document.querySelector("#last-action")
  const choiceBox = document.querySelector("#last-choices")
  if (!value) { box.hidden = true; return }
  box.hidden = false
  document.querySelector("#last-title").textContent = value.title || "Last PDF action"
  document.querySelector("#last-detail").textContent = value.detail || ""
  choiceBox.replaceChildren()
  for (const candidate of value.candidates || []) {
    const button = document.createElement("button")
    button.textContent = `${candidate.term} — ${candidate.explanation}`
    button.addEventListener("click", () => chooseVocabulary(value, candidate.term))
    choiceBox.append(button)
  }
  if (value.similarItems?.length) {
    for (const item of value.similarItems) {
      const label = document.createElement("small")
      label.textContent = `Similar saved entry: ${item.term}`
      choiceBox.append(label)
    }
    const separate = document.createElement("button")
    separate.textContent = "Add as a separate entry"
    separate.addEventListener("click", () => chooseVocabulary(value, undefined, true))
    choiceBox.append(separate)
  }
}

async function chooseVocabulary(value, candidate, allowSimilar = false) {
  const choiceBox = document.querySelector("#last-choices")
  choiceBox.querySelectorAll("button").forEach(button => button.disabled = true)
  const payload = { ...value.addPayload, ...(candidate ? { candidate } : {}), ...(allowSimilar ? { allowSimilar: true } : {}) }
  try {
    const result = await chrome.runtime.sendMessage({ type: "LEXI_API", method: "POST", path: "/api/vocabulary/add", body: payload })
    if (!result?.ok) throw new Error(result?.data?.error || "Could not add this entry.")
    if (result.data.status === "added") {
      const updated = { title: "Added to Vocabulary", detail: result.data.term || payload.term }
      await chrome.storage.local.set({ lexiLastAction: updated })
      renderLastAction(updated)
    } else {
      const updated = { ...value, title: "Choose a specific word form", detail: "Select an entry below.", candidates: result.data.candidates || [], similarItems: result.data.similarItems || [] }
      await chrome.storage.local.set({ lexiLastAction: updated })
      renderLastAction(updated)
    }
  } catch (error) {
    document.querySelector("#last-detail").textContent = error.message || "Could not add this entry."
    choiceBox.querySelectorAll("button").forEach(button => button.disabled = false)
  }
}

chrome.storage.local.get("lexiLastAction", ({ lexiLastAction }) => renderLastAction(lexiLastAction))
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.lexiLastAction) renderLastAction(changes.lexiLastAction.newValue) })

document.querySelector("#save").addEventListener("click", async () => {
  try {
    const url = new URL(input.value.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error("Use an http or https URL.")
    await chrome.storage.sync.set({ appUrl: url.origin })
    status.textContent = "Site saved. Reload open tabs to enable the selection menu."
  } catch (error) { status.textContent = error.message || "Enter a valid site URL." }
})
document.querySelector("#login").addEventListener("click", async () => {
  const { appUrl = "http://localhost:3000" } = await chrome.storage.sync.get("appUrl")
  chrome.tabs.create({ url: `${appUrl}/login` })
})
