let panel
let hideTimer
let selectionRange

const icons = {
  translate: '<svg viewBox="0 0 24 24"><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1m6 17 4-9 4 9m-6-4h5m-13 3h7m-7 0v-4m0 4c-.7 1.6-2.2 2.8-4 3.5m4-3.5c.8 1.3 1.8 2.2 3 2.8"/></svg>',
  vocab: '<svg viewBox="0 0 24 24"><path d="M12 5v14m7-7H5"/></svg>',
  mark: '<svg viewBox="0 0 24 24"><path d="m6 3 12 0v18l-6-4-6 4z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m18 6-12 12M6 6l12 12"/></svg>',
}
const buttons = [
  ["translate", "Translate and explain", icons.translate],
  ["vocab", "Add to Vocabulary", icons.vocab],
  ["mark", "Save marked", icons.mark],
  ["copy", "Copy", icons.copy],
  ["close", "Close", icons.close],
]

function api(path, body) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "LEXI_API", method: "POST", path, body }, result => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      if (!result?.ok) return reject(new Error(result?.data?.error || (result?.status === 401 ? "Sign in to Lexi, then try again." : "Could not reach Lexi.")))
      resolve(result.data)
    })
  })
}

function getSelectionContext(selection) {
  const node = selection.anchorNode
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  const block = element?.closest("p, li, blockquote, article, section, h1, h2, h3") || element
  return (block?.textContent || selection.toString()).trim().slice(0, 5000)
}

function closePanel() { panel?.remove(); panel = undefined }

function addText(parent, tag, value, className) {
  const element = document.createElement(tag)
  if (className) element.className = className
  element.textContent = value
  parent.append(element)
  return element
}

function renderBase(text, x, y, context) {
  closePanel()
  panel = document.createElement("section")
  panel.id = "lexi-selection-panel"
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-label", "Lexi selection actions")
  const head = document.createElement("div")
  head.className = "lexi-head"
  const brand = document.createElement("span")
  brand.className = "lexi-brand"
  brand.innerHTML = '<span class="lexi-brand-mark">L</span><span>Lexi</span>'
  const close = document.createElement("button")
  close.className = "lexi-close"
  close.title = "Close"
  close.setAttribute("aria-label", "Close")
  close.innerHTML = icons.close
  close.onclick = closePanel
  head.append(brand, close)
  const selected = addText(panel, "div", text, "lexi-selected")
  selected.title = "Selected text"
  const actions = document.createElement("div")
  actions.className = "lexi-actions"
  for (const [action, title, icon] of buttons.slice(0, 4)) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = `lexi-action${action === "translate" ? " lexi-primary" : ""}`
    button.dataset.action = action
    button.title = title
    button.setAttribute("aria-label", title)
    button.innerHTML = `${icon}<span>${title}</span>`
    actions.append(button)
  }
  const status = addText(panel, "div", "", "lexi-status")
  panel.append(head, actions, status)
  panel.style.left = `${Math.max(12, Math.min(x, innerWidth - 356))}px`
  panel.style.top = `${Math.max(12, Math.min(y + 14, innerHeight - 190))}px`
  panel.addEventListener("mousedown", event => event.preventDefault())
  panel.addEventListener("click", event => { void handleClick(event, text, context) })
  document.documentElement.append(panel)
}

function setBusy(message) {
  panel.querySelectorAll("button").forEach(button => button.disabled = true)
  const status = panel.querySelector(".lexi-status")
  status.textContent = message
  status.classList.add("lexi-visible")
}

function setError(error) {
  const status = panel.querySelector(".lexi-status")
  status.textContent = error instanceof Error ? error.message : String(error)
  status.className = "lexi-status lexi-visible lexi-error"
  panel.querySelectorAll("button").forEach(button => button.disabled = false)
}

async function saveMarked(text, context) {
  return api("/api/extension/marked", { text, context, url: location.href, title: document.title || location.hostname })
}

async function handleTranslate(text, context) {
  setBusy("Preparing explanation…")
  const { item } = await saveMarked(text, context)
  const { entry } = await api("/api/learning-history/translations/explain", { markedItemId: item.id })
  const explanation = entry.explanation
  panel.querySelector(".lexi-actions").remove()
  panel.querySelector(".lexi-selected").textContent = text
  const result = document.createElement("div")
  result.className = "lexi-result"
  addText(result, "div", explanation.wordTranslation, "lexi-translation")
  addText(result, "div", explanation.contextMeaning, "lexi-meaning")
  if (explanation.contextTranslation) addText(result, "div", explanation.contextTranslation, "lexi-context-translation")
  if (explanation.usage) addText(result, "div", explanation.usage, "lexi-usage")
  if (explanation.otherMeanings?.length) {
    const meanings = document.createElement("div")
    meanings.className = "lexi-other-meanings"
    addText(meanings, "div", "Other meanings", "lexi-section-title")
    for (const item of explanation.otherMeanings.slice(0, 3)) addText(meanings, "div", `${item.meaning} · ${item.translation}`, "lexi-other-item")
    result.append(meanings)
  }
  if (explanation.notes) addText(result, "div", explanation.notes, "lexi-usage")
  panel.insertBefore(result, panel.querySelector(".lexi-status"))
  const status = panel.querySelector(".lexi-status")
  status.textContent = "Saved in Translation history"
  status.className = "lexi-status lexi-visible"
  const closeButton = panel.querySelector(".lexi-close")
  closeButton.disabled = false
  panel.style.maxHeight = `${Math.max(200, innerHeight - 24)}px`
  panel.style.top = `${Math.max(12, Math.min(parseFloat(panel.style.top), innerHeight - panel.getBoundingClientRect().height - 12))}px`
}

