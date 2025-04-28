'use strict';
var cacheStorageKey = 'ListenTogetherv0-';

const CORE = ['/'];

function cacheFirst(request, key) {
    return caches.open(key).then((cache) => {
        return cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((response) => {
            return (
                response ||
                fetch(request).then((response) => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                })
            );
        });
    });
}

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(cacheStorageKey + 'Main').then(function (cache) {
            return cache.addAll(CORE);
        })
    );
    self.skipWaiting();
});

function parseURL(url) {
    let tmp = url.substr(url.indexOf("//") + 2);
    let host = tmp.substr(0, tmp.indexOf("/"));
    let tmp2 = tmp.substr(tmp.indexOf("/"));
    let qm = tmp2.indexOf("?");
    let path, queryParam;
    if (qm < 0) {
        path = tmp2;
        queryParam = undefined;
    } else {
        path = tmp2.substr(0, qm);
        queryParam = tmp2.substr(qm);
    }

    return {
        path,
        host,
        queryParam,
    };
}

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({type: 'window'}).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow("https://yzcm.work:11813/");
                // modify me
            }
            return null;
        })
    );
});
self.addEventListener('fetch', function (e) {
    const parsed = parseURL(e.request.url);
    if (!e.request.url.includes('?cache') && parsed.path!='/') return;
    e.respondWith(cacheFirst(e.request, cacheStorageKey + 'Main'));
    return;
});
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheNames) => {
                            return !cacheNames.startsWith(cacheStorageKey);
                        })
                        .map((cacheNames) => {
                            return caches.delete(cacheNames);
                        })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});