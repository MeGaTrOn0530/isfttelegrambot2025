import { Telegraf } from "telegraf"
import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

// Environment o'zgaruvchilarini yuklash
dotenv.config()

// Joriy papkani aniqlash
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Telegram bot tokenini tekshirish
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN topilmadi! .env faylini tekshiring.")
  process.exit(1)
}

// Telegram botni ishga tushirish
const bot = new Telegraf(TELEGRAM_BOT_TOKEN)

// Express serverini yaratish
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())
app.use(
  cors({
    origin: "*", // Barcha so'rovlarga ruxsat berish (ishlab chiqarish muhitida o'zgartiring)
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Student-Id", "X-Student-Name"],
    credentials: true,
  }),
)

// Ma'lumotlar uchun papka yaratish
const DATA_DIR = path.join(__dirname, "data")
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
    console.log("Data papkasi yaratildi/tekshirildi")
  } catch (error) {
    console.error("Data papkasini yaratishda xatolik:", error)
  }
}

// Foydalanuvchi chat ID larini saqlash uchun Map
const userChatIds = new Map()

// Tasdiqlash kodlarini saqlash uchun Map
const verificationCodes = new Map()

// Chat ID larini fayldan yuklash
async function loadChatIds() {
  try {
    const filePath = path.join(DATA_DIR, "chat_ids.json")
    const data = await fs.readFile(filePath, "utf8")
    const chatIds = JSON.parse(data)

    // Har bir chat ID ni Map ga qo'shish
    for (const [username, chatId] of Object.entries(chatIds)) {
      userChatIds.set(username.toLowerCase(), chatId)
    }

    console.log(`${Object.keys(chatIds).length} ta chat ID yuklandi`)
  } catch (error) {
    // Fayl mavjud bo'lmasligi mumkin, bu xato emas
    console.log("Saqlangan chat ID lar topilmadi")
  }
}

// Chat ID ni faylga saqlash
async function saveChatId(username, chatId) {
  try {
    const filePath = path.join(DATA_DIR, "chat_ids.json")

    // Mavjud chat ID larni o'qish
    let chatIds = {}
    try {
      const data = await fs.readFile(filePath, "utf8")
      chatIds = JSON.parse(data)
    } catch (error) {
      // Fayl mavjud bo'lmasligi mumkin, bu xato emas
    }

    // Yangi chat ID ni qo'shish yoki yangilash
    chatIds[username.toLowerCase()] = chatId

    // Faylga saqlash
    await fs.writeFile(filePath, JSON.stringify(chatIds, null, 2), "utf8")

    console.log(`@${username} uchun chat ID saqlandi: ${chatId}`)
  } catch (error) {
    console.error("Chat ID ni saqlashda xatolik:", error)
  }
}

// Bot start buyrug'i
bot.start(async (ctx) => {
  const username = ctx.from.username
  const chatId = ctx.chat.id

  if (username) {
    // Foydalanuvchi chat ID sini saqlash
    userChatIds.set(username.toLowerCase(), chatId)

    // Faylga saqlash
    await saveChatId(username, chatId)

    await ctx.reply(
      `Salom, ${ctx.from.first_name}! Men tasdiqlash kodlarini yuborish uchun botman. Ro'yxatdan o'tish jarayonida sizga kod yuboriladi.`,
    )
  } else {
    await ctx.reply("Salom! Iltimos, Telegram profilingizda username o'rnating, aks holda tizim sizni aniqlay olmaydi.")
  }
})

// Bot help buyrug'i
bot.help((ctx) => {
  return ctx.reply("Men tasdiqlash kodlarini yuborish uchun botman. Ro'yxatdan o'tish jarayonida sizga kod yuboriladi.")
})

// Tasdiqlash kodini yuborish uchun API endpoint
app.post("/api/auth/send-verification-code", async (req, res) => {
  try {
    console.log("So'rov qabul qilindi:", req.body)
    console.log("So'rov headers:", req.headers)

    const { telegram } = req.body

    if (!telegram) {
      console.log("Telegram username kiritilmagan")
      return res.status(400).json({
        success: false,
        error: "Telegram username kiritilmagan",
      })
    }

    console.log(`${telegram} uchun tasdiqlash kodi yuborish so'rovi qabul qilindi`)

    // 6 xonali tasodifiy kod yaratish
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    console.log(`Yaratilgan kod: ${code}`)

    // Kodni saqlash (10 daqiqa muddatga)
    verificationCodes.set(telegram.toLowerCase(), {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 daqiqa
    })

    // Foydalanuvchi chat ID sini olish
    const chatId = userChatIds.get(telegram.toLowerCase())

    if (!chatId) {
      console.log(`${telegram} uchun chat ID topilmadi`)
      return res.status(400).json({
        success: false,
        error: "Telegram username topilmadi. Iltimos, avval botga /start buyrug'ini yuboring",
      })
    }

    console.log(`${telegram} uchun chat ID topildi: ${chatId}`)
    console.log(`Tasdiqlash kodi yuborilmoqda: ${code}`)

    // Kod yuborish
    try {
      await bot.telegram.sendMessage(
        chatId,
        `Sizning tasdiqlash kodingiz: ${code}\n\nBu kod 10 daqiqa davomida amal qiladi.`,
      )

      console.log(`${telegram} ga tasdiqlash kodi muvaffaqiyatli yuborildi`)
      return res.json({ success: true })
    } catch (error) {
      console.error("Telegram xabarini yuborishda xatolik:", error)
      return res.status(500).json({
        success: false,
        error: "Telegram xabarini yuborishda xatolik yuz berdi: " + error.message,
      })
    }
  } catch (error) {
    console.error("Tasdiqlash kodini yuborishda xatolik:", error)
    return res.status(500).json({
      success: false,
      error: "Tasdiqlash kodini yuborishda xatolik yuz berdi: " + error.message,
    })
  }
})

