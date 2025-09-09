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
  return d.format('YYYY-MM-DDTHH:mm:ssZ'); // local ISO with offset, e.g. 2025-09-08T14:53:12+05:30
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    // Safely parse body
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

    // canonical local strings (human readable) and ISO-with-offset string
    const nowLocalHH = nowTz.format('HH:mm:ss'); // e.g. "14:53:12"
    const nowIsoLocal = isoWithOffset(nowTz); // e.g. "2025-09-08T14:53:12+05:30"
    const recordedAtDate = nowTz.toDate(); // Date object
    const recordedAtIsoUtc = nowTz.toISOString(); // UTC ISO string

    const filter = { userId: String(userId), date: today };

    // Atomic create-if-absent (punchIn) using upsert
    const upserted = await Attendance.findOneAndUpdate(
      filter,
      {
        // only set these fields if document is inserted (not when it exists)
        $setOnInsert: {
          userId: String(userId),
          name: user.name || '',
          role: user.role || '',
          date: today,
          punchIn: nowLocalHH,
          punchInIso: nowIsoLocal,
          recordedAt: recordedAtDate,
          recordedAtIso: recordedAtIsoUtc,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // If upserted document has punchOut already -> it's an existing record already punched out
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

    // If upsert returned a doc that has punchIn set to our current nowLocalHH and no punchOut,
    // it's likely newly created (successful punchIn)
    if (upserted && upserted.punchIn && !upserted.punchOut) {
      // If the punchIn time equals the canonical now, treat as newly created punch-in.
      // (This is safe because collisions on exact same seconds are unlikely.)
      if (upserted.punchIn === nowLocalHH || upserted.punchInIso === nowIsoLocal) {
        return res.status(200).json({
          message: 'Punched In Successfully',
          status: 'Punched In',
          punchIn: upserted.punchIn,
          punchInIso: upserted.punchInIso || nowIsoLocal,
          recordedAt: upserted.recordedAt,
          recordedAtIso: upserted.recordedAtIso,
        });
      }
      // Otherwise, it's an existing day's record with a prior punchIn (no punchOut yet).
      // Fall through to punch-out logic using that existing record.
    }

    // Re-fetch current record (fresh) to ensure we have latest state
    const record = await Attendance.findOne(filter).lean();

    if (!record) {
      // Shouldn't happen because of upsert, but safe fallback
      return res.status(500).json({ message: 'Unexpected error: record missing after upsert' });
    }

    // If record exists and only punchIn present -> attempt punchOut
    if (record.punchIn && !record.punchOut) {
      // compute seconds diff between now and stored punchIn (both in APP_TZ)
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

      // Atomic update set punchOut only if still null/absent (prevents race)
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] },
        {
          $set: {
            punchOut: nowLocalHH,
            punchOutIso: nowIsoLocal,
            recordedAt: recordedAtDate,
            recordedAtIso: recordedAtIsoUtc,
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

      // if another process updated it, fetch latest and return
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

    // If record exists and already has punchOut
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
