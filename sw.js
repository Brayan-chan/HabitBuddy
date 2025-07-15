// Service Worker para HabitBuddy
// Maneja notificaciones push y caché offline

const CACHE_NAME = 'habitbuddy-v1';
const urlsToCache = [
    '/',
    '/index.html',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/marked/marked.min.js',
    'https://cdn.jsdelivr.net/npm/dompurify@3.0.5/dist/purify.min.js',
    'https://esm.run/@google/generative-ai'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Cachéando archivos');
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.log('Service Worker: Error cacheando:', error);
            })
    );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activado');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Eliminando caché viejo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Interceptar requests de red
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Devolver desde caché si existe, sino fetch de red
                return response || fetch(event.request);
            })
    );
});

// Manejar notificaciones push
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push recibido');
    
    let notificationData = {
        title: '🌱 HabitBuddy',
        body: 'Tienes un recordatorio pendiente',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: 'habitbuddy-reminder',
        data: {
            url: '/',
            action: 'open'
        },
        actions: [
            {
                action: 'open',
                title: '📱 Abrir App'
            },
            {
                action: 'dismiss',
                title: '❌ Descartar'
            }
        ],
        requireInteraction: true,
        silent: false
    };

    // Si hay datos en el push, usarlos
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = { ...notificationData, ...pushData };
        } catch (e) {
            console.log('Service Worker: Error parseando push data:', e);
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notificación clickeada');
    
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data || {};

    if (action === 'dismiss') {
        return;
    }

    // Abrir o enfocar la aplicación
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Buscar si ya hay una ventana abierta
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        // Enviar mensaje a la aplicación sobre la acción
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            action: action,
                            data: notificationData
                        });
                        return client.focus();
                    }
                }
                
                // Si no hay ventana abierta, abrir una nueva
                if (clients.openWindow) {
                    const url = notificationData.url || '/';
                    return clients.openWindow(url);
                }
            })
    );
});

// Manejar cierre de notificaciones
self.addEventListener('notificationclose', (event) => {
    console.log('Service Worker: Notificación cerrada');
    
    // Opcional: enviar analíticas o limpiar estado
    const notificationData = event.notification.data || {};
    
    // Comunicar a la aplicación que la notificación fue cerrada
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin)) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLOSE',
                            data: notificationData
                        });
                    }
                }
            })
    );
});

// Manejar mensajes desde la aplicación principal
self.addEventListener('message', (event) => {
    console.log('Service Worker: Mensaje recibido:', event.data);
    
    const { type, data } = event.data;
    
    switch (type) {
        case 'SCHEDULE_NOTIFICATION':
            scheduleNotification(data);
            break;
        case 'CANCEL_NOTIFICATION':
            // Implementar cancelación si es necesario
            break;
        default:
            console.log('Service Worker: Tipo de mensaje no reconocido:', type);
    }
});

// Función para programar notificaciones localmente
function scheduleNotification(data) {
    const { id, title, body, scheduledTime, options = {} } = data;
    
    const now = Date.now();
    const scheduledTimestamp = new Date(scheduledTime).getTime();
    const delay = scheduledTimestamp - now;
    
    if (delay > 0) {
        setTimeout(() => {
            self.registration.showNotification(title, {
                body,
                icon: '/icon-192.png',
                badge: '/badge-72.png',
                tag: id,
                data: { id, scheduledTime },
                actions: [
                    { action: 'open', title: '📱 Abrir App' },
                    { action: 'dismiss', title: '❌ Descartar' }
                ],
                requireInteraction: true,
                ...options
            });
        }, delay);
        
        console.log(`Service Worker: Notificación programada para ${delay}ms (${new Date(scheduledTime)})`);
    }
}

// Función para limpiar notificaciones viejas
function cleanOldNotifications() {
    self.registration.getNotifications()
        .then((notifications) => {
            const now = Date.now();
            notifications.forEach((notification) => {
                const data = notification.data || {};
                const scheduledTime = data.scheduledTime;
                
                // Cerrar notificaciones de más de 24 horas
                if (scheduledTime && (now - new Date(scheduledTime).getTime()) > 24 * 60 * 60 * 1000) {
                    notification.close();
                }
            });
        });
}

// Limpiar notificaciones viejas cada hora
setInterval(cleanOldNotifications, 60 * 60 * 1000);