// Tasdiqlash kodini tekshirish uchun API endpoint
app.post("/api/auth/verify-code", (req, res) => {
  try {
    const { telegram, code } = req.body

    if (!telegram || !code) {
      return res.status(400).json({
        success: false,
        error: "Telegram username va kod kiritilishi shart",
      })
    }

    console.log(`${telegram} uchun kod tekshirilmoqda: ${code}`)

    // Saqlangan tasdiqlash ma'lumotlarini olish
    const verificationData = verificationCodes.get(telegram.toLowerCase())

    if (!verificationData) {
      console.log(`${telegram} uchun tasdiqlash kodi topilmadi`)
      return res.status(400).json({
        success: false,
        error: "Bu foydalanuvchi uchun tasdiqlash kodi topilmadi",
      })
    }

    // Kod muddati o'tganligini tekshirish
    if (Date.now() > verificationData.expiresAt) {
      console.log(`${telegram} uchun tasdiqlash kodi muddati o'tgan`)
      verificationCodes.delete(telegram.toLowerCase())
      return res.status(400).json({
        success: false,
        error: "Tasdiqlash kodi muddati o'tgan",
      })
    }

    // Kod to'g'riligini tekshirish
    if (verificationData.code !== code) {
      console.log(`${telegram} uchun noto'g'ri kod. Kutilgan: ${verificationData.code}, Kiritilgan: ${code}`)
      return res.status(400).json({
        success: false,
        error: "Noto'g'ri tasdiqlash kodi",
      })
    }

    console.log(`${telegram} uchun tasdiqlash muvaffaqiyatli`)

    // Kod to'g'ri, uni o'chirish
    verificationCodes.delete(telegram.toLowerCase())

    return res.json({ success: true })
  } catch (error) {
    console.error("Kodni tekshirishda xatolik:", error)
    return res.status(500).json({
      success: false,
      error: "Kodni tekshirishda xatolik yuz berdi",
    })
  }
})

// Foydalanuvchini ro'yxatdan o'tkazish uchun API endpoint
app.post("/api/register", async (req, res) => {
  try {
    const userData = req.body

    // Majburiy maydonlarni tekshirish
    const requiredFields = ["fullName", "studentId", "email", "phone", "telegram", "login", "password"]

    for (const field of requiredFields) {
      if (!userData[field]) {
        return res.status(400).json({
          success: false,
          error: `${field} maydoni to'ldirilishi shart`,
        })
      }
    }

    // Haqiqiy dasturda, bu ma'lumotlarni asosiy backend API ga yuborishingiz kerak
    // Bu misol uchun, faqat muvaffaqiyat qaytaramiz

    // Foydalanuvchiga Telegram orqali xabar yuborish
    const chatId = userChatIds.get(userData.telegram.replace("@", "").toLowerCase())
    if (chatId) {
      await bot.telegram.sendMessage(
        chatId,
        `Tabriklaymiz, ${userData.fullName}! Siz muvaffaqiyatli ro'yxatdan o'tdingiz.\n\nLogin: ${userData.login}`,
      )
    }

    return res.json({ success: true, userId: Date.now() })
  } catch (error) {
    console.error("Foydalanuvchini ro'yxatdan o'tkazishda xatolik:", error)
    return res.status(500).json({
      success: false,
      error: "Foydalanuvchini ro'yxatdan o'tkazishda xatolik yuz berdi",
    })
  }
})

// Server va botni ishga tushirish
async function startServer() {
  try {
    // Data papkasini yaratish
    await ensureDataDir()

    // Saqlangan chat ID larni yuklash
    await loadChatIds()

    // Express serverini ishga tushirish
    app.listen(PORT, () => {
      console.log(`Bot API serveri ${PORT} portda ishlamoqda`)
    })

    // Telegram botni ishga tushirish
    await bot.launch()
    console.log("Telegram bot muvaffaqiyatli ishga tushirildi")

    // Xavfsiz to'xtatish
    process.once("SIGINT", () => {
      console.log("Bot va server to'xtatilmoqda...")
      bot.stop("SIGINT")
    })
    process.once("SIGTERM", () => {
      console.log("Bot va server to'xtatilmoqda...")
      bot.stop("SIGTERM")
    })

    console.log("Bot serveri ishga tushirildi. To'xtatish uchun Ctrl+C bosing.")
  } catch (error) {
    console.error("Serverni ishga tushirishda xatolik:", error)
  }
}

// Serverni ishga tushirish
startServer()
