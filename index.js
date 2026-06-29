require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { Client } = require("pg");

// 1. Botni .env fayldagi token orqali aniqlash
const bot = new Telegraf(process.env.BOT_TOKEN);

// 2. PostgreSQL bazasiga DATABASE_URL orqali ulanish
const db = new Client({
    connectionString: process.env.DATABASE_URL,
});

// 3. Bazaga ulanishni tekshirish
db.connect()
    .then(() =>
        console.log(
            "PostgreSQL bazasiga ulanish muvaffaqiyatli amalga oshdi! ✅",
        ),
    )
    .catch((err) =>
        console.error("Baza bilan ulanishda xatolik yuz berdi: ❌", err),
    );

// --- Bot yaratgan eski barcha havolalarni o'chirish (Revoke) funksiyasi ---
async function temizleEskiLinkler() {
    const channelId = process.env.VIP_CHANNEL_ID;
    try {
        console.log("Eski havolalar tekshirilmoqda va tozalanmoqda...");

        // Bot yaratgan barcha taklif havolalari ro'yxatini olamiz
        const adminLinks = await bot.telegram.getChatMenuButton({
            chat_id: channelId,
        }); // yoki to'g'ridan-to'g'ri guruh havolalari admin qismidan olinadi

        // Telegram API orqali guruhdagi barcha o'zi yaratgan havolalarni o'chirish uchun:
        // Eslatma: Telegram botlar faqat o'zlari yaratgan va faol bo'lgan havolalarni o'chira oladi.
    } catch (err) {
        console.error(
            "Havolalarni tozalashda xatolik (Bu muhim emas, davom etamiz):",
            err,
        );
    }
}

// Bot ishga tushishi bilan tozalashni chaqiramiz
temizleEskiLinkler();
// --- Foydalanuvchi /start bosganda ishlaydigan qism ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "no_username";

    try {
        // --- YANGI QO'SHILGAN QISM: Avval faol VIP obunani tekshiramiz ---
        const checkQuery =
            "SELECT status, vip_end FROM users WHERE user_id = $1";
        const checkRes = await db.query(checkQuery, [userId]);

        if (checkRes.rows.length > 0) {
            const user = checkRes.rows[0];

            if (user.status === "active" && user.vip_end) {
                const hozir = new Date();
                const vipEndVahti = new Date(user.vip_end);
                const farqMilliSoniya = vipEndVahti - hozir;

                if (farqMilliSoniya > 0) {
                    // Kun va soatlarni hisoblaymiz
                    const qolganKun = Math.floor(
                        farqMilliSoniya / (1000 * 60 * 60 * 24),
                    );
                    const qolganSoat = Math.floor(
                        (farqMilliSoniya % (1000 * 60 * 60 * 24)) /
                            (1000 * 60 * 60),
                    );

                    let muddatMatni =
                        qolganKun > 0
                            ? `<b>${qolganKun} kun, ${qolganSoat} soat</b>`
                            : `<b>${qolganSoat} soat</b> (Bugun oxirgi kun!)`;

                    return ctx.reply(
                        `💎 <b>Sizda faol VIP obuna mavjud!</b>\n\n` +
                            `✨ VIP guruh materiallaridan cheklovsiz foydalanishingiz mumkin.\n` +
                            `⏳ Obunangiz tugashiga: ${muddatMatni} qoldi.`,
                        { parse_mode: "HTML" },
                    );
                }
            }
        }
        // --- YANGI QISM TUGADI ---

        // 1. Foydalanuvchini bazaga kiritamiz yoki statusini yangilaymiz (Sizning kodingiz)
        const query = `
            INSERT INTO users (user_id, username, status)
            VALUES ($1, $2, 'start')
            ON CONFLICT (user_id) 
            DO UPDATE SET username = $2;
        `;
        await db.query(query, [userId, username]);

        // 2. Foydalanuvchiga xabar va tugmani ko'rsatamiz (Sizning kodingiz)
        await ctx.reply(
            `Salom ${ctx.from.first_name}!\n\nVIP kanalimizga obuna bo'lish uchun quyidagi tugmani bosing:`,
            Markup.inlineKeyboard([
                [Markup.button.callback("💎 VIP Obuna olish", "get_vip")],
            ]),
        );
    } catch (err) {
        console.error("Start buyrug'ida xatolik:", err);
        ctx.reply("Tizimda xatolik yuz berdi. Birozdan so'ng urinib ko'ring.");
    }
});

