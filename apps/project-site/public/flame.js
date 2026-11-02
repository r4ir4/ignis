// The flame's outline morphs with SMIL, which CSS can't switch off: freeze it for people who asked for less motion.
if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('svg.flame-logo').forEach((svg) => {
    if (svg.pauseAnimations) svg.pauseAnimations();
  });
}
