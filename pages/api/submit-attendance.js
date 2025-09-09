// pages/api/submit-attendance.js
import connectDB from '../../lib/mongodb';
import Attendance from '../../models/Attendance';
import User from '../../models/User';
import dayjs from 'dayjs';

/**
 * POST body: { userId: "..." }
 *
 * Behavior:
 * - If no attendance record for today -> create with punchIn = now
 * - If record exists and has punchIn but no punchOut:
 *    - If time since punchIn < MIN_INTERVAL_SECONDS -> treat as duplicate (do not set punchOut)
 *    - Else set punchOut = now (atomic attempt, handles race)
 * - If record exists and has both punchIn and punchOut -> return Already Punched Out
 *
 * Config:
 * - MIN_PUNCH_INTERVAL_SECONDS (env) default 60
 */

const MIN_INTERVAL = Number(process.env.MIN_PUNCH_INTERVAL_SECONDS) || 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'Missing or invalid userId' });
    }

    // verify user exists (optional but helpful)
    const user = await User.findOne({ userId: String(userId) }).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const today = dayjs().format('YYYY-MM-DD');
    const now = dayjs();
    const nowStr = now.format('HH:mm:ss');

    // Load today's record
    let record = await Attendance.findOne({ userId: String(userId), date: today });

    // Case 1: no record -> create punchIn
    if (!record) {
      const punchInStr = nowStr;
      const newRecord = new Attendance({
        userId: String(userId),
        name: user.name || '',
        role: user.role || '',
        date: today,
        punchIn: punchInStr,
      });
      await newRecord.save();

      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: punchInStr,
      });
    }

    // Case 2: record exists and only punchIn exists (no punchOut yet)
    if (record && record.punchIn && !record.punchOut) {
      // compute seconds diff between now and punchIn
      // record.punchIn stored as 'HH:mm:ss' so combine with today's date
      const punchInMoment = dayjs(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss');
      const diffSec = now.diff(punchInMoment, 'second');

      // If too soon, treat as duplicate/ignored (prevents immediate punch-out)
      if (diffSec < MIN_INTERVAL) {
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          secondsSincePunchIn: diffSec,
        });
      }

      // Attempt atomic update: set punchOut only if punchOut is still not set
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, punchOut: { $exists: false } },
        { $set: { punchOut: nowStr } },
        { new: true }
      );

      if (updated && updated.punchOut) {
        return res.status(200).json({
          message: 'Punched Out Successfully',
          status: 'Punched Out',
          punchIn: updated.punchIn,
          punchOut: updated.punchOut,
        });
      }

      // If update didn't apply (race), re-fetch and return current state
      const latest = await Attendance.findById(record._id).lean();
      if (latest && latest.punchOut) {
        return res.status(200).json({
          message: 'Punched Out (by another request)',
          status: 'Punched Out',
          punchIn: latest.punchIn,
          punchOut: latest.punchOut,
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
      });
    }

    // Fallback
    return res.status(400).json({ message: 'Invalid attendance state' });
  } catch (err) {
    console.error('[Submit Attendance API Error]', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