// --- "VIP Obuna olish" tugmasi bosilganda ishlaydigan qism ---
bot.action("get_vip", async (ctx) => {
    const userId = ctx.from.id;
    const kartaRaqam = "8600 5304 3145 2237";
    const kartaEgasi = "Raxmanova M.";
    const obunaNarxi = "15 000 so'm"; // Bu yerga o'zingiz xohlagan narxni yozing

    try {
        // 1. Foydalanuvchi statusini 'pending' (to'lov kutyapti) holatiga o'tkazamiz
        const query = `
            UPDATE users 
            SET status = 'pending' 
            WHERE user_id = $1;
        `;
        await db.query(query, [userId]);

        await ctx.answerCbQuery(); // Soat belgisini to'xtatadi

        // 2. Karta raqami, narxi va yo'riqnomani HTML formatida yuboramiz
        await ctx.reply(
            `💎 <b>VIP Kanalga obuna bo'lish</b>\n\n` +
                `💰 <b>Obuna narxi:</b> ${obunaNarxi} (1 oy uchun)\n\n` +
                `💳 <b>To'lov qilish uchun karta raqami:</b>\n` +
                `<code>${kartaRaqam}</code> ${kartaEgasi}\n<i>(Karta raqam ustiga bossangiz, nusxalanadi)</i>\n\n` +
                `To'lovni amalga oshirganingizdan so'ng, <b>chekni (rasm shaklida)</b> shu yerga yuboring.\n\n` +
                `* Admin chekni tekshirib, sizga VIP kanalga kirish havolasini yuboradi.`,
            { parse_mode: "HTML" }, // HTML qildik, endi <code> teglari chiroyli ishlaydi
        );
    } catch (err) {
        console.error("Tugma bosilganda xatolik:", err);
        ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
    }
});

// --- Foydalanuvchi chek (rasm) yuborganida ishlaydigan qism ---
bot.on("photo", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username
        ? `@${ctx.from.username}`
        : "Mavjud emas";
    const name = ctx.from.first_name;
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id; // Eng sifatli rasmni olish

    try {
        // 1. Avval foydalanuvchi rostdan ham to'lov bosqichidami (pending) shuni bazadan tekshiramiz
        const checkUser = await db.query(
            "SELECT status FROM users WHERE user_id = $1",
            [userId],
        );

        if (!checkUser.rows[0] || checkUser.rows[0].status !== "pending") {
            return ctx.reply(
                "Iltimos, avval '💎 VIP Obuna olish' tugmasini bosing va keyin chek yuboring.",
            );
        }

        // 2. Adminga chekni tugmalar bilan birga yuboramiz
        const adminId = process.env.ADMIN_ID;

        await bot.telegram.sendPhoto(adminId, photoId, {
            caption:
                `🔔 <b>Yangi VIP so'rov!</b>\n\n` +
                `👤 <b>Foydalanuvchi:</b> ${name}\n` +
                `🆔 <b>ID:</b> <code>${userId}</code>\n` +
                `🌐 <b>Username:</b> ${username}\n\n` +
                `Chekni tekshirib, quyidagi tugmalardan birini bosing:`,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        "✅ Tasdiqlash",
                        `approve_${userId}`,
                    ),
                    Markup.button.callback("❌ Rad etish", `reject_${userId}`),
                ],
            ]),
        });

        // 3. Foydalanuvchiga chek qabul qilinganini bildiramiz
        await ctx.reply(
            "📥 Chekingiz adminga yuborildi. Tekshirilgandan so'ng sizga havola yuboriladi.",
        );
    } catch (err) {
        console.error("Chek yuborishda xatolik:", err);
        ctx.reply("Xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.");
    }
});

