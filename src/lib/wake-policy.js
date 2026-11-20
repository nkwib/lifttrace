/** Should the Keep-Awake setting hold the screen on right now? Pure. */
export function shouldHoldScreen(setting, hasLoggedSet, finished, isActiveDay) {
  return !!setting && !!hasLoggedSet && !finished && !!isActiveDay;
}
