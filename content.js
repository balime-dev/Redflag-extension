(function () {
  'use strict';

  /**
   * ONLY RUN ON:
   * https://admin.transip.us/redflagged/
   */
  const ALLOWED_URL = 'https://admin.transip.us/redflagged/';

  if (!window.location.href.startsWith(ALLOWED_URL)) {
    console.log('[Order Alert] Script blocked on this page:', window.location.href);
    return;
  }

  /**
   * Statuslogica:
   *
   * Geen orders               = grijs bolletje met 0
   * Wel orders, 0 t/m 9 min   = groen bolletje met aantal orders
   * Wel orders, 10 t/m 19 min = oranje bolletje met aantal orders
   * Wel orders, 20+ min       = rood bolletje met aantal orders
   * Oudste order 30+ min      = elke 15 min notificatie opnieuw
   * Pagina refresh            = elke 60 seconden
   */

  const ORANGE_FROM_MINUTES = 10;
  const RED_FROM_MINUTES = 20;
  const NOTIFY_FROM_MINUTES = 30;

  const CHECK_INTERVAL_MS = 5 * 1000;
  const PAGE_REFRESH_INTERVAL_MS = 60 * 1000;
  const NOTIFICATION_REPEAT_MS = 15 * 60 * 1000;

  const NOTIFICATION_STORAGE_KEY = 'orderAlertNotificationLastSent';
  const SESSION_INIT_KEY = 'orderAlertSessionInit';

  const COLORS = {
    GREY: '#9AA0A6',
    GREEN: '#34A853',
    ORANGE: '#BF7300',
    RED: '#D93025'
  };

  const originalTitle = document.title;

  function handleSessionReset() {
    if (!sessionStorage.getItem(SESSION_INIT_KEY)) {
      console.log('[Order Alert] New session detected -> reset notification state');
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
      sessionStorage.setItem(SESSION_INIT_KEY, 'true');
    }
  }

  function parseOrderDateFromText(text) {
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;

    const [, year, month, day, hour, minute, second] = match;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
  }

  function getOrderStatus() {
    const rows = document.querySelectorAll('tr');

    let oldestDate = null;
    let orderCount = 0;

    rows.forEach(row => {
      const rowText = row.textContent.trim().replace(/\s+/g, ' ');
      if (!rowText) return;

      const orderDate = parseOrderDateFromText(rowText);
      if (!orderDate) return;

      orderCount++;

      if (!oldestDate || orderDate < oldestDate) {
        oldestDate = orderDate;
      }
    });

    if (orderCount === 0 || !oldestDate) {
      return { orderCount: 0, ageMinutes: null, status: 'GREY' };
    }

    const ageMinutes = Math.floor((Date.now() - oldestDate.getTime()) / 60000);

    if (ageMinutes >= RED_FROM_MINUTES) {
      return { orderCount, ageMinutes, status: 'RED' };
    }

    if (ageMinutes >= ORANGE_FROM_MINUTES) {
      return { orderCount, ageMinutes, status: 'ORANGE' };
    }

    return { orderCount, ageMinutes, status: 'GREEN' };
  }

  function removeExistingFavicons() {
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach(el => el.remove());
  }

  function setFaviconHref(href) {
    removeExistingFavicons();

    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = href;

    document.head.appendChild(favicon);
  }

  function formatOrderCount(orderCount) {
    return orderCount > 99 ? '99+' : String(orderCount);
  }

  function getFontSizeForCount(label) {
    if (label.length === 1) return 34;
    if (label.length === 2) return 28;
    return 21;
  }

  function setFaviconDot(color, orderCount) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext('2d');

    const label = formatOrderCount(orderCount);
    const fontSize = getFontSizeForCount(label);

    ctx.clearRect(0, 0, 64, 64);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 32, 34);

    setFaviconHref(canvas.toDataURL('image/png'));
  }

  function requestNotificationPermissionIfNeeded() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function sendOldOrderNotification(orderStatus) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    new Notification('Redflagged order 30+ min open', {
      body: `Oudste order: ${orderStatus.ageMinutes} min | Totaal: ${orderStatus.orderCount}`
    });
  }

  function getLastNotificationTime() {
    const v = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    return v ? Number(v) : null;
  }

  function setLastNotificationTimeNow() {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, String(Date.now()));
  }

  function shouldSendNotification() {
    const last = getLastNotificationTime();
    if (!last) return true;

    return (Date.now() - last) >= NOTIFICATION_REPEAT_MS;
  }

  function updateNotificationStatus(orderStatus) {
    if (orderStatus.ageMinutes === null) return;

    if (orderStatus.ageMinutes >= NOTIFY_FROM_MINUTES) {
      if (shouldSendNotification()) {
        sendOldOrderNotification(orderStatus);
        setLastNotificationTimeNow();
      }
    } else {
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
    }
  }

  function updateTabStatus() {
    const orderStatus = getOrderStatus();

    if (orderStatus.status === 'GREY') {
      document.title = `⚪ 0 orders - ${originalTitle}`;
      setFaviconDot(COLORS.GREY, 0);
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
      return;
    }

    if (orderStatus.status === 'GREEN') {
      document.title = `🟢 ${orderStatus.orderCount} orders, ${orderStatus.ageMinutes}m - ${originalTitle}`;
      setFaviconDot(COLORS.GREEN, orderStatus.orderCount);
    }

    if (orderStatus.status === 'ORANGE') {
      document.title = `🟠 ${orderStatus.orderCount} orders, ${orderStatus.ageMinutes}m - ${originalTitle}`;
      setFaviconDot(COLORS.ORANGE, orderStatus.orderCount);
    }

    if (orderStatus.status === 'RED') {
      document.title = `🔴 ${orderStatus.orderCount} orders, ${orderStatus.ageMinutes}m - ${originalTitle}`;
      setFaviconDot(COLORS.RED, orderStatus.orderCount);
    }

    updateNotificationStatus(orderStatus);
  }

  function startAutoRefresh() {
    setInterval(() => {
      console.log('[Order Alert] Auto refresh');
      window.location.reload();
    }, PAGE_REFRESH_INTERVAL_MS);
  }

  // INIT
  handleSessionReset();
  requestNotificationPermissionIfNeeded();

  setTimeout(updateTabStatus, 1000);
  setInterval(updateTabStatus, CHECK_INTERVAL_MS);

  const observer = new MutationObserver(updateTabStatus);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  startAutoRefresh();
})();
