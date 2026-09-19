package com.yile.letime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 闹钟到点：弹通知，并按需要给自己排下一次催办。
 *
 * 运行环境可能是**冷启动的独立进程**（应用被系统划掉后由 AlarmManager 唤醒），
 * 所以这里只能读 [ReminderHub] 持久化下来的记录，绝不能假设网页还活着。
 */
class ReminderAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(ReminderHub.EXTRA_KEY) ?: return
    // 记录不在了 = 网页在那之后重排过、或用户已标记完成。此时什么都不做，
    // 这一条就是被撤销的那一条（撤销排期与写记录都走 rescheduleAll）。
    val rec = ReminderHub.findAlarm(context, key) ?: return

    ReminderHub.postReminder(context, rec, ongoing = rec.urgent)

    // 催办：到点档在用户处理掉之前，每隔 repeatMs 再弹一次，到 repeatUntil 为止。
    // 只有应用被杀时才会走到这里 —— 应用活着时长鸣由网页的 Web Audio 循环负责，
    // 不需要靠反复弹通知来维持声音。
    val next = System.currentTimeMillis() + rec.repeatMs
    if (rec.urgent && rec.repeatMs > 0 && next < rec.repeatUntil) {
      val repeated = rec.copy(at = next)
      ReminderHub.putAlarm(context, repeated)
      ReminderHub.schedule(context, repeated)
    }
  }
}

/**
 * 通知按钮：「停止响铃」/「标记完成」。
 *
 * 按钮不能直接调网页函数（进程可能已经没有网页了），所以只做两件事：
 * ① 把这次点击记进 [ReminderHub.drainActions] 的队列，网页下次巡检时取走并真正
 *    执行（改任务状态、停 Web Audio 循环）；② 立刻把通知本身处理掉，
 *    让用户按完就有反馈，而不是等网页醒过来。
 */
class ReminderActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(ReminderHub.EXTRA_KEY) ?: return
    val action = intent.getStringExtra(ReminderHub.EXTRA_ACTION) ?: return
    val rec = ReminderHub.findAlarm(context, key)
    ReminderHub.pushAction(context, key, action)
    // 无论哪种点击，原生侧都先认为「响铃已经结束」：MainActivity 据此恢复
    // 正常的 WebView 暂停行为（见 MainActivity.onPause）。
    ReminderHub.ringActive = false

    when (action) {
      ReminderHub.ACTION_STOP -> {
        // 撤掉催办，把常驻通知降级成一条可滑走的普通通知：内容留着，只是不再催。
        ReminderHub.cancelSchedule(context, key)
        if (rec != null) {
          ReminderHub.postReminder(context, rec.copy(urgent = false), ongoing = false, silent = true)
        }
      }

      ReminderHub.ACTION_DONE -> {
        // 完成 = 这条提醒彻底消失（含记录），否则重启后 [ReminderBootReceiver] 会把它排回来。
        ReminderHub.cancelSchedule(context, key)
        ReminderHub.cancel(context, key)
        ReminderHub.saveAlarms(context, ReminderHub.loadAlarms(context).filterNot { it.key == key })
      }
    }
  }
}

/**
 * 开机 / 覆盖安装后恢复闹钟。
 *
 * `AlarmManager` 的排期不跨重启。不接这个广播的后果是：手机重启之后所有提醒静默失效，
 * 直到用户某次真的打开应用、网页重排一次才恢复 —— 中间那几天等于没有提醒。
 */
class ReminderBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON" -> ReminderHub.restoreFromStore(context)
    }
  }
}
