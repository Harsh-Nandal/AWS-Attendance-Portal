import FormData from 'form-data';
import fetch from 'node-fetch';
import connectDB from '../../lib/mongodb';
import Attendance from '../../models/Attendance';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, role, userId, imageData } = req.body;

  // const BOT_TOKEN = '8072882753:AAGXU1N6E3ZDGHb91oxCWUaBZSRHaSvIzSY'; // Move to .env for security
  // const CHAT_ID = '6693684914'; // Your Telegram ID or group/channel ID

  const BOT_TOKEN = '8430452006:AAEgmLpUCqPCLLUaK-WxWvyz5iMXPOAgef0';
  const CHAT_ID = 6251710308;

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
