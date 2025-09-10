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

function isoWithOffset(d) {
  return d.format('YYYY-MM-DDTHH:mm:ssZ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    // Safe body parse
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
    const today = nowIst.format('YYYY-MM-DD');         // date in IST
    const nowTime = nowIst.format('HH:mm:ss');         // human-friendly IST time
    const recordedAtIso = isoWithOffset(nowIst);       // ISO with offset e.g. 2025-09-09T15:00:00+05:30
    const recordedAtDate = nowIst.toDate();            // JS Date (instant)

    // --- Atomic upsert for punchIn: use $setOnInsert and rawResult to detect insertion ---
    const filter = { userId: String(userId), date: today };
    const setOnInsert = {
      userId: String(userId),
      name: user.name || '',
      role: user.role || '',
      date: today,
      punchIn: nowTime,
      punchInIso: recordedAtIso,
      recordedAt: recordedAtDate,
      recordedAtIso: recordedAtIso,
    };

    const upsertRaw = await Attendance.findOneAndUpdate(
      filter,
      { $setOnInsert: setOnInsert },
      { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true }
    );

    const docAfterUpsert = upsertRaw.value;
    const didInsert = !!(upsertRaw.lastErrorObject && upsertRaw.lastErrorObject.upserted);

    if (didInsert) {
      // We just created the record -> this is a punch-in. Return immediately.
      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: docAfterUpsert.punchIn,
        punchInIso: docAfterUpsert.punchInIso,
        recordedAtIso: docAfterUpsert.recordedAtIso,
      });
    }

    // If we reach here, a record already existed. Fetch it reliably.
    const record = await Attendance.findOne(filter).lean();
    if (!record) {
      // Defensive: shouldn't happen
      return res.status(500).json({ message: 'Attendance record missing after upsert' });
    }

    // CASE: has punchIn but no punchOut -> attempt punchOut
    if (record.punchIn && !record.punchOut) {
      // Parse punchIn as IST for that date
      // Accept punchIn as HH:mm:ss (the format we store)
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      if (!punchInMoment.isValid()) {
        // fallback: try without seconds
        const fallback = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm', APP_TZ);
        if (fallback.isValid()) {
          // assign fallback
        }
      }

      const diffSec = nowIst.diff(punchInMoment, 'second');

      if (diffSec < MIN_INTERVAL) {
        // Too soon to punch out
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          secondsSincePunchIn: diffSec,
        });
      }

      // Atomic update to set punchOut only if still null/absent
      const updated = await Attendance.findOneAndUpdate(
        { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] },
        {
          $set: {
            punchOut: nowTime,
            punchOutIso: recordedAtIso,
            recordedAt: recordedAtDate,
            recordedAtIso: recordedAtIso,
          },
        },
        { new: true }
      ).lean();

      if (updated && updated.punchOut) {
        return res.status(200).json({
          message: 'Punched Out Successfully',
          status: 'Punched Out',
          punchIn: updated.punchIn,
          punchInIso: updated.punchInIso,
          punchOut: updated.punchOut,
          punchOutIso: updated.punchOutIso,
          recordedAtIso: updated.recordedAtIso,
        });
      }

      // If concurrent request set punchOut, re-fetch and return
      const latest = await Attendance.findById(record._id).lean();
      if (latest && latest.punchOut) {
        return res.status(200).json({
          message: 'Punched Out (by another request)',
          status: 'Punched Out',
          punchIn: latest.punchIn,
          punchInIso: latest.punchInIso,
          punchOut: latest.punchOut,
          punchOutIso: latest.punchOutIso,
          recordedAtIso: latest.recordedAtIso,
        });
      }

      return res.status(500).json({ message: 'Could not set punchOut - try again' });
    }

    // Already punched out or other states
    if (record.punchIn && record.punchOut) {
      return res.status(200).json({
        message: 'Already Punched Out',
        status: 'Punched Out',
        punchIn: record.punchIn,
        punchInIso: record.punchInIso,
        punchOut: record.punchOut,
        punchOutIso: record.punchOutIso,
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
