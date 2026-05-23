self.addEventListener("push", (event) => {
  let payload = {
    title: "SmartTodo Reminder",
    message: "You have a new task notification.",
    url: "/index.html"
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
      url: payload.url || "/index.html"
    },
    badge: "",
    icon: ""
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/index.html";

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
