// Every dialog on the site closes when you click outside it (on the dimmed backdrop).
// A press that starts inside the dialog (for example selecting text) and ends outside does not close it.
// Add data-no-backdrop-close to a dialog to opt out.
(() => {
  'use strict';
  let pressed = null;
  document.addEventListener('pointerdown', (e) => { pressed = e.target; }, true);
  document.addEventListener('click', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDialogElement) || !d.open || d.hasAttribute('data-no-backdrop-close')) return;
    if (pressed !== d || e.detail === 0) return; // started elsewhere, or a keyboard-triggered click
    const r = d.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    // The photo viewer is a transparent dialog whose own box is larger than the photo, so any click on it counts.
    if (outside || d.classList.contains('tr-lb')) d.close();
  });
})();
