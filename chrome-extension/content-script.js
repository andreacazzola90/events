(() => {
  let overlay = null;
  let selection = null;
  let startX = 0;
  let startY = 0;

  const cleanup = () => {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    selection = null;
    document.body.style.userSelect = '';
  };

  const createOverlay = () => {
    overlay = document.createElement('div');
    overlay.id = '__event_creator_overlay__';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.15)';
    overlay.style.zIndex = '2147483647';
    overlay.style.cursor = 'crosshair';
    overlay.style.userSelect = 'none';

    selection = document.createElement('div');
    selection.style.position = 'absolute';
    selection.style.border = '2px solid #2563eb';
    selection.style.background = 'rgba(37,99,235,0.2)';
    selection.style.display = 'none';

    overlay.appendChild(selection);
    document.body.appendChild(overlay);
  };

  const setRect = (x, y, width, height) => {
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  };

  const startSelection = () => {
    if (overlay) {
      cleanup();
    }

    document.body.style.userSelect = 'none';
    createOverlay();

    let selecting = false;

    overlay.addEventListener('mousedown', (event) => {
      selecting = true;
      startX = event.clientX;
      startY = event.clientY;
      selection.style.display = 'block';
      setRect(startX, startY, 0, 0);
    });

    overlay.addEventListener('mousemove', (event) => {
      if (!selecting) {
        return;
      }

      const currentX = event.clientX;
      const currentY = event.clientY;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      setRect(left, top, width, height);
    });

    overlay.addEventListener('mouseup', (event) => {
      if (!selecting) {
        cleanup();
        return;
      }

      selecting = false;
      const endX = event.clientX;
      const endY = event.clientY;

      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);

      cleanup();

      if (width < 8 || height < 8) {
        chrome.runtime.sendMessage({
          type: 'AREA_SELECTION_CANCELLED',
          reason: 'Area troppo piccola. Riprova selezionando una zona più ampia.'
        });
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          chrome.runtime.sendMessage({
            type: 'AREA_SELECTED',
            rect: { x: left, y: top, width, height },
            devicePixelRatio: window.devicePixelRatio || 1
          });
        });
      });
    });

    overlay.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      cleanup();
      chrome.runtime.sendMessage({ type: 'AREA_SELECTION_CANCELLED', reason: 'Selezione annullata.' });
    });

    window.addEventListener('keydown', function onKeydown(event) {
      if (event.key === 'Escape') {
        cleanup();
        chrome.runtime.sendMessage({ type: 'AREA_SELECTION_CANCELLED', reason: 'Selezione annullata.' });
        window.removeEventListener('keydown', onKeydown);
      }
    });
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'START_AREA_SELECTION') {
      startSelection();
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });
})();
