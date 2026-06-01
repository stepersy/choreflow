/* ChoreFlow Service Worker for Real Lock-Screen System Notifications */

self.addEventListener('install', (event) => {
    // Force activation immediately on install
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Claim all active website tabs immediately
    event.waitUntil(self.clients.claim());
});

// Listener for clicks on notifications
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Focus or open the ChoreFlow website
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
