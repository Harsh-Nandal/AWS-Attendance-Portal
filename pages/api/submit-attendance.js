// pages/api/submit-attendance.js
import connectDB from '../../lib/mongodb';
import Attendance from '../../models/Attendance';
import User from '../../models/User';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = 'Asia/Kolkata';
const MIN_INTERVAL = Number(process.env.MIN_PUNCH_INTERVAL_SECONDS) || 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    // Parse body safely
    let body = req.body;
    if (!body || typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch (e) {
        body = {};
      }
    }

    const { userId } = body || {};
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'Missing or invalid userId' });
    }

    // verify user exists
    const user = await User.findOne({ userId: String(userId) }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // IST-aware now and today's date
    const nowIst = dayjs().tz(APP_TZ);
    const today = nowIst.format('YYYY-MM-DD');
    const nowStr = nowIst.format('HH:mm:ss');
    const recordedAtDate = nowIst.toDate();
    const recordedAtIso = nowIst.format(); // optional, human-readable ISO with offset

    // Load today's record
    let record = await Attendance.findOne({ userId: String(userId), date: today });

    // Case 1: no record -> create punchIn
    if (!record) {
      const newRecord = new Attendance({
        userId: String(userId),
        name: user.name || '',
        role: user.role || '',
        date: today,
        punchIn: nowStr,
        recordedAt: recordedAtDate,
        recordedAtIso,
      });
      await newRecord.save();

      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: newRecord.punchIn,
        recordedAt: newRecord.recordedAt,
        recordedAtIso: newRecord.recordedAtIso,
      });
    }

    // Case 2: record exists and only punchIn exists (no punchOut yet)
    if (record && record.punchIn && !record.punchOut) {
      // compute seconds diff between now and stored punchIn (assume punchIn is in HH:mm:ss for that date)
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      const diffSec = nowIst.diff(punchInMoment, 'second');

      // If too soon, treat as duplicate/ignored
      if (diffSec < MIN_INTERVAL) {
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          secondsSincePunchIn: diffSec,
        });
      }

      // Atomic update: set punchOut only if it's still absent or null
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] },
        { $set: { punchOut: nowStr, recordedAt: recordedAtDate, recordedAtIso } },
        { new: true }
      ).lean();

      if (updated && updated.punchOut) {
        return res.status(200).json({
          message: 'Punched Out Successfully',
          status: 'Punched Out',
          punchIn: updated.punchIn,
          punchOut: updated.punchOut,
          recordedAt: updated.recordedAt,
          recordedAtIso: updated.recordedAtIso,
        });
      }

      // If update didn't apply due to race, re-fetch and return current state
      const latest = await Attendance.findById(record._id).lean();
      if (latest && latest.punchOut) {
        return res.status(200).json({
          message: 'Punched Out (by another request)',
          status: 'Punched Out',
          punchIn: latest.punchIn,
          punchOut: latest.punchOut,
          recordedAt: latest.recordedAt,
          recordedAtIso: latest.recordedAtIso,
        });
      }

      // unexpected fallback
      return res.status(500).json({ message: 'Could not set punchOut - try again' });
    }

    // Case 3: already punched out
    if (record && record.punchIn && record.punchOut) {
      return res.status(200).json({
        message: 'Already Punched Out',
        status: 'Punched Out',
        punchIn: record.punchIn,
        punchOut: record.punchOut,
        recordedAt: record.recordedAt,
        recordedAtIso: record.recordedAtIso,
      });
    }

    // Fallback
    return res.status(400).json({ message: 'Invalid attendance state' });
  } catch (err) {
    console.error('[Submit Attendance API Error]', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
