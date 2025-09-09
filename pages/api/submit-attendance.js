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
  return d.format('YYYY-MM-DDTHH:mm:ssZ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    // --- robust body parsing ---
    let body = req.body;
    if (!body || typeof body === 'string') {
      try {
        body = JSON.parse(body || '{}');
      } catch (e) {
        body = {};
      }
    }

    // helpful debug log (server console)
    console.log('[submit-attendance] received raw body:', req.body);
    console.log('[submit-attendance] parsed body:', body);

    const { userId } = body || {};
    if (!userId || typeof userId !== 'string') {
      console.warn('[submit-attendance] invalid userId in request:', userId);
      return res.status(400).json({ message: 'Missing or invalid userId' });
    }

    // verify user exists
    const user = await User.findOne({ userId: String(userId) }).lean();
    if (!user) {
      console.warn('[submit-attendance] user not found for userId:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    // canonical now in configured timezone (compute once)
    const nowTz = dayjs().tz(APP_TZ);
    const today = nowTz.format('YYYY-MM-DD');

    const nowLocalHH = nowTz.format('HH:mm:ss');            // human-friendly local time
    const nowIsoLocal = isoWithOffset(nowTz);              // local ISO with offset
    const recordedAtDate = nowTz.toDate();                 // Date object
    const recordedAtIso = nowTz.toISOString();             // canonical ISO (UTC)

    console.log(`[submit-attendance] user=${userId} now=${nowIsoLocal} today=${today}`);

    // Use atomic upsert to create record for today if missing (punchIn)
    const filter = { userId: String(userId), date: today };
    const upsertResult = await Attendance.findOneAndUpdate(
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
          recordedAtIso: recordedAtIso,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // If upsert created a new record (punchIn occurred), return Punched In
    // Heuristic: if the doc's punchInIso equals our nowIsoLocal or punchIn equals nowLocalHH then we created it now.
    if (upsertResult && upsertResult.punchIn && !upsertResult.punchOut &&
        (upsertResult.punchInIso === nowIsoLocal || upsertResult.punchIn === nowLocalHH)) {
      console.log('[submit-attendance] created new punch-in:', upsertResult._id);
      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: upsertResult.punchIn,
        punchInIso: upsertResult.punchInIso,
        recordedAt: upsertResult.recordedAt,
        recordedAtIso: upsertResult.recordedAtIso,
      });
    }

    // Otherwise fetch existing record
    const record = await Attendance.findOne(filter).lean();
    if (!record) {
      // Shouldn't happen because we just upserted, but handle defensively
      console.error('[submit-attendance] attendance record not available after upsert for', userId);
      return res.status(500).json({ message: 'Attendance record not available' });
    }

    // CASE A: record exists with punchIn only -> attempt punchOut
    if (record.punchIn && !record.punchOut) {
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      const diffSec = nowTz.diff(punchInMoment, 'second');

      if (diffSec < MIN_INTERVAL) {
        // too soon: don't punch out
        return res.status(200).json({
          message: `Too soon since punch-in (${diffSec}s). Minimum interval ${MIN_INTERVAL}s.`,
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

      // If concurrent update happened, re-read and return
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

    // CASE B: already punched out
    if (record.punchIn && record.punchOut) {
      return res.status(200).json({
        message: 'Already Punched Out',
        status: 'Punched Out',
        punchIn: record.punchIn,
        punchInIso: record.punchInIso || null,
        punchOut: record.punchOut,
        punchOutIso: record.punchOutIso || null,
        recordedAt: record.recordedAt,
        recordedAtIso: record.recordedIso || record.recordedAtIso || null,
      });
    }

    // Fallback
    return res.status(400).json({ message: 'Invalid attendance state' });
  } catch (err) {
    console.error('[Submit Attendance API Error]', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
