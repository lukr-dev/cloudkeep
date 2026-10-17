package work.cloudkeep.mobile

import android.os.SystemClock
import android.util.Log

object ShareTiming {
    fun mark(phase: String) { Log.d("CloudKeepTiming", "t=${SystemClock.elapsedRealtime()} phase=$phase") }
}