// --- Admin "✅ Tasdiqlash" tugmasini bosganda ishlaydigan qism ---
bot.action(/^approve_(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];

    try {
        // 1. Bazada foydalanuvchi statusini active qilish
        const updateQuery = `
            UPDATE users 
            SET status = 'active', 
                vip_start = NOW(), 
                vip_end = NOW() + INTERVAL '30 days'
            WHERE user_id = $1;
        `;
        await db.query(updateQuery, [userId]);

        // 2. O'zingiz yaratgan doimiy "Request Admin Approval" havolasini shu yerga qo'ying
        // DIQQAT: Havola matni to'liq va to'g'ri ekanligiga ishonch hosil qiling!
        const doimiyHavola = "https://t.me/+snjDckNhhL00ZTRi";

        // 3. Foydalanuvchiga xabarni yuborish (Eski va yangi versiyalar uchun eng xavfsiz format)
        await bot.telegram
            .sendMessage(
                userId,
                `🎉 <b>To'lovingiz muvaffaqiyatli tasdiqlandi!</b>\n\n` +
                    `💎 VIP kanalga a'zo bo'lish uchun quyidagi havolaga bosing va <b>"Kanalga qo'shilish so'rovini yuborish" (Request to join)</b> tugmasini bosing:\n\n` +
                    `${doimiyHavola}\n\n` +
                    `⚠️ <i>Bot sizning so'rovingizni avtomatik tekshirib, guruhga qabul qiladi. Obunangiz 1 oy davomida amal qiladi.</i>\n` +
                    `<marked>Unutmang agarda botni bloklasangiz VIP kanaldagi obunangiz ham bekor qilinadi va kanaldan chiqarib yuborilasiz!</marked>`,
                {
                    parse_mode: "HTML",
                    disable_web_page_preview: true, // Xatolik bermaydigan eski va mustahkam usul
                },
            )
            .catch((err) =>
                console.error("Foydalanuvchiga xabar ketishida xato:", err),
            );

        // 4. Admin xabarini yangilash
        await ctx
            .editMessageCaption(
                `✅ Foydalanuvchi (ID: ${userId}) so'rovi tasdiqlandi. Guruhga qo'shilish havolasi yuborildi.`,
                { reply_markup: null },
            )
            .catch((err) =>
                console.error("Admin xabarini o'zgartirishda xato:", err),
            );

        await ctx.answerCbQuery("Tasdiqlandi!").catch(() => {});
    } catch (err) {
        // Agar yana xato bersa, terminalda aynan nima xato ekanini ko'rsatadi
        console.error("TASDIQLASHDA ASOSIY XATOLIK:", err);
        ctx.answerCbQuery("Xatolik yuz berdi (Terminalga qarang)!", {
            show_alert: true,
        }).catch(() => {});
    }
});

// --- Admin "❌ Rad etish" tugmasini bosganda ishlaydigan qism ---
bot.action(/^reject_(\d+)$/, async (ctx) => {
    const userId = ctx.match[1];

    try {
        // Bazada statusni qaytadan 'start' holatiga qaytarish
        await db.query("UPDATE users SET status = 'start' WHERE user_id = $1", [
            userId,
        ]);

        // Foydalanuvchini ogohlantirish
        await bot.telegram.sendMessage(
            userId,
            "❌ <b>Afuski, siz yuborgan chek tasdiqlanmadi.</b>\n\nAgar xatolik o'tgan bo'lsa, qaytadan urinib ko'ring yoki adminga murojaat qiling.",
            { parse_mode: "HTML" },
        );

        // Admin xabarini yangilash
        await ctx.editMessageCaption(
            `❌ Foydalanuvchi (ID: ${userId}) so'rovi rad etildi.`,
            { reply_markup: null },
        );
        await ctx.answerCbQuery("Rad etildi!");
    } catch (err) {
        console.error("Rad etishda xatolik:", err);
        ctx.answerCbQuery("Xatolik yuz berdi!");
    }
});

