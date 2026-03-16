let globalSheets: CSSStyleSheet[] | null = null

export function getGlobalStyleSheets() {
  if (globalSheets === null) {
    globalSheets = Array.from(document.styleSheets).map((x) => {
      const sheet = new CSSStyleSheet()
      const css = Array.from(x.cssRules)
        .map((rule) => rule.cssText)
        .join(' ')
      sheet.replaceSync(css)
      return sheet
    })
  }

  return globalSheets
}

export function addGlobalStylesToShadowRoot(shadowRoot: ShadowRoot | null) {
  shadowRoot?.adoptedStyleSheets.push(...getGlobalStyleSheets())
}
