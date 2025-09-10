import connectDB from "../../lib/mongodb";
import Attendance from "../../models/Attendance";
import User from "../../models/User";
import moment from "moment-timezone";

const APP_TZ = "Asia/Kolkata";
const MIN_REPEAT_SECONDS =
  process.env.MIN_REPEAT_SECONDS !== undefined && process.env.MIN_REPEAT_SECONDS !== ""
    ? Number(process.env.MIN_REPEAT_SECONDS)
    : 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    await connectDB();

    const { userId, name: reqName, role: reqRole, imageData } = req.body || {};
    if (!userId) return res.status(400).json({ message: "Missing userId" });

    const uidStr = String(userId);
    const user = await User.findOne({ userId: uidStr }).lean().catch(() => null);

    const resolvedName = typeof reqName === "string" && reqName.trim() ? reqName.trim() : user?.name ?? "";
    const resolvedRole = typeof reqRole === "string" && reqRole.trim() ? reqRole.trim() : user?.role ?? "";

    // compute today's date once (server timezone = APP_TZ)
    const nowForDate = moment().tz(APP_TZ);
    const today = nowForDate.format("YYYY-MM-DD");

    // fetch record for today
    let record = await Attendance.findOne({ userId: uidStr, date: today });

    // helper to build iso + 12-hour display
    function makeTimestamps(momentObj) {
      return {
        iso: momentObj.format("YYYY-MM-DDTHH:mm:ssZ"),
        display12: momentObj.format("hh:mm:ss A"), // 12-hour with AM/PM
      };
    }

    // If no record -> create new record (Punch In)
    if (!record) {
      const now = moment().tz(APP_TZ);
      const { iso: isoNow, display12: shortNow12 } = makeTimestamps(now);

      const newRec = new Attendance({
        userId: uidStr,
        name: resolvedName,
        role: resolvedRole,
        date: today,
        punchInAt: isoNow,
        punchIn: shortNow12,
        imageData: imageData ?? undefined,
      });

      await newRec.save();

      return res.status(200).json({
        message: "Punched In Successfully",
        status: "Punched In",
        date: today,
        punchIn: newRec.punchIn,
        punchInAt: newRec.punchInAt,
        punchOut: null,
        punchOutAt: null,
        duration: null,
        name: newRec.name,
        role: newRec.role,
      });
    }

    // If record exists but punchInAt missing -> repair it as a Punch In
    if ((!record.punchInAt || record.punchInAt === null || String(record.punchInAt).trim() === "") && !record.punchOut) {
      const now = moment().tz(APP_TZ);
      const { iso: isoNow, display12: shortNow12 } = makeTimestamps(now);

      record.punchInAt = isoNow;
      record.punchIn = shortNow12;
      if (resolvedName) record.name = resolvedName;
      if (resolvedRole) record.role = resolvedRole;
      if (imageData) record.imageData = imageData;
      await record.save();

      return res.status(200).json({
        message: "Punched In (repaired missing punchInAt)",
        status: "Punched In",
        date: record.date,
        punchIn: record.punchIn,
        punchInAt: record.punchInAt,
        punchOut: null,
        punchOutAt: null,
        duration: null,
        name: record.name,
        role: record.role,
      });
    }

    // If already punched in but not punched out -> try to punch out (with duplicate protection)
    if (record.punchIn && !record.punchOut) {
      // re-read to reduce staleness
      record = await Attendance.findOne({ userId: uidStr, date: today });

      // if punchInAt missing AFTER re-read, repair it as punch-in (safe fallback)
      if (!record || !record.punchInAt) {
        if (!record) {
          // fallback create (shouldn't happen normally)
          const now = moment().tz(APP_TZ);
          const { iso: isoNow, display12: shortNow12 } = makeTimestamps(now);

          const newRec = new Attendance({
            userId: uidStr,
            name: resolvedName,
            role: resolvedRole,
            date: today,
            punchInAt: isoNow,
            punchIn: shortNow12,
            imageData: imageData ?? undefined,
          });
          await newRec.save();
          return res.status(200).json({
            message: "Punched In (created fallback record)",
            status: "Punched In",
            date: newRec.date,
            punchIn: newRec.punchIn,
            punchInAt: newRec.punchInAt,
            punchOut: null,
            punchOutAt: null,
            duration: null,
            name: newRec.name,
            role: newRec.role,
          });
        } else {
          // repair existing
          const now = moment().tz(APP_TZ);
          const { iso: isoNow, display12: shortNow12 } = makeTimestamps(now);

          record.punchInAt = isoNow;
          record.punchIn = shortNow12;
          if (resolvedName) record.name = resolvedName;
          if (resolvedRole) record.role = resolvedRole;
          if (imageData) record.imageData = imageData;
          await record.save();
          return res.status(200).json({
            message: "Punched In (repaired missing punchInAt)",
            status: "Punched In",
            date: record.date,
            punchIn: record.punchIn,
            punchInAt: record.punchInAt,
            punchOut: null,
            punchOutAt: null,
            duration: null,
            name: record.name,
            role: record.role,
          });
        }
      }

      // compute elapsed seconds using a fresh "now"
      const nowForElapsed = moment().tz(APP_TZ);
      let elapsedSec = null;
      try {
        const inMoment = moment.tz(record.punchInAt, APP_TZ);
        const nowMoment = nowForElapsed;
        const elapsedMs = Math.max(0, nowMoment.valueOf() - inMoment.valueOf());
        elapsedSec = Math.floor(elapsedMs / 1000);
      } catch (e) {
        console.warn("[submit-attendance] elapsed calc failed:", e);
        return res.status(400).json({ message: "Could not compute elapsed time from punchInAt. Contact admin." });
      }

      if (elapsedSec < Number(MIN_REPEAT_SECONDS)) {
        // Too soon -> reject and don't punch out
        return res.status(429).json({
          message: `Too soon to punch out: already punched in ${elapsedSec} seconds ago. Please wait ${Number(MIN_REPEAT_SECONDS) - elapsedSec} more second(s).`,
          status: "Punched In",
          date: record.date,
          punchIn: record.punchIn,
          punchInAt: record.punchInAt,
          punchOut: null,
          punchOutAt: null,
          duration: null,
          name: record.name,
          role: record.role,
        });
      }

      // recompute timestamp now (important — do not reuse old isoNow)
      const nowForPunchOut = moment().tz(APP_TZ);
      const { iso: isoNowPunchOut, display12: shortNowPunchOut12 } = makeTimestamps(nowForPunchOut);

      // atomic update for punchOut (only if still not set)
      const updateFields = {
        punchOutAt: isoNowPunchOut,
        punchOut: shortNowPunchOut12,
      };
      if (resolvedName) updateFields.name = resolvedName;
      if (resolvedRole) updateFields.role = resolvedRole;
      if (imageData) updateFields.imageData = imageData;

      const updated = await Attendance.findOneAndUpdate(
        {
          userId: uidStr,
          date: today,
          punchOut: { $in: [null, undefined] },
          punchInAt: record.punchInAt,
        },
        { $set: updateFields },
        { new: true }
      );

      if (!updated) {
        // race lost — return latest
        const latest = await Attendance.findOne({ userId: uidStr, date: today });
        let computedDuration = null;
        try {
          if (latest?.punchInAt && latest?.punchOutAt) {
            const inMoment = moment.tz(latest.punchInAt, APP_TZ);
            const outMoment = moment.tz(latest.punchOutAt, APP_TZ);
            const diffSec = Math.max(0, Math.floor((outMoment.valueOf() - inMoment.valueOf()) / 1000));
            const hh = String(Math.floor(diffSec / 3600)).padStart(2, "0");
            const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
            const ss = String(diffSec % 60).padStart(2, "0");
            computedDuration = `${hh}:${mm}:${ss}`;
          }
        } catch (e) {
          computedDuration = null;
        }

        return res.status(200).json({
          message: "Already Punched Out (race resolved)",
          status: "Punched Out",
          date: latest.date,
          punchIn: latest.punchIn,
          punchInAt: latest.punchInAt ?? null,
          punchOut: latest.punchOut,
          punchOutAt: latest.punchOutAt ?? null,
          duration: computedDuration,
          name: latest.name,
          role: latest.role,
        });
      }

      // success: compute duration using updated timestamps
      let duration = null;
      try {
        const inMoment = moment.tz(updated.punchInAt, APP_TZ);
        const outMoment = moment.tz(updated.punchOutAt, APP_TZ);
        const diffSec = Math.max(0, Math.floor((outMoment.valueOf() - inMoment.valueOf()) / 1000));
        const hh = String(Math.floor(diffSec / 3600)).padStart(2, "0");
        const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
        const ss = String(diffSec % 60).padStart(2, "0");
        duration = `${hh}:${mm}:${ss}`;
      } catch (e) {
        duration = null;
      }

      return res.status(200).json({
        message: "Punched Out Successfully",
        status: "Punched Out",
        date: updated.date,
        punchIn: updated.punchIn,
        punchInAt: updated.punchInAt,
        punchOut: updated.punchOut,
        punchOutAt: updated.punchOutAt,
        duration,
        name: updated.name,
        role: updated.role,
      });
    }

    // Already has both
    let computedDuration = null;
    try {
      if (record.punchInAt && record.punchOutAt) {
        const inMoment = moment.tz(record.punchInAt, APP_TZ);
        const outMoment = moment.tz(record.punchOutAt, APP_TZ);
        const diffSec = Math.max(0, Math.floor((outMoment.valueOf() - inMoment.valueOf()) / 1000));
        const hh = String(Math.floor(diffSec / 3600)).padStart(2, "0");
        const mm = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
        const ss = String(diffSec % 60).padStart(2, "0");
        computedDuration = `${hh}:${mm}:${ss}`;
      }
    } catch (e) {
      computedDuration = null;
    }

    return res.status(200).json({
      message: "Already Punched Out",
      status: "Punched Out",
      date: record.date,
      punchIn: record.punchIn,
      punchInAt: record.punchInAt ?? null,
      punchOut: record.punchOut,
      punchOutAt: record.punchOutAt ?? null,
      duration: computedDuration,
      name: record.name,
      role: record.role,
    });
  } catch (err) {
    console.error("[Submit Attendance API Error]", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err?.message ?? String(err),
    });
  }
}
