self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "SmartTodo Reminder",
    message: "You have a new task notification.",
    url: "/"
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      payload.message = event.data.text();
    }
  }

  const options = {
    body: payload.message,
    data: {
      url: payload.url || "/"
    },
    badge: "",
    icon: ""
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
