const http = require("http");

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_PATH = "/telegram-webhook-gd206-setup-7f3c91";
let adminChatId = process.env.TELEGRAM_CHAT_ID || null;

function telegram(method, body) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }).then(async r => {
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.description || "Telegram API error");
    return data.result;
  });
}

function reply(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "https://gd206-landing.onrender.com",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return reply(res, 204, {});
  if (req.method === "GET" && req.url === "/health") return reply(res, 200, { ok: true, service: "gd206-orders" });

  if (req.method === "POST" && req.url === WEBHOOK_PATH) {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", async () => {
      try {
        const update = JSON.parse(raw || "{}");
        const msg = update.message;
        if (msg?.chat?.id && msg?.text?.startsWith("/start")) {
          adminChatId = String(msg.chat.id);
          await telegram("sendMessage", {
            chat_id: adminChatId,
            text: "Бот GD-206 підключено. Сюди надходитимуть нові замовлення з сайту."
          });
          console.log("Admin chat connected");
        }
        reply(res, 200, { ok: true });
      } catch (e) {
        console.error("Webhook error:", e.message);
        reply(res, 200, { ok: true });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/orders") {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", async () => {
      try {
        if (!TOKEN) return reply(res, 503, { ok: false, error: "Telegram is not configured" });
        if (!adminChatId) return reply(res, 409, { ok: false, error: "Open the Telegram bot and send /start first" });
        const order = JSON.parse(raw || "{}");
        const required = ["name", "phone", "city", "branch"];
        if (required.some(k => !String(order[k] || "").trim())) return reply(res, 400, { ok: false, error: "Заповніть усі обов’язкові поля" });
        const text = [
          "🛒 НОВЕ ЗАМОВЛЕННЯ GD-206",
          "Товар: GDTIMES GD-206",
          "Ціна: 999 грн",
          "",
          "Ім’я: " + order.name,
          "Телефон: " + order.phone,
          "Місто: " + order.city,
          "Нова пошта: " + order.branch,
          "Коментар: " + (order.comment || "—")
        ].join("\n");
        await telegram("sendMessage", { chat_id: adminChatId, text });
        reply(res, 200, { ok: true });
      } catch (e) {
        console.error("Order error:", e.message);
        reply(res, 502, { ok: false, error: "Не вдалося надіслати замовлення. Спробуйте ще раз або зв’яжіться з продавцем." });
      }
    });
    return;
  }
  reply(res, 404, { ok: false });
});

server.listen(PORT, async () => {
  console.log("GD206 orders API listening on", PORT);
  if (!TOKEN) return console.error("Missing TELEGRAM_BOT_TOKEN");
  const base = process.env.RENDER_EXTERNAL_URL;
  if (base) {
    try {
      await telegram("setWebhook", { url: base + WEBHOOK_PATH, allowed_updates: ["message"] });
      console.log("Telegram webhook configured");
    } catch (e) {
      console.error("Webhook setup failed:", e.message);
    }
  }
});