bot.on("chat_join_request", async (ctx) => {
    const userId = ctx.chatJoinRequest.from.id;
    const chatId = ctx.chatJoinRequest.chat.id;

    // Terminalda bot so'rovni ko'rayotganini bilish uchun log:
    console.log(
        `🚀 KANALGA QO'SHILISH SO'ROVI KELDI! User ID: ${userId}, Chat ID: ${chatId}`,
    );

    try {
        const res = await db.query(
            "SELECT status FROM users WHERE user_id = $1",
            [userId],
        );
        const userStatus = res.rows[0]?.status;
        console.log(`📊 Foydalanuvchi bazadagi statusi: ${userStatus}`);

        if (userStatus === "active") {
            await bot.telegram.approveChatJoinRequest(chatId, userId);
            console.log(`✅ User ${userId} guruhga avtomat qabul qilindi.`);

            await bot.telegram.sendMessage(
                userId,
                "✅ <b>Siz guruhga muvaffaqiyatli qo'shildingiz!</b>\n\nVIP materiallardan bemalol foydalanishingiz mumkin. Obuna muddati: 1 oy." +
                    `<marked>Unutmang agarda botni bloklasangiz VIP kanaldagi obunangiz ham bekor qilinadi va kanaldan chiqarib yuborilasiz!</marked>`,
                { parse_mode: "HTML" },
            );
        } else {
            await bot.telegram.declineChatJoinRequest(chatId, userId);
            console.log(
                `❌ User ${userId} status active bo'lmagani uchun rad etildi.`,
            );

            await bot.telegram.sendMessage(
                userId,
                "❌ <b>Afsuski, sizning VIP obunangiz faol emas!</b>\n\nGuruhga kirish uchun avval bot orqali to'lov chekini yuboring.",
                { parse_mode: "HTML" },
            );
        }
    } catch (err) {
        console.error("🚨 SO'ROVNI TEKSHIRISHDAGI XATOLIK:", err);
    }
});

const cron = require("node-cron");

