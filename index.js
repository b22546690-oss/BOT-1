const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const User = require('../models/User');
const Withdraw = require('../models/Withdraw');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Configuration
const CHANNELS = ['@BDGmailEarning', '@cashbd9', '@OfficialEarning96986'];
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const REF_BONUS = 2; // Points per referral
const DAILY_BONUS_AMT = 5;

// DB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// --- Middlewares ---
const checkJoin = async (ctx, next) => {
  const userId = ctx.from.id;
  try {
    for (const channel of CHANNELS) {
      const member = await ctx.telegram.getChatMember(channel, userId);
      if (['left', 'kicked'].includes(member.status)) {
        return ctx.reply(`❌ You must join our channels to use this bot!`, Markup.inlineKeyboard([
          ...CHANNELS.map(c => [Markup.button.url(`Join ${c}`, `https://t.me/${c.replace('@', '')}`)]),
          [Markup.button.callback('✅ Check Join', 'check_join')]
        ]));
      }
    }
    return next();
  } catch (e) {
    return next(); // If error (e.g. bot not admin in channel), skip check
  }
};

// --- Menus ---
const mainMenu = (ctx) => {
  return ctx.reply("🏠 Main Menu", Markup.keyboard([
    ['💰 Balance', '🎁 Daily Bonus'],
    ['👥 Refer', '💸 Withdraw'],
    ['📞 Support']
  ]).resize());
};

// --- Bot Commands ---
bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  const refId = ctx.payload; // For links like t.me/bot?start=123
  
  let user = await User.findOne({ tgId });

  if (!user) {
    user = new User({ tgId, username: ctx.from.username });
    
    // Referral Logic
    if (refId && parseInt(refId) !== tgId) {
      const referrer = await User.findOne({ tgId: parseInt(refId) });
      if (referrer) {
        user.referredBy = referrer.tgId;
        referrer.balance += REF_BONUS;
        referrer.referralCount += 1;
        await referrer.save();
        ctx.telegram.sendMessage(referrer.tgId, `🎁 You received ${REF_BONUS} for a new referral!`);
      }
    }
    await user.save();
  }
  return mainMenu(ctx);
});

bot.hears('💰 Balance', checkJoin, async (ctx) => {
  const user = await User.findOne({ tgId: ctx.from.id });
  ctx.reply(`👤 User: ${ctx.from.first_name}\n💰 Balance: ${user.balance.toFixed(2)} Points\n👥 Referrals: ${user.referralCount}`);
});

bot.hears('🎁 Daily Bonus', checkJoin, async (ctx) => {
  const user = await User.findOne({ tgId: ctx.from.id });
  const now = new Date();
  
  if (user.lastBonus && (now - user.lastBonus) < 24 * 60 * 60 * 1000) {
    const remaining = 24 - (now - user.lastBonus) / (1000 * 60 * 60);
    return ctx.reply(`❌ You already claimed today. Come back in ${remaining.toFixed(1)} hours.`);
  }

  user.balance += DAILY_BONUS_AMT;
  user.lastBonus = now;
  await user.save();
  ctx.reply(`✅ You received ${DAILY_BONUS_AMT} Daily Bonus!`);
});

bot.hears('👥 Refer', checkJoin, async (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  ctx.reply(`👥 Referral System\n\n🔗 Your Link: ${link}\n\n💰 Per Referral: ${REF_BONUS} Points`);
});

bot.hears('📞 Support', async (ctx) => {
  ctx.reply("📞 Support Channels:", Markup.inlineKeyboard([
    [Markup.button.url('Channel 1', 'https://t.me/BDGmailEarning')],
    [Markup.button.url('Channel 2', 'https://t.me/cashbd9')],
    [Markup.button.url('Channel 3', 'https://t.me/OfficialEarning96986')]
  ]));
});

// --- Withdraw System ---
bot.hears('💸 Withdraw', checkJoin, async (ctx) => {
  const user = await User.findOne({ tgId: ctx.from.id });
  if (user.balance < 10) return ctx.reply("❌ Minimum withdraw is 10 Points.");
  
  ctx.reply("Send your Payment Method and Address (e.g., Bkash: 017xx...):");
  // Simple listener for next message (State management not used for brevity)
  bot.on('text', async (ctx, next) => {
      if (ctx.message.text.includes(':')) {
          const newRequest = new Withdraw({
              tgId: ctx.from.id,
              amount: user.balance,
              method: ctx.message.text
          });
          await newRequest.save();
          user.balance = 0;
          await user.save();
          ctx.reply("✅ Withdrawal request sent to Admin!");
          
          // Notify Admin
          bot.telegram.sendMessage(ADMIN_ID, `🔔 New Withdraw Request!\nID: ${ctx.from.id}\nInfo: ${ctx.message.text}\n\nApprove: /approve_${newRequest._id}\nReject: /reject_${newRequest._id}`);
      } else {
          return next();
      }
  });
});

// --- Admin Logic ---
bot.command('admin', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply("Welcome Admin. Usage:\n/add [id] [amt]\n/remove [id] [amt]");
});

bot.action('check_join', async (ctx) => {
    await ctx.answerCbQuery("Checking...");
    return mainMenu(ctx);
});

bot.on('text', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    const msg = ctx.message.text;

    if (msg.startsWith('/approve_')) {
        const id = msg.split('_')[1];
        const req = await Withdraw.findById(id);
        if (req) {
            req.status = 'Approved';
            await req.save();
            ctx.reply("Approved!");
            bot.telegram.sendMessage(req.tgId, "✅ Your withdrawal has been approved!");
        }
    }
    
    if (msg.startsWith('/add ')) {
        const [_, id, amt] = msg.split(' ');
        await User.findOneAndUpdate({ tgId: id }, { $inc: { balance: parseFloat(amt) } });
        ctx.reply("Balance Added.");
    }
});

// --- Vercel Webhook Handler ---
export default async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Bot is running');
    }
  } catch (e) {
    console.error(e);
    res.status(500).send('Error');
  }
};