function showVocabChoices(data, text, context) {
  panel.querySelector(".lexi-actions").remove()
  const choices = document.createElement("div")
  choices.className = "lexi-choices"
  const add = async candidate => {
    choices.querySelectorAll("button").forEach(button => button.disabled = true)
    setBusy("Adding to Vocabulary…")
    try {
      const result = await api("/api/vocabulary/add", { term: text, context, candidate, source: { title: document.title || location.hostname, url: location.href } })
      if (result.status === "ambiguous") return showVocabChoices({ candidates: result.candidates }, text, context)
      if (result.status === "similar") return showVocabChoices({ similarItems: result.similarItems }, text, context)
      panel.querySelector(".lexi-selected").textContent = `Added “${result.term}” to Vocabulary`
      panel.querySelector(".lexi-status").remove()
      choices.remove()
      const closeButton = panel.querySelector(".lexi-close")
      closeButton.disabled = false
    } catch (error) { setError(error) }
  }
  if (data.candidates?.length) {
    addText(choices, "div", "Choose the word form", "lexi-section-title")
    for (const candidate of data.candidates) {
      const button = document.createElement("button")
      button.className = "lexi-choice"
      addText(button, "span", candidate.term, "lexi-choice-term")
      addText(button, "span", candidate.explanation, "lexi-choice-description")
      button.onclick = () => void add(candidate.term)
      choices.append(button)
    }
  } else if (data.suggestions?.length) {
    addText(choices, "div", "Suggested words and phrases", "lexi-section-title")
    for (const suggestion of data.suggestions) {
      const button = document.createElement("button")
      button.className = "lexi-choice"
      addText(button, "span", suggestion.term, "lexi-choice-term")
      addText(button, "span", suggestion.explanation, "lexi-choice-description")
      button.onclick = () => void add(suggestion.term)
      choices.append(button)
    }
    const custom = document.createElement("button")
    custom.className = "lexi-choice lexi-choice-custom"
    custom.textContent = `Add full selection “${text}”`
    custom.onclick = () => void add()
    choices.append(custom)
  } else if (data.similarItems?.length) {
    addText(choices, "div", "Similar words already in Vocabulary", "lexi-section-title")
    for (const item of data.similarItems) addText(choices, "div", item.term, "lexi-choice-term")
    const separate = document.createElement("button")
    separate.className = "lexi-choice lexi-choice-custom"
    separate.textContent = "Add as a separate entry"
    separate.onclick = async () => {
      try {
        setBusy("Adding to Vocabulary…")
        await api("/api/vocabulary/add", { term: text, context, allowSimilar: true, source: { title: document.title || location.hostname, url: location.href } })
        panel.querySelector(".lexi-selected").textContent = `Added “${text}” to Vocabulary`
        choices.remove()
        panel.querySelector(".lexi-status").remove()
        panel.querySelector(".lexi-close").disabled = false
      } catch (error) { setError(error) }
    }
    choices.append(separate)
  } else {
    const custom = document.createElement("button")
    custom.className = "lexi-choice lexi-choice-custom"
    custom.textContent = `Add “${text}” to Vocabulary`
    custom.onclick = () => void add()
    choices.append(custom)
  }
  panel.insertBefore(choices, panel.querySelector(".lexi-status"))
  const status = panel.querySelector(".lexi-status")
  status.textContent = ""
  status.className = "lexi-status"
  panel.querySelector(".lexi-close").disabled = false
}

async function handleClick(event, text, context) {
  const button = event.target.closest("button")
  if (!button || button.disabled) return
  const action = button.dataset.action
  if (action === "close") return closePanel()
  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(text)
      panel.querySelector(".lexi-status").textContent = "Copied to clipboard"
      panel.querySelector(".lexi-status").classList.add("lexi-visible")
    } catch { setError("Clipboard access is not available on this page.") }
    return
  }
  try {
    if (action === "mark") {
      setBusy("Saving to Marked…")
      await saveMarked(text, context)
      panel.querySelector(".lexi-selected").textContent = "Saved to Marked"
      panel.querySelector(".lexi-status").remove()
      panel.querySelector(".lexi-actions").remove()
      panel.querySelector(".lexi-close").disabled = false
      return
    }
    if (action === "translate") return await handleTranslate(text, context)
    if (action === "vocab") {
      setBusy("Checking the selected text…")
      const data = text.trim().split(/\s+/).length > 1
        ? await api("/api/vocabulary/suggestions", { text, context })
        : await api("/api/vocabulary/add", { term: text, context, source: { title: document.title || location.hostname, url: location.href } })
      if (data.status === "added") {
        panel.querySelector(".lexi-selected").textContent = `Added “${data.term}” to Vocabulary`
        panel.querySelector(".lexi-status").remove()
        panel.querySelector(".lexi-actions").remove()
        panel.querySelector(".lexi-close").disabled = false
      } else showVocabChoices(data, text, context)
    }
  } catch (error) { setError(error) }
}

document.addEventListener("mouseup", event => {
  clearTimeout(hideTimer)
  if (event.target.closest("#lexi-selection-panel")) return
  const selection = getSelection()
  const text = selection?.toString().trim()
  if (!text || text.length > 500 || !selection.rangeCount) return closePanel()
  selectionRange = selection.getRangeAt(0).cloneRange()
  const rect = selectionRange.getBoundingClientRect()
  renderBase(text, Math.max(rect.left, Math.min(event.clientX, rect.right)), rect.bottom, getSelectionContext(selection))
})
document.addEventListener("mousedown", event => { if (!event.target.closest("#lexi-selection-panel")) hideTimer = setTimeout(closePanel, 120) })
