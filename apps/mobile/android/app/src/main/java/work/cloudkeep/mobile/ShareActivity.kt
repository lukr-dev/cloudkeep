package work.cloudkeep.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

class ShareActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ShareTiming.mark("share_received")
        val url = if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain")
            ShareUrl.extract(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(), intent.getStringExtra(Intent.EXTRA_SUBJECT)) else null
        if (url == null) {
            Toast.makeText(this, "No HTTP(S) link found", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        val app = application as CloudKeepApplication
        val shares = app.shares
        ShareTiming.mark("share_mode_ready")
        // Legacy installs migrate once off-thread so an existing Quick preference is preserved.
        if (!shares.needsMigration && shares.mode != "quick") {
            openAsk(url)
            return
        }
        // A fresh activity performs exactly one request; configuration changes do not resend it.
        CloudKeepApplication.io.execute {
            try {
                val store = app.store
                val credentials = store.credentials()
                if (shares.mode == "quick" && credentials.token.isNotEmpty()) {
                    try {
                        ShareTiming.mark("quick_save_start")
                        val duplicate = ApiClient().save(credentials.server, credentials.token, url, shares.defaultList)
                        app.bookmarksChanged.set(true)
                        ShareTiming.mark("quick_save_ready")
                        runOnUiThread {
                            Toast.makeText(this, if (duplicate) "Already saved" else "Saved to CloudKeep", Toast.LENGTH_LONG).show()
                            finish()
                        }
                        return@execute
                    } catch (_: Exception) {
                        runOnUiThread { Toast.makeText(this, "Quick save failed. Review and retry in CloudKeep.", Toast.LENGTH_LONG).show() }
                    }
                }
                runOnUiThread { openAsk(url) }
            } catch (_: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Could not access secure storage. Open CloudKeep to sign in again.", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }
    private fun openAsk(url: String) {
        ShareTiming.mark("ask_launch")
        startActivity(Intent(this, MainActivity::class.java)
            .putExtra(MainActivity.SHARED_URL, url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }
}