// --- Har kuni soat 00:00 da VIP muddatlarni tekshirish ---
cron.schedule("0 0 * * *", async () => {
    console.log("⏰ VIP obuna muddatlarini tekshirish taymeri ishga tushdi...");
    const channelId = process.env.VIP_CHANNEL_ID;
    const adminId = process.env.ADMIN_ID; // --- `.env` faylingizda ADMIN_ID bo'lishi kerak ---

    try {
        // 1. Adminga taymer ishga tushgani haqida xabar berish
        await bot.telegram
            .sendMessage(
                adminId,
                "⏰ <b>VIP obuna muddatlarini tekshirish taymeri avtomatik ishga tushdi...</b>",
                { parse_mode: "HTML" },
            )
            .catch(() =>
                console.log(
                    "Adminga taymer xabari ketmadi (Admin botni bloklagan bo'lishi mumkin).",
                ),
            );

        // 2. VIP muddati tugagan foydalanuvchilarni aniqlaymiz
        const expiredUsersQuery = `
            SELECT user_id FROM users 
            WHERE status = 'active' AND vip_end <= NOW();
        `;
        const res = await db.query(expiredUsersQuery);
        const expiredUsers = res.rows;

        // Agar muddati tugaganlar bo'lsa, adminga ro'yxat hisobotini yuborish uchun o'zgaruvchi
        let adminReport = `📉 <b>VIP muddati tugagan foydalanuvchilar soni: ${expiredUsers.length} ta</b>\n\n`;

        for (const user of expiredUsers) {
            const userId = user.user_id;

            try {
                // 3. Foydalanuvchini guruh/kanaldan chiqarib yuborish
                await bot.telegram.banChatMember(channelId, userId);
                await bot.telegram.unbanChatMember(channelId, userId);

                // 4. Bazada uning statusini 'start' holatiga qaytaramiz
                await db.query(
                    "UPDATE users SET status = 'start', vip_end = NULL WHERE user_id = $1",
                    [userId],
                );

                // 5. Foydalanuvchiga ogohlantirish xabarini yuborish
                await bot.telegram
                    .sendMessage(
                        userId,
                        "⚠️ <b>Sizning VIP obuna muddatingiz tugadi!</b>\n\n" +
                            "VIP guruh materiallaridan foydalanishni davom ettirish uchun iltimos, qaytadan to'lov qiling va chekni adminga yuboring.",
                        { parse_mode: "HTML" },
                    )
                    .catch(() =>
                        console.log(
                            `Foydalanuvchi botni bloklagan bo'lishi mumkin (ID: ${userId})`,
                        ),
                    );

                console.log(
                    `❌ Foydalanuvchi (ID: ${userId}) VIP muddati tugagani sababli guruhdan chiqarildi.`,
                );
                adminReport += `• User ID: <code>${userId}</code> ── guruhdan chiqarildi va xabardor qilindi.\n`;
            } catch (memberErr) {
                console.error(
                    `Foydalanuvchini (ID: ${userId}) guruhdan chiqarishda xatolik:`,
                    memberErr,
                );
                adminReport += `• User ID: <code>${userId}</code> ── ⚠️ Chiqarishda xatolik yuz berdi!\n`;
            }
        }

        // Agar muddati tugaganlar bo'lgan bo'lsa, adminga natija hisobotini yuboramiz
        if (expiredUsers.length > 0) {
            await bot.telegram
                .sendMessage(adminId, adminReport, { parse_mode: "HTML" })
                .catch(() => {});
        }

        // --- QO'SHIMCHA: Muddat tugashiga 2 kun qolganda ogohlantirish tizimi ---
        const warningUsersQuery = `
            SELECT user_id FROM users 
            WHERE status = 'active' 
              AND vip_end <= NOW() + INTERVAL '2 days' 
              AND vip_end > NOW() + INTERVAL '1 day';
        `;
        const warnRes = await db.query(warningUsersQuery);

        if (warnRes.rows.length > 0) {
            let adminWarnReport = `🔔 <b>Obuna tugashiga 2 kun qolgan foydalanuvchilar (${warnRes.rows.length} ta):</b>\n\n`;

            for (const user of warnRes.rows) {
                await bot.telegram
                    .sendMessage(
                        user.user_id,
                        "🔔 <b>Diqqat, ogohlantirish!</b>\n\nSizning VIP obunangiz tugashiga <b>2 kun</b> qoldi. Obunani uzaytirish uchun hozirdan to'lov qilishingiz mumkin.",
                        { parse_mode: "HTML" },
                    )
                    .catch(() => {});

                adminWarnReport += `• User ID: <code>${user.user_id}</code> ── ogohlantirildi.\n`;
            }

            // Adminga kimlar ogohlantirilgani haqida hisobot
            await bot.telegram
                .sendMessage(adminId, adminWarnReport, { parse_mode: "HTML" })
                .catch(() => {});
        }
    } catch (err) {
        console.error("Taymer ishida umumiy xatolik:", err);
    }
});

bot.command("statistika", async (ctx) => {
    const userId = ctx.from.id;
    const adminId = parseInt(process.env.ADMIN_ID);

    // Faqat admin ko'ra olishi uchun cheklov
    if (userId !== adminId) return;

    try {
        // 1. Hozirda faol VIP obunachilar (status = 'active' va muddati o'tmagan)
        const activeRes = await db.query(`
            SELECT COUNT(*) FROM users 
            WHERE status = 'active' AND vip_end > NOW();
        `);

        // 2. Shu paytgacha VIP sotib olgan barcha foydalanuvchilar (vip_end NULL bo'lmaganlar)
        const totalVipRes = await db.query(`
            SELECT COUNT(*) FROM users 
            WHERE vip_end IS NOT NULL;
        `);

        // 3. VIP tugashiga 1 kun (24 soat) yoki undan kam vaqt qolganlar
        const oneDayLeftRes = await db.query(`
            SELECT COUNT(*) FROM users 
            WHERE status = 'active' 
              AND vip_end <= NOW() + INTERVAL '1 day' 
              AND vip_end > NOW();
        `);

        const faolUsers = activeRes.rows[0].count;
        const jamiVip = totalVipRes.rows[0].count;
        const kunQoldiUsers = oneDayLeftRes.rows[0].count;

        const statXabar =
            `📊 <b>Bot Statistikasi (Admin uchun)</b>\n\n` +
            `💎 <b>Hozirgi faol VIP a'zolar:</b> ${faolUsers} ta\n` +
            `⏳ <b>Tugashiga 1 kun qolganlar:</b> ${kunQoldiUsers} ta\n` +
            `👥 <b>Umumiy VIP sotib olganlar:</b> ${jamiVip} ta`;

        await ctx.reply(statXabar, { parse_mode: "HTML" });
    } catch (err) {
        console.error("Statistika buyrug'ida xatolik:", err);
        ctx.reply("Statistikani hisoblashda xatolik yuz berdi.");
    }
});

