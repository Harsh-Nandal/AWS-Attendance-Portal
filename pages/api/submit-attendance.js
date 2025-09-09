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
  // local ISO with offset, e.g. 2025-09-08T14:53:12+05:30
  return d.format('YYYY-MM-DDTHH:mm:ssZ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    // parse body safely
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

    // canonical now in configured timezone (compute once)
    const nowTz = dayjs().tz(APP_TZ);
    const today = nowTz.format('YYYY-MM-DD');

    const nowLocalHH = nowTz.format('HH:mm:ss');            // human-friendly local time
    const nowIsoLocal = isoWithOffset(nowTz);              // local ISO with offset
    const recordedAtDate = nowTz.toDate();                 // Date object (UTC under the hood)
    const recordedAtIso = nowTz.toISOString();             // canonical ISO (UTC)

    // Filter for today's record
    const filter = { userId: String(userId), date: today };

    // Atomic upsert to create today's record with punchIn if absent.
    // Use $setOnInsert so we only set punchIn when inserting.
    const upserted = await Attendance.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          userId: String(userId),
          name: user.name || '',
          role: user.role || '',
          date: today,
          punchIn: nowLocalHH,
          punchInIso: nowIsoLocal,
          recordedAt: recordedAtDate,
          recordedAtIso,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // If upserted doc already has punchOut (someone already punched out), return it
    if (upserted && upserted.punchIn && upserted.punchOut) {
      return res.status(200).json({
        message: 'Already Punched Out',
        status: 'Punched Out',
        punchIn: upserted.punchIn,
        punchInIso: upserted.punchInIso || null,
        punchOut: upserted.punchOut,
        punchOutIso: upserted.punchOutIso || null,
        recordedAt: upserted.recordedAt,
        recordedAtIso: upserted.recordedAtIso,
      });
    }

    // If upserted doc has punchIn equal to our current now -> it was created in this request -> Punched In
    if (
      upserted &&
      upserted.punchIn &&
      !upserted.punchOut &&
      (upserted.punchIn === nowLocalHH || upserted.punchInIso === nowIsoLocal)
    ) {
      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: upserted.punchIn,
        punchInIso: upserted.punchInIso || nowIsoLocal,
        recordedAt: upserted.recordedAt,
        recordedAtIso: upserted.recordedAtIso,
      });
    }

    // Otherwise fetch the current record to determine state (should exist because of upsert)
    const record = await Attendance.findOne(filter).lean();
    if (!record) {
      // unexpected: upsert should have created a record
      return res.status(500).json({ message: 'Unexpected: attendance record missing' });
    }

    // CASE: record exists and only punchIn present -> attempt punchOut
    if (record.punchIn && !record.punchOut) {
      // compute diff between now and stored punchIn (both in APP_TZ)
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      const diffSec = nowTz.diff(punchInMoment, 'second');

      if (diffSec < MIN_INTERVAL) {
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          punchInIso: record.punchInIso || null,
          secondsSincePunchIn: diffSec,
        });
      }

      // Atomically set punchOut only if still absent
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] },
        {
          $set: {
            punchOut: nowLocalHH,
            punchOutIso: nowIsoLocal,
            recordedAt: recordedAtDate,
            recordedAtIso,
          },
        },
        { new: true }
      ).lean();

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

      // If another request updated it, return latest
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

      return res.status(500).json({ message: 'Could not set punchOut - try again' });
    }

    // CASE: already punched out
    if (record.punchIn && record.punchOut) {
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
