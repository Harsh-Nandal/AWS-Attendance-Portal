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
    const today = nowIst.format('YYYY-MM-DD');         // date in IST
    const nowTime = nowIst.format('HH:mm:ss');         // human-friendly IST time
    const recordedAtDate = nowIst.toDate();            // JS Date (instant)

    // --- Atomic upsert to create punchIn only if no record exists for (userId, date) ---
    // Use native collection.findOneAndUpdate so we can inspect lastErrorObject.upserted
    const filter = { userId: String(userId), date: today };
    const update = {
      $setOnInsert: {
        userId: String(userId),
        name: user.name || '',
        role: user.role || '',
        date: today,
        punchIn: nowTime,
        recordedAt: recordedAtDate,
      },
    };
    const opts = { upsert: true, returnDocument: 'after' }; // return the document after update/insert

    const rawResult = await Attendance.collection.findOneAndUpdate(filter, update, opts);
    // rawResult has { value, lastErrorObject, ok } from the native driver
    const { value: docAfterUpsert, lastErrorObject } = rawResult || {};

    // If lastErrorObject.upserted exists -> we created a new document => Punch In
    if (lastErrorObject && lastErrorObject.upserted) {
      // docAfterUpsert contains the newly created document
      return res.status(200).json({
        message: 'Punched In Successfully',
        status: 'Punched In',
        punchIn: docAfterUpsert.punchIn,
        recordedAt: docAfterUpsert.recordedAt,
      });
    }

    // Otherwise, a document already existed for today. docAfterUpsert is the existing doc.
    const record = docAfterUpsert;

    if (!record) {
      // Very unlikely, but handle defensively
      return res.status(500).json({ message: 'Attendance record not available' });
    }

    // If already has both punchIn & punchOut
    if (record.punchIn && record.punchOut) {
      return res.status(200).json({
        message: 'Already Punched Out',
        status: 'Punched Out',
        punchIn: record.punchIn,
        punchOut: record.punchOut,
        recordedAt: record.recordedAt,
      });
    }

    // If record has punchIn but no punchOut -> attempt punchOut
    if (record.punchIn && !record.punchOut) {
      // compute seconds diff between now and stored punchIn (assume punchIn is HH:mm:ss for that date in IST)
      const punchInMoment = dayjs.tz(`${record.date} ${record.punchIn}`, 'YYYY-MM-DD HH:mm:ss', APP_TZ);
      const diffSec = nowIst.diff(punchInMoment, 'second');

      if (diffSec < MIN_INTERVAL) {
        // Too soon -> ignore as duplicate
        return res.status(200).json({
          message: `Duplicate/too-fast: already punched in ${diffSec}s ago. Minimum interval ${MIN_INTERVAL}s.`,
          status: 'Already Punched In (recent)',
          punchIn: record.punchIn,
          secondsSincePunchIn: diffSec,
        });
      }

      // Atomic update: set punchOut only if it's still absent or null
      const punchOutUpdate = {
        $set: {
          punchOut: nowTime,
          recordedAt: recordedAtDate,
        },
      };

      const updatedRaw = await Attendance.collection.findOneAndUpdate(
        { _id: record._id, $or: [{ punchOut: { $exists: false } }, { punchOut: null }] },
        punchOutUpdate,
        { returnDocument: 'after' }
      );

      const updatedDoc = updatedRaw.value;

      if (updatedDoc && updatedDoc.punchOut) {
        return res.status(200).json({
          message: 'Punched Out Successfully',
          status: 'Punched Out',
          punchIn: updatedDoc.punchIn,
          punchOut: updatedDoc.punchOut,
          recordedAt: updatedDoc.recordedAt,
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
        });
      }

      // fallback
      return res.status(500).json({ message: 'Could not set punchOut - try again' });
    }

    // Any other unexpected state -> return it
    return res.status(400).json({ message: 'Invalid attendance state', record });
  } catch (err) {
    console.error('[Submit Attendance API Error]', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
}
