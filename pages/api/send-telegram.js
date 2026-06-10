import FormData from 'form-data';
import fetch from 'node-fetch';
import cron from 'node-cron';
import connectDB from '../../lib/mongodb';
import Attendance from '../../models/Attendance';
import Students from '../../models/User'; // Assuming you have a Students model

// const BOT_TOKEN = '8072882753:AAGXU1N6E3ZDGHb91oxCWUaBZSRHaSvIzSY'; // Move to .env for security
// const CHAT_ID = '6693684914'; // Your Telegram ID or group/channel ID

const BOT_TOKEN = "8430452006:AAEgmLpUCqPCLLUaK-WxWvyz5iMXPOAgef0";
const CHAT_ID = 6251710308;

// Flag to ensure cron jobs are scheduled only once
let isScheduled = false;

if (!isScheduled) {
  // Schedule daily report at 3:35 PM IST (10:05 AM UTC)
  cron.schedule('25 22 * * *', sendDailyReport);
  // Schedule daily report at 7:00 PM IST (1:30 PM UTC)
  cron.schedule('30 16 * * *', sendDailyReport);
  // Temporary: Uncomment to test immediately (remove after testing)
  // sendDailyReport();
  isScheduled = true;
}

async function sendDailyReport() {
  console.log('sendDailyReport called at', new Date().toISOString()); // Debug log
  try {
    await connectDB();
    const now = new Date();
    const date = now.toISOString().split('T')[0];

    // Get all students
    const allStudents = await Students.find({});
    console.log(`Found ${allStudents.length} students`); // Debug log
    // Get today's attendances
    const attendances = await Attendance.find({ date });
    console.log(`Found ${attendances.length} attendances for ${date}`); // Debug log
    const presentIds = attendances.map(a => a.userId);

    // Determine present and absent
    const present = allStudents.filter(s => presentIds.includes(s.userId));
    const absent = allStudents.filter(s => !presentIds.includes(s.userId));

    // Build the message
    let message = `📊 *Daily Attendance Report for ${date}*\n\n`;
    message += `✅ *Present Students (${present.length}):*\n`;
    present.forEach(s => {
      const att = attendances.find(a => a.userId === s.userId);
      message += `- ${s.name} (ID: ${s.userId}) - In: ${att.punchIn}, Out: ${att.punchOut || 'Not yet'}\n`;
    });
    message += `\n❌ *Absent Students (${absent.length}):*\n`;
    absent.forEach(s => {
      message += `- ${s.name} (ID: ${s.userId})\n`;
    });

    console.log('Sending message to Telegram:', message.substring(0, 100) + '...'); // Debug log (first 100 chars)

    // Send to Telegram
    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!telegramRes.ok) {
      const errorText = await telegramRes.text();
      console.error('Failed to send daily report to Telegram:', errorText);
    } else {
      console.log('Daily report sent successfully at', new Date().toISOString());
    }
  } catch (err) {
    console.error('Error sending daily report:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, role, userId, imageData } = req.body;

  try {
    await connectDB();

    const now = new Date();
    const date = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const currentTime = now.toLocaleTimeString('en-IN', { hour12: true });

    let status = '';

    // Find today's attendance record
    const attendance = await Attendance.findOne({ userId, date });

    if (!attendance) {
      // First punch of the day — Punch In
      await Attendance.create({
        userId,
        name,
        role,
        date,
        punchIn: currentTime,
      });
      status = '🔓 Punched In';
    } else if (!attendance.punchOut) {
      // Second punch — Punch Out
      attendance.punchOut = currentTime;
      await attendance.save();
      status = '🏁 Punched Out';
    } else {
      // Already punched out
      status = '✅ Already Punched Out';
    }

    // Decode image from base64
    const buffer = Buffer.from(imageData.split(',')[1], 'base64');

    // Send photo + details to Telegram
    const form = new FormData();
    form.append('chat_id', CHAT_ID);
    form.append(
      'caption',
      `🧑‍🎓 *Name:* ${name}\n📌 *Role:* ${role}\n🆔 *ID:* ${userId}\n🗓️ *Date:* ${date}\n⏰ *Time:* ${currentTime}\n📍 *Status:* ${status}`
    );
    form.append('photo', buffer, {
      filename: `${name}_photo.jpg`,
      contentType: 'image/jpeg',
    });

    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      body: form,
    });

    if (!telegramRes.ok) {
      const errorText = await telegramRes.text();
      console.error('Telegram Error:', errorText);
      throw new Error('Failed to send photo to Telegram');
    }

    // Respond back to frontend
    res.status(200).json({ success: true, status });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
