// Utilitats de navegació compartides per tots els components.

export function canInterceptNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

export function getStoryPath(storyId) {
  return `/noticia/${encodeURIComponent(storyId)}`
}
