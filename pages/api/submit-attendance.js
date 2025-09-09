// pages/api/submit-attendance.js
import connectDB from '../../lib/mongodb';
import Attendance from '../../models/Attendance';
import User from '../../models/User';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const MIN_INTERVAL = Number(process.env.MIN_PUNCH_INTERVAL_SECONDS) || 60;

function isoWithOffset(d) {
  // returns YYYY-MM-DDTHH:mm:ss+05:30 style string (with the configured timezone offset)
  return d.format('YYYY-MM-DDTHH:mm:ssZ');
}

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

    // canonical now in configured timezone
    const nowTz = dayjs().tz(APP_TZ);
    const today = nowTz.format('YYYY-MM-DD');

    // canonical local strings (human readable) and ISO-with-offset strings
    const nowLocalHH = nowTz.format('HH:mm:ss'); // e.g. "14:53:12"
    const nowIsoLocal = isoWithOffset(nowTz); // e.g. "2025-09-08T14:53:12+05:30"
    const recordedAtDate = nowTz.toDate(); // Date object (UTC under the hood)
    const recordedAtIsoUtc = nowTz.toISOString(); // canonical ISO (UTC), useful for audits

    // Load today's record
    let record = await Attendance.findOne({ userId: String(userId), date: today });

    // Case 1: no record -> create punchIn
    if (!record) {
      const newRecord = new Attendance({
        userId: String(userId),
        name: user.name || '',
        role: user.role || '',
        date: today,
        // human-friendly local time
        punchIn: nowLocalHH,
        // ISO with timezone offset
        punchInIso: nowIsoLocal,
        // machine timestamp
        recordedAt: recordedAtDate,
        recordedAtIso: recordedAtIsoUtc,
      });
      await newRecord.save();

      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: newRecord.punchIn,
        punchInIso: newRecord.punchInIso,
        recordedAt: newRecord.recordedAt,
        recordedAtIso: newRecord.recordedAtIso,
      });
    }

    // Case 2: record exists and only punchIn exists (no punchOut yet)
    if (record && record.punchIn && !record.punchOut) {
      // compute seconds difference between now and stored punchIn (both in APP_TZ)
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      const diffSec = nowTz.diff(punchInMoment, 'second');

      // If too soon, treat as duplicate/ignored
      if (diffSec < MIN_INTERVAL) {
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          punchInIso: record.punchInIso || null,
          secondsSincePunchIn: diffSec,
        });
      }

      // Atomic update: set punchOut only if it's still absent/null
      const filter = { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] };
      const update = {
        $set: {
          punchOut: nowLocalHH,
          punchOutIso: nowIsoLocal,
          recordedAt: recordedAtDate,
          recordedAtIso: recordedAtIsoUtc,
        },
      };

      const updated = await Attendance.findOneAndUpdate(filter, update, { new: true }).exec();

      if (updated && updated.punchOut) {
        return res.status(200).json({
          message: 'Punched Out Successfully',
          status: 'Punched Out',
          punchIn: updated.punchIn,
          punchInIso: updated.punchInIso || null,
          punchOut: updated.punchOut,
          punchOutIso: updated.punchOutIso || null,
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
          punchInIso: latest.punchInIso || null,
          punchOut: latest.punchOut,
          punchOutIso: latest.punchOutIso || null,
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
        punchInIso: record.punchInIso || null,
        punchOut: record.punchOut,
        punchOutIso: record.punchOutIso || null,
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
