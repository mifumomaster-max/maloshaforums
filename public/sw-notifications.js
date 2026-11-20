var SHARE_CACHE_NAME = 'malosha-share-target-v1';
var SHARE_IMAGE_KEY = '/_malosha_shared_image';
var SHARE_META_KEY = '/_malosha_shared_meta';

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.pathname !== '/share-target') {
    return;
  }

  if (request.method === 'POST') {
    event.respondWith(
      (async function () {
        try {
          var formData = await request.formData();
          var files = formData.getAll('media');
          if (!files || !files.length) {
            var entries = Array.from(formData.values());
            files = entries.filter(function (v) {
              return v && typeof v === 'object' && 'size' in v && 'type' in v;
            });
          }

          var imageFile = null;
          for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f && typeof f === 'object' && 'size' in f && f.size > 0) {
              imageFile = f;
              break;
            }
          }

          var cache = await caches.open(SHARE_CACHE_NAME);
          await cache.delete(SHARE_IMAGE_KEY);
          await cache.delete(SHARE_META_KEY);

          if (imageFile) {
            var fileName = imageFile.name || 'picha-ya-simu.jpg';
            var fileType = imageFile.type || 'image/jpeg';
            var headers = new Headers({
              'Content-Type': fileType,
              'X-Malosha-Filename': encodeURIComponent(fileName),
            });
            var buf = await imageFile.arrayBuffer();
            await cache.put(SHARE_IMAGE_KEY, new Response(buf, { headers: headers }));
          }

          var title = String(formData.get('title') || '').slice(0, 140);
          var text = String(formData.get('text') || '').slice(0, 2000);
          var sharedUrl = String(formData.get('url') || '').slice(0, 500);
          await cache.put(
            SHARE_META_KEY,
            new Response(JSON.stringify({ title: title, text: text, url: sharedUrl }), {
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } catch (err) {
          // Proceed to Kijiweni even if payload read fails
        }

        return Response.redirect('/?tab=kijiweni&share_target=1', 303);
      })()
    );
    return;
  }

  if (request.method === 'GET') {
    event.respondWith(Response.redirect('/?tab=kijiweni&share_target=1', 303));
  }
});

self.addEventListener('message', function (event) {
  var payload = event && event.data;
  if (!payload || payload.type !== 'SET_BADGE') return;
  var count = Number(payload.count || 0);
  try {
    if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
      if (count > 0) {
        self.navigator.setAppBadge(count);
      } else if (typeof self.navigator.clearAppBadge === 'function') {
        self.navigator.clearAppBadge();
      }
    }
  } catch (err) {
    // Ignore unsupported badge calls in SW
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = (event.notification && event.notification.data) || {};
  var targetUrl = typeof data.url === 'string' && data.url ? data.url : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            if ('navigate' in client && targetUrl) {
              try {
                client.navigate(targetUrl);
              } catch (err) {
                // Ignore cross-navigation error
              }
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