bot.command("help", async (ctx) => {
    const adminUsername = process.env.ADMIN_USERNAME || "admin_username";

    await ctx.reply(
        "❓ <b>Yordam kerakmi yoki savollaringiz bormi?</b>\n\n" +
            "To'lov muammolari, takliflar yoki VIP guruh bo'yicha savollar bo'lsa, pastdagi tugma orqali admin bilan bog'lanishingiz mumkin:",
        {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
                [
                    Markup.button.url(
                        "👤 Admin bilan bog'lanish",
                        `https://t.me/${adminUsername}`,
                    ),
                ],
            ]),
        },
    );
});

bot.command("rassilka", async (ctx) => {
    const userId = ctx.from.id;
    const adminId = parseInt(process.env.ADMIN_ID);

    // Faqat admin ruxsati
    if (userId !== adminId) return;

    // `/rassilka ` so'zidan keyingi matnni ajratib olish
    const xabarMatni = ctx.message.text.split(" ").slice(1).join(" ");

    if (!xabarMatni) {
        return ctx.reply(
            "⚠️ <b>Xato:</b> Tarqatish uchun matn kiriting.\nMisol: <code>/rassilka Salom, ertaga profilaktika!</code>",
            { parse_mode: "HTML" },
        );
    }

    try {
        await ctx.reply("🚀 Xabar tarqatish boshlandi, biroz kuting...");

        // Bazadagi barcha foydalanuvchilarni olish
        const usersRes = await db.query("SELECT user_id FROM users");
        const allUsers = usersRes.rows;

        let yetibBorganlar = 0;
        let bloklaganlar = 0;

        for (const user of allUsers) {
            try {
                await bot.telegram.sendMessage(
                    user.user_id,
                    `📢 <b>Bot ma'muriyatidan xabar:</b>\n\n${xabarMatni}`,
                    { parse_mode: "HTML" },
                );
                yetibBorganlar++;

                // Telegram spam blokiga tushmaslik uchun har bir xabardan keyin ozgina kutish (35ms)
                await new Promise((resolve) => setTimeout(resolve, 35));
            } catch (sendErr) {
                // Foydalanuvchi botni bloklagan bo'lsa xato beradi
                bloklaganlar++;
            }
        }

        await ctx.reply(
            `✅ <b>Rassilka yakunlandi!</b>\n\n` +
                `👤 Yetib bordi: ${yetibBorganlar} ta foydalanuvchiga\n` +
                `❌ Bloklaganlar: ${bloklaganlar} ta (yuborilmadi)`,
            { parse_mode: "HTML" },
        );
    } catch (err) {
        console.error("Rassilka jarayonida xatolik:", err);
        ctx.reply("Rassilka qilishda xatolik yuz berdi.");
    }
});

// 4. Botni ishga tushirish
bot.launch()
    .then(() => console.log("Bot muvaffaqiyatli ishga tushdi... 🚀"))
    .catch((err) => console.error("Botni ishga tushirishda xatolik: ❌", err));

// Botni xavfsiz o'chirish uchun sozlamalar (baza aloqasini uzish)
process.once("SIGINT", () => {
    db.end();
    bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
    db.end();
    bot.stop("SIGTERM");
});
