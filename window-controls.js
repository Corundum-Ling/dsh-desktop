document.querySelector('.window-controls')?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-window-action]')?.dataset.windowAction
  if (action === 'minimize') window.windowApi.minimize()
  if (action === 'maximize') window.windowApi.toggleMaximize()
  if (action === 'close') window.windowApi.close()
})
